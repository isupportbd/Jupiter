import type { Context, Next } from "hono";
import { eq } from "drizzle-orm";
import { db } from "@/framework/facade.js";
import { users } from "@/modules/auth/database/models/user.js";

export async function subscriptionMiddleware(c: Context, next: Next) {
  const auth = c.get("auth") as any;
  if (!auth) {
    return await next();
  }

  // SuperAdmin is exempt from subscription restrictions
  const role = String(auth.role || "").toLowerCase();
  if (role === "superadmin" || role === "admin" || auth.roleId === 1) {
    return await next();
  }

  // Exempt read-only HTTP GET, HEAD, OPTIONS requests
  const method = c.req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return await next();
  }

  // Exempt auth routes
  const path = c.req.path;
  if (path.startsWith("/api/auth/")) {
    return await next();
  }

  try {
    const currentUserId = Number(auth.id);
    const currentUser = await db.query.users.findFirst({
      where: eq(users.id, currentUserId)
    });

    const targetUserId = currentUser.adminId ? Number(currentUser.adminId) : currentUserId;
    const effectiveUser = currentUser.adminId
      ? await db.query.users.findFirst({ where: eq(users.id, targetUserId) })
      : currentUser;

    if (!effectiveUser) {
      return await next();
    }

    const isSubscriptionActive = !!(
      effectiveUser.subscriptionExpiresAt &&
      new Date(effectiveUser.subscriptionExpiresAt).getTime() > Date.now()
    );

    if (!isSubscriptionActive) {
      return c.json(
        {
          success: false,
          isSubscriptionExpired: true,
          message: "Your account subscription has expired. Please contact the Administrator to renew."
        },
        403
      );
    }

    return await next();
  } catch (err) {
    console.error("Subscription middleware error:", err);
    return await next();
  }
}
