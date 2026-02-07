'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { CME_CONTRACTS } from '@/types/ib-protocol';
import type { GatewayConnectionStatus } from '@/types/ib-protocol';

export type DataSource = 'binance' | 'ib';

const CME_SYMBOLS = Object.entries(CME_CONTRACTS);

interface DataSourceSelectorProps {
  source: DataSource;
  onSourceChange: (source: DataSource) => void;
  ibSymbol: string;
  onIBSymbolChange: (symbol: string) => void;
  ibStatus: GatewayConnectionStatus;
  onConnectIB: () => void;
}

const STATUS_LABELS: Record<GatewayConnectionStatus, { label: string; color: string }> = {
  disconnected: { label: 'Deconnecte', color: 'text-zinc-500' },
  authenticating: { label: 'Auth...', color: 'text-amber-400' },
  connecting_ib: { label: 'Connexion IB...', color: 'text-amber-400' },
  connected: { label: 'Connecte', color: 'text-green-400' },
  error: { label: 'Erreur', color: 'text-red-400' },
};

export function DataSourceSelector({
  source,
  onSourceChange,
  ibSymbol,
  onIBSymbolChange,
  ibStatus,
  onConnectIB,
}: DataSourceSelectorProps) {
  const session = useSession()?.data;
  const statusInfo = STATUS_LABELS[ibStatus];

  return (
    <div className="flex items-center gap-2">
      {/* Source Toggle */}
      <div className="flex items-center bg-zinc-800/80 rounded-lg p-0.5 border border-zinc-700">
        <button
          onClick={() => onSourceChange('binance')}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
            source === 'binance'
              ? 'bg-amber-500/20 text-amber-400'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Crypto
        </button>
        <button
          onClick={() => {
            onSourceChange('ib');
            if (ibStatus === 'disconnected') onConnectIB();
          }}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
            source === 'ib'
              ? 'bg-green-500/20 text-green-400'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          CME Futures
        </button>
      </div>

      {/* IB Symbol selector (only when IB source is active) */}
      {source === 'ib' && (
        <>
          <select
            value={ibSymbol}
            onChange={(e) => onIBSymbolChange(e.target.value)}
            className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-white text-xs font-mono"
          >
            {CME_SYMBOLS.map(([sym, spec]) => (
              <option key={sym} value={sym}>
                {sym} - {spec.description}
              </option>
            ))}
          </select>

          {/* IB Status */}
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${
              ibStatus === 'connected' ? 'bg-green-400' :
              ibStatus === 'error' ? 'bg-red-400' :
              ibStatus === 'disconnected' ? 'bg-zinc-600' :
              'bg-amber-400 animate-pulse'
            }`} />
            <span className={`text-xs ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
