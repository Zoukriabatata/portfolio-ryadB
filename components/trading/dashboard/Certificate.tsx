'use client';

import { forwardRef } from 'react';

export type CertificateVariant = 'PASSED' | 'FAILED' | 'DISCIPLINE';

export interface CertificateData {
  userName:        string;
  presetLabel:     string;
  startingBalance: number;
  finalEquity:     number;
  profit:          number;
  totalTrades:     number;
  winRate:         number;
  profitFactor:    number;
  bestTrade:       number;
  startDate:       Date;
  passedAt:        Date;
  certId:          string;
  variant?:        CertificateVariant;
}

interface CertificateProps {
  data: CertificateData;
}

// Shared neutrals (warm-leaning to harmonize with champagne metal).
const IVORY = '#f5f2ea';  // headline / name / wordmark
const BODY  = '#9aa2b2';  // body copy
const MUTED = '#6c7382';  // labels / captions

/**
 * Two colors define every variant:
 *   metal — the formal frame, seal, dividers, cert id (champagne / pewter)
 *   hero  — the achievement accent (profit, preset, key stat)
 */
const VARIANT_METAL: Record<CertificateVariant, string> = {
  PASSED:     '214,193,150', // champagne gold
  FAILED:     '156,164,180', // pewter — somber, dignified
  DISCIPLINE: '214,193,150', // champagne gold
};

const VARIANT_HERO: Record<CertificateVariant, string> = {
  PASSED:     '52,211,153',  // emerald
  FAILED:     '244,113,113', // soft red
  DISCIPLINE: '167,139,250', // violet
};

const VARIANT_THEME: Record<CertificateVariant, {
  preTitle:   string;
  title:      string;
  bodyIntro:  string;
  bodyClose:  (profitStr: string, days: number, heroHex: string) => React.ReactNode;
  sealLabel:  string;
  finalLabel: string;
}> = {
  PASSED: {
    preTitle:   'OFFICIAL ACHIEVEMENT',
    title:      'CERTIFICATE OF MERIT',
    bodyIntro:  'for successfully completing the',
    bodyClose:  (p, d, hero) => (<>achieving a verified net profit of <strong style={{ color: hero, fontSize: '16px' }}>{p}</strong> over <strong style={{ color: IVORY }}>{d}</strong> trading day{d > 1 ? 's' : ''}.</>),
    sealLabel:  'VERIFIED',
    finalLabel: 'Paper Trading Achievement',
  },
  FAILED: {
    preTitle:   'COMBINE CONCLUDED',
    title:      'CHALLENGE ATTEMPT',
    bodyIntro:  'concluded the',
    bodyClose:  (p, d, hero) => (<>with a final result of <strong style={{ color: hero, fontSize: '16px' }}>{p}</strong> over <strong style={{ color: IVORY }}>{d}</strong> trading day{d > 1 ? 's' : ''}. Reset and try again — every pro has been here.</>),
    sealLabel:  'CLOSED',
    finalLabel: 'Combine Attempt Record',
  },
  DISCIPLINE: {
    preTitle:   'DISCIPLINE AWARD',
    title:      'CERTIFICATE OF DISCIPLINE',
    bodyIntro:  'demonstrated risk discipline on the',
    bodyClose:  (p, d, hero) => (<>by recovering from drawdown without breaching limits over <strong style={{ color: IVORY }}>{d}</strong> trading day{d > 1 ? 's' : ''}. Current performance: <strong style={{ color: hero, fontSize: '16px' }}>{p}</strong>.</>),
    sealLabel:  'DISCIPLINE',
    finalLabel: 'Risk Discipline Award',
  },
};

/**
 * Certificate template — "Emerald & Champagne".
 * Fixed A4-landscape (1123 × 794 px @ 96 DPI). Rendered offscreen, snapshotted
 * by html2canvas, embedded in a jsPDF page.
 *
 * Design language:
 *   - Deep ink background, faint guilloché hairlines + two soft accent glows
 *   - Double champagne frame with engraved corner flourishes
 *   - Serif title + italic name for gravitas; emerald reserved for the win
 *   - A single, intentional accent (emerald) — no competing color systems
 *
 * html2canvas-safe: no background-clip:text, no filter/blur. Solid colors,
 * gradients, box-shadow, transforms and dashed borders only.
 */
const Certificate = forwardRef<HTMLDivElement, CertificateProps>(({ data }, ref) => {
  const variant     = data.variant ?? 'PASSED';
  const theme       = VARIANT_THEME[variant];
  const metal       = VARIANT_METAL[variant];
  const hero        = VARIANT_HERO[variant];
  const heroHex     = `rgb(${hero})`;
  const tradingDays = Math.max(
    1,
    Math.ceil((data.passedAt.getTime() - data.startDate.getTime()) / (24 * 60 * 60 * 1000)),
  );

  const dateStr = data.passedAt.toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const profitStr = variant === 'DISCIPLINE'
    ? `$${data.finalEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : fmtUSD(data.profit);

  return (
    <div
      ref={ref}
      style={{
        width:        '1123px',
        height:       '794px',
        background:   '#07080f',
        backgroundImage: [
          `radial-gradient(ellipse at 14% 16%, rgba(${hero},0.10) 0%, transparent 42%)`,
          `radial-gradient(ellipse at 86% 86%, rgba(${metal},0.08) 0%, transparent 46%)`,
          'repeating-linear-gradient(135deg, rgba(255,255,255,0.013) 0px, rgba(255,255,255,0.013) 1px, transparent 1px, transparent 8px)',
          'linear-gradient(160deg, #07080f 0%, #0a0b16 100%)',
        ].join(', '),
        color:        BODY,
        fontFamily:   '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        boxSizing:    'border-box',
        position:     'relative',
        overflow:     'hidden',
      }}
    >
      {/* ─── Double champagne frame ─── */}
      <div style={{ position: 'absolute', top: '20px', left: '20px', right: '20px', bottom: '20px', border: `1px solid rgba(${metal},0.55)`, borderRadius: '6px', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: '27px', left: '27px', right: '27px', bottom: '27px', border: `1px solid rgba(${metal},0.22)`, borderRadius: '4px', pointerEvents: 'none' }} />

      {/* ─── Corner flourishes ─── */}
      {([
        { top: '36px',    left: '36px',  transform: 'rotate(0deg)'   },
        { top: '36px',    right: '36px', transform: 'rotate(90deg)'  },
        { bottom: '36px', right: '36px', transform: 'rotate(180deg)' },
        { bottom: '36px', left: '36px',  transform: 'rotate(270deg)' },
      ] as const).map((pos, i) => (
        <svg key={i} width="26" height="26" viewBox="0 0 26 26" style={{ position: 'absolute', pointerEvents: 'none', ...pos }} aria-hidden="true">
          <path d="M 1 9 L 1 1 L 9 1 M 13 1 L 16 1 M 1 13 L 1 16" stroke={`rgba(${metal},0.75)`} strokeWidth="1" strokeLinecap="round" fill="none" />
          <path d="M 4 4 L 4 6 M 4 4 L 6 4" stroke={`rgba(${metal},0.5)`} strokeWidth="1" strokeLinecap="round" fill="none" />
          <circle cx="1" cy="1" r="1.4" fill={`rgba(${metal},0.9)`} />
        </svg>
      ))}

      {/* ─── Content ─── */}
      <div style={{ position: 'absolute', top: '58px', left: '62px', right: '62px', bottom: '58px', display: 'flex', flexDirection: 'column' }}>

        {/* HEADER */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '20px', borderBottom: `1px solid rgba(${metal},0.2)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '46px', height: '46px', borderRadius: '11px',
                background: 'linear-gradient(135deg, #16a34a, #4ade80)',
                boxShadow: '0 0 22px rgba(74,222,128,0.4), inset 0 0 12px rgba(0,0,0,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1, flexShrink: 0,
              }}
            >
              <span style={{ fontSize: '26px', fontWeight: 900, color: '#06140b', lineHeight: 1, display: 'block', transform: 'translateY(1px)' }}>S</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '6px', lineHeight: 1 }}>
              {/* Wordmark — solid ivory (html2canvas-safe; no background-clip) */}
              <div style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '4px', color: IVORY, lineHeight: 1 }}>
                SENZOUKRIA
              </div>
              <div style={{ fontSize: '9px', color: MUTED, letterSpacing: '2.6px', lineHeight: 1 }}>
                PROFESSIONAL TRADING PLATFORM
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '9px', color: MUTED, letterSpacing: '2px' }}>CERTIFICATE No.</div>
            <div style={{ fontSize: '13px', color: `rgb(${metal})`, fontFamily: '"Courier New", Courier, monospace', marginTop: '4px', letterSpacing: '1px', fontWeight: 700 }}>
              {data.certId}
            </div>
          </div>
        </div>

        {/* TITLE BAND */}
        <div style={{ textAlign: 'center', marginTop: '34px' }}>
          <div style={{ display: 'inline-block', padding: '6px 22px', border: `1px solid rgba(${metal},0.55)`, borderRadius: '999px', fontSize: '10px', color: `rgb(${metal})`, letterSpacing: '5px', fontWeight: 600, marginBottom: '16px' }}>
            {theme.preTitle}
          </div>
          <h1 style={{ fontFamily: '"Georgia", "Times New Roman", serif', fontSize: '44px', fontWeight: 700, letterSpacing: '5px', color: IVORY, margin: 0, lineHeight: 1.1 }}>
            {theme.title}
          </h1>
          {/* Divider with center lozenge */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginTop: '14px' }}>
            <div style={{ width: '64px', height: '1px', background: `linear-gradient(to right, transparent, rgba(${metal},0.9))` }} />
            <div style={{ width: '5px', height: '5px', transform: 'rotate(45deg)', background: `rgb(${metal})` }} />
            <div style={{ width: '64px', height: '1px', background: `linear-gradient(to left, transparent, rgba(${metal},0.9))` }} />
          </div>
        </div>

        {/* BODY */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center', marginTop: '8px' }}>
          <div style={{ fontSize: '12px', color: BODY, letterSpacing: '3.5px', marginBottom: '14px' }}>
            PRESENTED TO
          </div>
          <div style={{ fontFamily: '"Georgia", "Times New Roman", serif', fontSize: '54px', fontStyle: 'italic', fontWeight: 400, color: IVORY, padding: '4px 0', borderBottom: `1px solid rgba(${metal},0.3)`, maxWidth: '720px', margin: '0 auto' }}>
            {data.userName}
          </div>
          <div style={{ fontSize: '13px', color: BODY, lineHeight: 1.7, maxWidth: '780px', margin: '24px auto 0' }}>
            {theme.bodyIntro}
          </div>
          <div style={{ fontSize: '22px', color: heroHex, fontWeight: 700, letterSpacing: '0.5px', marginTop: '6px' }}>
            {data.presetLabel}
          </div>
          <div style={{ fontSize: '13px', color: BODY, maxWidth: '760px', margin: '16px auto 0', lineHeight: 1.6 }}>
            {theme.bodyClose(profitStr, tradingDays, heroHex)}
          </div>
        </div>

        {/* STATS — single emerald accent on FINAL, rest ivory for consistency */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'stretch', padding: '16px 0', margin: '22px 30px 0', borderTop: `1px solid rgba(${metal},0.2)`, borderBottom: `1px solid rgba(${metal},0.2)` }}>
          <Stat label="STARTING"      value={fmtUSD(data.startingBalance, true)} />
          <Divider metal={metal} />
          <Stat label="FINAL"         value={fmtUSD(data.finalEquity, true)} valueColor={heroHex} />
          <Divider metal={metal} />
          <Stat label="TRADES"        value={data.totalTrades.toString()} />
          <Divider metal={metal} />
          <Stat label="WIN RATE"      value={`${data.winRate.toFixed(1)}%`} />
          <Divider metal={metal} />
          <Stat label="PROFIT FACTOR" value={data.profitFactor === Infinity ? '∞' : data.profitFactor.toFixed(2)} />
          <Divider metal={metal} />
          <Stat label="BEST TRADE"    value={fmtUSD(data.bestTrade)} />
        </div>

        {/* FOOTER */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '26px' }}>
          {/* Signature */}
          <div style={{ width: '220px' }}>
            <div style={{ fontFamily: '"Georgia", "Times New Roman", serif', fontSize: '24px', fontStyle: 'italic', color: `rgb(${metal})`, marginBottom: '4px', letterSpacing: '1px' }}>
              Senzoukria
            </div>
            <div style={{ borderTop: `1px solid rgba(${metal},0.45)`, paddingTop: '6px' }}>
              <div style={{ fontSize: '9px', color: BODY, letterSpacing: '2px' }}>AUTHORIZED SIGNATURE</div>
              <div style={{ fontSize: '11px', color: '#e2e8f0', marginTop: '2px', fontWeight: 600 }}>Senzoukria Trading Platform</div>
            </div>
          </div>

          {/* Seal */}
          <div style={{ width: '98px', height: '98px', borderRadius: '50%', background: `radial-gradient(circle, rgba(${metal},0.14), rgba(${metal},0.02))`, border: `2px solid rgba(${metal},0.6)`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', boxShadow: `inset 0 0 14px rgba(${metal},0.16)`, flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: '6px', left: '6px', right: '6px', bottom: '6px', borderRadius: '50%', border: `1px dashed rgba(${metal},0.45)`, pointerEvents: 'none' }} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', lineHeight: 1 }}>
              <div style={{ fontSize: '20px', fontWeight: 900, color: `rgb(${metal})`, letterSpacing: '1.5px', lineHeight: 1 }}>SZK</div>
              <div style={{ fontSize: '7px', color: heroHex, letterSpacing: '2px', lineHeight: 1, fontWeight: 700 }}>{theme.sealLabel}</div>
            </div>
          </div>

          {/* Issue date */}
          <div style={{ width: '220px', textAlign: 'right' }}>
            <div style={{ fontFamily: '"Georgia", "Times New Roman", serif', fontSize: '18px', color: IVORY, marginBottom: '6px', letterSpacing: '0.5px' }}>
              {dateStr}
            </div>
            <div style={{ borderTop: `1px solid rgba(${metal},0.45)`, paddingTop: '6px' }}>
              <div style={{ fontSize: '9px', color: BODY, letterSpacing: '2px' }}>ISSUE DATE</div>
              <div style={{ fontSize: '11px', color: '#e2e8f0', marginTop: '2px', fontWeight: 600 }}>{theme.finalLabel}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

Certificate.displayName = 'Certificate';
export default Certificate;

// ──────────────────────────────────────────────────────────────────────────

function Stat({ label, value, valueColor = '#f1f5f9' }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ fontSize: '9px', color: MUTED, letterSpacing: '2px', marginBottom: '7px', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: '17px', fontWeight: 700, color: valueColor, letterSpacing: '0.3px' }}>{value}</div>
    </div>
  );
}

function Divider({ metal = '214,193,150' }: { metal?: string }) {
  return <div style={{ width: '1px', background: `linear-gradient(to bottom, transparent, rgba(${metal},0.32), transparent)`, flexShrink: 0 }} />;
}

function fmtUSD(n: number, compact = false): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : (n > 0 ? '+' : '');
  if (compact && abs >= 10000) {
    return `${n < 0 ? '-' : ''}$${(abs / 1000).toFixed(abs >= 100000 ? 0 : 1)}K`;
  }
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
