import NextAuth from 'next-auth';
import { NextRequest } from 'next/server';
import { authOptions } from '@/lib/auth/auth-options';

const nextAuthHandler = NextAuth(authOptions);

/**
 * Wrap NextAuth handler in a try-catch to guarantee JSON responses.
 * Without this, unhandled errors (DB down, Prisma timeout, etc.) cause
 * Next.js to return an HTML "Internal Server Error" page, which the
 * NextAuth client can't parse → CLIENT_FETCH_ERROR.
 */
async function safeHandler(req: NextRequest, ctx: { params: Promise<{ nextauth: string[] }> }) {
  try {
    return await nextAuthHandler(req, ctx);
  } catch (error) {
    console.error('[next-auth] Unhandled error in auth handler:', error);
    return Response.json(
      { error: 'Internal authentication error. Please try again.' },
      { status: 500 }
    );
  }
}

export { safeHandler as GET, safeHandler as POST };
