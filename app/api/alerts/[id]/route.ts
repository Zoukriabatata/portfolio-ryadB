/**
 * DELETE /api/alerts/[id]  — delete an alert
 * POST   /api/alerts/[id]  — trigger an alert (called client-side when price crosses)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/api-middleware';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/auth/email-verification';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;

  const alert = await prisma.priceAlert.findFirst({ where: { id, userId: auth.user.id } });
  if (!alert) return NextResponse.json({ error: 'Alert not found' }, { status: 404 });

  await prisma.priceAlert.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;

  const alert = await prisma.priceAlert.findFirst({
    where: { id, userId: auth.user.id, triggered: false },
  });
  if (!alert) return NextResponse.json({ error: 'Alert not found or already triggered' }, { status: 404 });

  let body: { currentPrice?: number } = {};
  try { body = await req.json(); } catch { /* ok */ }
  const currentPrice = body.currentPrice ?? alert.targetPrice;

  // Mark triggered
  await prisma.priceAlert.update({
    where: { id },
    data: { triggered: true, triggeredAt: new Date(), emailSent: false },
  });

  // Send email (fire-and-forget)
  const user = await prisma.user.findUnique({ where: { id: auth.user.id }, select: { email: true, name: true } });
  if (user) {
    const dir = alert.condition === 'above' ? '↑ crossed above' : '↓ crossed below';
    const symbol = alert.symbol.replace('USDT', '/USDT').replace('BTC', 'BTC/');
    const content = `
      <h2 style="margin: 0 0 8px; font-size: 20px; font-weight: 700; color: #e2e8f0;">Price Alert Triggered</h2>
      <p style="margin: 0 0 20px; font-size: 14px; color: #94a3b8;">Your alert for <strong style="color:#e2e8f0;">${alert.symbol}</strong> was triggered.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
        style="background:#0f0f1a;border:1px solid #1e1e2e;border-radius:10px;margin-bottom:24px;">
        <tr><td style="padding:20px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding-bottom:12px;border-bottom:1px solid #1e1e2e;">
              <span style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#475569;">Symbol</span><br/>
              <span style="font-size:16px;font-weight:600;color:#e2e8f0;">${alert.symbol}</span>
            </td></tr>
            <tr><td style="padding-top:12px;padding-bottom:12px;border-bottom:1px solid #1e1e2e;">
              <span style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#475569;">Condition</span><br/>
              <span style="font-size:15px;color:#fbbf24;">${dir} $${alert.targetPrice.toLocaleString()}</span>
            </td></tr>
            <tr><td style="padding-top:12px;">
              <span style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#475569;">Current Price</span><br/>
              <span style="font-size:15px;color:#4ade80;font-weight:600;">$${currentPrice.toLocaleString()}</span>
            </td></tr>
          </table>
        </td></tr>
      </table>
      ${alert.label ? `<p style="margin:0 0 20px;font-size:13px;color:#64748b;">Note: ${alert.label}</p>` : ''}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td align="center">
          <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://orderflow-v2.vercel.app'}/live?symbol=${encodeURIComponent(alert.symbol)}"
             target="_blank"
             style="display:inline-block;padding:12px 36px;background:linear-gradient(135deg,#4ade80,#22c55e);color:#0a0a0f;font-size:14px;font-weight:700;text-decoration:none;border-radius:8px;">
            Open Chart
          </a>
        </td></tr>
      </table>
    `;
    sendEmail({
      to: user.email,
      subject: `Alert: ${alert.symbol} ${dir} $${alert.targetPrice.toLocaleString()}`,
      content,
      text: `Price Alert: ${alert.symbol} ${dir} $${alert.targetPrice.toLocaleString()}\nCurrent price: $${currentPrice.toLocaleString()}`,
    }).then(() => {
      prisma.priceAlert.update({ where: { id }, data: { emailSent: true } }).catch(() => {});
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
