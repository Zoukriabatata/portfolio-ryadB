import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getLatestRelease, type ReleaseInfo } from '@/lib/github/releases';
import { AnimatedChars } from '@/components/ui/AnimatedChars';
import MarketingShell from '@/components/marketing/MarketingShell';

export const metadata: Metadata = {
  title: 'Download Senzoukria — Free preview until June 17',
  description:
    'Download Senzoukria desktop: footprint charts with broker-side daily volume, delta, imbalance and absorption detection. NinjaTrader Bridge for Apex / Rithmic, Rithmic direct, or crypto. Windows. Free preview until 17 June 2026.',
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
    title: 'Download Senzoukria — Free preview until June 17',
    description:
      'Footprint charts + NinjaTrader Bridge for futures traders. Free preview until 17/06/2026.',
    url: '/download',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Download Senzoukria — Free preview',
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
    <MarketingShell>
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
            'radial-gradient(circle in oklab, rgb(var(--primary-rgb) / 0.10), transparent 70%)',
          filter: 'blur(80px)',
        }}
      />

      <div className="max-w-4xl mx-auto relative z-10">

        {/* ── HEADER ─────────────────────────────────────────────────── */}
        <div style={enter(140)}>
          <span style={{ ...MONO_KICKER, color: 'var(--text-dimmed)' }}>
            · Download
          </span>
        </div>

        <h1
          className="font-display mt-5 leading-none"
          style={{
            fontSize: 'clamp(44px, 6vw, 88px)',
            color: 'var(--text-primary)',
            WebkitFontSmoothing: 'subpixel-antialiased',
          }}
        >
          <AnimatedChars text="Senzoukria" baseDelay={220} charDelay={32} />
          <br />
          <span className="font-display-accent">
            <AnimatedChars text="for desktop" baseDelay={520} charDelay={32} />
          </span>
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

        {/* ── NEW VERSION BANNER ─────────────────────────────────────── */}
        {release && (
          <section
            className="mt-8 rounded-xl p-5 relative overflow-hidden"
            style={{
              ...enter(850),
              background:
                'linear-gradient(135deg, rgb(var(--primary-rgb) / 0.10), rgb(var(--primary-rgb) / 0.02))',
              border: '1px solid color-mix(in oklab, var(--primary) 35%, transparent)',
              boxShadow: '0 0 36px rgb(var(--primary-rgb) / 0.10)',
            }}
          >
            <div className="flex items-center gap-3 flex-wrap">
              <span
                className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full shrink-0"
                style={{
                  ...MONO_LABEL,
                  fontSize: 9.5,
                  color: 'var(--primary)',
                  background: 'rgb(var(--primary-rgb) / 0.12)',
                  border: '1px solid rgb(var(--primary-rgb) / 0.40)',
                }}
              >
                <span
                  aria-hidden
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{
                    background: 'var(--primary)',
                    boxShadow: '0 0 8px rgb(var(--primary-rgb) / 0.7)',
                    animation: 'dl-new-pulse 1.6s ease-in-out infinite',
                  }}
                />
                New release
              </span>
              <span
                style={{ ...MONO_DATA, fontSize: 15, color: 'var(--text-primary)' }}
              >
                {release.version} is live
              </span>
              {release.releaseDate && (
                <span
                  style={{ ...MONO_LABEL, fontSize: 10, color: 'var(--text-dimmed)' }}
                >
                  · {new Date(release.releaseDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              )}
              <span
                className="ml-auto text-xs shrink-0"
                style={{ color: 'var(--text-muted)' }}
              >
                Installed already? It auto-updates in-app.
              </span>
            </div>

            {release.releaseNotes && (
              <details className="mt-4 group">
                <summary
                  className="cursor-pointer select-none list-none inline-flex items-center gap-1.5"
                  style={{ ...MONO_LABEL, fontSize: 10, color: 'var(--primary-light)' }}
                >
                  <span aria-hidden className="transition-transform group-open:rotate-90">›</span>
                  What&apos;s new
                </summary>
                <div
                  className="mt-3 p-4 rounded-md text-sm leading-relaxed"
                  style={{
                    background: 'var(--surface-elevated)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                    whiteSpace: 'pre-wrap',
                    maxHeight: 220,
                    overflowY: 'auto',
                  }}
                >
                  {release.releaseNotes}
                </div>
              </details>
            )}

            <style>{`
              @keyframes dl-new-pulse {
                0%, 100% { transform: scale(1); opacity: 1; }
                50%      { transform: scale(1.5); opacity: 0.55; }
              }
              @media (prefers-reduced-motion: reduce) {
                [style*="dl-new-pulse"] { animation: none !important; }
              }
            `}</style>
          </section>
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
                background: 'rgb(var(--warning-rgb) / 0.05)',
                border: '1px solid rgb(var(--warning-rgb) / 0.30)',
              }}
            >
              <div style={{ ...MONO_LABEL, color: 'var(--warning)' }}>
                · Heads-up
              </div>
              <p
                className="mt-3 text-sm leading-relaxed"
                style={{ color: 'var(--text-secondary)' }}
              >
                Windows will show a protection screen. That&apos;s expected —
                Senzoukria is published by an independent studio and the Windows
                code-signing certificate (≈€300/yr) ships in the next release.
              </p>
              <p
                className="mt-3 text-sm"
                style={{ color: 'var(--text-secondary)' }}
              >
                To install: <CodeChip>More info</CodeChip>{' '}
                → <CodeChip>Run anyway</CodeChip>. That&apos;s it.
              </p>
            </section>

            {/* ── STEP 01 ─────────────────────────────────────────────── */}
            <Step
              index="01"
              title="Install Senzoukria on Windows"
              delay={1180}
            >
              <Ol>
                <li>
                  Download the <CodeChip>.msi</CodeChip> file above.
                </li>
                <li>Double-click to launch the installer.</li>
                <li>
                  If the <em>Windows protected your PC</em> screen appears:
                  {' '}<strong style={{ color: 'var(--text-primary)' }}>More info</strong>
                  {' '}→ <strong style={{ color: 'var(--text-primary)' }}>Run anyway</strong>.
                </li>
                <li>Sign in with your Senzoukria account.</li>
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
                If you trade futures through NinjaTrader (Apex, Rithmic), this
                step connects Senzoukria to your local NT feed — no need to
                re-enter your Rithmic credentials, NT handles everything.
              </p>

              <a
                href="/OrderflowBridge.cs"
                download="OrderflowBridge.cs"
                className="btn-brand inline-flex w-full items-center justify-center gap-2 py-3 rounded-md text-center mb-6 transition-all duration-200 active:scale-[0.99]"
                style={MONO_BTN}
              >
                <span aria-hidden>↓</span>
                Download OrderflowBridge.cs
              </a>

              <Ol>
                <li>
                  Copy <CodeChip>OrderflowBridge.cs</CodeChip> into{' '}
                  <CodeChip>Documents\NinjaTrader 8\bin\Custom\Indicators\</CodeChip>
                </li>
                <li>
                  In NinjaTrader: <strong style={{ color: 'var(--text-primary)' }}>Tools → NinjaScript Editor → F5</strong>
                  {' '}(compile, must report 0 errors)
                </li>
                <li>
                  Open a chart with these exact settings:
                  <div className="mt-3 rounded-md p-3" style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)' }}>
                    <ConfigRow k="Bars Period Type" v="Tick" />
                    <ConfigRow k="Bars Period Value" v="100" warn />
                    <ConfigRow k="Tick Replay" v="ON" warn />
                    <ConfigRow k="Days to load" v="1+" last />
                  </div>
                </li>
                <li>
                  Apply the <strong style={{ color: 'var(--text-primary)' }}>OrderflowBridge</strong> indicator to the chart
                  {' '}(Indicators → New → OrderflowBridge → Apply).
                </li>
                <li>
                  The Output window should show:{' '}
                  <CodeChip>OrderflowBridge: listening on 127.0.0.1:7272</CodeChip>
                </li>
                <li>
                  In Senzoukria → switch to{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>NinjaTrader Bridge</strong>
                  {' '}— data appears within a few seconds.
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

            {/* ── STEP 03 — Quantower bridge ──────────────────────────── */}
            <Step
              index="03"
              title="Connect the Quantower bridge"
              badge="Quantower"
              accent
              delay={1460}
            >
              <p
                className="text-sm mb-5 leading-relaxed"
                style={{ color: 'var(--text-secondary)' }}
              >
                Trade through Quantower? Stream its broker feed straight into
                Senzoukria. Unlike NinjaTrader, Quantower loads <em>compiled</em>{' '}
                indicators, so this bridge ships as a <CodeChip>.cs</CodeChip> you
                build once into a <CodeChip>.dll</CodeChip>.
              </p>

              <a
                href="/QuantowerOrderflowBridge.cs"
                download="QuantowerOrderflowBridge.cs"
                className="btn-brand inline-flex w-full items-center justify-center gap-2 py-3 rounded-md text-center mb-6 transition-all duration-200 active:scale-[0.99]"
                style={MONO_BTN}
              >
                <span aria-hidden>↓</span>
                Download QuantowerOrderflowBridge.cs
              </a>

              <Ol>
                <li>
                  Build it into a DLL (needs the .NET SDK):{' '}
                  <CodeChip>dotnet build --configuration Release</CodeChip>
                </li>
                <li>
                  Copy <CodeChip>QuantowerOrderflowBridge.dll</CodeChip> into{' '}
                  <CodeChip>Quantower\Settings\Scripts\Indicators\</CodeChip>
                </li>
                <li>
                  Restart Quantower — <strong style={{ color: 'var(--text-primary)' }}>QuantowerOrderflowBridge</strong>
                  {' '}now shows up in the indicator list.
                </li>
                <li>
                  Add it to <strong style={{ color: 'var(--text-primary)' }}>one</strong> chart only
                  {' '}(it opens a single local port — <CodeChip>127.0.0.1:7273</CodeChip>).
                </li>
                <li>
                  In Senzoukria → switch to{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>Quantower Bridge</strong>
                  {' '}— data appears within a few seconds.
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
                  · NinjaTrader vs Quantower
                </div>
                <p
                  className="mt-2 text-xs leading-relaxed"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Use whichever platform already carries your feed. Run only one
                  bridge at a time — NinjaTrader on <CodeChip>7272</CodeChip>,
                  Quantower on <CodeChip>7273</CodeChip>.
                </p>
              </div>
            </Step>
          </>
        )}

      </div>
    </div>
    </MarketingShell>
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
          color: warn ? 'var(--warning)' : 'var(--text-primary)',
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
            className="btn-brand inline-flex w-full items-center justify-center gap-2 py-2.5 rounded-md mt-6 transition-all duration-200 active:scale-[0.99]"
            style={MONO_BTN}
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
