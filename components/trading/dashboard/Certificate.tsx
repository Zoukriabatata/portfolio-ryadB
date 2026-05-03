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
 * Certificate template — designed at fixed A4 landscape dimensions
 * (1123 × 794 px @ 96 DPI). Rendered offscreen, snapshotted by
 * html2canvas, then embedded in a jsPDF page.
 *
 * Wraps in forwardRef so the export function can grab the DOM node.
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
        // A4 landscape @ 96 DPI = 1123 × 794
        width:    '1123px',
        height:   '794px',
        background:
          'linear-gradient(135deg, #0a0a0f 0%, #12121a 100%)',
        color:        '#e2e8f0',
        fontFamily:   '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        padding:      '60px',
        boxSizing:    'border-box',
        position:     'relative',
        overflow:     'hidden',
        border:       '1px solid #1e1e2e',
      }}
    >
      {/* Ambient glow accents */}
      <div
        style={{
          position:   'absolute',
          top:        '-200px',
          right:      '-200px',
          width:      '600px',
          height:     '600px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(74,222,128,0.10) 0%, transparent 70%)',
          filter:     'blur(80px)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position:   'absolute',
          bottom:     '-200px',
          left:       '-200px',
          width:      '500px',
          height:     '500px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(168,139,250,0.08) 0%, transparent 70%)',
          filter:     'blur(80px)',
          pointerEvents: 'none',
        }}
      />

      {/* Inner border / frame */}
      <div
        style={{
          position:   'absolute',
          inset:      '24px',
          border:     '2px solid rgba(74,222,128,0.4)',
          borderRadius: '12px',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position:   'absolute',
          inset:      '32px',
          border:     '1px solid rgba(74,222,128,0.2)',
          borderRadius: '8px',
          pointerEvents: 'none',
        }}
      />

      {/* Header */}
      <div style={{ position: 'relative', textAlign: 'center', marginTop: '20px' }}>
        <div
          style={{
            display:        'inline-flex',
            alignItems:     'center',
            gap:            '12px',
            marginBottom:   '8px',
          }}
        >
          <div
            style={{
              width:         '52px',
              height:        '52px',
              borderRadius:  '14px',
              background:    'linear-gradient(135deg, #16a34a, #4ade80)',
              boxShadow:     '0 0 30px rgba(74,222,128,0.4)',
              display:       'flex',
              alignItems:    'center',
              justifyContent:'center',
            }}
          >
            <span style={{ fontSize: '28px', fontWeight: 900, color: '#fff' }}>S</span>
          </div>
          <div style={{ textAlign: 'left' }}>
            <div
              style={{
                fontSize:        '32px',
                fontWeight:      800,
                letterSpacing:   '4px',
                background:      'linear-gradient(to right, #4ade80, #a78bfa)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor:  'transparent',
                lineHeight:      '1',
              }}
            >
              SENZOUKRIA
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', letterSpacing: '2px', marginTop: '4px' }}>
              PROFESSIONAL ORDERFLOW PLATFORM
            </div>
          </div>
        </div>
      </div>

      {/* Title */}
      <div style={{ position: 'relative', textAlign: 'center', marginTop: '40px' }}>
        <div
          style={{
            fontSize:      '14px',
            color:         '#94a3b8',
            letterSpacing: '6px',
            marginBottom:  '8px',
          }}
        >
          CERTIFICATE OF ACHIEVEMENT
        </div>
        <div
          style={{
            width:        '100px',
            height:       '2px',
            background:   'linear-gradient(to right, transparent, #4ade80, transparent)',
            margin:       '0 auto',
          }}
        />
      </div>

      {/* Body */}
      <div style={{ position: 'relative', textAlign: 'center', marginTop: '40px' }}>
        <div style={{ fontSize: '15px', color: '#94a3b8', marginBottom: '12px' }}>
          This is to certify that
        </div>
        <div
          style={{
            fontSize:      '44px',
            fontWeight:    700,
            color:         '#e2e8f0',
            marginBottom:  '12px',
            fontFamily:    '"Georgia", "Times New Roman", serif',
            fontStyle:     'italic',
          }}
        >
          {data.userName}
        </div>
        <div style={{ fontSize: '15px', color: '#94a3b8', marginBottom: '8px' }}>
          has successfully completed the
        </div>
        <div
          style={{
            fontSize:      '24px',
            fontWeight:    700,
            color:         '#4ade80',
            letterSpacing: '1px',
          }}
        >
          {data.presetLabel} CHALLENGE
        </div>
        <div
          style={{
            fontSize:    '15px',
            color:       '#94a3b8',
            marginTop:   '14px',
            lineHeight:  '1.6',
          }}
        >
          achieving a net profit of{' '}
          <span style={{ color: '#4ade80', fontWeight: 700, fontSize: '18px' }}>
            {fmtUSD(data.profit)}
          </span>
          {' '}over <strong style={{ color: '#e2e8f0' }}>{tradingDays}</strong> trading day{tradingDays > 1 ? 's' : ''}
        </div>
      </div>

      {/* Stats grid */}
      <div
        style={{
          position:        'relative',
          display:         'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap:             '16px',
          marginTop:       '40px',
          padding:         '20px 60px',
        }}
      >
        <Stat label="Starting Balance" value={fmtUSD(data.startingBalance)} />
        <Stat label="Final Equity"     value={fmtUSD(data.finalEquity)} highlight />
        <Stat label="Total Trades"     value={data.totalTrades.toString()} />
        <Stat label="Win Rate"         value={`${data.winRate.toFixed(1)}%`} highlight />
        <Stat label="Profit Factor"    value={data.profitFactor === Infinity ? '∞' : data.profitFactor.toFixed(2)} />
        <Stat label="Best Trade"       value={fmtUSD(data.bestTrade)} highlight />
        <Stat label="Issue Date"       value={dateStr} />
        <Stat label="Certificate ID"   value={data.certId.toUpperCase()} mono />
      </div>

      {/* Footer signature */}
      <div
        style={{
          position:    'absolute',
          bottom:      '60px',
          left:        '0',
          right:       '0',
          padding:     '0 80px',
          display:     'flex',
          justifyContent: 'space-between',
          alignItems:  'flex-end',
        }}
      >
        <div style={{ textAlign: 'left' }}>
          <div
            style={{
              width:        '180px',
              borderTop:    '1px solid #475569',
              paddingTop:   '8px',
              fontSize:     '11px',
              color:        '#94a3b8',
              letterSpacing:'1px',
            }}
          >
            ISSUED BY
          </div>
          <div style={{ fontSize: '13px', color: '#e2e8f0', marginTop: '2px', fontWeight: 600 }}>
            Senzoukria Trading Platform
          </div>
        </div>

        <div
          style={{
            width:         '90px',
            height:        '90px',
            borderRadius:  '50%',
            border:        '2px solid #4ade80',
            display:       'flex',
            alignItems:    'center',
            justifyContent:'center',
            background:    'rgba(74,222,128,0.05)',
          }}
        >
          <div style={{ textAlign: 'center', lineHeight: '1.1' }}>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#4ade80' }}>SZK</div>
            <div style={{ fontSize: '7px', color: '#94a3b8', letterSpacing: '1px', marginTop: '2px' }}>
              VERIFIED
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              width:        '180px',
              borderTop:    '1px solid #475569',
              paddingTop:   '8px',
              fontSize:     '11px',
              color:        '#94a3b8',
              letterSpacing:'1px',
            }}
          >
            DEMO ACCOUNT
          </div>
          <div style={{ fontSize: '13px', color: '#e2e8f0', marginTop: '2px', fontWeight: 600 }}>
            Paper Trading Achievement
          </div>
        </div>
      </div>
    </div>
  );
});

Certificate.displayName = 'Certificate';
export default Certificate;

function Stat({
  label,
  value,
  highlight,
  mono,
}: {
  label:      string;
  value:      string;
  highlight?: boolean;
  mono?:      boolean;
}) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          fontSize:      '10px',
          color:         '#64748b',
          letterSpacing: '1.5px',
          marginBottom:  '4px',
        }}
      >
        {label.toUpperCase()}
      </div>
      <div
        style={{
          fontSize:    highlight ? '20px' : '16px',
          fontWeight:  highlight ? 700 : 600,
          color:       highlight ? '#4ade80' : '#e2e8f0',
          fontFamily:  mono ? 'Courier, monospace' : undefined,
          letterSpacing: mono ? '0.5px' : undefined,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function fmtUSD(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
