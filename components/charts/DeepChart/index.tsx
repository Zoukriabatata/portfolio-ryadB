'use client';

import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';
import { ChartSkeleton } from '@/components/ui/Skeleton';
import DOMPanel from './DOMPanel';

const FootprintChartPro = dynamic(
  () => import('@/components/charts/FootprintChartPro'),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

// ─── DOM panel width presets ─────────────────────────────────────────────────

const DOM_WIDTH_DEFAULT = 210; // px

// ─── DeepChart ────────────────────────────────────────────────────────────────

interface Props {
  symbol: string;
  tickSize?: number;
  onSymbolChange?: (s: string) => void;
}

export default function DeepChart({ symbol, tickSize = 0.1, onSymbolChange }: Props) {
  const [domVisible, setDomVisible] = useState(true);
  const [domWidth]  = useState(DOM_WIDTH_DEFAULT);

  // Derive tickSize from symbol if not passed
  const resolvedTickSize = tickSize;

  return (
    <div className="flex h-full w-full overflow-hidden" style={{ background: '#0a0a0f' }}>
      {/* ── Footprint chart (fills remaining space) ─────────────────────── */}
      <div className="flex-1 min-w-0 h-full">
        <FootprintChartPro className="h-full" onSymbolChange={onSymbolChange} />
      </div>

      {/* ── Resize handle ───────────────────────────────────────────────── */}
      <div
        style={{
          width: 3,
          cursor: 'col-resize',
          background: '#1e1e2e',
          flexShrink: 0,
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => ((e.target as HTMLElement).style.background = '#3a3a5a')}
        onMouseLeave={e => ((e.target as HTMLElement).style.background = '#1e1e2e')}
      />

      {/* ── DOM panel ───────────────────────────────────────────────────── */}
      {domVisible && (
        <div
          style={{
            width: domWidth,
            flexShrink: 0,
            height: '100%',
            background: '#0a0a0f',
            borderLeft: '1px solid #1e1e2e',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Panel title bar */}
          <div
            style={{
              height: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 8px',
              background: '#0d0d16',
              borderBottom: '1px solid #1a1a28',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 9, color: '#4a4a6a', fontFamily: 'Consolas, monospace', letterSpacing: 1 }}>
              DEPTH OF MARKET
            </span>
            <button
              onClick={() => setDomVisible(false)}
              style={{
                background: 'none', border: 'none', color: '#3a3a5a',
                cursor: 'pointer', fontSize: 11, padding: '0 2px', lineHeight: 1,
              }}
              title="Hide DOM"
            >
              ✕
            </button>
          </div>

          {/* Canvas area */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <DOMPanel symbol={symbol} tickSize={resolvedTickSize} width={domWidth} />
          </div>
        </div>
      )}

      {/* ── Show DOM button (when hidden) ───────────────────────────────── */}
      {!domVisible && (
        <button
          onClick={() => setDomVisible(true)}
          style={{
            width: 18,
            flexShrink: 0,
            background: '#0d0d16',
            border: 'none',
            borderLeft: '1px solid #1e1e2e',
            color: '#3a3a5a',
            cursor: 'pointer',
            fontSize: 8,
            writingMode: 'vertical-rl',
            letterSpacing: 1,
            fontFamily: 'Consolas, monospace',
          }}
          title="Show DOM"
        >
          DOM ▶
        </button>
      )}
    </div>
  );
}
