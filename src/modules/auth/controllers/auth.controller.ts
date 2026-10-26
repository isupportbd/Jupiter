import { and, desc, eq, gt, lt } from "drizzle-orm";
import type { Handler } from "hono";
import { authConfig, jwtConfig } from "@/config/index.js";
import { cookie, db, dispatchEvent, HttpStatusCodes, jwt, password, urls } from "@/framework/facade.js";
import { mail } from "@/framework/support/mail.js";
import { roles } from "@/modules/auth/database/models/role.js";
import {
  emailVerificationTokens,
  otpVerifications,
  passwordResetTokens,
  refreshTokens,
  users
} from "@/modules/auth/database/models/user.js";
import {
  generateAndSaveOtp,
  hashEmailVerificationToken,
  hashResetToken,
  issueTokens,
  makeEmailVerificationToken,
  makeResetToken,
  revokeCurrentRefreshToken,
  sanitizeUser,
  validateAndBurnOtp,
  checkUserSubscriptionStatus
} from "./auth.helpers.js";

/**
 * 1. User Registration (Initiates Signup & sends 6-digit Email OTP)
 * Route: POST /auth/register
 */
export const register: Handler = async (c: any) => {
  try {
    const body = c.req.valid("json");
    const cleanEmail = body.email.toLowerCase().trim();

    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, cleanEmail)
    });

    if (existingUser && existingUser.emailVerifiedAt) {
      return c.json({ message: "An account with this email already exists" }, HttpStatusCodes.UNPROCESSABLE_ENTITY);
    }

    const requestedRoleName = (body.role || "user").toLowerCase() === "admin" ? "admin" : "user";

    // If requesting admin role, verify if an active office admin already exists
    if (requestedRoleName === "admin") {
      const adminRoleRecord = await db.query.roles.findFirst({ where: eq(roles.name, "admin") });
      if (adminRoleRecord) {
        const existingAdmin = await db.query.users.findFirst({
          where: and(eq(users.roleId, adminRoleRecord.id), eq(users.status, "active"))
        });
        if (existingAdmin && existingAdmin.email !== cleanEmail) {
          return c.json(
            { message: "An Office Admin already exists for this office. Please register as a User." },
            HttpStatusCodes.UNPROCESSABLE_ENTITY
          );
        }
      }
    }

    let assignedRole = await db.query.roles.findFirst({
      where: eq(roles.name, requestedRoleName)
    });

    if (!assignedRole) {
      const [newRole] = await db.insert(roles).values({ name: requestedRoleName }).returning();
      assignedRole = newRole;
    }

    const hashedPassword = await password.hashPassword(body.password);
    const cleanPhone = body.phone ? String(body.phone).trim() : null;

    if (existingUser && !existingUser.emailVerifiedAt) {
      await db
        .update(users)
        .set({
          name: body.name.trim(),
          phone: cleanPhone,
          password: hashedPassword,
          roleId: assignedRole?.id ?? null,
          status: "pending",
          billingCycleDays: 30,
          updatedAt: new Date()
        })
        .where(eq(users.id, existingUser.id));
    } else {
      await db.insert(users).values({
        name: body.name.trim(),
        email: cleanEmail,
        phone: cleanPhone,
        password: hashedPassword,
        roleId: assignedRole?.id ?? null,
        status: "pending",
        billingCycleDays: 30,
        subscriptionExpiresAt: null,
        emailVerifiedAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    const approvalTarget = requestedRoleName === "admin" ? "SuperAdmin" : "Office Administrator";

    // If email verification is enabled, generate & dispatch OTP
    if (authConfig.requireEmailVerification) {
      const otp = await generateAndSaveOtp(cleanEmail, "signup", 10);
      await mail.sendSignupOtpMail(cleanEmail, body.name.trim(), otp);

      return c.json(
        {
          success: true,
          requireOtp: true,
          email: cleanEmail,
          message: "A 6-digit verification code has been sent to your email. Please enter the code to complete registration."
        },
        HttpStatusCodes.OK
      );
    }

    // Email verification disabled (direct signup in dev/configured mode)
    await db
      .update(users)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.email, cleanEmail));

    return c.json(
      {
        success: true,
        requireOtp: false,
        isPendingApproval: true,
        email: cleanEmail,
        message: `Registration successful! Your ${requestedRoleName === "admin" ? "Admin " : ""}account has been submitted and is awaiting ${approvalTarget} approval.`
      },
      HttpStatusCodes.OK
    );
  } catch (error) {
    console.error("Register error:", error);
    return c.json({ message: "Failed to register account" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * 2. Verify Signup OTP
 * Route: POST /auth/verify-otp
 */
export const verifySignupOtp: Handler = async (c: any) => {
  try {
    const body = c.req.valid("json");
    const cleanEmail = body.email.toLowerCase().trim();

    const validation = await validateAndBurnOtp(cleanEmail, body.otp, "signup");
    if (!validation.valid) {
      return c.json({ message: validation.message || "Invalid or expired verification code" }, HttpStatusCodes.UNPROCESSABLE_ENTITY);
    }

    const user = await db.query.users.findFirst({
      where: eq(users.email, cleanEmail),
      with: { role: true }
    });

    if (!user) {
      return c.json({ message: "User account not found" }, HttpStatusCodes.NOT_FOUND);
    }

    // Mark user email as verified
    await db
      .update(users)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, user.id));

    const userRole = String(user.role?.name || "").toLowerCase();
    const approvalTarget = userRole === "admin" ? "SuperAdmin" : "Office Administrator";

    return c.json(
      {
        success: true,
        isPendingApproval: true,
        message: `Email verified successfully! Your ${userRole === "admin" ? "Admin " : ""}account has been submitted and is awaiting ${approvalTarget} approval.`,
        data: {
          user: sanitizeUser(user)
        }
      },
      HttpStatusCodes.OK
    );
  } catch (error) {
    console.error("Verify Signup OTP error:", error);
    return c.json({ message: "Failed to verify signup code" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * 3. User Login - Validates Credentials, Status, and Dispatches 2FA Login OTP (or direct login if OTP disabled)
 * Route: POST /auth/login
 */
export const login: Handler = async (c: any) => {
  try {
    const body = c.req.valid("json");
    const cleanEmail = body.email.toLowerCase().trim();

    const user = await db.query.users.findFirst({
      where: eq(users.email, cleanEmail),
      with: { role: true, parent: true }
    });

    if (!user || !(await password.verifyPassword(body.password, user.password))) {
      return c.json({ message: "Invalid email or password" }, HttpStatusCodes.UNAUTHORIZED);
    }

    const roleName = String(user.role?.name || "").toLowerCase();
    const isSuperOrAdmin = roleName === "superadmin" || roleName === "admin";

    // Check Account Status
    if (user.status === "pending") {
      return c.json(
        {
          success: false,
          isPendingApproval: true,
          message: "Your account is pending Administrator approval. Please contact support or wait for approval before logging in."
        },
        HttpStatusCodes.FORBIDDEN
      );
    }

    if (user.status === "suspended" || user.status === "rejected") {
      return c.json(
        {
          success: false,
          isSuspended: true,
          message: "Your account has been deactivated or suspended. Please contact the Administrator."
        },
        HttpStatusCodes.FORBIDDEN
      );
    }

    // If operator, also check parent account status
    if (user.adminId && user.parent) {
      if (user.parent.status === "suspended" || user.parent.status === "rejected") {
        return c.json(
          {
            success: false,
            isSuspended: true,
            message: "The primary account has been suspended. Access is currently disabled."
          },
          HttpStatusCodes.FORBIDDEN
        );
      }
    }

    // Check Subscription Expiry
    const subCheck = await checkUserSubscriptionStatus(user);
    if (subCheck.expired) {
      return c.json(
        {
          success: false,
          isSubscriptionExpired: true,
          adminPhone: subCheck.adminPhone || null,
          adminName: subCheck.adminName || null,
          message: subCheck.message
        },
        HttpStatusCodes.FORBIDDEN
      );
    }

    // If 2FA Login OTP is required
    if (authConfig.requireLoginOtp) {
      // Generate & Dispatch 2FA Login OTP (Valid 5 minutes)
      const otp = await generateAndSaveOtp(cleanEmail, "login", 5);
      await mail.sendLoginOtpMail(cleanEmail, user.name, otp);

      return c.json(
        {
          success: true,
          requireOtp: true,
          email: cleanEmail,
          message: "A 6-digit login security code has been sent to your email."
        },
        HttpStatusCodes.OK
      );
    }

    // Direct Login without OTP (Development / OTP disabled mode)
    if (!user.emailVerifiedAt) {
      await db.update(users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));
    }

    await revokeCurrentRefreshToken(c);
    const tokens = await issueTokens(c, user, { remember: !!body.remember });

    return c.json(
      {
        success: true,
        message: "Login successful! Welcome to Jupiter.",
        data: {
          user: sanitizeUser(user),
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          token_type: "Bearer"
        }
      },
      HttpStatusCodes.OK
    );
  } catch (error) {
    console.error("Login error:", error);
    return c.json({ message: "Failed to process login request" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * 4. Verify 2FA Login OTP and Issue JWT Tokens
 * Route: POST /auth/verify-login-otp
 */
export const verifyLoginOtp: Handler = async (c: any) => {
  try {
    const body = c.req.valid("json");
    const cleanEmail = body.email.toLowerCase().trim();

    // Verify OTP with single-use & brute-force protection
    const validation = await validateAndBurnOtp(cleanEmail, body.otp, "login");
    if (!validation.valid) {
      return c.json({ message: validation.message || "Invalid or expired login code" }, HttpStatusCodes.UNPROCESSABLE_ENTITY);
    }

    const user = await db.query.users.findFirst({
      where: eq(users.email, cleanEmail),
      with: { role: true, parent: true }
    });

    if (!user) {
      return c.json({ message: "User account not found" }, HttpStatusCodes.NOT_FOUND);
    }

    if (user.status === "pending") {
      return c.json(
        { message: "Your account is pending Administrator approval." },
        HttpStatusCodes.FORBIDDEN
      );
    }

    if (user.status === "suspended" || user.status === "rejected") {
      return c.json(
        { message: "Your account has been deactivated or suspended. Please contact the Administrator." },
        HttpStatusCodes.FORBIDDEN
      );
    }

    if (user.adminId && user.parent) {
      if (user.parent.status === "suspended" || user.parent.status === "rejected") {
        return c.json(
          { message: "The primary account has been suspended." },
          HttpStatusCodes.FORBIDDEN
        );
      }
    }

    // Check Subscription Expiry
    const subCheck = await checkUserSubscriptionStatus(user);
    if (subCheck.expired) {
      return c.json(
        {
          success: false,
          isSubscriptionExpired: true,
          adminPhone: subCheck.adminPhone || null,
          adminName: subCheck.adminName || null,
          message: subCheck.message
        },
        HttpStatusCodes.FORBIDDEN
      );
    }

    // If account was unverified, auto-verify now
    if (!user.emailVerifiedAt) {
      await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, user.id));
    }

    await revokeCurrentRefreshToken(c);
    const tokens = await issueTokens(c, user, { remember: !!body.remember });

    return c.json(
      {
        message: "Login successful! Welcome to Jupiter.",
        data: {
          user: sanitizeUser(user),
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          token_type: "Bearer"
        }
      },
      HttpStatusCodes.OK
    );
  } catch (error) {
    console.error("Verify Login OTP error:", error);
    return c.json({ message: "Failed to verify login code" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * 5. Resend OTP for Signup, Login, or Password Reset
 * Route: POST /auth/resend-otp
 */
export const resendOtp: Handler = async (c: any) => {
  try {
    const body = c.req.valid("json");
    const cleanEmail = body.email.toLowerCase().trim();
    const type = body.type || "login";

    const user = await db.query.users.findFirst({
      where: eq(users.email, cleanEmail),
      with: { parent: true }
    });

    if (!user && type !== "signup") {
      return c.json({ message: "If an account exists with this email, a verification code has been sent." }, HttpStatusCodes.OK);
    }

    if (user && (user.status === "suspended" || user.status === "rejected")) {
      return c.json({ message: "Your account has been deactivated or suspended." }, HttpStatusCodes.FORBIDDEN);
    }

    if (user?.adminId && user.parent && (user.parent.status === "suspended" || user.parent.status === "rejected")) {
      return c.json({ message: "The primary account has been suspended." }, HttpStatusCodes.FORBIDDEN);
    }

    const name = user?.name || "User";
    const expiryMins = type === "login" ? 5 : 10;
    const otp = await generateAndSaveOtp(cleanEmail, type, expiryMins);

    if (type === "signup") {
      await mail.sendSignupOtpMail(cleanEmail, name, otp);
    } else if (type === "login") {
      await mail.sendLoginOtpMail(cleanEmail, name, otp);
    } else if (type === "reset_password") {
      await mail.sendResetPasswordOtpMail(cleanEmail, name, otp);
    }

    return c.json({ message: "A new verification code has been sent to your email." }, HttpStatusCodes.OK);
  } catch (error) {
    console.error("Resend OTP error:", error);
    return c.json({ message: "Failed to resend verification code" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * 6. Initiate Forgot Password flow with 6-digit OTP
 * Route: POST /auth/forgot-password
 */
export const forgotPassword: Handler = async (c: any) => {
  try {
    const body = c.req.valid("json");
    const cleanEmail = body.email.toLowerCase().trim();

    const user = await db.query.users.findFirst({
      where: eq(users.email, cleanEmail)
    });

    if (user) {
      const otp = await generateAndSaveOtp(cleanEmail, "reset_password", 10);
      await mail.sendResetPasswordOtpMail(cleanEmail, user.name, otp);
    }

    return c.json(
      {
        message: "If this email is registered, a 6-digit password reset code has been sent to your inbox.",
        requireOtp: true,
        email: cleanEmail
      },
      HttpStatusCodes.OK
    );
  } catch (error) {
    console.error("Forgot password error:", error);
    return c.json({ message: "Failed to process forgot password request" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * 7. Reset Password with 6-digit OTP
 * Route: POST /auth/reset-password
 */
export const resetPassword: Handler = async (c: any) => {
  try {
    const body = c.req.valid("json");
    const cleanEmail = body.email.toLowerCase().trim();

    const validation = await validateAndBurnOtp(cleanEmail, body.otp, "reset_password");
    if (!validation.valid) {
      return c.json({ message: validation.message || "Invalid or expired reset code" }, HttpStatusCodes.UNPROCESSABLE_ENTITY);
    }

    const user = await db.query.users.findFirst({
      where: eq(users.email, cleanEmail)
    });

    if (!user) {
      return c.json({ message: "User account not found" }, HttpStatusCodes.NOT_FOUND);
    }

    await db
      .update(users)
      .set({
        password: await password.hashPassword(body.password),
        updatedAt: new Date()
      })
      .where(eq(users.id, user.id));

    await db.update(refreshTokens).set({ revoked: true }).where(eq(refreshTokens.userId, user.id));

    return c.json(
      { message: "Password reset successfully! You can now log in with your new password." },
      HttpStatusCodes.OK
    );
  } catch (error) {
    console.error("Reset password error:", error);
    return c.json({ message: "Failed to reset password" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * 8. Email Verification
 * Route: POST /auth/verify-email
 */
export const verifyEmail: Handler = async (c: any) => {
  try {
    const body = c.req.valid("json");
    const cleanEmail = body.email.toLowerCase().trim();

    if (body.otp) {
      const validation = await validateAndBurnOtp(cleanEmail, body.otp, "signup");
      if (!validation.valid) {
        return c.json({ message: validation.message || "Invalid verification code" }, HttpStatusCodes.UNPROCESSABLE_ENTITY);
      }
    } else if (body.token) {
      const record = await db.query.emailVerificationTokens.findFirst({
        where: and(
          eq(emailVerificationTokens.email, cleanEmail),
          eq(emailVerificationTokens.token, hashEmailVerificationToken(body.token)),
          gt(emailVerificationTokens.expiresAt, new Date())
        )
      });
      if (!record) {
        return c.json({ message: "Invalid or expired verification link" }, HttpStatusCodes.UNPROCESSABLE_ENTITY);
      }
      await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.email, cleanEmail));
    } else {
      return c.json({ message: "Verification OTP or token is required" }, HttpStatusCodes.BAD_REQUEST);
    }

    await db.update(users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.email, cleanEmail));
    return c.json({ message: "Email verified successfully!" }, HttpStatusCodes.OK);
  } catch (error) {
    console.error("Verify email error:", error);
    return c.json({ message: "Failed to verify email" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * 9. Refresh Token
 * Route: POST /auth/refresh-token
 */
export const refreshToken: Handler = async (c: any) => {
  try {
    const body = c.req.valid("json");
    const payload = await jwt.verifyToken(body.refresh_token, "refresh");

    if (!payload?.jti) return c.json({ message: "Invalid refresh token" }, HttpStatusCodes.UNAUTHORIZED);

    const storedToken = await db.query.refreshTokens.findFirst({
      where: eq(refreshTokens.jti, payload.jti as string)
    });

    if (!storedToken || storedToken.revoked) {
      return c.json({ message: "Refresh token revoked" }, HttpStatusCodes.UNAUTHORIZED);
    }

    if (storedToken.expiresAt.getTime() < Date.now()) {
      await db.delete(refreshTokens).where(eq(refreshTokens.id, storedToken.id));
      return c.json({ message: "Refresh token expired" }, HttpStatusCodes.UNAUTHORIZED);
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, payload.id as number),
      with: { role: true, parent: true }
    });
    if (!user) return c.json({ message: "User not found" }, HttpStatusCodes.UNAUTHORIZED);

    if (user.status === "suspended" || user.status === "rejected") {
      return c.json({ message: "Your account has been deactivated or suspended." }, HttpStatusCodes.FORBIDDEN);
    }

    if (user.adminId && user.parent && (user.parent.status === "suspended" || user.parent.status === "rejected")) {
      return c.json({ message: "The primary account has been suspended." }, HttpStatusCodes.FORBIDDEN);
    }

    const remember = !!payload.remember;
    const refreshExpiry = remember ? jwtConfig.refreshRememberExpirySeconds : undefined;
    const adminId = user.adminId ? Number(user.adminId) : null;
    const roleId = user.role?.id ?? null;
    const role = user.role?.name || "user";

    const accessToken = await jwt.generateToken(
      {
        id: user.id,
        email: user.email,
        adminId,
        roleId,
        role,
        remember
      },
      "access"
    );

    const newRefreshToken = await jwt.generateToken(
      {
        id: user.id,
        email: user.email,
        adminId,
        roleId,
        role,
        remember
      },
      "refresh",
      refreshExpiry
    );

    await db.update(refreshTokens).set({ revoked: true }).where(eq(refreshTokens.id, storedToken.id));

    if (newRefreshToken.jti) {
      await db.insert(refreshTokens).values({
        userId: user.id,
        jti: newRefreshToken.jti,
        expiresAt: new Date(newRefreshToken.exp * 1000),
        revoked: false
      });
    }

    await cookie.setAuth(c, accessToken.token);
    await cookie.setRefresh(c, newRefreshToken.token, refreshExpiry);

    return c.json({
      access_token: accessToken.token,
      refresh_token: newRefreshToken.token,
      token_type: "Bearer"
    });
  } catch (error) {
    console.error("Refresh token error:", error);
    return c.json({ message: "Failed to refresh token" }, HttpStatusCodes.UNAUTHORIZED);
  }
};

/**
 * 10. Get Current Authenticated User
 * Route: GET /auth/me
 */
export const me: Handler = async (c: any) => {
  try {
    const auth = c.get("auth");
    if (!auth?.id) {
      return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, Number(auth.id)),
      with: { role: true, parent: true }
    });

    if (!user) {
      return c.json({ message: "User not found" }, HttpStatusCodes.NOT_FOUND);
    }

    return c.json({
      data: sanitizeUser(user)
    });
  } catch (error) {
    console.error("Me error:", error);
    return c.json({ message: "Failed to get user profile" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * 11. Logout
 * Route: POST /auth/logout
 */
export const logout: Handler = async (c: any) => {
  try {
    await revokeCurrentRefreshToken(c);
    cookie.deleteRefresh(c);
    cookie.deleteAuth(c);
    return c.json({ message: "Logged out successfully" }, HttpStatusCodes.OK);
  } catch (error) {
    console.error("Logout error:", error);
    return c.json({ message: "Failed to logout" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * 12. Logout All Devices
 * Route: POST /auth/logout-all
 */
export const logoutAllDevices: Handler = async (c: any) => {
  try {
    const auth = c.get("auth");
    if (auth?.id) {
      await db.update(refreshTokens).set({ revoked: true }).where(eq(refreshTokens.userId, Number(auth.id)));
    }
    cookie.deleteRefresh(c);
    cookie.deleteAuth(c);
    return c.json({ message: "Logged out from all devices" }, HttpStatusCodes.OK);
  } catch (error) {
    console.error("Logout all devices error:", error);
    return c.json({ message: "Failed to logout all devices" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};
