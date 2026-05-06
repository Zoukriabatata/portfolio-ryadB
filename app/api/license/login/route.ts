/**
 * POST /api/license/login
 *
 * Desktop app login. Exchanges (email + password + machineId) for a 24h
 * Ed25519 JWT that the app uses on every subsequent /api/license/heartbeat
 * call.
 *
 * Body:
 *   { email, password, machineId, os?, appVersion? }
 *
 * Response:
 *   200 { ok: true, token, expiresAt, license: { licenseKey, status, maxMachines, machines: number } }
 *   401 invalid creds | account locked | OAuth-only user
 *   402 subscription not active (FREE, expired, license SUSPENDED/REVOKED)
 *   409 max machines reached
 *   429 rate-limited
 *   500 internal
 *
 * Slot accounting: a machine counts toward the limit if it has a heartbeat
 * within the last 7 days. Older inactive machines are pruned implicitly
 * (they aren't deleted — the row sticks around so a returning user reclaims
 * their slot — but they don't block a new device).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, isPrismaAvailable } from '@/lib/db';
import { verifyPassword } from '@/lib/auth/security';
import { loginRateLimit, tooManyRequests, rateLimitHeaders } from '@/lib/auth/rate-limiter';
import { signLicenseJwt } from '@/lib/license/jwt';
import { randomUUID } from 'node:crypto';

export const dynamic = 'force-dynamic';

const HEARTBEAT_FRESH_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const JWT_TTL_SECONDS    = 24 * 60 * 60;             // 24h

const bodySchema = z.object({
  email:      z.string().email().max(254),
  password:   z.string().min(1).max(200),
  machineId:  z.string().min(8).max(128),
  os:         z.enum(['windows', 'macos', 'linux']).optional(),
  appVersion: z.string().max(32).optional(),
}).strict();

export async function POST(req: NextRequest) {
  // Per-IP rate limit (5 / 60s)
  const rl = await loginRateLimit(req);
  if (!rl.allowed) return tooManyRequests(rl);
  const rlHeaders: Record<string, string> = { ...rateLimitHeaders(rl) };

  if (!isPrismaAvailable()) {
    return NextResponse.json(
      { ok: false, error: 'Database unavailable' },
      { status: 503, headers: rlHeaders },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400, headers: rlHeaders });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'INVALID_BODY', issues: parsed.error.issues.map(i => i.path.join('.')) },
      { status: 400, headers: rlHeaders },
    );
  }
  const { email: rawEmail, password, machineId, os, appVersion } = parsed.data;
  const email = rawEmail.toLowerCase().trim();

  try {
    const user = await prisma.user.findUnique({
      where:   { email },
      include: { license: true },
    });

    // Generic message for both unknown email and wrong password to avoid
    // leaking user existence.
    if (!user || !user.password) {
      return NextResponse.json(
        { ok: false, error: 'INVALID_CREDENTIALS' },
        { status: 401, headers: rlHeaders },
      );
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return NextResponse.json(
        { ok: false, error: 'ACCOUNT_LOCKED', retryAfterSeconds: Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000) },
        { status: 423, headers: rlHeaders },
      );
    }

    const passwordOk = await verifyPassword(password, user.password);
    if (!passwordOk) {
      // Mirror the web login: lock for 30min after 5 failed attempts.
      const nextAttempts = user.failedLoginAttempts + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: nextAttempts,
          lockedUntil: nextAttempts >= 5 ? new Date(Date.now() + 30 * 60 * 1000) : null,
        },
      });
      return NextResponse.json(
        { ok: false, error: 'INVALID_CREDENTIALS' },
        { status: 401, headers: rlHeaders },
      );
    }

    if (user.subscriptionTier !== 'PRO') {
      return NextResponse.json(
        { ok: false, error: 'NOT_SUBSCRIBED', message: 'A PRO subscription is required to use the desktop app.' },
        { status: 402, headers: rlHeaders },
      );
    }

    if (user.subscriptionEnd && user.subscriptionEnd < new Date()) {
      return NextResponse.json(
        { ok: false, error: 'SUBSCRIPTION_EXPIRED' },
        { status: 402, headers: rlHeaders },
      );
    }

    // The webhook should have created the License when the subscription
    // first became active. If we reach this branch the user is PRO but
    // has no license — this is a bug in the webhook, not a client error.
    if (!user.license) {
      console.error(`[license/login] user ${user.id} is PRO but has no License row`);
      // Heal the gap so the user isn't stuck waiting for a webhook re-run.
      const healed = await prisma.license.create({
        data: {
          userId:      user.id,
          licenseKey:  `OFV2-${randomUUID()}`,
          status:      'ACTIVE',
          maxMachines: 2,
        },
      });
      user.license = healed;
    }

    if (user.license.status !== 'ACTIVE') {
      return NextResponse.json(
        { ok: false, error: 'LICENSE_INACTIVE', status: user.license.status },
        { status: 402, headers: rlHeaders },
      );
    }

    // Slot check — a machine counts toward the limit if it heartbeated in
    // the last 7 days OR is the one we're about to register.
    const cutoff = new Date(Date.now() - HEARTBEAT_FRESH_MS);
    const existing = await prisma.machine.findUnique({
      where: { licenseId_machineId: { licenseId: user.license.id, machineId } },
    });

    if (!existing) {
      const activeCount = await prisma.machine.count({
        where: {
          licenseId:       user.license.id,
          lastHeartbeatAt: { gte: cutoff },
        },
      });
      if (activeCount >= user.license.maxMachines) {
        return NextResponse.json(
          {
            ok: false,
            error: 'MAX_MACHINES_REACHED',
            maxMachines:    user.license.maxMachines,
            activeMachines: activeCount,
            message: `This license is already in use on ${activeCount} machine(s). Sign out from another machine or wait 7 days for it to expire.`,
          },
          { status: 409, headers: rlHeaders },
        );
      }
    }

    // Upsert the machine row. Composite unique (licenseId, machineId) makes
    // this idempotent for repeated logins from the same machine.
    const now = new Date();
    const machine = await prisma.machine.upsert({
      where: { licenseId_machineId: { licenseId: user.license.id, machineId } },
      create: {
        licenseId:       user.license.id,
        machineId,
        os:              os ?? null,
        appVersion:      appVersion ?? null,
        firstSeenAt:     now,
        lastHeartbeatAt: now,
      },
      update: {
        lastHeartbeatAt: now,
        os:              os         ?? existing?.os         ?? null,
        appVersion:      appVersion ?? existing?.appVersion ?? null,
      },
    });

    // Reset failed-attempt counter on success.
    if (user.failedLoginAttempts !== 0) {
      await prisma.user.update({
        where: { id: user.id },
        data:  { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    const token = await signLicenseJwt(
      {
        sub:        user.id,
        licenseKey: user.license.licenseKey,
        machineId:  machine.machineId,
        tier:       'PRO',
      },
      { ttlSeconds: JWT_TTL_SECONDS },
    );

    const activeMachinesCount = await prisma.machine.count({
      where: { licenseId: user.license.id, lastHeartbeatAt: { gte: cutoff } },
    });

    return NextResponse.json(
      {
        ok: true,
        token,
        expiresAt: new Date(Date.now() + JWT_TTL_SECONDS * 1000).toISOString(),
        license: {
          licenseKey:     user.license.licenseKey,
          status:         user.license.status,
          maxMachines:    user.license.maxMachines,
          activeMachines: activeMachinesCount,
        },
      },
      { headers: rlHeaders },
    );
  } catch (err) {
    console.error('[license/login] error:', err);
    return NextResponse.json(
      { ok: false, error: 'INTERNAL', message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500, headers: rlHeaders },
    );
  }
}
