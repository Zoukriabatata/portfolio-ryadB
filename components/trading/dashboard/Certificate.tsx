'use client';

import { forwardRef } from 'react';

export interface CertificateData {
  userName:        string;
  presetLabel:     string;       // e.g. "Topstep 50K Combine"
  startingBalance: number;
  finalEquity:     number;
  profit:          number;
  totalTrades:     number;
  winRate:         number;
  profitFactor:    number;
  bestTrade:       number;
  startDate:       Date;
  passedAt:        Date;
  certId:          string;       // generated random hex
}

interface CertificateProps {
  data: CertificateData;
}

/**
 * Certificate template — Apex/Topstep/Lucid-inspired. Fixed A4-landscape
 * dimensions (1123 × 794 px @ 96 DPI). Rendered offscreen, snapshotted by
 * html2canvas, embedded in a jsPDF page.
 *
 * Design language:
 *   - Deep navy background with subtle radial accents
 *   - Double-line gold/green frame
 *   - Two-column body: certified text on the left, large profit on the right
 *   - Stats bar at bottom in a pill row (centered, evenly spaced)
 *   - Real-looking signature + verified seal in footer
 */
const Certificate = forwardRef<HTMLDivElement, CertificateProps>(({ data }, ref) => {
  const tradingDays = Math.max(
    1,
    Math.ceil((data.passedAt.getTime() - data.startDate.getTime()) / (24 * 60 * 60 * 1000)),
  );

  const dateStr = data.passedAt.toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div
      ref={ref}
      style={{
        width:        '1123px',
        height:       '794px',
        background:   '#070710',
        backgroundImage: [
          'radial-gradient(ellipse at 15% 20%, rgba(74,222,128,0.10) 0%, transparent 45%)',
          'radial-gradient(ellipse at 85% 80%, rgba(168,139,250,0.08) 0%, transparent 45%)',
          'linear-gradient(135deg, #070710 0%, #0a0a18 100%)',
        ].join(', '),
        color:        '#e2e8f0',
        fontFamily:   '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        padding:      '0',
        margin:       '0',
        boxSizing:    'border-box',
        position:     'relative',
        overflow:     'hidden',
      }}
    >
      {/* ─── Outer frame (double border) ─── */}
      <div
        style={{
          position: 'absolute',
          top: '20px', left: '20px', right: '20px', bottom: '20px',
          border: '1px solid rgba(212,175,55,0.5)',  // gold
          borderRadius: '6px',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '28px', left: '28px', right: '28px', bottom: '28px',
          border: '1px solid rgba(212,175,55,0.2)',
          borderRadius: '4px',
          pointerEvents: 'none',
        }}
      />

      {/* ─── Corner ornaments (gold cross) ─── */}
      {([
        { top: '38px', left: '38px' },
        { top: '38px', right: '38px' },
        { bottom: '38px', left: '38px' },
        { bottom: '38px', right: '38px' },
      ] as const).map((pos, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            ...pos,
            width: '14px',
            height: '14px',
            pointerEvents: 'none',
          }}
        >
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: 'rgba(212,175,55,0.55)' }} />
          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', background: 'rgba(212,175,55,0.55)' }} />
        </div>
      ))}

      {/* ─── Content wrapper (everything inside the inner border) ─── */}
      <div
        style={{
          position: 'absolute',
          top: '60px', left: '60px', right: '60px', bottom: '60px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* HEADER: brand left, cert ID right */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: '22px',
            borderBottom: '1px solid rgba(212,175,55,0.18)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '11px',
                background: 'linear-gradient(135deg, #16a34a, #4ade80)',
                boxShadow: '0 0 24px rgba(74,222,128,0.45), inset 0 0 12px rgba(0,0,0,0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{ fontSize: '24px', fontWeight: 900, color: '#fff', letterSpacing: '-1px' }}>S</span>
            </div>
            <div>
              <div
                style={{
                  fontSize: '24px',
                  fontWeight: 800,
                  letterSpacing: '4px',
                  background: 'linear-gradient(to right, #4ade80 0%, #a78bfa 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  lineHeight: 1,
                }}
              >
                SENZOUKRIA
              </div>
              <div style={{ fontSize: '9px', color: '#64748b', letterSpacing: '2.5px', marginTop: '5px' }}>
                PROFESSIONAL TRADING PLATFORM
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '9px', color: '#64748b', letterSpacing: '2px' }}>CERTIFICATE No.</div>
            <div
              style={{
                fontSize: '13px',
                color: '#d4af37',
                fontFamily: '"Courier New", Courier, monospace',
                marginTop: '3px',
                letterSpacing: '1px',
                fontWeight: 700,
              }}
            >
              {data.certId}
            </div>
          </div>
        </div>

        {/* TITLE BAND */}
        <div style={{ textAlign: 'center', marginTop: '36px' }}>
          <div
            style={{
              display: 'inline-block',
              padding: '6px 22px',
              border: '1px solid rgba(212,175,55,0.5)',
              borderRadius: '999px',
              fontSize: '10px',
              color: '#d4af37',
              letterSpacing: '5px',
              fontWeight: 600,
              marginBottom: '14px',
            }}
          >
            OFFICIAL ACHIEVEMENT
          </div>
          <h1
            style={{
              fontFamily: '"Georgia", "Times New Roman", serif',
              fontSize: '46px',
              fontWeight: 700,
              letterSpacing: '6px',
              color: '#f1f5f9',
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            CERTIFICATE OF MERIT
          </h1>
          <div
            style={{
              width: '120px',
              height: '2px',
              background: 'linear-gradient(to right, transparent, #d4af37, transparent)',
              margin: '12px auto 0',
            }}
          />
        </div>

        {/* BODY: name + presented to */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center', marginTop: '12px' }}>
          <div style={{ fontSize: '13px', color: '#94a3b8', letterSpacing: '3px', marginBottom: '12px' }}>
            PRESENTED TO
          </div>
          <div
            style={{
              fontFamily: '"Georgia", "Times New Roman", serif',
              fontSize: '54px',
              fontStyle: 'italic',
              fontWeight: 400,
              color: '#f8fafc',
              padding: '4px 0',
              borderBottom: '1px solid rgba(212,175,55,0.25)',
              maxWidth: '700px',
              margin: '0 auto',
            }}
          >
            {data.userName}
          </div>
          <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '24px', lineHeight: 1.7, maxWidth: '780px', margin: '24px auto 0' }}>
            for successfully completing the
          </div>
          <div
            style={{
              fontSize: '22px',
              color: '#4ade80',
              fontWeight: 700,
              letterSpacing: '1px',
              marginTop: '4px',
            }}
          >
            {data.presetLabel}
          </div>
          <div
            style={{
              fontSize: '13px',
              color: '#94a3b8',
              marginTop: '18px',
              maxWidth: '760px',
              margin: '18px auto 0',
              lineHeight: 1.6,
            }}
          >
            achieving a verified net profit of <strong style={{ color: '#4ade80', fontSize: '16px' }}>{fmtUSD(data.profit)}</strong> over <strong style={{ color: '#f1f5f9' }}>{tradingDays}</strong> trading day{tradingDays > 1 ? 's' : ''}.
          </div>
        </div>

        {/* STATS PILL ROW */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'stretch',
            gap: '0',
            padding: '16px 0',
            margin: '24px 40px 0',
            borderTop: '1px solid rgba(212,175,55,0.18)',
            borderBottom: '1px solid rgba(212,175,55,0.18)',
          }}
        >
          <Stat label="STARTING"  value={fmtUSD(data.startingBalance, true)} />
          <Divider />
          <Stat label="FINAL"     value={fmtUSD(data.finalEquity, true)} accent />
          <Divider />
          <Stat label="TRADES"    value={data.totalTrades.toString()} />
          <Divider />
          <Stat label="WIN RATE"  value={`${data.winRate.toFixed(1)}%`} accent />
          <Divider />
          <Stat label="PROFIT FACTOR" value={data.profitFactor === Infinity ? '∞' : data.profitFactor.toFixed(2)} />
          <Divider />
          <Stat label="BEST TRADE" value={fmtUSD(data.bestTrade)} accent />
        </div>

        {/* FOOTER: signature left | seal center | date right */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginTop: '28px',
            paddingTop: '8px',
          }}
        >
          {/* Signature */}
          <div style={{ width: '220px' }}>
            <div
              style={{
                fontFamily: '"Georgia", "Times New Roman", serif',
                fontSize: '24px',
                fontStyle: 'italic',
                color: '#d4af37',
                marginBottom: '4px',
                letterSpacing: '1px',
              }}
            >
              Senzoukria
            </div>
            <div style={{ borderTop: '1px solid rgba(148,163,184,0.4)', paddingTop: '6px' }}>
              <div style={{ fontSize: '9px', color: '#94a3b8', letterSpacing: '2px' }}>AUTHORIZED SIGNATURE</div>
              <div style={{ fontSize: '11px', color: '#e2e8f0', marginTop: '2px', fontWeight: 600 }}>
                Senzoukria Trading Platform
              </div>
            </div>
          </div>

          {/* Verified seal */}
          <div
            style={{
              width: '92px',
              height: '92px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(212,175,55,0.10), rgba(212,175,55,0.02))',
              border: '2px solid rgba(212,175,55,0.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              boxShadow: 'inset 0 0 12px rgba(212,175,55,0.15)',
            }}
          >
            {/* Inner ring */}
            <div
              style={{
                position: 'absolute',
                inset: '6px',
                borderRadius: '50%',
                border: '1px dashed rgba(212,175,55,0.4)',
              }}
            />
            <div style={{ textAlign: 'center', lineHeight: 1.05 }}>
              <div style={{ fontSize: '20px', fontWeight: 900, color: '#d4af37', letterSpacing: '1px' }}>SZK</div>
              <div style={{ fontSize: '7px', color: '#94a3b8', letterSpacing: '1.5px', marginTop: '3px' }}>VERIFIED</div>
            </div>
          </div>

          {/* Issued date */}
          <div style={{ width: '220px', textAlign: 'right' }}>
            <div
              style={{
                fontFamily: '"Georgia", "Times New Roman", serif',
                fontSize: '18px',
                color: '#f1f5f9',
                marginBottom: '6px',
                letterSpacing: '0.5px',
              }}
            >
              {dateStr}
            </div>
            <div style={{ borderTop: '1px solid rgba(148,163,184,0.4)', paddingTop: '6px' }}>
              <div style={{ fontSize: '9px', color: '#94a3b8', letterSpacing: '2px' }}>ISSUE DATE</div>
              <div style={{ fontSize: '11px', color: '#e2e8f0', marginTop: '2px', fontWeight: 600 }}>
                Paper Trading Achievement
              </div>
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

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div
        style={{
          fontSize: '9px',
          color: '#64748b',
          letterSpacing: '2px',
          marginBottom: '6px',
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: '17px',
          fontWeight: 700,
          color: accent ? '#d4af37' : '#f1f5f9',
          letterSpacing: '0.3px',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Divider() {
  return (
    <div
      style={{
        width: '1px',
        background: 'linear-gradient(to bottom, transparent, rgba(212,175,55,0.3), transparent)',
        flexShrink: 0,
      }}
    />
  );
}

function fmtUSD(n: number, compact = false): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : (n > 0 ? '+' : '');
  if (compact && abs >= 10000) {
    return `${n < 0 ? '-' : ''}$${(abs / 1000).toFixed(abs >= 100000 ? 0 : 1)}K`;
  }
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
