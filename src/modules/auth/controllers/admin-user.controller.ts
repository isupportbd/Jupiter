import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { Handler } from "hono";
import { db, HttpStatusCodes } from "@/framework/facade.js";
import { roles } from "@/modules/auth/database/models/role.js";
import { users } from "@/modules/auth/database/models/user.js";
import { bondRecords } from "@/modules/bond/database/models/bond.js";

/**
 * Helper to check if requester is Admin or SuperAdmin
 */
function isUserAdmin(auth: any): boolean {
  const role = String(auth?.role || "").toLowerCase();
  return role === "superadmin" || role === "admin" || auth?.roleId === 1;
}

/**
 * 1. List All Users (with status, subscription, and records count)
 * Route: GET /api/admin/users
 */
export const listUsers: Handler = async (c: any) => {
  try {
    const auth = c.get("auth");
    if (!isUserAdmin(auth)) {
      return c.json({ message: "Access denied. Administrator privileges required." }, HttpStatusCodes.FORBIDDEN);
    }

    const search = (c.req.query("search") || "").trim().toLowerCase();
    const statusFilter = (c.req.query("status") || "").trim().toLowerCase();

    const allUsers = await db.query.users.findMany({
      with: { role: true },
      orderBy: [desc(users.createdAt)]
    });

    // Get total bond records grouped by user_id
    const recordCounts = await db
      .select({
        userId: bondRecords.userId,
        count: sql<number>`count(*)`
      })
      .from(bondRecords)
      .groupBy(bondRecords.userId);

    const countMap = new Map<number, number>();
    for (const r of recordCounts) {
      if (r.userId) {
        countMap.set(Number(r.userId), Number(r.count || 0));
      }
    }

    const now = Date.now();

    const formattedUsers = allUsers.map((u: any) => {
      const roleName = String(u.role?.name || "user").toLowerCase();
      const isSuperOrAdmin = roleName === "superadmin" || roleName === "admin";

      let daysRemaining = 0;
      let isExpired = false;

      if (isSuperOrAdmin) {
        daysRemaining = 9999;
      } else if (u.subscriptionExpiresAt) {
        const diff = new Date(u.subscriptionExpiresAt).getTime() - now;
        daysRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
        isExpired = diff <= 0;
      } else if (u.status === "pending") {
        daysRemaining = 0;
      }

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role?.name || "user",
        roleId: u.roleId,
        status: u.status || "pending",
        isExpired,
        daysRemaining,
        billingCycleDays: u.billingCycleDays || 30,
        subscriptionExpiresAt: u.subscriptionExpiresAt,
        approvedAt: u.approvedAt,
        approvedBy: u.approvedBy,
        emailVerifiedAt: u.emailVerifiedAt,
        createdAt: u.createdAt,
        totalRecords: countMap.get(u.id) || 0
      };
    });

    // Filter by search & status
    const filteredUsers = formattedUsers.filter((u: any) => {
      if (search) {
        const matchesName = u.name?.toLowerCase().includes(search);
        const matchesEmail = u.email?.toLowerCase().includes(search);
        if (!matchesName && !matchesEmail) return false;
      }
      if (statusFilter && statusFilter !== "all") {
        if (statusFilter === "expired") {
          return u.isExpired && u.status === "active";
        }
        return u.status === statusFilter;
      }
      return true;
    });

    // Summary counts
    const pendingCount = formattedUsers.filter((u: any) => u.status === "pending").length;
    const activeCount = formattedUsers.filter((u: any) => u.status === "active" && !u.isExpired).length;
    const expiredCount = formattedUsers.filter((u: any) => u.isExpired && u.status === "active").length;
    const suspendedCount = formattedUsers.filter((u: any) => u.status === "suspended").length;

    return c.json({
      success: true,
      data: filteredUsers,
      summary: {
        total: formattedUsers.length,
        pendingCount,
        activeCount,
        expiredCount,
        suspendedCount
      }
    });
  } catch (error: any) {
    console.error("List users error:", error);
    return c.json({ message: error.message }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * 2. Approve Pending User (Activate & set 30-Day Billing Access)
 * Route: POST /api/admin/users/:id/approve
 */
export const approveUser: Handler = async (c: any) => {
  try {
    const auth = c.get("auth");
    if (!isUserAdmin(auth)) {
      return c.json({ message: "Access denied. Administrator privileges required." }, HttpStatusCodes.FORBIDDEN);
    }

    const userId = Number(c.req.param("id"));
    const body = await c.req.json().catch(() => ({}));
    const cycleDays = Number(body.days || 30);

    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
      with: { role: true }
    });

    if (!targetUser) {
      return c.json({ message: "User not found" }, HttpStatusCodes.NOT_FOUND);
    }

    // Set 30-day access from now
    const expiresAt = new Date(Date.now() + cycleDays * 24 * 60 * 60 * 1000);

    await db
      .update(users)
      .set({
        status: "active",
        billingCycleDays: cycleDays,
        subscriptionExpiresAt: expiresAt,
        approvedAt: new Date(),
        approvedBy: Number(auth.id),
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));

    return c.json({
      success: true,
      message: `User "${targetUser.name}" has been approved with ${cycleDays} days access (expires on ${expiresAt.toLocaleDateString()}).`,
      data: {
        userId,
        status: "active",
        subscriptionExpiresAt: expiresAt,
        daysRemaining: cycleDays
      }
    });
  } catch (error: any) {
    console.error("Approve user error:", error);
    return c.json({ message: error.message }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * 3. Renew / Extend 30-Day Billing Cycle
 * Route: POST /api/admin/users/:id/renew
 */
export const renewUserBilling: Handler = async (c: any) => {
  try {
    const auth = c.get("auth");
    if (!isUserAdmin(auth)) {
      return c.json({ message: "Access denied. Administrator privileges required." }, HttpStatusCodes.FORBIDDEN);
    }

    const userId = Number(c.req.param("id"));
    const body = await c.req.json().catch(() => ({}));
    const extendDays = Number(body.days || 30);

    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, userId)
    });

    if (!targetUser) {
      return c.json({ message: "User not found" }, HttpStatusCodes.NOT_FOUND);
    }

    // If current expiration is still in the future, extend from that date; otherwise from now
    const now = Date.now();
    let baseTime = now;
    if (targetUser.subscriptionExpiresAt && new Date(targetUser.subscriptionExpiresAt).getTime() > now) {
      baseTime = new Date(targetUser.subscriptionExpiresAt).getTime();
    }

    const newExpiresAt = new Date(baseTime + extendDays * 24 * 60 * 60 * 1000);

    await db
      .update(users)
      .set({
        status: "active",
        billingCycleDays: extendDays,
        subscriptionExpiresAt: newExpiresAt,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));

    const totalDaysRemaining = Math.max(0, Math.ceil((newExpiresAt.getTime() - now) / (1000 * 60 * 60 * 24)));

    return c.json({
      success: true,
      message: `Billing cycle renewed by +${extendDays} days for "${targetUser.name}". Total ${totalDaysRemaining} days remaining.`,
      data: {
        userId,
        status: "active",
        subscriptionExpiresAt: newExpiresAt,
        daysRemaining: totalDaysRemaining
      }
    });
  } catch (error: any) {
    console.error("Renew billing error:", error);
    return c.json({ message: error.message }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * 4. Update User Status (active, suspended, pending)
 * Route: POST /api/admin/users/:id/status
 */
export const updateUserStatus: Handler = async (c: any) => {
  try {
    const auth = c.get("auth");
    if (!isUserAdmin(auth)) {
      return c.json({ message: "Access denied. Administrator privileges required." }, HttpStatusCodes.FORBIDDEN);
    }

    const userId = Number(c.req.param("id"));
    const body = await c.req.json();
    const newStatus = String(body.status || "active").trim().toLowerCase();

    if (!["active", "suspended", "pending", "rejected"].includes(newStatus)) {
      return c.json({ message: "Invalid status value" }, HttpStatusCodes.BAD_REQUEST);
    }

    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, userId)
    });

    if (!targetUser) {
      return c.json({ message: "User not found" }, HttpStatusCodes.NOT_FOUND);
    }

    await db
      .update(users)
      .set({
        status: newStatus,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));

    return c.json({
      success: true,
      message: `User status updated to "${newStatus}".`,
      data: {
        userId,
        status: newStatus
      }
    });
  } catch (error: any) {
    console.error("Update user status error:", error);
    return c.json({ message: error.message }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * 5. Delete User & all associated data
 * Route: DELETE /api/admin/users/:id
 */
export const deleteUser: Handler = async (c: any) => {
  try {
    const auth = c.get("auth");
    if (!isUserAdmin(auth)) {
      return c.json({ message: "Access denied. Administrator privileges required." }, HttpStatusCodes.FORBIDDEN);
    }

    const userId = Number(c.req.param("id"));

    // Prevent deleting own self
    if (Number(auth.id) === userId) {
      return c.json({ message: "You cannot delete your own account." }, HttpStatusCodes.BAD_REQUEST);
    }

    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, userId)
    });

    if (!targetUser) {
      return c.json({ message: "User not found" }, HttpStatusCodes.NOT_FOUND);
    }

    // Delete user (foreign keys cascade to bond_records & tokens)
    await db.delete(users).where(eq(users.id, userId));

    return c.json({
      success: true,
      message: `User "${targetUser.name}" and all associated records have been permanently deleted.`
    });
  } catch (error: any) {
    console.error("Delete user error:", error);
    return c.json({ message: error.message }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};
