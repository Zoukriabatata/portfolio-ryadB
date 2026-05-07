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
 *
 * No-store cache headers are set on every response to bypass any
 * intermediate edge cache (Vercel CDN, browser, etc.). The route
 * itself relies on the Next.js Data Cache inside getLatestRelease()
 * (5 min revalidate on the GitHub API call) to keep us under the
 * GitHub rate limit. The two layers serve different purposes.
 */

import { NextResponse } from 'next/server';
import { getLatestReleaseFresh, fetchSignatureContent } from '@/lib/github/releases';

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

function withNoStore(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', 'no-store, max-age=0');
  res.headers.set('CDN-Cache-Control', 'no-store');
  res.headers.set('Vercel-CDN-Cache-Control', 'no-store');
  return res;
}

function noUpdate(): NextResponse {
  return withNoStore(new NextResponse(null, { status: 204 }));
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ target: string; current_version: string }> },
) {
  const { target, current_version } = await params;

  if (!SUPPORTED_TARGETS.includes(target)) {
    return noUpdate();
  }

  const release = await getLatestReleaseFresh();
  if (!release) {
    return noUpdate();
  }
  if (!isNewer(release.version, current_version)) {
    return noUpdate();
  }
  if (!release.signatureUrl) {
    return noUpdate();
  }

  const signature = await fetchSignatureContent(release.signatureUrl);
  if (!signature) {
    return noUpdate();
  }

  return withNoStore(
    NextResponse.json({
      version:  release.version.replace(/^v/, ''),
      notes:    release.releaseNotes,
      pub_date: release.releaseDate,
      platforms: {
        'windows-x86_64': {
          signature,
          url: release.downloadUrl,
        },
      },
    }),
  );
}
