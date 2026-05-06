/**
 * GET /api/account/license
 *
 * Returns the authenticated user's license info + active machines.
 * Returns { ok: true, data: null } if the user has no license yet
 * (FREE users, PRO users whose webhook hasn't fired yet, etc.).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, isPrismaAvailable } from '@/lib/db';
import { requireAuth } from '@/lib/auth/api-middleware';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if ('error' in authResult) {
    return NextResponse.json(
      { ok: false, error: authResult.error },
      { status: authResult.status, headers: authResult.headers }
    );
  }

  if (!isPrismaAvailable()) {
    return NextResponse.json(
      { ok: false, error: 'Database unavailable' },
      { status: 503, headers: authResult.headers }
    );
  }

  try {
    const license = await prisma.license.findUnique({
      where: { userId: authResult.user.id },
      include: {
        machines: {
          orderBy: { lastHeartbeatAt: 'desc' },
        },
      },
    });

    if (!license) {
      return NextResponse.json(
        { ok: true, data: null },
        { headers: authResult.headers }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          licenseKey:   license.licenseKey,
          status:       license.status,
          maxMachines:  license.maxMachines,
          createdAt:    license.createdAt.toISOString(),
          machines: license.machines.map(m => ({
            id:                m.id,
            machineId:         m.machineId,
            os:                m.os,
            appVersion:        m.appVersion,
            firstSeenAt:       m.firstSeenAt.toISOString(),
            lastHeartbeatAt:   m.lastHeartbeatAt.toISOString(),
          })),
        },
      },
      { headers: authResult.headers }
    );
  } catch (err) {
    console.error('[api/account/license] error:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to load license' },
      { status: 500, headers: authResult.headers }
    );
  }
}
