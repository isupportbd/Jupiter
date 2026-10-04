import nodemailer from "nodemailer";
import { randomBytes } from "node:crypto";
import { mailConfig } from "@/config/index.js";
import { logger } from "@/framework/support/logger.js";

type MailPayload = {
  to: string;
  subject: string;
  html: string;
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

function getBstFormattedTime(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  }).format(date);
}

function getEmailHtmlTemplate(title: string, name: string, code: string, desc: string, expiryText: string, sentTime: string) {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0; padding:0; background-color:#f1f5f9; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing:antialiased;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f1f5f9; padding:30px 15px;">
    <tr>
      <td align="center">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px; background-color:#ffffff; border-radius:12px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
          <!-- Brand Header -->
          <tr>
            <td align="center" style="padding:28px 24px; background-color:#0f172a; border-bottom:3px solid #2563eb;">
              <table border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <span style="font-size:24px; font-weight:800; color:#ffffff; letter-spacing:-0.5px;">Jupiter</span>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top:4px;">
                    <span style="font-size:12px; font-weight:600; color:#38bdf8; text-transform:uppercase; letter-spacing:0.5px;">Intelligence &amp; Analytics</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding:32px 32px 24px;">
              <h1 style="font-size:18px; font-weight:700; color:#0f172a; margin:0 0 14px 0;">Hello ${name || "User"},</h1>
              <p style="font-size:14px; line-height:1.6; color:#475569; margin:0 0 20px 0;">
                ${desc}
              </p>
              <!-- OTP Box -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:20px 0;">
                <tr>
                  <td align="center">
                    <div style="display:inline-block; background-color:#f8fafc; border:2px solid #2563eb; border-radius:8px; padding:12px 28px; font-family:'Courier New', Courier, monospace; font-size:32px; font-weight:800; letter-spacing:8px; color:#1e40af;">
                      ${code}
                    </div>
                  </td>
                </tr>
              </table>
              <p style="font-size:13px; color:#64748b; text-align:center; margin:0 0 18px 0;">
                ${expiryText}
              </p>
              
              <!-- Sent Timestamp Box -->
              <div style="background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:10px 14px; font-size:12px; color:#64748b; margin-bottom:16px; text-align:center;">
                <span style="color:#0f172a; font-weight:600;">Time Sent:</span> ${sentTime} (BST / GMT+6)
              </div>

              <div style="background-color:#f8fafc; border:1px solid #e2e8f0; border-left:4px solid #2563eb; border-radius:6px; padding:12px 16px; font-size:12px; line-height:1.5; color:#64748b;">
                <strong style="color:#0f172a;">Security Notice:</strong> If you did not request this code, no further action is required. Your account remains secure.
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding:20px; background-color:#f8fafc; border-top:1px solid #e2e8f0; font-size:12px; color:#94a3b8;">
              &copy; ${new Date().getFullYear()} Jupiter. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export const mail = {
  /**
   * Why: Sends transactional email through configured SMTP transport.
   * When: Features need notifications/password reset/signup email.
   * Where: Jobs and event handlers.
   * How: Uses dynamic nodemailer transport with strict anti-spam compliance.
   */
  async sendMail(payload: MailPayload) {
    try {
      const fromName = (mailConfig as any).fromName || process.env.MAIL_FROM_NAME || "Jupiter";
      const fromAddress = process.env.MAIL_FROM_ADDRESS || mailConfig.fromAddress || "noreply@isupportbd.com";
      const domain = fromAddress.includes("@") ? fromAddress.split("@")[1] : "isupportbd.com";
      const transport = getTransport();

      const messageId = `<${Date.now()}.${randomBytes(8).toString("hex")}@${domain}>`;

      const info = await transport.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        replyTo: fromAddress,
        to: payload.to,
        subject: payload.subject,
        text: payload.text || payload.html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
        html: payload.html,
        date: new Date(),
        messageId,
        headers: {
          "X-Priority": "3",
          "X-MSMail-Priority": "Normal",
          "Importance": "Normal"
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
    const bstTime = getBstFormattedTime();
    console.log(`\n========================================`);
    console.log(`[AUTH OTP - SIGNUP] Code for ${to} is: [ ${otp} ] (Sent at: ${bstTime} BST)`);
    console.log(`========================================\n`);

    const desc = "Thank you for registering with Jupiter. Please use the verification code below to verify your email address:";
    const expiryText = "This code is valid for 10 minutes.";
    const html = getEmailHtmlTemplate("Verify Your Jupiter Account", name, otp, desc, expiryText, bstTime);
    const text = `Hello ${name || "User"},\n\n${desc}\n\nVerification Code: ${otp}\n\n${expiryText}\nTime Sent: ${bstTime} (BST / GMT+6)\n\nIf you did not request this, please ignore this message.\n\n- Jupiter`;

    return this.sendMail({
      to,
      subject: `Your Jupiter verification code: ${otp}`,
      text,
      html
    });
  },

  async sendLoginOtpMail(to: string, name: string, otp: string) {
    const bstTime = getBstFormattedTime();
    console.log(`\n========================================`);
    console.log(`[AUTH OTP - LOGIN 2FA] Code for ${to} is: [ ${otp} ] (Sent at: ${bstTime} BST)`);
    console.log(`========================================\n`);

    const desc = "A sign-in attempt was made for your Jupiter account. Please use the security code below to complete your sign-in:";
    const expiryText = "This code is valid for 5 minutes.";
    const html = getEmailHtmlTemplate("Jupiter Login Security Code", name, otp, desc, expiryText, bstTime);
    const text = `Hello ${name || "User"},\n\n${desc}\n\nSecurity Code: ${otp}\n\n${expiryText}\nTime Sent: ${bstTime} (BST / GMT+6)\n\nIf you did not make this request, please change your password immediately.\n\n- Jupiter`;

    return this.sendMail({
      to,
      subject: `Your Jupiter security code: ${otp}`,
      text,
      html
    });
  },

  async sendResetPasswordOtpMail(to: string, name: string, otp: string) {
    const bstTime = getBstFormattedTime();
    console.log(`\n========================================`);
    console.log(`[AUTH OTP - RESET PASSWORD] Code for ${to} is: [ ${otp} ] (Sent at: ${bstTime} BST)`);
    console.log(`========================================\n`);

    const desc = "We received a request to reset your Jupiter account password. Enter the code below to set a new password:";
    const expiryText = "This code is valid for 10 minutes.";
    const html = getEmailHtmlTemplate("Reset Your Jupiter Password", name, otp, desc, expiryText, bstTime);
    const text = `Hello ${name || "User"},\n\n${desc}\n\nReset Code: ${otp}\n\n${expiryText}\nTime Sent: ${bstTime} (BST / GMT+6)\n\nIf you did not request this password reset, please ignore this email.\n\n- Jupiter`;

    return this.sendMail({
      to,
      subject: `Your Jupiter password reset code: ${otp}`,
      text,
      html
    });
  }
};
