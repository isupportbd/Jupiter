import type { Context, Next } from "hono";
import { eq } from "drizzle-orm";
import { db } from "@/framework/facade.js";
import { users } from "@/modules/auth/database/models/user.js";
import { checkUserSubscriptionStatus } from "@/modules/auth/controllers/auth.helpers.js";

export async function subscriptionMiddleware(c: Context, next: Next) {
  const auth = c.get("auth") as any;
  if (!auth) {
    return await next();
  }

  // SuperAdmin is platform owner and always exempt
  const role = String(auth.role || "").toLowerCase();
  if (role === "superadmin") {
    return await next();
  }

  // Exempt read-only HTTP GET, HEAD, OPTIONS requests UNLESS it is an export request
  const method = c.req.method.toUpperCase();
  const isExport = c.req.query("export") === "true";
  if ((method === "GET" || method === "HEAD" || method === "OPTIONS") && !isExport) {
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
      where: eq(users.id, currentUserId),
      with: { role: true, parent: true }
    });

    if (!currentUser) {
      return await next();
    }

    const subCheck = await checkUserSubscriptionStatus(currentUser);
    if (subCheck.expired) {
      return c.json(
        {
          success: false,
          isSubscriptionExpired: true,
          adminPhone: subCheck.adminPhone || null,
          adminName: subCheck.adminName || null,
          message: subCheck.message
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
