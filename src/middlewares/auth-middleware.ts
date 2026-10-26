import { eq } from "drizzle-orm";
import type { Context, Next } from "hono";
import { cookie, db, jwt } from "@/framework/facade.js";
import { refreshTokens, users } from "@/modules/auth/database/models/user.js";

export async function authMiddleware(c: Context, next: Next) {
  let accessToken = await cookie.getAuth(c);

  if (!accessToken) {
    const authHeader = c.req.header("Authorization") || c.req.header("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      accessToken = authHeader.substring(7).trim();
    }
  }

  if (!accessToken) {
    const queryToken = c.req.query("token");
    if (queryToken) {
      accessToken = queryToken.trim();
    }
  }

  if (accessToken) {
    const accessPayload = await jwt.verifyToken(accessToken, "access");

    if (accessPayload && accessPayload.id) {
      // Verify in real-time against database that account exists and is active for all roles
      const user = await db.query.users.findFirst({
        where: eq(users.id, Number(accessPayload.id)),
        with: { role: true, parent: true }
      });

      if (!user) {
        cookie.deleteAuth(c);
        cookie.deleteRefresh(c);
        return c.json({ message: "User account no longer exists." }, 401);
      }

      if (user.status === "pending") {
        return c.json({ message: "Your account is pending administrator approval." }, 403);
      }

      if (user.status === "suspended" || user.status === "rejected") {
        return c.json({ message: "Your account has been suspended by the administrator." }, 403);
      }

      // If operator, enforce that primary parent account is active
      if (user.adminId && user.parent) {
        if (user.parent.status === "suspended" || user.parent.status === "rejected") {
          return c.json({ message: "The primary parent account has been suspended." }, 403);
        }
      }

      c.set("auth", {
        ...accessPayload,
        id: user.id,
        email: user.email,
        adminId: user.adminId ? Number(user.adminId) : null,
        roleId: user.role?.id ?? null,
        role: user.role?.name ?? null
      });
      return await next();
    }
  }

  const refreshToken = await cookie.getRefresh(c);

  if (!refreshToken) {
    cookie.deleteAuth(c);
    cookie.deleteRefresh(c);
    return c.json({ message: "Unauthorized" }, 401);
  }

  const refreshPayload = await jwt.verifyToken(refreshToken, "refresh");

  if (!refreshPayload?.jti) {
    cookie.deleteAuth(c);
    cookie.deleteRefresh(c);
    return c.json({ message: "Invalid token" }, 401);
  }

  const storedToken = await db.query.refreshTokens.findFirst({
    where: eq(refreshTokens.jti, refreshPayload.jti as string)
  });

  if (!storedToken || storedToken.revoked) {
    cookie.deleteAuth(c);
    cookie.deleteRefresh(c);
    return c.json({ message: "Invalid token" }, 401);
  }

  if (storedToken.expiresAt.getTime() < Date.now()) {
    await db.delete(refreshTokens).where(eq(refreshTokens.id, storedToken.id));
    cookie.deleteAuth(c);
    cookie.deleteRefresh(c);
    return c.json({ message: "Invalid token" }, 401);
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, refreshPayload.id as number),
    with: { role: true, parent: true }
  });

  if (!user) {
    cookie.deleteAuth(c);
    cookie.deleteRefresh(c);
    return c.json({ message: "Unauthorized" }, 401);
  }

  if (user.status === "suspended" || user.status === "rejected" || user.status === "pending") {
    cookie.deleteAuth(c);
    cookie.deleteRefresh(c);
    return c.json({ message: "Account is not active." }, 403);
  }

  if (user.adminId && user.parent && (user.parent.status === "suspended" || user.parent.status === "rejected")) {
    cookie.deleteAuth(c);
    cookie.deleteRefresh(c);
    return c.json({ message: "The primary parent account has been suspended." }, 403);
  }

  const newAccessToken = await jwt.generateToken(
    {
      id: user.id,
      email: user.email,
      adminId: user.adminId ?? null,
      roleId: user.role?.id ?? null,
      role: user.role?.name ?? null
    },
    "access"
  );

  await cookie.setAuth(c, newAccessToken.token);
  c.set("auth", {
    id: user.id,
    email: user.email,
    adminId: user.adminId ?? null,
    roleId: user.role?.id ?? null,
    role: user.role?.name ?? null,
    type: "access"
  });
  return await next();
}
