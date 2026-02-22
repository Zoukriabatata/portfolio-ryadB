import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { apiRateLimit, tooManyRequests, withRateLimitHeaders } from '@/lib/auth/rate-limiter';

const profileUpdateSchema = z.object({
  name: z.string().max(100).optional(),
  displayName: z.string().max(50).optional(),
}).strict();

/** Strip HTML tags and dangerous characters from user input */
function sanitize(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')       // Strip HTML tags
    .replace(/[<>"'`]/g, '')       // Remove dangerous chars
    .trim();
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = apiRateLimit(session.user.id);
  if (!rl.allowed) return tooManyRequests(rl);

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, displayName: true, email: true },
  });

  return withRateLimitHeaders(NextResponse.json({ user }), rl);
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = apiRateLimit(session.user.id);
  if (!rl.allowed) return tooManyRequests(rl);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const result = profileUpdateSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: result.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { name, displayName } = result.data;

  const updateData: Record<string, string | null> = {};
  if (name !== undefined) updateData.name = sanitize(name) || null;
  if (displayName !== undefined) updateData.displayName = sanitize(displayName) || null;

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: updateData,
    select: { name: true, displayName: true },
  });

  return NextResponse.json({ success: true, user });
}
