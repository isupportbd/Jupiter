import nodemailer from "nodemailer";
import { mailConfig } from "@/config/index.js";
import { logger } from "@/framework/support/logger.js";

type MailPayload = {
  to: string;
  subject: string;
  html?: string;
  text?: string;
};

function getTransport() {
  const host = (process.env.MAIL_HOST || mailConfig.host || "127.0.0.1").trim();
  const port = Number(process.env.MAIL_PORT || mailConfig.port || 465);
  const user = (process.env.MAIL_USERNAME || mailConfig.username || "").trim();
  const pass = (process.env.MAIL_PASSWORD || mailConfig.password || "").trim();
  const encryption = (process.env.MAIL_ENCRYPTION || mailConfig.encryption || "ssl").trim().toLowerCase();
  const isSecure = encryption === "ssl" || port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure: isSecure,
    auth: user && pass ? { user, pass } : undefined,
    tls: {
      rejectUnauthorized: false
    }
  });
}

function getEmailHtmlTemplate(title: string, name: string, code: string, desc: string, expiryText: string) {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>${title}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #f8fafc;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0b0f19; padding: 40px 20px;">
      <tr>
        <td align="center">
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 480px; background-color: #131926; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
            <!-- Header -->
            <tr>
              <td align="center" style="padding: 32px 24px 20px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border-bottom: 1px solid #1e293b;">
                <div style="font-size: 26px; font-weight: 800; color: #f8fafc; letter-spacing: -0.5px;">🪐 Jupiter</div>
                <div style="font-size: 13px; color: #38bdf8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px;">Security Verification</div>
              </td>
            </tr>
            <!-- Content -->
            <tr>
              <td style="padding: 32px 28px;">
                <h2 style="font-size: 18px; font-weight: 700; color: #f8fafc; margin: 0 0 12px 0;">Hello ${name || "User"},</h2>
                <p style="font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0 0 24px 0;">
                  ${desc}
                </p>
                <!-- OTP Code Display -->
                <div style="text-align: center; margin: 28px 0;">
                  <div style="display: inline-block; background: #020617; border: 2px solid #38bdf8; border-radius: 12px; padding: 14px 28px; font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #38bdf8; box-shadow: 0 0 20px rgba(56, 189, 248, 0.2);">
                    ${code}
                  </div>
                </div>
                <p style="font-size: 13px; color: #64748b; text-align: center; margin: 0 0 20px 0;">
                  ⏳ ${expiryText}
                </p>
                <div style="background: rgba(56, 189, 248, 0.08); border-left: 3px solid #38bdf8; border-radius: 4px; padding: 12px 14px; font-size: 12px; color: #cbd5e1; line-height: 1.5;">
                  <strong>Security Note:</strong> If you did not initiate this request, please ignore this email or contact support immediately.
                </div>
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td align="center" style="padding: 20px; background-color: #0b0f19; border-top: 1px solid #1e293b; font-size: 12px; color: #64748b;">
                &copy; ${new Date().getFullYear()} Jupiter Intelligence & Analytics. All rights reserved.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
}

export const mail = {
  /**
   * Why: Sends transactional email through configured SMTP transport.
   * When: Features need notifications/password reset/signup email.
   * Where: Jobs and event handlers.
   * How: Uses dynamic nodemailer transport and respects the fail-silent setting.
   */
  async sendMail(payload: MailPayload) {
    try {
      const textFallback =
        payload.text ||
        (payload.html
          ? payload.html
              .replace(/<style[^>]*>.*?<\/style>/gi, "")
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim()
          : undefined);

      const fromName = (mailConfig as any).fromName || process.env.MAIL_FROM_NAME || "Jupiter";
      const fromAddress = process.env.MAIL_FROM_ADDRESS || mailConfig.fromAddress || "noreply@isupportbd.com";
      const transport = getTransport();

      const info = await transport.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        ...payload,
        text: textFallback,
        headers: {
          "X-Entity-Ref-ID": `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
          "X-Auto-Response-Suppress": "OOF, AutoReply",
          Auto_Submitted: "auto-generated"
        }
      });

      console.log(`[SMTP Success] Email delivered to: ${payload.to} (MessageID: ${info?.messageId})`);
      return info;
    } catch (error: any) {
      console.error(`[SMTP Error] Failed to send email to ${payload.to}:`, error?.message || error);
      logger.error("Mail send failed", {
        to: payload.to,
        subject: payload.subject,
        error: error instanceof Error ? error.message : error
      });

      if (!mailConfig.failSilent) throw error;
      return null;
    }
  },

  async sendSignupOtpMail(to: string, name: string, otp: string) {
    console.log(`\n========================================`);
    console.log(`[AUTH OTP - SIGNUP] Code for ${to} is: [ ${otp} ]`);
    console.log(`========================================\n`);

    const html = getEmailHtmlTemplate(
      "Verify Your Jupiter Account",
      name,
      otp,
      "Thank you for registering with Jupiter. Please use the 6-digit verification code below to confirm your email address:",
      "This code is valid for 10 minutes."
    );

    return this.sendMail({
      to,
      subject: `Jupiter - Your Account Verification Code (${otp})`,
      html
    });
  },

  async sendLoginOtpMail(to: string, name: string, otp: string) {
    console.log(`\n========================================`);
    console.log(`[AUTH OTP - LOGIN 2FA] Code for ${to} is: [ ${otp} ]`);
    console.log(`========================================\n`);

    const html = getEmailHtmlTemplate(
      "Jupiter Login Verification Code",
      name,
      otp,
      "A sign-in attempt was made for your Jupiter account. Please use the 6-digit one-time code below to complete your sign-in:",
      "This code is valid for 5 minutes."
    );

    return this.sendMail({
      to,
      subject: `Jupiter - Login Security Code (${otp})`,
      html
    });
  },

  async sendResetPasswordOtpMail(to: string, name: string, otp: string) {
    console.log(`\n========================================`);
    console.log(`[AUTH OTP - RESET PASSWORD] Code for ${to} is: [ ${otp} ]`);
    console.log(`========================================\n`);

    const html = getEmailHtmlTemplate(
      "Reset Your Jupiter Password",
      name,
      otp,
      "We received a request to reset your Jupiter account password. Enter the 6-digit code below to set a new password:",
      "This code is valid for 10 minutes."
    );

    return this.sendMail({
      to,
      subject: `Jupiter - Password Reset Code (${otp})`,
      html
    });
  }
};
