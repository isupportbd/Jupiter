/**
 * Why: Account/authentication policy settings.
 * When: Register, login, and email verification flows.
 * Where: src/config/auth.ts.
 * How: Plain literals. `requireEmailVerification` adds a verify-email step
 *      before a new account can log in.
 */
export const authConfig = {
  requireEmailVerification: process.env.AUTH_REQUIRE_EMAIL_VERIFICATION === "true",
  requireLoginOtp: process.env.AUTH_REQUIRE_LOGIN_OTP === "true"
};

export type AuthConfig = typeof authConfig;
