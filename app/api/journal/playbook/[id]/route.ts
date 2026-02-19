/**
 * PLAYBOOK API - Single setup operations
 *
 * GET    /api/journal/playbook/[id] - Get setup with linked trades
 * PUT    /api/journal/playbook/[id] - Update setup
 * DELETE /api/journal/playbook/[id] - Delete setup
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { prisma } from '@/lib/db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const setup = await prisma.playbookSetup.findFirst({
    where: { id, userId: token.id as string },
    include: {
      journalEntries: {
        orderBy: { entryTime: 'desc' },
        take: 50,
      },
    },
  });

  if (!setup) {
    return NextResponse.json({ error: 'Setup not found' }, { status: 404 });
  }

  return NextResponse.json({ setup });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.playbookSetup.findFirst({
    where: { id, userId: token.id as string },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Setup not found' }, { status: 404 });
  }

  const body = await req.json();
  const { name, description, rules, exampleUrls, isActive } = body;

  const setup = await prisma.playbookSetup.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(rules !== undefined && { rules }),
      ...(exampleUrls !== undefined && { exampleUrls }),
      ...(isActive !== undefined && { isActive }),
    },
  });

  return NextResponse.json({ success: true, setup });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.playbookSetup.findFirst({
    where: { id, userId: token.id as string },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Setup not found' }, { status: 404 });
  }

  // Unlink trades first
  await prisma.journalEntry.updateMany({
    where: { playbookSetupId: id },
    data: { playbookSetupId: null },
  });

  await prisma.playbookSetup.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
