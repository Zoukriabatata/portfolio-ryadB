/**
 * SUPPORT TICKET API
 *
 * Creates support tickets and sends email notifications
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { apiRateLimit, tooManyRequests } from '@/lib/auth/rate-limiter';
import { sendEmail } from '@/lib/auth/email-verification';

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'ryad.bouderga78@gmail.com';

const ticketSchema = z.object({
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
  category: z.enum(['BILLING', 'TECHNICAL', 'ACCOUNT', 'FEATURE_REQUEST', 'OTHER']),
}).strict();

const CATEGORY_LABEL: Record<string, string> = {
  BILLING:         'Billing',
  TECHNICAL:       'Technical',
  ACCOUNT:         'Account',
  FEATURE_REQUEST: 'Feature Request',
  OTHER:           'Other',
};

/** Strip HTML tags and dangerous characters */
function sanitize(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/[<>"'`]/g, '')
    .trim();
}

/** Escape what's needed for safe HTML interpolation. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await apiRateLimit(session.user.id);
    if (!rl.allowed) return tooManyRequests(rl);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const parsed = ticketSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'All fields are required and must be valid' },
        { status: 400 }
      );
    }

    const { subject, message, category } = parsed.data;

    const safeSubject = sanitize(subject);
    const safeMessage = sanitize(message);

    // Create support ticket with sanitized input
    const ticket = await prisma.supportTicket.create({
      data: {
        userId:   session.user.id,
        subject:  safeSubject,
        message:  safeMessage,
        category,
        priority: session.user.tier === 'PRO' ? 'HIGH' : 'NORMAL',
      },
    });

    console.log(`[Support] New ticket ${ticket.id} from ${session.user.email} (${category})`);

    // Notify admin by email (non-blocking — don't fail ticket creation if email fails)
    const userEmail = session.user.email ?? 'unknown@unknown';
    const userName  = session.user.name  ?? userEmail.split('@')[0];
    const tier      = session.user.tier  ?? 'FREE';
    const catLabel  = CATEGORY_LABEL[category] ?? category;
    const priority  = tier === 'PRO' ? 'HIGH' : 'NORMAL';

    const emailContent = `
      <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #e2e8f0;">
        Nouveau ticket support — ${escapeHtml(catLabel)}
      </h2>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #0f0f1a; border: 1px solid #1e1e2e; border-radius: 10px; margin-bottom: 24px;">
        <tr><td style="padding: 20px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding: 6px 0;">
              <span style="display:inline-block; min-width:90px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #475569;">User</span>
              <span style="font-size: 14px; color: #e2e8f0;">${escapeHtml(userName)} &lt;${escapeHtml(userEmail)}&gt;</span>
            </td></tr>
            <tr><td style="padding: 6px 0;">
              <span style="display:inline-block; min-width:90px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #475569;">Tier</span>
              <span style="font-size: 14px; color: ${tier === 'PRO' ? '#a78bfa' : '#94a3b8'};">${escapeHtml(tier)}</span>
            </td></tr>
            <tr><td style="padding: 6px 0;">
              <span style="display:inline-block; min-width:90px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #475569;">Priority</span>
              <span style="font-size: 14px; color: ${priority === 'HIGH' ? '#ef4444' : '#94a3b8'};">${priority}</span>
            </td></tr>
            <tr><td style="padding: 6px 0;">
              <span style="display:inline-block; min-width:90px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #475569;">Category</span>
              <span style="font-size: 14px; color: #a78bfa;">${escapeHtml(catLabel)}</span>
            </td></tr>
            <tr><td style="padding: 6px 0;">
              <span style="display:inline-block; min-width:90px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #475569;">Subject</span>
              <span style="font-size: 14px; color: #e2e8f0;">${escapeHtml(safeSubject)}</span>
            </td></tr>
            <tr><td style="padding: 6px 0;">
              <span style="display:inline-block; min-width:90px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #475569;">Ticket ID</span>
              <span style="font-size: 12px; color: #64748b; font-family: monospace;">${escapeHtml(ticket.id)}</span>
            </td></tr>
          </table>
        </td></tr>
      </table>
      <p style="margin: 0 0 8px; font-size: 12px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px;">Message</p>
      <div style="padding: 16px 20px; background: #0f0f1a; border: 1px solid #1e1e2e; border-radius: 8px; font-size: 14px; color: #cbd5e1; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(safeMessage)}</div>
      <p style="margin: 24px 0 0; font-size: 12px; color: #475569;">
        Réponds directement à ce mail — l&apos;utilisateur recevra ta réponse à ${escapeHtml(userEmail)}.
      </p>
    `;

    sendEmail({
      to:      SUPPORT_EMAIL,
      replyTo: userEmail,
      subject: `[Ticket ${priority === 'HIGH' ? '🔥 ' : ''}${catLabel}] ${safeSubject}`,
      content: emailContent,
      text:    `New support ticket from ${userName} <${userEmail}>\nTier: ${tier} | Priority: ${priority}\nCategory: ${catLabel}\nSubject: ${safeSubject}\nTicket ID: ${ticket.id}\n\n${safeMessage}\n\nReply to this email to respond directly to the user.`,
    }).catch(err => {
      console.error('[Support] Failed to send notification email:', err);
    });

    return NextResponse.json({
      success: true,
      ticketId: ticket.id,
      message: 'Your ticket has been created. We will respond within 24-48h.',
    });
  } catch (error) {
    console.error('Support ticket error:', error);
    return NextResponse.json(
      { error: 'Error creating ticket' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await apiRateLimit(session.user.id);
    if (!rl.allowed) return tooManyRequests(rl);

    const tickets = await prisma.supportTicket.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ tickets });
  } catch (error) {
    console.error('Get tickets error:', error);
    return NextResponse.json(
      { error: 'Error retrieving tickets' },
      { status: 500 }
    );
  }
}
