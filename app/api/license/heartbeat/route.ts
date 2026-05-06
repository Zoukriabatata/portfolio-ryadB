/**
 * POST /api/license/heartbeat
 *
 * Called by the desktop app every 4–6h. Verifies the bearer JWT, refreshes
 * Machine.lastHeartbeatAt, re-validates that the underlying user is still
 * a paying PRO subscriber, and returns a fresh 24h JWT.
 *
 * Headers:
 *   Authorization: Bearer <jwt>
 *
 * Body (optional):
 *   { os?, appVersion? }   — desktop app may report version updates here
 *
 * Response:
 *   200 { ok: true, token, expiresAt, license: {...} }
 *   401 NO_TOKEN | INVALID_SIGNATURE | EXPIRED | BAD_PAYLOAD | KEYS_NOT_CONFIGURED
 *   402 NOT_SUBSCRIBED | SUBSCRIPTION_EXPIRED | LICENSE_INACTIVE
 *   404 LICENSE_NOT_FOUND | MACHINE_NOT_FOUND
 *   429 rate-limited
 *   500 internal
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, isPrismaAvailable } from '@/lib/db';
import { signLicenseJwt, verifyLicenseJwt } from '@/lib/license/jwt';
import { apiRateLimit, tooManyRequests, rateLimitHeaders } from '@/lib/auth/rate-limiter';

export const dynamic = 'force-dynamic';

const JWT_TTL_SECONDS    = 24 * 60 * 60;
const HEARTBEAT_FRESH_MS = 7 * 24 * 60 * 60 * 1000;

const bodySchema = z.object({
  os:         z.enum(['windows', 'macos', 'linux']).optional(),
  appVersion: z.string().max(32).optional(),
}).strict().optional();

function extractBearer(req: NextRequest): string | null {
  const h = req.headers.get('authorization');
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

export async function POST(req: NextRequest) {
  const token = extractBearer(req);
  const verify = await verifyLicenseJwt(token);
  if (!verify.valid) {
    const status =
      verify.error === 'KEYS_NOT_CONFIGURED' ? 500 :
      verify.error === 'EXPIRED'             ? 401 :
      401;
    return NextResponse.json({ ok: false, error: verify.error }, { status });
  }

  // Authenticated — apply per-user rate limit.
  const rl = await apiRateLimit(verify.payload.sub);
  if (!rl.allowed) return tooManyRequests(rl);
  const rlHeaders: Record<string, string> = { ...rateLimitHeaders(rl) };

  if (!isPrismaAvailable()) {
    return NextResponse.json(
      { ok: false, error: 'Database unavailable' },
      { status: 503, headers: rlHeaders },
    );
  }

  let body: unknown = undefined;
  try {
    if (req.headers.get('content-length') && req.headers.get('content-length') !== '0') {
      body = await req.json();
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400, headers: rlHeaders });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID_BODY' }, { status: 400, headers: rlHeaders });
  }
  const updates = parsed.data ?? {};

  try {
    const user = await prisma.user.findUnique({
      where:   { id: verify.payload.sub },
      include: { license: true },
    });

    if (!user) {
      return NextResponse.json({ ok: false, error: 'USER_NOT_FOUND' }, { status: 404, headers: rlHeaders });
    }

    if (user.subscriptionTier !== 'PRO') {
      return NextResponse.json(
        { ok: false, error: 'NOT_SUBSCRIBED' },
        { status: 402, headers: rlHeaders },
      );
    }
    if (user.subscriptionEnd && user.subscriptionEnd < new Date()) {
      return NextResponse.json(
        { ok: false, error: 'SUBSCRIPTION_EXPIRED' },
        { status: 402, headers: rlHeaders },
      );
    }

    if (!user.license) {
      return NextResponse.json({ ok: false, error: 'LICENSE_NOT_FOUND' }, { status: 404, headers: rlHeaders });
    }
    if (user.license.status !== 'ACTIVE') {
      return NextResponse.json(
        { ok: false, error: 'LICENSE_INACTIVE', status: user.license.status },
        { status: 402, headers: rlHeaders },
      );
    }
    // Token's licenseKey must still match — guards against stale tokens
    // surviving a license rotation (e.g. abuse → revoke + reissue).
    if (user.license.licenseKey !== verify.payload.licenseKey) {
      return NextResponse.json({ ok: false, error: 'LICENSE_MISMATCH' }, { status: 401, headers: rlHeaders });
    }

    const machine = await prisma.machine.findUnique({
      where: {
        licenseId_machineId: {
          licenseId: user.license.id,
          machineId: verify.payload.machineId,
        },
      },
    });
    if (!machine) {
      // The machine was deleted (e.g. via /account or admin) — desktop
      // must re-login to pick up a new slot.
      return NextResponse.json({ ok: false, error: 'MACHINE_NOT_FOUND' }, { status: 404, headers: rlHeaders });
    }

    const now = new Date();
    await prisma.machine.update({
      where: { id: machine.id },
      data: {
        lastHeartbeatAt: now,
        os:              updates.os         ?? machine.os,
        appVersion:      updates.appVersion ?? machine.appVersion,
      },
    });

    const refreshed = await signLicenseJwt(
      {
        sub:        user.id,
        licenseKey: user.license.licenseKey,
        machineId:  machine.machineId,
        tier:       'PRO',
      },
      { ttlSeconds: JWT_TTL_SECONDS },
    );

    const cutoff = new Date(Date.now() - HEARTBEAT_FRESH_MS);
    const activeMachines = await prisma.machine.count({
      where: { licenseId: user.license.id, lastHeartbeatAt: { gte: cutoff } },
    });

    return NextResponse.json(
      {
        ok: true,
        token: refreshed,
        expiresAt: new Date(Date.now() + JWT_TTL_SECONDS * 1000).toISOString(),
        license: {
          licenseKey:     user.license.licenseKey,
          status:         user.license.status,
          maxMachines:    user.license.maxMachines,
          activeMachines,
        },
      },
      { headers: rlHeaders },
    );
  } catch (err) {
    console.error('[license/heartbeat] error:', err);
    return NextResponse.json(
      { ok: false, error: 'INTERNAL' },
      { status: 500, headers: rlHeaders },
    );
  }
}
