/**
 * POST /api/trading/send-certificate
 * ─────────────────────────────────────────────────────────────────────────────
 * Sends the user's PASSED challenge certificate as a PDF attachment via Resend.
 *
 * Body: { pdfBase64: string, filename: string, certData: { presetLabel, profit, certId } }
 *
 * Uses Resend HTTPS API directly (not nodemailer SMTP) for reliable delivery
 * on Vercel serverless. Recipient = the authenticated user's email.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { z } from 'zod';
import { apiRateLimit, tooManyRequests } from '@/lib/auth/rate-limiter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FROM = process.env.SMTP_FROM ?? 'Senzoukria <onboarding@resend.dev>';

const bodySchema = z.object({
  pdfBase64:   z.string().min(100),
  filename:    z.string().min(3).max(100),
  certData: z.object({
    presetLabel: z.string().max(100),
    profit:      z.number(),
    certId:      z.string().max(50),
    finalEquity: z.number(),
    totalTrades: z.number(),
    winRate:     z.number(),
  }),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = await apiRateLimit(session.user.id);
  if (!rl.allowed) return tooManyRequests(rl);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid certificate payload' }, { status: 400 });
  }

  const apiKey = process.env.SMTP_PASS;
  if (!apiKey || !apiKey.startsWith('re_')) {
    console.error('[send-certificate] No Resend API key configured (SMTP_PASS missing or not a Resend key)');
    return NextResponse.json(
      { error: 'Email service not configured' },
      { status: 503 },
    );
  }

  // Strip data: prefix if present
  const cleanBase64 = parsed.data.pdfBase64.replace(/^data:application\/pdf;base64,/, '');

  const { presetLabel, profit, certId, finalEquity, totalTrades, winRate } = parsed.data.certData;
  const userName  = session.user.name?.trim() || session.user.email.split('@')[0];
  const subject   = `🏆 Certificate of Achievement — ${presetLabel}`;

  const html = `
    <!DOCTYPE html>
    <html><body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 20px;">
        <tr><td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#12121a;border-radius:12px;border:1px solid #1e1e2e;overflow:hidden;">
            <tr><td style="padding:32px 40px 24px;text-align:center;border-bottom:1px solid #1e1e2e;">
              <h1 style="margin:0;font-size:28px;font-weight:700;letter-spacing:2px;">
                <span style="color:#a78bfa;">SEN</span><span style="color:#e2e8f0;">ZOUKRIA</span>
              </h1>
            </td></tr>
            <tr><td style="padding:40px;">
              <h2 style="margin:0 0 16px;font-size:24px;color:#e2e8f0;text-align:center;">
                🏆 Congratulations, ${escapeHtml(userName)}!
              </h2>
              <p style="margin:0 0 24px;font-size:15px;color:#94a3b8;line-height:1.6;text-align:center;">
                You successfully passed the <strong style="color:#4ade80;">${escapeHtml(presetLabel)} Challenge</strong>.
                Your certificate of achievement is attached as PDF.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f1a;border:1px solid #1e1e2e;border-radius:10px;margin-bottom:24px;">
                <tr><td style="padding:20px 24px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr><td style="padding:6px 0;">
                      <span style="display:inline-block;min-width:120px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#475569;">Net profit</span>
                      <span style="font-size:18px;color:#4ade80;font-weight:700;">+$${profit.toFixed(2)}</span>
                    </td></tr>
                    <tr><td style="padding:6px 0;">
                      <span style="display:inline-block;min-width:120px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#475569;">Final equity</span>
                      <span style="font-size:14px;color:#e2e8f0;">$${finalEquity.toFixed(2)}</span>
                    </td></tr>
                    <tr><td style="padding:6px 0;">
                      <span style="display:inline-block;min-width:120px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#475569;">Win rate</span>
                      <span style="font-size:14px;color:#e2e8f0;">${winRate.toFixed(1)}% over ${totalTrades} trades</span>
                    </td></tr>
                    <tr><td style="padding:6px 0;">
                      <span style="display:inline-block;min-width:120px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#475569;">Certificate ID</span>
                      <span style="font-size:12px;color:#a78bfa;font-family:monospace;">${escapeHtml(certId)}</span>
                    </td></tr>
                  </table>
                </td></tr>
              </table>

              <p style="margin:0;font-size:13px;color:#64748b;text-align:center;line-height:1.6;">
                Keep up the discipline — pass another preset to grow your simulated capital.
              </p>
            </td></tr>
            <tr><td style="padding:24px 40px 32px;border-top:1px solid #1e1e2e;text-align:center;">
              <p style="margin:0;font-size:11px;color:#475569;">
                This is a <strong>paper trading</strong> achievement on the Senzoukria simulator.
              </p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body></html>
  `;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    FROM,
        to:      [session.user.email],
        subject,
        html,
        attachments: [{
          filename: parsed.data.filename,
          content:  cleanBase64,
        }],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[send-certificate] Resend ${res.status}: ${errText.slice(0, 300)}`);
      return NextResponse.json({ error: 'Failed to send email' }, { status: 502 });
    }

    const json = await res.json().catch(() => ({})) as { id?: string };
    console.log(`[send-certificate] Sent — id=${json.id ?? '?'} to=${session.user.email}`);

    return NextResponse.json({ success: true, messageId: json.id });
  } catch (err) {
    console.error('[send-certificate] Send failed:', err);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
