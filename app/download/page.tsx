import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { getLatestRelease, type ReleaseInfo } from '@/lib/github/releases';

export const metadata: Metadata = {
  title: 'Download OrderflowV2 — Free preview until June 17',
  description:
    'Download OrderflowV2 desktop : footprint charts, liquidity heatmap, GEX dashboard, multi-broker (Rithmic, NinjaTrader Bridge). Windows. Free preview access until 17 June 2026.',
  keywords: [
    'orderflow software download',
    'footprint chart download',
    'GEX dashboard',
    'Rithmic footprint',
    'NinjaTrader bridge',
    'orderflow desktop app',
    'free trading software',
    'ATAS alternative',
    'Bookmap alternative',
    'Sierra Chart alternative',
  ],
  alternates: { canonical: '/download' },
  openGraph: {
    title: 'Download OrderflowV2 — Free preview until June 17',
    description:
      'Footprint charts, liquidity heatmap, GEX dashboard for futures traders. Free preview until 17/06/2026.',
    url: '/download',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Download OrderflowV2 — Free preview',
    description:
      'Footprint, heatmap, GEX. Free until 17/06/2026.',
  },
};

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
        <>
          {/* SmartScreen heads-up — first thing the user sees AFTER the
              download cards. We surface it as a callout (not buried in
              the install list) because the unsigned installer fires a
              big red Windows warning that scares ~30-50% of non-tech
              users into closing the window. Telling them it's expected
              + showing the two-click workaround flips that into a
              non-event. Visible until we ship a code-signed build. */}
          <section
            className="w-full max-w-2xl rounded-2xl p-5 relative z-10 mb-6"
            style={{
              background: 'rgba(251, 191, 36, 0.06)',
              border:     '1px solid rgba(251, 191, 36, 0.35)',
            }}
          >
            <div className="flex items-start gap-3">
              <span style={{ fontSize: 22 }} aria-hidden>⚠️</span>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                <strong style={{ color: '#fbbf24' }}>
                  Heads-up : Windows va afficher un écran de protection.
                </strong>{' '}
                C&apos;est normal — OrderflowV2 est édité par un studio indépendant et le
                certificat de signature Windows (≈300€/an) sera ajouté dans la prochaine release.
                <br /><br />
                <strong style={{ color: 'var(--text-primary)' }}>Pour installer :</strong>
                {' '}clique sur <em style={{ color: 'var(--primary-light)' }}>Informations
                complémentaires</em> dans l&apos;écran bleu, puis sur{' '}
                <em style={{ color: 'var(--primary-light)' }}>Exécuter quand même</em>.
                C&apos;est tout — l&apos;installation est sûre.
              </div>
            </div>
          </section>

          <section
            className="w-full max-w-2xl rounded-2xl p-6 relative z-10 mb-6"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              Step 1 — Install OrderflowV2 on Windows
            </h2>
            <ol className="list-decimal pl-5 space-y-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              <li>Télécharge le fichier <code>.msi</code> ci-dessus.</li>
              <li>Double-clique pour lancer l&apos;installeur.</li>
              <li>
                Si l&apos;écran &quot;Windows protected your PC&quot; apparaît :
                {' '}<strong style={{ color: 'var(--text-primary)' }}>Informations complémentaires</strong>
                {' '}→ <strong style={{ color: 'var(--text-primary)' }}>Exécuter quand même</strong>.
              </li>
              <li>Sign in avec ton compte OrderflowV2.</li>
            </ol>
          </section>

          {/* NinjaTrader bridge install — second critical step for the
              futures audience (Apex / Rithmic-through-NT users). The
              .cs source-of-truth lives at desktop/scripts/ninjatrader/
              OrderflowBridge.cs; a copy is served from /public so users
              get a one-click download instead of having to find it in
              the GitHub repo. Keep the two in sync when the wire
              protocol changes (next release should ideally script the
              copy in package.json, but a manual cp is fine for now). */}
          <section
            className="w-full max-w-2xl rounded-2xl p-6 relative z-10 mb-8"
            style={{ background: 'var(--surface)', border: '1px solid rgba(74,222,128,0.30)' }}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                Step 2 — Connect NinjaTrader bridge
              </h2>
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider"
                style={{
                  background: 'rgba(74,222,128,0.15)',
                  color:      'var(--primary)',
                  border:     '1px solid rgba(74,222,128,0.35)',
                }}
              >
                APEX / RITHMIC
              </span>
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
              Si tu trades les futures via NinjaTrader (Apex Trader Funding, Rithmic, etc.),
              cette étape connecte OrderflowV2 à ton flux NT en local — pas besoin de re-saisir
              tes credentials Rithmic, NT s&apos;occupe de tout.
            </p>

            <a
              href="/OrderflowBridge.cs"
              download="OrderflowBridge.cs"
              className="inline-block w-full py-3 rounded-lg font-bold text-[13px] tracking-wide text-center mb-5 transition-all duration-200 hover:opacity-90"
              style={{
                background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
                color:      '#fff',
              }}
            >
              ⬇ Download OrderflowBridge.cs (NinjaScript)
            </a>

            <ol className="list-decimal pl-5 space-y-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              <li>
                Copie le fichier <code>OrderflowBridge.cs</code> dans
                {' '}<code>Documents\NinjaTrader 8\bin\Custom\Indicators\</code>
              </li>
              <li>
                Dans NinjaTrader : <strong style={{ color: 'var(--text-primary)' }}>Tools → NinjaScript Editor → F5</strong>
                {' '}(compile, doit afficher 0 erreur)
              </li>
              <li>
                Ouvre un chart avec ces paramètres exacts :
                <ul className="list-disc pl-5 mt-1 space-y-1 text-xs">
                  <li><strong>Bars Period Type</strong> : Tick</li>
                  <li><strong>Bars Period Value</strong> : <strong style={{ color: '#fbbf24' }}>100</strong> (pas 1)</li>
                  <li><strong>Tick Replay</strong> : <strong style={{ color: '#fbbf24' }}>ON</strong> (Properties → Data Series)</li>
                  <li><strong>Days to load</strong> : 1 ou plus</li>
                </ul>
              </li>
              <li>
                Applique l&apos;indicateur <strong style={{ color: 'var(--text-primary)' }}>OrderflowBridge</strong> sur le chart
                {' '}(Indicators → New → OrderflowBridge → Apply).
                L&apos;Output window doit afficher : <em>&quot;OrderflowBridge: listening on 127.0.0.1:7272&quot;</em>
              </li>
              <li>
                Dans l&apos;app OrderflowV2 → bascule sur <strong style={{ color: 'var(--text-primary)' }}>&quot;NinjaTrader Bridge&quot;</strong>
                {' '}→ les données apparaissent en quelques secondes.
              </li>
            </ol>

            <div
              className="mt-5 p-3 rounded-lg text-xs"
              style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', color: 'var(--text-secondary)' }}
            >
              <strong style={{ color: 'var(--primary-light)' }}>💡 Tu n&apos;as pas NinjaTrader ?</strong>
              {' '}Tu peux aussi utiliser l&apos;adapter Rithmic direct (broker settings dans l&apos;app)
              ou le mode crypto (Binance / Bybit / Deribit) sans aucune installation.
            </div>
          </section>
        </>
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
        {!active ? 'Coming soon' : highlighted ? 'Detected' : 'Available'}
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
