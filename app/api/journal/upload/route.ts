/**
 * JOURNAL SCREENSHOT UPLOAD API
 *
 * POST /api/journal/upload - Upload screenshot, returns URL
 *
 * Uses Vercel Blob for storage. Install @vercel/blob first.
 * Falls back to a base64 data URL if @vercel/blob is not available.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { apiRateLimit, tooManyRequests } from '@/lib/auth/rate-limiter';

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = apiRateLimit(token.id as string);
  if (!rl.allowed) return tooManyRequests(rl);

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 });
    }

    // Try Vercel Blob first
    try {
      const { put } = await import('@vercel/blob');
      const blob = await put(
        `journal/${token.id}/${Date.now()}-${file.name}`,
        file,
        { access: 'public', addRandomSuffix: true }
      );
      return NextResponse.json({ url: blob.url });
    } catch {
      // Fallback: convert to base64 data URL
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const base64 = buffer.toString('base64');
      const dataUrl = `data:${file.type};base64,${base64}`;
      return NextResponse.json({ url: dataUrl });
    }
  } catch {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
