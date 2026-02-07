/**
 * EMAIL VERIFICATION & PASSWORD RESET
 *
 * Secure token generation and email sending via SMTP (nodemailer)
 * Fallback: logs verification URL to console when SMTP is not configured
 */

import crypto from 'crypto';

// Dynamic import for nodemailer - only available when installed
let nodemailer: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  nodemailer = require('nodemailer');
} catch {
  // nodemailer not installed - will use console fallback
}

// ============ TOKEN GENERATION ============

const TOKEN_EXPIRY_HOURS = 24;

/**
 * Generate a cryptographically secure verification token
 * Returns a 64-character hex string (32 bytes of randomness)
 */
export function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Returns a Date object representing 24 hours from now
 */
export function getTokenExpiry(): Date {
  return new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);
}

// ============ SMTP CONFIGURATION ============

function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || 'Senzoukria <noreply@senzoukria.com>';

  const isConfigured = !!(host && port && user && pass);

  return { host, port: port ? parseInt(port, 10) : 587, user, pass, from, isConfigured };
}

function createTransport() {
  const config = getSmtpConfig();

  if (!config.isConfigured || !nodemailer) {
    return null;
  }

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
}

// ============ EMAIL TEMPLATES ============

function getBaseEmailTemplate(content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Senzoukria</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0f; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color: #12121a; border-radius: 12px; border: 1px solid #1e1e2e; overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 40px 24px; text-align: center; border-bottom: 1px solid #1e1e2e;">
              <h1 style="margin: 0; font-size: 28px; font-weight: 700; letter-spacing: 2px;">
                <span style="color: #a78bfa;">SEN</span><span style="color: #e2e8f0;">ZOUKRIA</span>
              </h1>
              <p style="margin: 8px 0 0; font-size: 12px; color: #64748b; letter-spacing: 1px; text-transform: uppercase;">
                Professional Orderflow Platform
              </p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px 32px; border-top: 1px solid #1e1e2e; text-align: center;">
              <p style="margin: 0 0 12px; font-size: 12px; color: #475569;">
                This is an automated email from Senzoukria. Please do not reply to this message.
              </p>
              <p style="margin: 0; font-size: 11px; color: #334155;">
                If you did not create an account on Senzoukria, you can safely ignore this email.
                No action will be taken on your behalf.
              </p>
            </td>
          </tr>
        </table>

        <!-- Anti-phishing notice -->
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="margin-top: 16px;">
          <tr>
            <td style="padding: 16px 24px; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #334155; line-height: 1.5;">
                <strong style="color: #475569;">Anti-phishing notice:</strong> Senzoukria will never ask for your
                password, private keys, or financial information via email. Always verify that links
                point to <span style="color: #64748b;">senzoukria.com</span> before clicking.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function getVerificationEmailContent(verificationUrl: string): string {
  return `
    <h2 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #e2e8f0;">
      Verify your email address
    </h2>
    <p style="margin: 0 0 24px; font-size: 15px; color: #94a3b8; line-height: 1.6;">
      Welcome to Senzoukria! Please confirm your email address by clicking the button below.
      This ensures the security of your account and gives you full access to the platform.
    </p>

    <!-- CTA Button -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
      <tr>
        <td align="center">
          <a href="${verificationUrl}"
             target="_blank"
             style="display: inline-block; padding: 14px 40px; background: linear-gradient(135deg, #7c3aed, #a78bfa); color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px; letter-spacing: 0.5px;">
            Verify Email Address
          </a>
        </td>
      </tr>
    </table>

    <p style="margin: 0 0 8px; font-size: 13px; color: #64748b;">
      Or copy and paste this link into your browser:
    </p>
    <p style="margin: 0 0 24px; font-size: 12px; color: #7c3aed; word-break: break-all; background-color: #0f0f1a; padding: 12px 16px; border-radius: 6px; border: 1px solid #1e1e2e;">
      ${verificationUrl}
    </p>

    <!-- Expiry warning -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding: 12px 16px; background-color: #1a1520; border-radius: 8px; border-left: 3px solid #a78bfa;">
          <p style="margin: 0; font-size: 13px; color: #94a3b8;">
            <strong style="color: #c4b5fd;">Expires in 24 hours.</strong>
            If you don't verify your email within this time, you will need to request a new verification link.
          </p>
        </td>
      </tr>
    </table>`;
}

function getPasswordResetEmailContent(resetUrl: string): string {
  return `
    <h2 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #e2e8f0;">
      Reset your password
    </h2>
    <p style="margin: 0 0 24px; font-size: 15px; color: #94a3b8; line-height: 1.6;">
      We received a request to reset the password for your Senzoukria account.
      Click the button below to choose a new password.
    </p>

    <!-- CTA Button -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
      <tr>
        <td align="center">
          <a href="${resetUrl}"
             target="_blank"
             style="display: inline-block; padding: 14px 40px; background: linear-gradient(135deg, #dc2626, #ef4444); color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px; letter-spacing: 0.5px;">
            Reset Password
          </a>
        </td>
      </tr>
    </table>

    <p style="margin: 0 0 8px; font-size: 13px; color: #64748b;">
      Or copy and paste this link into your browser:
    </p>
    <p style="margin: 0 0 24px; font-size: 12px; color: #ef4444; word-break: break-all; background-color: #0f0f1a; padding: 12px 16px; border-radius: 6px; border: 1px solid #1e1e2e;">
      ${resetUrl}
    </p>

    <!-- Expiry warning -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 16px;">
      <tr>
        <td style="padding: 12px 16px; background-color: #1a1520; border-radius: 8px; border-left: 3px solid #ef4444;">
          <p style="margin: 0; font-size: 13px; color: #94a3b8;">
            <strong style="color: #fca5a5;">Expires in 24 hours.</strong>
            If you don't reset your password within this time, you will need to request a new reset link.
          </p>
        </td>
      </tr>
    </table>

    <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.5;">
      If you did not request a password reset, please ignore this email. Your password will remain unchanged.
      If you suspect unauthorized access to your account, please contact support immediately.
    </p>`;
}

// ============ EMAIL SENDING ============

/**
 * Send a verification email to the user
 * Falls back to console logging if SMTP is not configured (beta testing)
 */
export async function sendVerificationEmail(
  email: string,
  token: string,
  baseUrl: string
): Promise<void> {
  const verificationUrl = `${baseUrl}/api/auth/verify-email?token=${token}`;
  const config = getSmtpConfig();
  const transporter = createTransport();

  if (!transporter) {
    console.log('========================================');
    console.log('SMTP not configured - Verification Email');
    console.log('========================================');
    console.log(`To:    ${email}`);
    console.log(`Token: ${token}`);
    console.log(`URL:   ${verificationUrl}`);
    console.log('========================================');
    return;
  }

  const html = getBaseEmailTemplate(getVerificationEmailContent(verificationUrl));

  await transporter.sendMail({
    from: config.from,
    to: email,
    subject: 'Verify your Senzoukria account',
    html,
    text: `Welcome to Senzoukria!\n\nPlease verify your email address by visiting the following link:\n${verificationUrl}\n\nThis link expires in 24 hours.\n\nIf you did not create an account, you can safely ignore this email.`,
  });
}

/**
 * Send a password reset email to the user
 * Falls back to console logging if SMTP is not configured (beta testing)
 */
export async function sendPasswordResetEmail(
  email: string,
  token: string,
  baseUrl: string
): Promise<void> {
  const resetUrl = `${baseUrl}/auth/reset-password?token=${token}`;
  const config = getSmtpConfig();
  const transporter = createTransport();

  if (!transporter) {
    console.log('========================================');
    console.log('SMTP not configured - Password Reset Email');
    console.log('========================================');
    console.log(`To:    ${email}`);
    console.log(`Token: ${token}`);
    console.log(`URL:   ${resetUrl}`);
    console.log('========================================');
    return;
  }

  const html = getBaseEmailTemplate(getPasswordResetEmailContent(resetUrl));

  await transporter.sendMail({
    from: config.from,
    to: email,
    subject: 'Reset your Senzoukria password',
    html,
    text: `Password Reset Request\n\nYou requested a password reset for your Senzoukria account. Visit the following link to choose a new password:\n${resetUrl}\n\nThis link expires in 24 hours.\n\nIf you did not request this, please ignore this email. Your password will remain unchanged.`,
  });
}
