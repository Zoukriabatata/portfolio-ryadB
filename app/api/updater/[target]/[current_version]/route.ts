/**
 * GET /api/updater/[target]/[current_version]
 *
 * Tauri 2 auto-updater manifest endpoint. The desktop client substitutes
 * the placeholders configured in tauri.conf.json:
 *
 *   {{target}}            -> e.g. "windows-x86_64"
 *   {{current_version}}   -> e.g. "0.1.2"
 *
 * Behavior:
 *   - 200 + JSON manifest if a newer release ships an .msi (+ .msi.sig)
 *     for the requested target
 *   - 204 No Content if the running version is already the latest, the
 *     platform is unsupported, no signature is published yet, or the
 *     GitHub fetch fails — Tauri treats all of these as "no update"
 */

import { NextResponse } from 'next/server';
import { getLatestRelease, fetchSignatureContent } from '@/lib/github/releases';

const SUPPORTED_TARGETS = ['windows-x86_64'];

/** Minimal x.y.z compare. Returns true if `latest` is strictly greater
 *  than `current`. Pre-release suffixes (e.g. `-beta`) are not handled —
 *  introduce a real semver lib if/when that becomes a use case. */
function isNewer(latest: string, current: string): boolean {
  const stripV = (s: string) => s.replace(/^v/, '');
  const a = stripV(latest).split('.').map((s) => Number.parseInt(s, 10));
  const b = stripV(current).split('.').map((s) => Number.parseInt(s, 10));
  for (let i = 0; i < 3; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return false;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ target: string; current_version: string }> },
) {
  const { target, current_version } = await params;

  if (!SUPPORTED_TARGETS.includes(target)) {
    return new NextResponse(null, { status: 204 });
  }

  const release = await getLatestRelease();
  if (!release) {
    return new NextResponse(null, { status: 204 });
  }
  if (!isNewer(release.version, current_version)) {
    return new NextResponse(null, { status: 204 });
  }
  if (!release.signatureUrl) {
    return new NextResponse(null, { status: 204 });
  }

  const signature = await fetchSignatureContent(release.signatureUrl);
  if (!signature) {
    return new NextResponse(null, { status: 204 });
  }

  return NextResponse.json({
    version:  release.version.replace(/^v/, ''),
    notes:    release.releaseNotes,
    pub_date: release.releaseDate,
    platforms: {
      'windows-x86_64': {
        signature,
        url: release.downloadUrl,
      },
    },
  });
}
