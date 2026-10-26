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
  return role === "superadmin" || role === "admin";
}

function isUserSuperAdmin(auth: any): boolean {
  const role = String(auth?.role || "").toLowerCase();
  return role === "superadmin";
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

    let allUsers = await db.query.users.findMany({
      with: { role: true, parent: true, operators: true },
      orderBy: [desc(users.createdAt)]
    });

    // If requester is not SuperAdmin, hide SuperAdmin account so Admin only manages office users
    if (!isUserSuperAdmin(auth)) {
      allUsers = allUsers.filter((u: any) => String(u.role?.name || "").toLowerCase() !== "superadmin");
    }

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
    const officeAdmin = allUsers.find((user: any) => String(user.role?.name || "").toLowerCase() === "admin");

    const formattedUsers = allUsers.map((u: any) => {
      const roleName = String(u.role?.name || "user").toLowerCase();
      const isSuperAdmin = roleName === "superadmin";
      const isAdmin = roleName === "admin";
      const isOperator = Boolean(u.adminId) || roleName === "operator";

      let daysRemaining = 0;
      let isExpired = false;
      let effectiveSubscriptionExpiresAt = u.subscriptionExpiresAt;

      if (isSuperAdmin) {
        daysRemaining = 9999;
        isExpired = false;
      } else if (isAdmin) {
        if (u.subscriptionExpiresAt) {
          const diff = new Date(u.subscriptionExpiresAt).getTime() - now;
          daysRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
          isExpired = diff <= 0;
        } else {
          daysRemaining = 0;
          isExpired = true;
        }
      } else {
        // Regular user or operator: inherited from office admin or parent if not set
        if (!effectiveSubscriptionExpiresAt) {
          effectiveSubscriptionExpiresAt = u.parent?.subscriptionExpiresAt || officeAdmin?.subscriptionExpiresAt || null;
        }
        if (effectiveSubscriptionExpiresAt) {
          const diff = new Date(effectiveSubscriptionExpiresAt).getTime() - now;
          daysRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
          isExpired = diff <= 0;
        } else {
          daysRemaining = 0;
          isExpired = true;
        }
        if (u.status === "pending") {
          daysRemaining = 0;
          isExpired = false;
        }
      }

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone || null,
        role: u.role?.name || (isOperator ? "operator" : "user"),
        roleId: u.roleId,
        adminId: u.adminId ? Number(u.adminId) : null,
        parentName: u.parent?.name || (isAdmin ? null : officeAdmin?.name) || null,
        parentEmail: u.parent?.email || (isAdmin ? null : officeAdmin?.email) || null,
        parentPhone: u.parent?.phone || (isAdmin ? null : officeAdmin?.phone) || null,
        operatorsCount: Array.isArray(u.operators) ? u.operators.length : 0,
        status: u.status || "pending",
        isExpired,
        daysRemaining,
        billingCycleDays: u.billingCycleDays || 30,
        subscriptionExpiresAt: effectiveSubscriptionExpiresAt,
        approvedAt: u.approvedAt,
        approvedBy: u.approvedBy,
        emailVerifiedAt: u.emailVerifiedAt,
        createdAt: u.createdAt,
        totalRecords: isOperator ? 0 : (countMap.get(u.id) || 0)
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
    let cycleDays = Number(body.days || 30);
    if (!Number.isInteger(cycleDays) || cycleDays < 1 || cycleDays > 3650) {
      cycleDays = 30;
    }

    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
      with: { role: true }
    });

    if (!targetUser) {
      return c.json({ message: "User not found" }, HttpStatusCodes.NOT_FOUND);
    }

    const requesterRole = String(auth?.role || "").toLowerCase();
    const isSuperAdmin = requesterRole === "superadmin";
    const isAdmin = requesterRole === "admin";
    const targetRole = String(targetUser.role?.name || "").toLowerCase();

    if (targetRole === "admin") {
      if (!isSuperAdmin) {
        return c.json({ message: "Only SuperAdmin can approve Admin signups." }, HttpStatusCodes.FORBIDDEN);
      }
    } else if (targetRole === "user" || targetRole === "operator") {
      if (isSuperAdmin) {
        return c.json(
          { message: "SuperAdmin only approves Admin signups. The Office Admin approves User signups." },
          HttpStatusCodes.FORBIDDEN
        );
      }
      if (!isAdmin) {
        return c.json({ message: "Only the Office Admin can approve User signups." }, HttpStatusCodes.FORBIDDEN);
      }
    }

    const isTargetAdmin = targetRole === "admin";
    // Both Admin and User get their configured cycle days (default 30)
    let expiresAt: Date;
    if (isTargetAdmin) {
      expiresAt = new Date(Date.now() + cycleDays * 24 * 60 * 60 * 1000);
    } else {
      // User links to office admin
      const adminUser = await db.query.users.findFirst({ where: eq(users.id, Number(auth.id)) });
      expiresAt = adminUser?.subscriptionExpiresAt || new Date(Date.now() + cycleDays * 24 * 60 * 60 * 1000);
    }

    const updateData: any = {
      status: "active",
      billingCycleDays: cycleDays,
      subscriptionExpiresAt: expiresAt,
      approvedAt: new Date(),
      approvedBy: Number(auth.id),
      updatedAt: new Date()
    };

    if (!isTargetAdmin) {
      updateData.adminId = Number(auth.id);
    }

    await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId));

    const totalDaysRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

    return c.json({
      success: true,
      message: `${isTargetAdmin ? "Admin" : "User"} "${targetUser.name}" has been approved successfully.`,
      data: {
        userId,
        status: "active",
        subscriptionExpiresAt: expiresAt,
        daysRemaining: totalDaysRemaining
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
    let extendDays = Number(body.days || 30);
    if (!Number.isInteger(extendDays) || extendDays < 1 || extendDays > 3650) {
      extendDays = 30;
    }

    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
      with: { parent: true, role: true }
    });

    if (!targetUser) {
      return c.json({ message: "User not found" }, HttpStatusCodes.NOT_FOUND);
    }

    const targetRole = String(targetUser.role?.name || "").toLowerCase();
    const isSuperAdmin = isUserSuperAdmin(auth);
    if (targetRole === "admin" && !isSuperAdmin) {
      return c.json({ message: "Only SuperAdmin can renew an Office Admin's subscription." }, HttpStatusCodes.FORBIDDEN);
    }

    // If target is an operator, extend the parent tenant's subscription
    const effectiveTargetId = targetUser.adminId ? Number(targetUser.adminId) : targetUser.id;
    const effectiveUser = targetUser.adminId
      ? (targetUser.parent || (await db.query.users.findFirst({ where: eq(users.id, effectiveTargetId) })))
      : targetUser;

    if (!effectiveUser) {
      return c.json({ message: "Parent tenant account not found" }, HttpStatusCodes.NOT_FOUND);
    }

    // If current expiration is still in the future, extend from that date; otherwise from now
    const now = Date.now();
    let baseTime = now;
    if (effectiveUser.subscriptionExpiresAt && new Date(effectiveUser.subscriptionExpiresAt).getTime() > now) {
      baseTime = new Date(effectiveUser.subscriptionExpiresAt).getTime();
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
      .where(eq(users.id, effectiveTargetId));

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
      where: eq(users.id, userId),
      with: { role: true }
    });

    if (!targetUser) {
      return c.json({ message: "User not found" }, HttpStatusCodes.NOT_FOUND);
    }

    if (Number(auth.id) === userId) {
      return c.json({ message: "You cannot change your own account status" }, HttpStatusCodes.BAD_REQUEST);
    }

    const targetRoleName = String(targetUser.role?.name || "").toLowerCase();
    const isSuperAdmin = isUserSuperAdmin(auth);

    if (targetRoleName === "superadmin" && !isSuperAdmin) {
      return c.json({ message: "Only superadmin can modify a superadmin's status" }, HttpStatusCodes.FORBIDDEN);
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
      where: eq(users.id, userId),
      with: { role: true }
    });

    if (!targetUser) {
      return c.json({ message: "User not found" }, HttpStatusCodes.NOT_FOUND);
    }

    const targetRoleName = String(targetUser.role?.name || "").toLowerCase();
    const isSuperAdmin = isUserSuperAdmin(auth);

    if (targetRoleName === "superadmin" && !isSuperAdmin) {
      return c.json({ message: "Only superadmin can delete a superadmin account" }, HttpStatusCodes.FORBIDDEN);
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

/**
 * 6. Change User Role (superadmin, admin, user, operator)
 * Route: POST /api/admin/users/:id/role
 */
export const updateUserRole: Handler = async (c: any) => {
  try {
    const auth = c.get("auth");
    if (!isUserAdmin(auth)) {
      return c.json({ message: "Access denied. Administrator privileges required." }, HttpStatusCodes.FORBIDDEN);
    }

    const userId = Number(c.req.param("id"));
    const body = await c.req.json();
    const roleName = String(body.role || "").toLowerCase().trim();
    const parentAdminId = body.adminId !== undefined ? (body.adminId ? Number(body.adminId) : null) : undefined;

    if (!["superadmin", "admin", "user", "operator"].includes(roleName)) {
      return c.json({ message: "Invalid role. Supported roles: superadmin, admin, user, operator" }, HttpStatusCodes.BAD_REQUEST);
    }

    // Prevent changing own role
    if (Number(auth.id) === userId) {
      return c.json({ message: "You cannot change your own role." }, HttpStatusCodes.BAD_REQUEST);
    }

    const isSuperAdmin = isUserSuperAdmin(auth);

    // Only superadmin can assign superadmin role
    if (roleName === "superadmin" && !isSuperAdmin) {
      return c.json({ message: "Only superadmin can promote a user to superadmin." }, HttpStatusCodes.FORBIDDEN);
    }

    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
      with: { role: true }
    });

    if (!targetUser) {
      return c.json({ message: "User not found" }, HttpStatusCodes.NOT_FOUND);
    }

    const targetRoleName = String(targetUser.role?.name || "").toLowerCase();

    // Only superadmin can modify a superadmin
    if (targetRoleName === "superadmin" && !isSuperAdmin) {
      return c.json({ message: "Only superadmin can modify a superadmin user." }, HttpStatusCodes.FORBIDDEN);
    }

    // Validate operator parent assignment
    if (roleName === "operator") {
      if (!parentAdminId) {
        return c.json({ message: "An operator must be assigned to a valid parent user." }, HttpStatusCodes.BAD_REQUEST);
      }
      if (parentAdminId === userId) {
        return c.json({ message: "A user cannot be their own parent." }, HttpStatusCodes.BAD_REQUEST);
      }
      const parentUser = await db.query.users.findFirst({
        where: eq(users.id, parentAdminId),
        with: { role: true }
      });
      if (!parentUser) {
        return c.json({ message: "The specified parent user does not exist." }, HttpStatusCodes.BAD_REQUEST);
      }
      const parentRoleName = String(parentUser.role?.name || "").toLowerCase();
      if (parentRoleName === "operator" || parentUser.adminId) {
        return c.json({ message: "An operator cannot be the parent of another operator." }, HttpStatusCodes.BAD_REQUEST);
      }
    }

    // Ensure role exists in roles table
    let roleRecord = await db.query.roles.findFirst({
      where: eq(roles.name, roleName)
    });
    if (!roleRecord) {
      try {
        const [created] = await db.insert(roles).values({ name: roleName }).returning();
        roleRecord = created;
      } catch (_) {
        roleRecord = await db.query.roles.findFirst({ where: eq(roles.name, roleName) });
      }
    }

    const updates: any = {
      roleId: roleRecord?.id || null,
      updatedAt: new Date()
    };

    if (roleName === "operator") {
      if (parentAdminId !== undefined) {
        updates.adminId = parentAdminId;
      }
    } else {
      // If changing from operator to user/admin/superadmin, clear adminId
      updates.adminId = null;
    }

    await db.update(users).set(updates).where(eq(users.id, userId));

    let selfDemoted = false;
    let responseMessage = `Role for "${targetUser.name}" successfully changed to "${roleName}".`;

    // If an Admin (not SuperAdmin) sets another user as Admin,
    // they automatically transfer the admin role and become a regular user
    if (roleName === "admin" && !isSuperAdmin) {
      let userRoleRecord = await db.query.roles.findFirst({
        where: eq(roles.name, "user")
      });
      if (!userRoleRecord) {
        try {
          const [created] = await db.insert(roles).values({ name: "user" }).returning();
          userRoleRecord = created;
        } catch (_) {
          userRoleRecord = await db.query.roles.findFirst({ where: eq(roles.name, "user") });
        }
      }
      if (userRoleRecord) {
        await db
          .update(users)
          .set({ roleId: userRoleRecord.id, updatedAt: new Date() })
          .where(eq(users.id, Number(auth.id)));
        selfDemoted = true;
        responseMessage = `Admin role successfully transferred to "${targetUser.name}". Your account has been converted to User role.`;
      }
    }

    return c.json({
      success: true,
      message: responseMessage,
      selfDemoted,
      data: {
        userId,
        role: roleName,
        roleId: roleRecord?.id,
        adminId: updates.adminId
      }
    });
  } catch (error: any) {
    console.error("Update user role error:", error);
    return c.json({ message: error.message }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * 7. Update User Phone Number
 * Route: POST /api/admin/users/:id/phone
 */
export const updateUserPhone: Handler = async (c: any) => {
  try {
    const auth = c.get("auth");
    if (!isUserAdmin(auth)) {
      return c.json({ message: "Access denied. Administrator privileges required." }, HttpStatusCodes.FORBIDDEN);
    }

    const userId = Number(c.req.param("id"));
    const body = await c.req.json().catch(() => ({}));
    const phone = body.phone !== undefined ? (body.phone ? String(body.phone).trim() : null) : null;

    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
      with: { role: true }
    });

    if (!targetUser) {
      return c.json({ message: "User not found" }, HttpStatusCodes.NOT_FOUND);
    }

    const isSuperAdmin = isUserSuperAdmin(auth);
    const targetRole = String(targetUser.role?.name || "").toLowerCase();

    // Regular admin can only edit users; SuperAdmin can edit admin or users
    if (targetRole === "admin" && !isSuperAdmin && Number(auth.id) !== userId) {
      return c.json({ message: "Only SuperAdmin can update Admin phone." }, HttpStatusCodes.FORBIDDEN);
    }

    await db
      .update(users)
      .set({
        phone,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));

    return c.json({
      success: true,
      message: `Phone number updated successfully.`,
      data: {
        userId,
        phone
      }
    });
  } catch (error: any) {
    console.error("Update user phone error:", error);
    return c.json({ message: error.message }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};


