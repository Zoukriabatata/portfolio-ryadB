/**
 * GET /api/releases/latest
 *
 * Exposes the latest desktop release metadata for external clients
 * (anything that isn't /download itself, which calls the helper
 * directly to skip the HTTP round-trip).
 *
 * Standard project envelope: { ok: true, data } on success,
 * { ok: false, error } on no release / no .msi / GitHub failure.
 * Always responds 200 — the client decides what to do with ok:false.
 */

import { NextResponse } from 'next/server';
import { getLatestRelease } from '@/lib/github/releases';

export async function GET() {
  const release = await getLatestRelease();
  if (!release) {
    return NextResponse.json({ ok: false, error: 'NO_RELEASE' });
  }
  return NextResponse.json({ ok: true, data: release });
}
