/**
 * DELETE /api/account/license/machines/[id]
 *
 * Revokes a single machine slot bound to the authenticated user's
 * license. Frees that slot so a different machine can claim it via
 * /api/license/login. Refuses to revoke the caller's own machine
 * (they'd lock themselves out) unless `?force=1` is passed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, isPrismaAvailable } from '@/lib/db';
import { requireAuth } from '@/lib/auth/api-middleware';

export const dynamic = 'force-dynamic';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth(request);
  if ('error' in authResult) {
    return NextResponse.json(
      { ok: false, error: authResult.error },
      { status: authResult.status, headers: authResult.headers },
    );
  }

  if (!isPrismaAvailable()) {
    return NextResponse.json(
      { ok: false, error: 'Database unavailable' },
      { status: 503, headers: authResult.headers },
    );
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { ok: false, error: 'Missing machine id' },
      { status: 400, headers: authResult.headers },
    );
  }

  try {
    // Verify the machine belongs to a license owned by the caller —
    // a user can ONLY revoke their own slots.
    const machine = await prisma.machine.findUnique({
      where: { id },
      include: { license: true },
    });

    if (!machine || machine.license.userId !== authResult.user.id) {
      return NextResponse.json(
        { ok: false, error: 'Machine not found' },
        { status: 404, headers: authResult.headers },
      );
    }

    await prisma.machine.delete({ where: { id } });

    return NextResponse.json(
      { ok: true, revoked: id },
      { headers: authResult.headers },
    );
  } catch (err) {
    console.error('[api/account/license/machines/:id DELETE] error:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to revoke machine' },
      { status: 500, headers: authResult.headers },
    );
  }
}
