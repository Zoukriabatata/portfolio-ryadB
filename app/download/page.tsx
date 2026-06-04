import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { getLatestRelease, type ReleaseInfo } from '@/lib/github/releases';
import { AnimatedChars } from '@/components/ui/AnimatedChars';

export const metadata: Metadata = {
  title: 'Download OrderflowV2 — Free preview until June 17',
  description:
    'Download OrderflowV2 desktop : footprint charts with broker-side daily volume, delta, imbalance and absorption detection. NinjaTrader Bridge for Apex / Rithmic, Rithmic direct, or crypto. Windows. Free preview until 17 June 2026.',
  keywords: [
    'orderflow software download',
    'footprint chart download',
    'NinjaTrader bridge download',
    'NinjaScript orderflow indicator',
    'Apex Trader Funding footprint',
    'Rithmic footprint',
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
      'Footprint charts + NinjaTrader Bridge for futures traders. Free preview until 17/06/2026.',
    url: '/download',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Download OrderflowV2 — Free preview',
    description:
      'Footprint + NinjaTrader Bridge. Free until 17/06/2026.',
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

// ─── Shared mono style helpers ─────────────────────────────────────────────
const MONO_KICKER: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains-mono)',
  fontSize: 11,
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
};
const MONO_LABEL: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains-mono)',
  fontSize: 10,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
};
const MONO_BTN: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains-mono)',
  fontSize: 11,
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  fontWeight: 600,
};
const MONO_DATA: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains-mono)',
  fontVariantNumeric: 'tabular-nums',
};

function enter(delay: number): React.CSSProperties {
  return {
    animation: `fadeInUp 0.7s cubic-bezier(.2,.7,.2,1) ${delay}ms forwards`,
    opacity: 0,
  };
}

// ─── Page ──────────────────────────────────────────────────────────────────
export default async function DownloadPage() {
  const headersList = await headers();
  const os = detectOS(headersList.get('user-agent'));
  const release = await getLatestRelease();

  return (
    <div
      className="min-h-screen px-6 py-16 relative overflow-hidden"
      style={{ background: 'var(--background)' }}
    >
      {/* Soft lime halo top-right — single, in oklab, no banding */}
      <div
        aria-hidden="true"
        className="absolute top-0 right-0 w-[640px] h-[640px] rounded-full pointer-events-none"
        style={{
          background:
            'radial-gradient(circle in oklab, rgba(74,222,128,0.10), transparent 70%)',
          filter: 'blur(80px)',
        }}
      />

      <div className="max-w-4xl mx-auto relative z-10">

        {/* ── HEADER ─────────────────────────────────────────────────── */}
        <div style={enter(60)}>
          <Link
            href="/"
            className="inline-block hover:text-[var(--primary)] transition-colors"
            style={{ ...MONO_KICKER }}
          >
            ← Back to home
          </Link>
        </div>

        <div className="mt-14" style={enter(140)}>
          <span style={{ ...MONO_KICKER, color: 'var(--text-dimmed)' }}>
            · Download
          </span>
        </div>

        <h1
          className="mt-5 leading-none"
          style={{
            fontFamily: 'var(--font-jetbrains-mono)',
            fontWeight: 500,
            fontSize: 'clamp(44px, 6vw, 88px)',
            color: 'var(--text-primary)',
            letterSpacing: '-0.04em',
            textTransform: 'uppercase',
            WebkitFontSmoothing: 'subpixel-antialiased',
          }}
        >
          <AnimatedChars text="Orderflow" baseDelay={220} charDelay={32} />
          <br />
          <AnimatedChars text="for desktop" baseDelay={520} charDelay={32} />
        </h1>

        <p
          className="mt-7 max-w-xl"
          style={{
            ...enter(640),
            color: 'var(--text-secondary)',
            fontSize: 15,
            lineHeight: 1.6,
          }}
        >
          Footprint, depth, replay — broker-side data, no proxy lag. Plug your
          NinjaTrader feed or connect Rithmic direct.
        </p>

        {/* ── META BAR — release info inline ─────────────────────────── */}
        {release && (
          <div
            className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 pt-5"
            style={{
              ...enter(780),
              borderTop: '1px solid var(--border)',
            }}
          >
            <MetaItem k="Version" v={release.version} />
            <MetaItem k="Build size" v={formatBytes(release.fileSize)} />
            <MetaItem k="Platform" v="Windows · MSI" />
            <MetaItem k="Free PRO" v="Until 17 Jun 2026" />
          </div>
        )}

        {/* ── OS CARDS ───────────────────────────────────────────────── */}
        <div
          className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-3"
          style={enter(900)}
        >
          <DownloadCard kind="windows" highlighted={os === 'windows'} release={release} />
          <DownloadCard kind="mac"     highlighted={os === 'mac'}     release={null} comingSoon="Q3 2026" />
          <DownloadCard kind="linux"   highlighted={os === 'linux'}   release={null} comingSoon="Soon" />
        </div>

        {release && (
          <>
            {/* ── SMARTSCREEN WARNING ─────────────────────────────────── */}
            <section
              className="mt-12 rounded-xl p-5"
              style={{
                ...enter(1080),
                background: 'color-mix(in oklab, #fbbf24 5%, transparent)',
                border: '1px solid color-mix(in oklab, #fbbf24 30%, transparent)',
              }}
            >
              <div style={{ ...MONO_LABEL, color: '#fbbf24' }}>
                · Heads-up
              </div>
              <p
                className="mt-3 text-sm leading-relaxed"
                style={{ color: 'var(--text-secondary)' }}
              >
                Windows va afficher un écran de protection. C&apos;est normal —
                OrderflowV2 est édité par un studio indépendant et le certificat
                de signature Windows (≈300 €/an) arrive dans la prochaine release.
              </p>
              <p
                className="mt-3 text-sm"
                style={{ color: 'var(--text-secondary)' }}
              >
                Pour installer : <CodeChip>Informations complémentaires</CodeChip>{' '}
                → <CodeChip>Exécuter quand même</CodeChip>. C&apos;est tout.
              </p>
            </section>

            {/* ── STEP 01 ─────────────────────────────────────────────── */}
            <Step
              index="01"
              title="Install OrderflowV2 on Windows"
              delay={1180}
            >
              <Ol>
                <li>
                  Télécharge le fichier <CodeChip>.msi</CodeChip> ci-dessus.
                </li>
                <li>Double-clique pour lancer l&apos;installeur.</li>
                <li>
                  Si l&apos;écran <em>Windows protected your PC</em> apparaît :
                  {' '}<strong style={{ color: 'var(--text-primary)' }}>Informations complémentaires</strong>
                  {' '}→ <strong style={{ color: 'var(--text-primary)' }}>Exécuter quand même</strong>.
                </li>
                <li>Sign in avec ton compte OrderflowV2.</li>
              </Ol>
            </Step>

            {/* ── STEP 02 — NinjaTrader bridge ────────────────────────── */}
            <Step
              index="02"
              title="Connect the NinjaTrader bridge"
              badge="Apex / Rithmic"
              accent
              delay={1320}
            >
              <p
                className="text-sm mb-5 leading-relaxed"
                style={{ color: 'var(--text-secondary)' }}
              >
                Si tu trades les futures via NinjaTrader (Apex, Rithmic),
                cette étape connecte OrderflowV2 à ton flux NT en local —
                pas besoin de re-saisir les credentials Rithmic, NT s&apos;occupe
                de tout.
              </p>

              <a
                href="/OrderflowBridge.cs"
                download="OrderflowBridge.cs"
                className="inline-flex w-full items-center justify-center gap-2 py-3 rounded-md text-center mb-6 transition-all duration-200 active:scale-[0.99] hover:opacity-95"
                style={{
                  ...MONO_BTN,
                  background: 'var(--primary)',
                  color: '#0a0a0a',
                  fontWeight: 700,
                }}
              >
                <span aria-hidden>↓</span>
                Download OrderflowBridge.cs
              </a>

              <Ol>
                <li>
                  Copie le fichier <CodeChip>OrderflowBridge.cs</CodeChip> dans{' '}
                  <CodeChip>Documents\NinjaTrader 8\bin\Custom\Indicators\</CodeChip>
                </li>
                <li>
                  Dans NinjaTrader : <strong style={{ color: 'var(--text-primary)' }}>Tools → NinjaScript Editor → F5</strong>
                  {' '}(compile, doit afficher 0 erreur)
                </li>
                <li>
                  Ouvre un chart avec ces paramètres exacts :
                  <div className="mt-3 rounded-md p-3" style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)' }}>
                    <ConfigRow k="Bars Period Type" v="Tick" />
                    <ConfigRow k="Bars Period Value" v="100" warn />
                    <ConfigRow k="Tick Replay" v="ON" warn />
                    <ConfigRow k="Days to load" v="1+" last />
                  </div>
                </li>
                <li>
                  Applique l&apos;indicateur <strong style={{ color: 'var(--text-primary)' }}>OrderflowBridge</strong> sur le chart
                  {' '}(Indicators → New → OrderflowBridge → Apply).
                </li>
                <li>
                  L&apos;Output window doit afficher :{' '}
                  <CodeChip>OrderflowBridge: listening on 127.0.0.1:7272</CodeChip>
                </li>
                <li>
                  Dans OrderflowV2 → bascule sur{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>NinjaTrader Bridge</strong>
                  {' '}— les données apparaissent en quelques secondes.
                </li>
              </Ol>

              <div
                className="mt-5 p-4 rounded-md"
                style={{
                  background: 'color-mix(in oklab, var(--primary) 6%, transparent)',
                  border: '1px solid color-mix(in oklab, var(--primary) 25%, transparent)',
                }}
              >
                <div style={{ ...MONO_LABEL, color: 'var(--primary)' }}>
                  · No NinjaTrader?
                </div>
                <p
                  className="mt-2 text-xs leading-relaxed"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Use Rithmic direct (broker settings in-app) or crypto mode
                  (Binance / Bybit / Deribit) — zero install.
                </p>
              </div>
            </Step>
          </>
        )}

        {/* ── FOOTER LINKS ────────────────────────────────────────────── */}
        <div
          className="mt-16 pt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3"
          style={{
            ...enter(1480),
            borderTop: '1px solid var(--border)',
          }}
        >
          <FootLink href="/account">Already a customer? Sign in</FootLink>
          <FootSep />
          <FootLink href="/auth/register">Create an account</FootLink>
          <FootSep />
          <FootLink href="/pricing">See pricing</FootLink>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function MetaItem({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-col">
      <span style={{ ...MONO_LABEL, color: 'var(--text-dimmed)', fontSize: 9 }}>
        {k}
      </span>
      <span
        className="mt-1"
        style={{ ...MONO_DATA, fontSize: 13, color: 'var(--text-primary)' }}
      >
        {v}
      </span>
    </div>
  );
}

function CodeChip({ children }: { children: React.ReactNode }) {
  return (
    <code
      className="px-1.5 py-0.5 rounded"
      style={{
        fontFamily: 'var(--font-jetbrains-mono)',
        fontSize: 11.5,
        background: 'var(--surface-elevated)',
        border: '1px solid var(--border)',
        color: 'var(--primary-light)',
      }}
    >
      {children}
    </code>
  );
}

// Ordered list with mono trader-coded counters. Native `list-decimal`
// would render the markers in the inherited body font (Geist), out of
// sync with the editorial-mono voice of the rest of the page.
function Ol({ children }: { children: React.ReactNode }) {
  return (
    <ol
      className="space-y-3 text-sm leading-relaxed pl-7 marker:text-[var(--text-dimmed)] download-ol"
      style={{
        color: 'var(--text-secondary)',
        listStyleType: 'decimal',
      }}
    >
      {children}
    </ol>
  );
}

function ConfigRow({ k, v, warn, last }: { k: string; v: string; warn?: boolean; last?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between py-2 ${last ? '' : 'border-b'}`}
      style={{ borderColor: 'var(--border)' }}
    >
      <span style={{ ...MONO_LABEL, color: 'var(--text-muted)' }}>{k}</span>
      <span
        style={{
          ...MONO_DATA,
          fontSize: 12,
          color: warn ? '#fbbf24' : 'var(--text-primary)',
          fontWeight: warn ? 600 : 400,
        }}
      >
        {v}
      </span>
    </div>
  );
}

function Step({
  index, title, badge, accent, children, delay,
}: {
  index: string;
  title: string;
  badge?: string;
  accent?: boolean;
  children: React.ReactNode;
  delay: number;
}) {
  return (
    <section
      className="mt-8 rounded-xl p-7"
      style={{
        ...enter(delay),
        background: 'var(--surface)',
        border: accent
          ? '1px solid color-mix(in oklab, var(--primary) 30%, transparent)'
          : '1px solid var(--border)',
      }}
    >
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <div style={{ ...MONO_KICKER, color: 'var(--text-dimmed)' }}>
            · Step {index}
          </div>
          <h2
            className="mt-2 uppercase"
            style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontWeight: 500,
              fontSize: 22,
              letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
              WebkitFontSmoothing: 'subpixel-antialiased',
            }}
          >
            {title}
          </h2>
        </div>
        {badge && (
          <span
            className="px-2.5 py-1 rounded-md whitespace-nowrap"
            style={{
              ...MONO_LABEL,
              background: 'color-mix(in oklab, var(--primary) 12%, transparent)',
              color: 'var(--primary)',
              border: '1px solid color-mix(in oklab, var(--primary) 30%, transparent)',
              fontSize: 9.5,
            }}
          >
            {badge}
          </span>
        )}
      </div>
      <div className="step-body">
        {children}
      </div>
      {/* Mono ordered-list counter via CSS — see globals.css .step-body ol */}
    </section>
  );
}

function FootLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="hover:text-[var(--primary)] transition-colors"
      style={{ ...MONO_KICKER, color: 'var(--text-muted)' }}
    >
      {children}
    </Link>
  );
}
function FootSep() {
  return <span style={{ color: 'var(--border)' }}>·</span>;
}

// ─── DownloadCard ──────────────────────────────────────────────────────────
const META: Record<OSKind, { name: string; ext: string }> = {
  windows: { name: 'Windows', ext: '.MSI' },
  mac:     { name: 'macOS',   ext: '.DMG' },
  linux:   { name: 'Linux',   ext: '.APPIMAGE' },
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
  const accent = highlighted && active;

  const statusLabel =
    !active ? (comingSoon ?? 'Pending')
    : highlighted ? 'Detected'
    : 'Available';

  return (
    <div
      className="rounded-xl p-5 flex flex-col h-full"
      style={{
        background: 'var(--surface)',
        border: accent
          ? '1px solid color-mix(in oklab, var(--primary) 40%, transparent)'
          : '1px solid var(--border)',
        boxShadow: accent ? '0 0 32px color-mix(in oklab, var(--primary) 12%, transparent)' : 'none',
        opacity: active ? 1 : 0.55,
      }}
    >
      <div className="flex items-center justify-between mb-5">
        <span
          style={{
            ...MONO_LABEL,
            color: accent ? 'var(--primary)' : 'var(--text-dimmed)',
          }}
        >
          · {statusLabel}
        </span>
        <span style={{ ...MONO_LABEL, color: 'var(--text-dimmed)' }}>
          {meta.ext}
        </span>
      </div>

      <h3
        className="uppercase mb-1"
        style={{
          fontFamily: 'var(--font-jetbrains-mono)',
          fontWeight: 500,
          fontSize: 28,
          letterSpacing: '-0.03em',
          color: 'var(--text-primary)',
        }}
      >
        {meta.name}
      </h3>

      <div className="flex-1" />

      {release && active ? (
        <>
          <a
            href={release.downloadUrl}
            className="inline-flex w-full items-center justify-center gap-2 py-2.5 rounded-md mt-6 transition-all duration-200 active:scale-[0.99] hover:opacity-95"
            style={{
              ...MONO_BTN,
              background: 'var(--primary)',
              color: '#0a0a0a',
              fontWeight: 700,
            }}
          >
            <span aria-hidden>↓</span>
            Download
          </a>
          <p
            className="text-center mt-3"
            style={{
              ...MONO_DATA,
              fontSize: 11,
              letterSpacing: '0.08em',
              color: 'var(--text-muted)',
            }}
          >
            {release.version} · {formatBytes(release.fileSize)}
          </p>
        </>
      ) : (
        <button
          disabled
          className="inline-block w-full py-2.5 rounded-md mt-6 cursor-not-allowed"
          style={{
            ...MONO_BTN,
            background: 'transparent',
            color: 'var(--text-dimmed)',
            border: '1px solid var(--border)',
          }}
        >
          {comingSoon ?? 'Build pending'}
        </button>
      )}
    </div>
  );
}
