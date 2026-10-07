import bcrypt from "bcryptjs";
import { and, desc, eq } from "drizzle-orm";
import type { Handler } from "hono";
import { db, HttpStatusCodes } from "@/framework/facade.js";
import { roles } from "@/modules/auth/database/models/role.js";
import { users } from "@/modules/auth/database/models/user.js";

/**
 * Helper to ensure requester is a Primary User / Tenant Admin (not an operator)
 * Validates against live database record to prevent token spoofing or privilege escalation.
 */
async function getPrimaryUserAuth(c: any) {
  const auth = c.get("auth");
  const userId = auth?.id ? Number(auth.id) : null;
  if (!userId) {
    return { userId: null, isOperator: true, isSuperOrAdmin: false, dbUser: null };
  }

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, userId),
    with: { role: true }
  });

  if (!dbUser) {
    return { userId: null, isOperator: true, isSuperOrAdmin: false, dbUser: null };
  }

  const roleName = String(dbUser.role?.name || "").toLowerCase();
  const isOperator = Boolean(dbUser.adminId) || roleName === "operator";
  const isSuperOrAdmin = roleName === "superadmin" || roleName === "admin";

  return { userId, isOperator, isSuperOrAdmin, dbUser };
}

/**
 * 1. List Operators under the authenticated Primary User
 * Route: GET /api/auth/operators
 */
export const listOperators: Handler = async (c: any) => {
  try {
    const { userId, isOperator } = await getPrimaryUserAuth(c);
    if (!userId) {
      return c.json({ message: "Unauthorized. Please log in." }, HttpStatusCodes.UNAUTHORIZED);
    }
    if (isOperator) {
      return c.json({ message: "Access denied. Operators are not permitted to manage operator accounts." }, HttpStatusCodes.FORBIDDEN);
    }

    const operatorsList = await db.query.users.findMany({
      where: eq(users.adminId, userId),
      with: { role: true },
      orderBy: [desc(users.createdAt)]
    });

    const formatted = operatorsList.map((op: any) => ({
      id: op.id,
      name: op.name,
      email: op.email,
      role: op.role?.name || "operator",
      status: op.status || "active",
      createdAt: op.createdAt,
      updatedAt: op.updatedAt
    }));

    return c.json({
      success: true,
      data: formatted,
      summary: {
        total: formatted.length,
        activeCount: formatted.filter((o: any) => o.status === "active").length,
        suspendedCount: formatted.filter((o: any) => o.status === "suspended").length
      }
    });
  } catch (error: any) {
    console.error("List operators error:", error);
    return c.json({ message: error.message || "Failed to fetch operators" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * 2. Create a new Operator under the authenticated Primary User
 * Route: POST /api/user/operators
 */
export const createOperator: Handler = async (c: any) => {
  try {
    const { userId, isOperator } = await getPrimaryUserAuth(c);
    if (!userId) {
      return c.json({ message: "Unauthorized. Please log in." }, HttpStatusCodes.UNAUTHORIZED);
    }
    if (isOperator) {
      return c.json({ message: "Operators cannot create or add new accounts." }, HttpStatusCodes.FORBIDDEN);
    }

    const body = await c.req.json();
    const name = String(body.name || "").trim();
    const email = String(body.email || "").toLowerCase().trim();
    const password = String(body.password || "").trim();

    if (!name || name.length < 2) {
      return c.json({ message: "Name is required and must be at least 2 characters." }, HttpStatusCodes.BAD_REQUEST);
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return c.json({ message: "A valid email address is required." }, HttpStatusCodes.BAD_REQUEST);
    }
    if (!password || password.length < 6) {
      return c.json({ message: "Password is required and must be at least 6 characters." }, HttpStatusCodes.BAD_REQUEST);
    }

    // Check if email already exists
    const existing = await db.query.users.findFirst({
      where: eq(users.email, email)
    });
    if (existing) {
      return c.json({ message: "An account with this email already exists." }, HttpStatusCodes.CONFLICT);
    }

    // Ensure 'operator' role exists
    let operatorRole = await db.query.roles.findFirst({
      where: eq(roles.name, "operator")
    });
    if (!operatorRole) {
      try {
        const [newRole] = await db.insert(roles).values({ name: "operator" }).returning();
        operatorRole = newRole;
      } catch (_) {
        operatorRole = await db.query.roles.findFirst({ where: eq(roles.name, "operator") });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [newOperator] = await db
      .insert(users)
      .values({
        name,
        email,
        password: hashedPassword,
        adminId: userId,
        roleId: operatorRole?.id || null,
        status: "active",
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();

    return c.json({
      success: true,
      message: `Operator "${name}" created successfully.`,
      data: {
        id: newOperator.id,
        name: newOperator.name,
        email: newOperator.email,
        role: "operator",
        status: newOperator.status,
        createdAt: newOperator.createdAt
      }
    });
  } catch (error: any) {
    console.error("Create operator error:", error);
    return c.json({ message: error.message || "Failed to create operator" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * 3. Update Operator (Name, optional password reset, status)
 * Route: PUT /api/user/operators/:id
 */
export const updateOperator: Handler = async (c: any) => {
  try {
    const { userId, isOperator } = await getPrimaryUserAuth(c);
    if (!userId) {
      return c.json({ message: "Unauthorized. Please log in." }, HttpStatusCodes.UNAUTHORIZED);
    }
    if (isOperator) {
      return c.json({ message: "Operators cannot modify accounts." }, HttpStatusCodes.FORBIDDEN);
    }

    const operatorId = Number(c.req.param("id"));
    const body = await c.req.json();

    const target = await db.query.users.findFirst({
      where: and(eq(users.id, operatorId), eq(users.adminId, userId))
    });

    if (!target) {
      return c.json({ message: "Operator not found or does not belong to your account." }, HttpStatusCodes.NOT_FOUND);
    }

    const updates: any = {
      updatedAt: new Date()
    };

    if (body.name && String(body.name).trim().length >= 2) {
      updates.name = String(body.name).trim();
    }

    if (body.status && ["active", "suspended"].includes(String(body.status).toLowerCase())) {
      updates.status = String(body.status).toLowerCase();
    }

    if (body.password && String(body.password).trim().length >= 6) {
      updates.password = await bcrypt.hash(String(body.password).trim(), 10);
    }

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, operatorId))
      .returning();

    return c.json({
      success: true,
      message: `Operator "${updated.name}" updated successfully.`,
      data: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        status: updated.status,
        updatedAt: updated.updatedAt
      }
    });
  } catch (error: any) {
    console.error("Update operator error:", error);
    return c.json({ message: error.message || "Failed to update operator" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * 4. Toggle Operator Status (Active / Suspended)
 * Route: PATCH /api/user/operators/:id/status
 */
export const toggleOperatorStatus: Handler = async (c: any) => {
  try {
    const { userId, isOperator } = await getPrimaryUserAuth(c);
    if (!userId) {
      return c.json({ message: "Unauthorized. Please log in." }, HttpStatusCodes.UNAUTHORIZED);
    }
    if (isOperator) {
      return c.json({ message: "Access denied." }, HttpStatusCodes.FORBIDDEN);
    }

    const operatorId = Number(c.req.param("id"));
    const body = await c.req.json();
    const newStatus = String(body.status || "active").toLowerCase().trim();

    if (!["active", "suspended"].includes(newStatus)) {
      return c.json({ message: "Invalid status value. Must be 'active' or 'suspended'." }, HttpStatusCodes.BAD_REQUEST);
    }

    const target = await db.query.users.findFirst({
      where: and(eq(users.id, operatorId), eq(users.adminId, userId))
    });

    if (!target) {
      return c.json({ message: "Operator not found or does not belong to your account." }, HttpStatusCodes.NOT_FOUND);
    }

    await db
      .update(users)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(users.id, operatorId));

    return c.json({
      success: true,
      message: `Operator status set to "${newStatus}".`,
      data: { id: operatorId, status: newStatus }
    });
  } catch (error: any) {
    console.error("Toggle operator status error:", error);
    return c.json({ message: error.message || "Failed to update status" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * 5. Delete Operator
 * Route: DELETE /api/user/operators/:id
 */
export const deleteOperator: Handler = async (c: any) => {
  try {
    const { userId, isOperator } = await getPrimaryUserAuth(c);
    if (!userId) {
      return c.json({ message: "Unauthorized. Please log in." }, HttpStatusCodes.UNAUTHORIZED);
    }
    if (isOperator) {
      return c.json({ message: "Access denied." }, HttpStatusCodes.FORBIDDEN);
    }

    const operatorId = Number(c.req.param("id"));

    const target = await db.query.users.findFirst({
      where: and(eq(users.id, operatorId), eq(users.adminId, userId))
    });

    if (!target) {
      return c.json({ message: "Operator not found or does not belong to your account." }, HttpStatusCodes.NOT_FOUND);
    }

    await db.delete(users).where(eq(users.id, operatorId));

    return c.json({
      success: true,
      message: `Operator "${target.name}" has been deleted.`
    });
  } catch (error: any) {
    console.error("Delete operator error:", error);
    return c.json({ message: error.message || "Failed to delete operator" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};
