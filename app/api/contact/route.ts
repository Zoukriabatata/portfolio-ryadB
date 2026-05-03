/**
 * POST /api/contact
 * ─────────────────────────────────────────────────────────────────────────────
 * PUBLIC contact form — no auth required. Anyone can submit a question and
 * an email is sent to SUPPORT_EMAIL.
 *
 * Use this for landing page / pre-signup support questions.
 * For authenticated, in-app support tickets that persist in DB,
 * use /api/support instead.
 *
 * Anti-abuse:
 *   - Rate limit: 3 messages / hour / IP
 *   - Honeypot field (`company`) — bots fill it, humans never see it
 *   - Length limits on every field
 *   - HTML sanitized before email composition
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, tooManyRequests } from '@/lib/auth/rate-limiter';
import { sendEmail } from '@/lib/auth/email-verification';

/** Extract the originating client IP from common proxy/forwarded headers. */
function getClientIP(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'ryad.bouderga78@gmail.com';

const contactSchema = z.object({
  name:     z.string().min(1).max(100),
  email:    z.string().email().max(200),
  subject:  z.string().min(3).max(200),
  message:  z.string().min(10).max(5000),
  category: z.enum(['QUESTION', 'BUG', 'FEATURE_REQUEST', 'OTHER']).default('QUESTION'),
  // Honeypot — must be empty. Bots auto-fill all visible fields.
  company:  z.string().max(0).optional().or(z.literal('')),
}).strict();

const CATEGORY_LABEL: Record<string, string> = {
  QUESTION:        'Question',
  BUG:             'Bug Report',
  FEATURE_REQUEST: 'Feature Request',
  OTHER:           'Other',
};

/** Strip HTML tags + any < > " ' ` from raw user input before composing email body. */
function sanitize(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/[<>"'`]/g, '')
    .trim();
}

/** Escape only what's needed for safe HTML interpolation (preserves user text). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function POST(req: NextRequest) {
  // Rate limit: 3 messages per hour per IP
  const ip = getClientIP(req);
  const rl = await checkRateLimit(`ip:contact:${ip}`, 3, 60 * 60 * 1000);
  if (!rl.allowed) return tooManyRequests(rl);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Tous les champs sont requis et doivent être valides' },
      { status: 400 },
    );
  }

  // Honeypot triggered — silently accept (don't tell the bot it was caught)
  if (parsed.data.company && parsed.data.company.length > 0) {
    return NextResponse.json({ success: true, message: 'Message envoyé.' });
  }

  const name     = sanitize(parsed.data.name).slice(0, 100);
  const email    = parsed.data.email.toLowerCase().trim();
  const subject  = sanitize(parsed.data.subject).slice(0, 200);
  const message  = sanitize(parsed.data.message).slice(0, 5000);
  const category = parsed.data.category;
  const catLabel = CATEGORY_LABEL[category] ?? category;

  const content = `
    <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #e2e8f0;">
      Nouveau message de contact
    </h2>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #0f0f1a; border: 1px solid #1e1e2e; border-radius: 10px; margin-bottom: 24px;">
      <tr><td style="padding: 20px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding: 6px 0;">
            <span style="display:inline-block; min-width:80px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #475569;">From</span>
            <span style="font-size: 14px; color: #e2e8f0;">${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</span>
          </td></tr>
          <tr><td style="padding: 6px 0;">
            <span style="display:inline-block; min-width:80px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #475569;">Category</span>
            <span style="font-size: 14px; color: #a78bfa;">${escapeHtml(catLabel)}</span>
          </td></tr>
          <tr><td style="padding: 6px 0;">
            <span style="display:inline-block; min-width:80px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #475569;">Subject</span>
            <span style="font-size: 14px; color: #e2e8f0;">${escapeHtml(subject)}</span>
          </td></tr>
        </table>
      </td></tr>
    </table>

    <p style="margin: 0 0 8px; font-size: 12px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px;">Message</p>
    <div style="padding: 16px 20px; background: #0f0f1a; border: 1px solid #1e1e2e; border-radius: 8px; font-size: 14px; color: #cbd5e1; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(message)}</div>

    <p style="margin: 24px 0 0; font-size: 12px; color: #475569;">
      Réponds directement à ce mail — l&apos;expéditeur recevra ta réponse à ${escapeHtml(email)}.
    </p>
  `;

  const sent = await sendEmail({
    to:      SUPPORT_EMAIL,
    replyTo: email,  // Hitting "Reply" in your inbox replies to the sender
    subject: `[Contact - ${catLabel}] ${subject}`,
    content,
    text:    `New contact message\n\nFrom: ${name} <${email}>\nCategory: ${catLabel}\nSubject: ${subject}\n\n${message}\n\nReply directly to this email — Reply-To is set to the sender.`,
  });

  // Note: sendEmail returns false when SMTP is not configured. We still
  // return success to the client because the message was logged server-side
  // (visible in dev console). If you need a hard error in prod, gate on env.
  if (!sent && process.env.NODE_ENV === 'production') {
    console.error('[contact] SMTP not configured in production — message lost', {
      from: email, subject,
    });
    return NextResponse.json(
      { error: 'Service de messagerie temporairement indisponible. Réessayez plus tard.' },
      { status: 503 },
    );
  }

  console.log(`[contact] New message from ${email} (${catLabel}): ${subject}`);

  return NextResponse.json({
    success: true,
    message: 'Message envoyé. Nous vous répondrons sous 24-48h.',
  });
}
