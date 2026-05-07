/**
 * GitHub Releases helper.
 *
 * Single source of truth for fetching the latest desktop release.
 * Both /api/releases/latest (external clients) and /download (SSR page)
 * call this directly to share the same Next.js fetch cache layer
 * (5 min revalidate) — one round-trip to GitHub per cache window,
 * regardless of how many UI/API consumers ask.
 *
 * Returns null on any failure (no release yet, no .msi asset, GitHub
 * down, rate limit) so callers can render a graceful fallback rather
 * than a 500.
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

export async function getLatestRelease(): Promise<ReleaseInfo | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      next: { revalidate: REVALIDATE_SECONDS },
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

/**
 * Read a .msi.sig asset's plaintext content. Tauri's updater manifest
 * embeds the signature *inline* (not as a URL), so the route has to
 * pull the file. Cached the same 5 min as the release lookup so each
 * cache window costs at most one extra request.
 */
export async function fetchSignatureContent(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
    if (!res.ok) return null;
    return (await res.text()).trim();
  } catch {
    return null;
  }
}
