/**
 * POST /api/tradovate/ws-ticket
 *
 * Issues a short-lived (60s) JWT ticket that the browser uses to authenticate
 * with the standalone WS proxy server. The ticket contains the user's Tradovate
 * credentials (AES-encrypted), so raw credentials never travel over WebSocket.
 *
 * Flow:
 *   Browser → GET /api/tradovate/ws-ticket → { ticket, wsUrl }
 *   Browser → WebSocket ws://<wsUrl>/ws?ticket=<jwt>
 *   Server  → verifies ticket → creates/reuses TradovateProxy for this user
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { prisma } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

// ── AES-256-GCM encryption (matches server/utils/encrypt.js) ──────────────

const SALT = 'senzoukria-cred-salt';

function getDerivedKey() {
  const secret = process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET!;
  return scryptSync(secret, SALT, 32) as Buffer;
}

function encryptCredential(plaintext: string): string {
  const key = getDerivedKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = (cipher as any).getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const isDev = process.env.NODE_ENV === 'development';

  // Production: require auth. Dev: allow env-var credentials so contributors
  // can run a Tradovate sim without the auth/DB stack.
  if (!isDev && !session?.user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Load user's Tradovate credentials from DB (set via /boutique)
  let username: string | undefined;
  let password: string | undefined;
  let mode: 'demo' | 'live' = 'demo';

  if (session?.user) {
    try {
      const config = await prisma.dataFeedConfig.findFirst({
        where: { userId: session.user.id, provider: 'TRADOVATE' },
      });

      if (config?.username) username = config.username;
      if (config?.apiKey) password = config.apiKey; // password stored as apiKey
      if (config?.host === 'live') mode = 'live';
    } catch {
      // Fall through to env vars
    }
  }

  // Fallback to environment variables (useful for single-user dev setups)
  username = username || process.env.TRADOVATE_USERNAME;
  password = password || process.env.TRADOVATE_PASSWORD;
  if (process.env.TRADOVATE_DEMO === 'false') mode = 'live';

  if (!username || !password) {
    return NextResponse.json(
      {
        error: 'Tradovate not configured',
        message: 'Add your Tradovate credentials in the Data Feeds (Boutique) page first.',
      },
      { status: 401 }
    );
  }

  const secret = process.env.WS_TICKET_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Server misconfigured: missing NEXTAUTH_SECRET' }, { status: 500 });
  }

  // Sign a short-lived ticket with encrypted credentials
  // 60 second expiry — long enough for the browser to connect, short enough to be useless if leaked
  const ticket = jwt.sign(
    {
      userId: session?.user?.id ?? 'dev-env',
      username: encryptCredential(username),
      password: encryptCredential(password),
      mode,
    },
    secret,
    { expiresIn: 60, algorithm: 'HS256' }
  );

  // WS server URL — defaults to localhost for development
  const wsServerUrl = process.env.NEXT_PUBLIC_WS_SERVER_URL || 'ws://localhost:8080';

  return NextResponse.json({
    ticket,
    wsUrl: `${wsServerUrl}/ws`,
    expiresIn: 60,
    mode,
  });
}
