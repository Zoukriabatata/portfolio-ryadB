import { headers } from 'next/headers';
import Link from 'next/link';
import { getLatestRelease, type ReleaseInfo } from '@/lib/github/releases';

type OSKind = 'windows' | 'mac' | 'linux';

function detectOS(userAgent: string | null): OSKind | 'unknown' {
  if (!userAgent) return 'unknown';
  const ua = userAgent.toLowerCase();
  if (ua.includes('windows')) return 'windows';
  if (ua.includes('mac os') || ua.includes('macintosh')) return 'mac';
  if (ua.includes('linux') || ua.includes('x11')) return 'linux';
  return 'unknown';
}

function formatBytes(b: number): string {
  if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  if (b >= 1024)        return `${(b / 1024).toFixed(0)} KB`;
  return `${b} B`;
}

export default async function DownloadPage() {
  const headersList = await headers();
  const os = detectOS(headersList.get('user-agent'));
  const release = await getLatestRelease();

  return (
    <div
      className="min-h-screen flex flex-col items-center px-4 py-16 relative overflow-hidden"
      style={{ background: 'var(--background)' }}
    >
      <div
        className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(74,222,128,0.08) 0%, transparent 70%)', filter: 'blur(80px)' }}
        aria-hidden="true"
      />

      <div className="text-center mb-10 relative z-10 max-w-2xl">
        <Link
          href="/"
          className="inline-block px-3 py-1 rounded-full text-[10px] tracking-widest mb-6"
          style={{ background: 'var(--surface-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
        >
          ← BACK TO HOME
        </Link>
        <h1 className="text-4xl md:text-5xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
          Download OrderflowV2
        </h1>
        <p className="text-base md:text-lg" style={{ color: 'var(--text-muted)' }}>
          Real-time order flow on your desktop. Connect your broker, trade your way.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl w-full mb-12 relative z-10">
        <DownloadCard kind="windows" highlighted={os === 'windows'} release={release} />
        <DownloadCard kind="mac"     highlighted={os === 'mac'}     release={null} comingSoon="Coming Q3 2026" />
        <DownloadCard kind="linux"   highlighted={os === 'linux'}   release={null} comingSoon="Coming soon" />
      </div>

      {release && (
        <section
          className="w-full max-w-2xl rounded-2xl p-6 relative z-10 mb-8"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
            How to install on Windows
          </h2>
          <ol className="list-decimal pl-5 space-y-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            <li>Download the <code>.msi</code> file above.</li>
            <li>Double-click the file to launch the installer.</li>
            <li>
              <strong style={{ color: 'var(--text-primary)' }}>Important</strong>: Windows might
              show a &quot;Windows protected your PC&quot; warning. Click <em>More info</em>, then
              <em> Run anyway</em>. (Code signing is on the roadmap — the installer is currently
              unsigned, which triggers SmartScreen.)
            </li>
            <li>Sign in with your OrderflowV2 account.</li>
            <li>You&apos;re in. Live charts, footprints, GEX — all native.</li>
          </ol>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3 text-sm relative z-10" style={{ color: 'var(--text-muted)' }}>
        <Link href="/account"       className="hover:underline" style={{ color: 'var(--primary)' }}>Already a customer? Sign in</Link>
        <span>·</span>
        <Link href="/auth/register" className="hover:underline" style={{ color: 'var(--primary)' }}>Create an account</Link>
        <span>·</span>
        <Link href="/pricing"       className="hover:underline" style={{ color: 'var(--primary)' }}>See pricing</Link>
      </div>
    </div>
  );
}

const META: Record<OSKind, { name: string; ext: string }> = {
  windows: { name: 'Windows', ext: '.msi' },
  mac:     { name: 'macOS',   ext: '.dmg' },
  linux:   { name: 'Linux',   ext: '.AppImage' },
};

function DownloadCard({
  kind, highlighted, release, comingSoon,
}: {
  kind:        OSKind;
  highlighted: boolean;
  release:     ReleaseInfo | null;
  comingSoon?: string;
}) {
  const meta = META[kind];
  const active = release !== null;

  return (
    <div
      className="rounded-2xl p-6 flex flex-col items-center text-center"
      style={{
        background: 'var(--surface)',
        border:     highlighted && active ? '1px solid var(--primary)' : '1px solid var(--border)',
        boxShadow:  highlighted && active ? '0 0 30px rgba(74,222,128,0.12)' : 'none',
        opacity:    active ? 1 : 0.55,
      }}
    >
      <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
        {highlighted && active ? 'Detected' : 'Available'}
      </div>
      <h3 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{meta.name}</h3>
      <p className="text-xs mb-5" style={{ color: 'var(--text-muted)' }}>{meta.ext}</p>

      {release ? (
        <>
          <a
            href={release.downloadUrl}
            className="inline-block w-full py-2.5 rounded-lg font-bold text-[13px] tracking-wide"
            style={{
              background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
              color:      '#fff',
            }}
          >
            Download for {meta.name}
          </a>
          <p className="text-[11px] mt-3" style={{ color: 'var(--text-muted)' }}>
            {release.version} · {formatBytes(release.fileSize)}
          </p>
        </>
      ) : (
        <button
          disabled
          className="inline-block w-full py-2.5 rounded-lg font-bold text-[13px] tracking-wide cursor-not-allowed"
          style={{
            background: 'var(--surface-elevated)',
            color:      'var(--text-muted)',
            border:     '1px solid var(--border)',
          }}
        >
          {comingSoon ?? 'Build pending'}
        </button>
      )}
    </div>
  );
}
