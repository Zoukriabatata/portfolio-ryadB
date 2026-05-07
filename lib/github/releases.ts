/**
 * GitHub Releases helper.
 *
 * Two variants serve different freshness requirements:
 *
 *   - getLatestRelease()       — Next.js Data Cache, 5 min revalidate.
 *                                For /download (SSR page) and
 *                                /api/releases/latest (external clients).
 *                                5-min stale is acceptable; this caps
 *                                GitHub API hits during traffic spikes.
 *
 *   - getLatestReleaseFresh()  — Bypasses Data Cache (cache: 'no-store').
 *                                For /api/updater where stale data
 *                                directly causes "no update available"
 *                                false negatives right after a release
 *                                publishes (the bug burned v0.1.10 and
 *                                v0.1.11). Each request hits GitHub.
 *                                GitHub unauth rate limit is 60 req/hour
 *                                per IP — fine at our current scale.
 *                                If hit, add a PAT (5000 req/hour).
 *
 * Both return null on any failure (no release yet, no .msi asset,
 * GitHub down, rate limit) so callers can render a graceful fallback
 * rather than a 500.
 */

const REPO = 'Zoukriabatata/portfolio-ryadB';
const REVALIDATE_SECONDS = 300;

export interface ReleaseInfo {
  version:      string;
  downloadUrl:  string;
  fileSize:     number;
  releaseDate:  string;
  releaseNotes: string;
  /** URL of the .msi.sig asset, or null if the release didn't ship one
   *  (e.g. an unsigned build pre-Phase 6.4). The updater route fetches
   *  the .sig content from this URL and embeds it in the manifest. */
  signatureUrl: string | null;
}

interface GitHubAsset {
  name:                 string;
  size:                 number;
  browser_download_url: string;
}

interface GitHubRelease {
  tag_name?:     string;
  name?:         string;
  body?:         string;
  published_at?: string;
  assets?:       GitHubAsset[];
}

async function fetchLatestRelease(opts: { fresh: boolean }): Promise<ReleaseInfo | null> {
  const cacheOpts = opts.fresh
    ? { cache: 'no-store' as const }
    : { next: { revalidate: REVALIDATE_SECONDS } };

  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      ...cacheOpts,
    });

    if (!res.ok) return null;

    const data = (await res.json()) as GitHubRelease;
    const assets = data.assets ?? [];
    const msiAsset = assets.find((a) => a.name.toLowerCase().endsWith('.msi'));
    const sigAsset = assets.find((a) => a.name.toLowerCase().endsWith('.msi.sig'));

    if (!msiAsset) return null;

    return {
      version:      data.tag_name ?? data.name ?? 'unknown',
      downloadUrl:  msiAsset.browser_download_url,
      fileSize:     msiAsset.size,
      releaseDate:  data.published_at ?? '',
      releaseNotes: data.body ?? '',
      signatureUrl: sigAsset?.browser_download_url ?? null,
    };
  } catch {
    return null;
  }
}

/** Cached variant (5 min). Use for /download and /api/releases/latest. */
export async function getLatestRelease(): Promise<ReleaseInfo | null> {
  return fetchLatestRelease({ fresh: false });
}

/** Fresh variant (no cache). Use for /api/updater where stale data
 *  silently breaks the auto-update flow right after a release. */
export async function getLatestReleaseFresh(): Promise<ReleaseInfo | null> {
  return fetchLatestRelease({ fresh: true });
}

/**
 * Read a .msi.sig asset's plaintext content. Tauri's updater manifest
 * embeds the signature inline (not as a URL), so the route has to pull
 * the file. Always fresh — only called from the updater path where any
 * staleness defeats the point.
 */
export async function fetchSignatureContent(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.text()).trim();
  } catch {
    return null;
  }
}
