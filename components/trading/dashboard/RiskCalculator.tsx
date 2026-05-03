'use client';

import { useState, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTradingStore } from '@/stores/useTradingStore';

/**
 * Risk-per-trade calculator.
 *
 * Two-way: the user picks one of three "anchor" inputs and the other two
 * are computed live. Anchors:
 *   1. Risk %  → derives risk $ from balance, then contracts from SL distance
 *   2. Risk $  → derives risk %, then contracts
 *   3. Contracts → derives risk $ and risk % (reverse — useful when the
 *                  user already knows the size and wants to know exposure)
 *
 * Inputs always required regardless of anchor:
 *   - Stop loss distance (price units, e.g. $50 for BTC)
 *   - Account balance (auto-filled from the active broker)
 */

type Anchor = 'pct' | 'usd' | 'contracts';

const RISK_PRESETS = [0.5, 1, 2, 3];

export default function RiskCalculator() {
  const { connections, activeBroker } = useTradingStore(
    useShallow(s => ({
      connections:  s.connections,
      activeBroker: s.activeBroker,
    })),
  );

  const broker  = activeBroker ?? 'demo';
  const balance = connections[broker]?.balance ?? 0;

  const [anchor, setAnchor]       = useState<Anchor>('pct');
  const [riskPct, setRiskPct]     = useState(1);          // %
  const [riskUsd, setRiskUsd]     = useState(500);        // $
  const [contracts, setContracts] = useState(1);
  const [slDist, setSlDist]       = useState(10);          // price units (per 1 contract)

  // Derive the two non-anchor values. The math:
  //   riskUsd      = riskPct/100 × balance
  //   contracts    = riskUsd / slDist
  //   reverse:    riskUsd = contracts × slDist
  const computed = useMemo(() => {
    const safeSl = Math.max(0.0001, slDist);
    let pct = riskPct, usd = riskUsd, qty = contracts;

    if (anchor === 'pct') {
      usd = (riskPct / 100) * balance;
      qty = Math.max(1, Math.round(usd / safeSl));
    } else if (anchor === 'usd') {
      pct = balance > 0 ? (riskUsd / balance) * 100 : 0;
      qty = Math.max(1, Math.round(riskUsd / safeSl));
    } else { // contracts
      usd = contracts * safeSl;
      pct = balance > 0 ? (usd / balance) * 100 : 0;
    }

    // Status: green if <= 1%, yellow up to 3%, red beyond
    const status: 'safe' | 'warning' | 'danger' =
      pct <= 1 ? 'safe' : pct <= 3 ? 'warning' : 'danger';

    return { pct, usd, qty, status };
  }, [anchor, riskPct, riskUsd, contracts, slDist, balance]);

  const statusColor = {
    safe:    '#10b981',
    warning: '#fbbf24',
    danger:  '#ef4444',
  }[computed.status];

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Risk Calculator</h3>
        <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          ${balance.toLocaleString()} acct
        </span>
      </div>

      {/* Stop distance — always required */}
      <div>
        <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
          Stop loss distance ($ per contract)
        </label>
        <input
          type="number"
          min={0.0001}
          step={0.01}
          value={slDist}
          onChange={e => setSlDist(Math.max(0.0001, parseFloat(e.target.value) || 0.0001))}
          className="w-full px-3 py-1.5 rounded-lg text-[12px] tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
          style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        />
      </div>

      {/* Anchor inputs */}
      <div className="grid grid-cols-3 gap-2">
        {/* Risk % */}
        <AnchorBlock
          label="Risk %"
          active={anchor === 'pct'}
          onActivate={() => setAnchor('pct')}
        >
          <input
            type="number"
            min={0}
            step={0.1}
            value={anchor === 'pct' ? riskPct : computed.pct.toFixed(2)}
            onChange={e => { setAnchor('pct'); setRiskPct(Math.max(0, parseFloat(e.target.value) || 0)); }}
            className="w-full bg-transparent text-center text-[14px] font-bold tabular-nums focus:outline-none"
            style={{ color: statusColor }}
          />
          <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>% of account</span>
        </AnchorBlock>

        {/* Risk $ */}
        <AnchorBlock
          label="Risk $"
          active={anchor === 'usd'}
          onActivate={() => setAnchor('usd')}
        >
          <input
            type="number"
            min={0}
            step={1}
            value={anchor === 'usd' ? riskUsd : computed.usd.toFixed(0)}
            onChange={e => { setAnchor('usd'); setRiskUsd(Math.max(0, parseFloat(e.target.value) || 0)); }}
            className="w-full bg-transparent text-center text-[14px] font-bold tabular-nums focus:outline-none"
            style={{ color: statusColor }}
          />
          <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>$ at risk</span>
        </AnchorBlock>

        {/* Contracts */}
        <AnchorBlock
          label="Contracts"
          active={anchor === 'contracts'}
          onActivate={() => setAnchor('contracts')}
        >
          <input
            type="number"
            min={1}
            step={1}
            value={anchor === 'contracts' ? contracts : computed.qty}
            onChange={e => { setAnchor('contracts'); setContracts(Math.max(1, parseInt(e.target.value) || 1)); }}
            className="w-full bg-transparent text-center text-[14px] font-bold tabular-nums focus:outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
          <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>position size</span>
        </AnchorBlock>
      </div>

      {/* Risk % presets */}
      <div className="flex items-center gap-1">
        <span className="text-[10px] uppercase tracking-wider mr-1" style={{ color: 'var(--text-muted)' }}>Preset</span>
        {RISK_PRESETS.map(p => (
          <button
            key={p}
            onClick={() => { setAnchor('pct'); setRiskPct(p); }}
            className="px-2 py-0.5 rounded text-[10px] font-semibold transition-colors"
            style={{
              background: anchor === 'pct' && riskPct === p ? 'rgba(74,222,128,0.10)' : 'var(--surface-elevated)',
              color:      anchor === 'pct' && riskPct === p ? 'var(--primary)' : 'var(--text-muted)',
              border:     `1px solid ${anchor === 'pct' && riskPct === p ? 'var(--primary)' : 'var(--border)'}`,
            }}
          >
            {p}%
          </button>
        ))}
      </div>

      {/* Status warning */}
      {computed.status !== 'safe' && (
        <div
          className="text-[11px] px-2.5 py-1.5 rounded flex items-start gap-1.5"
          style={{
            background: computed.status === 'danger' ? 'rgba(239,68,68,0.08)' : 'rgba(251,191,36,0.08)',
            color:      statusColor,
            border:     `1px solid ${statusColor}40`,
          }}
        >
          <span className="mt-px">⚠</span>
          <span>
            {computed.status === 'danger'
              ? `Risking ${computed.pct.toFixed(1)}% per trade is high — pros stay under 1-2%.`
              : `Risk above 1% — make sure your edge supports it.`}
          </span>
        </div>
      )}
    </div>
  );
}

function AnchorBlock({
  label, active, onActivate, children,
}: {
  label:      string;
  active:     boolean;
  onActivate: () => void;
  children:   React.ReactNode;
}) {
  return (
    <div
      onClick={onActivate}
      className="rounded-lg p-2 cursor-pointer transition-all flex flex-col items-center gap-0.5"
      style={{
        background: active ? 'rgba(74,222,128,0.05)' : 'var(--surface-elevated)',
        border:     `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
      }}
    >
      <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      {children}
    </div>
  );
}
