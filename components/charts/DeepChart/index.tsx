'use client';

/**
 * DeepChart layout — FootprintTESTChart (left) + DOMPanel (right)
 */

import dynamic from 'next/dynamic';
import { useState } from 'react';
import DOMPanel from './DOMPanel';

const FootprintTESTChart = dynamic(
  () => import('./FootprintTESTChart'),
  { ssr: false, loading: () => <div style={{ width: '100%', height: '100%', background: '#06080f' }} /> }
);

const DOM_DEFAULT_W = 210;

// Symbol → tickSize
const TICK: Record<string, number> = {
  // CME micro futures
  mnq: 0.25, mes: 0.25, mym: 1, m2k: 0.1,
  // Binance futures
  btcusdt: 10, ethusdt: 1, solusdt: 0.1, bnbusdt: 1,
  xrpusdt: 0.001, adausdt: 0.001, dogeusdt: 0.0001,
  avaxusdt: 0.1, linkusdt: 0.01, arbusdt: 0.001,
  opusdt: 0.01, pepeusdt: 0.0000001,
};

interface Props {
  symbol         ?: string;
  onSymbolChange ?: (s: string) => void;
}

export default function DeepChart({ symbol = 'btcusdt', onSymbolChange }: Props) {
  const [domVisible, setDomVisible] = useState(true);
  const sym      = symbol.toLowerCase();
  const tickSize = TICK[sym] ?? 0.1;

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden', background: '#06080f' }}>

      {/* ── New footprint chart ─────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, height: '100%' }}>
        <FootprintTESTChart symbol={sym.toUpperCase()} tickSize={tickSize} />
      </div>

      {/* ── Divider ─────────────────────────────────────────────────────── */}
      <div style={{ width: 2, background: '#0d1525', flexShrink: 0 }} />

      {/* ── DOM panel ───────────────────────────────────────────────────── */}
      {domVisible ? (
        <div style={{ width: DOM_DEFAULT_W, flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column', background: '#06080f', borderLeft: '1px solid #0d1525' }}>
          {/* Title bar */}
          <div style={{ height: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', background: '#080c18', borderBottom: '1px solid #0d1525', flexShrink: 0 }}>
            <span style={{ fontSize: 9, color: '#2a3a5a', fontFamily: 'Consolas, monospace', letterSpacing: '0.08em' }}>
              DEPTH OF MARKET
            </span>
            <button
              onClick={() => setDomVisible(false)}
              style={{ background: 'none', border: 'none', color: '#2a3a5a', cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1 }}
              title="Hide DOM"
            >✕</button>
          </div>
          {/* Canvas */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <DOMPanel symbol={sym} tickSize={tickSize} width={DOM_DEFAULT_W} />
          </div>
        </div>
      ) : (
        /* Toggle button when hidden */
        <button
          onClick={() => setDomVisible(true)}
          style={{
            width: 18, flexShrink: 0, background: '#080c18', border: 'none',
            borderLeft: '1px solid #0d1525', color: '#2a3a5a', cursor: 'pointer',
            fontSize: 8, writingMode: 'vertical-rl', letterSpacing: '0.08em',
            fontFamily: 'Consolas, monospace',
          }}
          title="Show DOM"
        >DOM ▶</button>
      )}
    </div>
  );
}
