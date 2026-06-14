/**
 * POST /api/leads
 * Capture a sales lead from the landing chat + notify admin by email.
 * Public, rate-limited. Lead is persisted even if the email notification fails.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/auth/email-verification';
import { checkRateLimit, tooManyRequests } from '@/lib/auth/rate-limiter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = process.env.ADMIN_EMAILS?.split(',')[0]?.trim()
  || process.env.SUPPORT_EMAIL
  || 'ryad.bouderga78@gmail.com';

const leadSchema = z.object({
  email:       z.string().email().max(200),
  temperature: z.enum(['cold', 'warm', 'hot']).default('warm'),
  topic:       z.string().max(200).optional(),
  transcript:  z.string().max(4000).optional(),
  page:        z.string().max(200).optional(),
}).strict();

function getClientIP(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export async function POST(req: NextRequest) {
  const ip = getClientIP(req);
  const rl = await checkRateLimit(`ip:leads:${ip}`, 5, 60 * 60 * 1000);
  if (!rl.allowed) return tooManyRequests(rl);

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = leadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Email invalide' }, { status: 400 });
  }

  const { email, temperature, topic, transcript, page } = parsed.data;
  const lead = await prisma.lead.create({
    data: { email: email.toLowerCase().trim(), temperature, topic, transcript, page, source: 'sales_chat' },
  });

  const content = `
    <h2 style="margin:0 0 12px;font-size:18px;color:#e2e8f0;">Nouveau lead — chat de vente</h2>
    <p style="font-size:14px;color:#cbd5e1;">
      <b>Email</b> : ${escapeHtml(email)}<br/>
      <b>Température</b> : ${escapeHtml(temperature)}<br/>
      <b>Sujet</b> : ${escapeHtml(topic ?? '—')}<br/>
      <b>Page</b> : ${escapeHtml(page ?? '—')}
    </p>
    ${transcript ? `<p style="font-size:12px;color:#94a3b8;">Extrait :</p><div style="padding:12px;background:#0f0f1a;border:1px solid #1e1e2e;border-radius:8px;font-size:13px;color:#cbd5e1;white-space:pre-wrap;">${escapeHtml(transcript)}</div>` : ''}
  `;

  let notified = false;
  try {
    notified = await sendEmail({
      to: ADMIN_EMAIL,
      replyTo: email,
      subject: `[Lead ${temperature}] ${email}`,
      content,
      text: `Nouveau lead\nEmail: ${email}\nTempérature: ${temperature}\nSujet: ${topic ?? '—'}\nPage: ${page ?? '—'}\n\n${transcript ?? ''}`,
    });
    if (notified) await prisma.lead.update({ where: { id: lead.id }, data: { notified: true } });
  } catch (err) {
    console.error('[leads] admin notification failed (lead kept):', err);
  }

  return NextResponse.json({ success: true });
}
