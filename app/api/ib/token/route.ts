/**
 * IB GATEWAY TOKEN ENDPOINT
 *
 * Generates a signed JWT for the IB Gateway Bridge.
 * The gateway verifies this token using the same NEXTAUTH_SECRET.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import jwt from 'jsonwebtoken';
import { apiRateLimit, tooManyRequests } from '@/lib/auth/rate-limiter';

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const rl = apiRateLimit(session.user.id);
  if (!rl.allowed) return tooManyRequests(rl);

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  // Sign a JWT with the same secret the gateway uses
  const token = jwt.sign(
    {
      id: session.user.id,
      email: session.user.email,
      tier: session.user.tier,
    },
    secret,
    { expiresIn: '1h' }
  );

  return NextResponse.json({ token });
}
