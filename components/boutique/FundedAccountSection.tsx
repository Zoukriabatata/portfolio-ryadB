'use client';

import { useDataFeedStore } from '@/stores/useDataFeedStore';

const PROP_FIRMS = [
  {
    name: 'TopStep',
    abbr: 'TS',
    color: '#3B82F6',
    connector: 'tradovate' as const,
    connectorLabel: 'Tradovate',
    hint: 'Your TopStep account IS a Tradovate account — use the same credentials',
  },
  {
    name: 'Apex',
    abbr: 'AP',
    color: '#F97316',
    connector: 'tradovate' as const,
    connectorLabel: 'Tradovate',
    hint: 'Apex dashboard → Account → Tradovate credentials',
  },
  {
    name: '4PropTrader',
    abbr: '4PT',
    color: '#8B5CF6',
    connector: 'dxfeed' as const,
    connectorLabel: 'dxFeed',
    hint: 'Get your dxFeed API token in your 4PropTrader dashboard',
  },
  {
    name: 'Earn2Trade',
    abbr: 'E2T',
    color: '#10B981',
    connector: 'tradovate' as const,
    connectorLabel: 'Tradovate',
    hint: 'Earn2Trade dashboard → Credentials → Tradovate',
  },
  {
    name: 'My Funded Futures',
    abbr: 'MFF',
    color: '#EF4444',
    connector: 'tradovate' as const,
    connectorLabel: 'Tradovate',
    hint: 'Log into your MFF dashboard to find your Tradovate credentials',
  },
  {
    name: 'Bulenox',
    abbr: 'BLX',
    color: '#F59E0B',
    connector: 'tradovate' as const,
    connectorLabel: 'Tradovate',
    hint: 'Bulenox provides Tradovate-based credentials',
  },
] as const;

interface FundedAccountSectionProps {
  onConfigure: (providerId: string) => void;
}

export default function FundedAccountSection({ onConfigure }: FundedAccountSectionProps) {
  const configs = useDataFeedStore(s => s.configs);
  const tradovateStatus = configs['tradovate']?.status;
  const dxfeedStatus   = configs['dxfeed']?.status;
  const isConnected = (tradovateStatus === 'connected' || dxfeedStatus === 'connected');

  return (
    <div
      className="rounded-2xl p-6 mb-10"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background accent */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at top left, rgba(99,102,241,0.06) 0%, transparent 70%)',
        }}
      />

      <div className="relative">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                Tu as un compte funded ?
              </span>
              {isConnected && (
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: 'var(--success-bg)', color: 'var(--success)' }}
                >
                  Connected
                </span>
              )}
            </div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Connecte ton compte prop firm pour accéder aux données CME temps réel — ES, NQ, MNQ, MES, GC...
            </p>
          </div>

          {/* CME badge */}
          <div
            className="shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold"
            style={{ background: 'rgba(99,102,241,0.12)', color: '#818CF8', border: '1px solid rgba(99,102,241,0.2)' }}
          >
            CME · CBOT · COMEX
          </div>
        </div>

        {/* How it works */}
        <div
          className="rounded-xl p-4 mb-5 text-xs"
          style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2 mb-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
            </svg>
            Comment ça marche
          </div>
          <div className="grid sm:grid-cols-3 gap-3" style={{ color: 'var(--text-muted)' }}>
            <div className="flex items-start gap-2">
              <span className="shrink-0 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center mt-0.5"
                style={{ background: 'var(--primary-glow)', color: 'var(--primary)' }}>1</span>
              <span>Ton funded te donne accès aux données marché via Tradovate ou dxFeed</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="shrink-0 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center mt-0.5"
                style={{ background: 'var(--primary-glow)', color: 'var(--primary)' }}>2</span>
              <span>Tu entres tes credentials sur Senzoukria — connexion directe depuis le navigateur</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="shrink-0 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center mt-0.5"
                style={{ background: 'var(--primary-glow)', color: 'var(--primary)' }}>3</span>
              <span>Données live ES / NQ / GC sur ton footprint et heatmap — comme sur ATAS ou Bookmap</span>
            </div>
          </div>
        </div>

        {/* Prop firm cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {PROP_FIRMS.map((firm) => {
            const connectorStatus = configs[firm.connector]?.status;
            const connected = connectorStatus === 'connected';
            const configured = connectorStatus === 'configured';

            return (
              <button
                key={firm.name}
                onClick={() => onConfigure(firm.connector)}
                title={firm.hint}
                className="group relative rounded-xl p-3 text-left transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: connected
                    ? 'var(--success-bg)'
                    : 'var(--surface-elevated)',
                  border: connected
                    ? '1px solid color-mix(in srgb, var(--success) 30%, transparent)'
                    : configured
                    ? '1px solid rgba(245,158,11,0.3)'
                    : '1px solid var(--border)',
                }}
              >
                {/* Status dot */}
                {(connected || configured) && (
                  <div
                    className="absolute top-2 right-2 w-2 h-2 rounded-full"
                    style={{ background: connected ? 'var(--success)' : '#F59E0B' }}
                  />
                )}

                {/* Firm logo */}
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-bold mb-2"
                  style={{ background: `${firm.color}18`, color: firm.color, border: `1px solid ${firm.color}30` }}
                >
                  {firm.abbr}
                </div>

                {/* Firm name */}
                <div className="text-[11px] font-semibold mb-1 leading-tight" style={{ color: 'var(--text-primary)' }}>
                  {firm.name}
                </div>

                {/* Connector badge */}
                <div
                  className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded"
                  style={{
                    background: firm.connector === 'dxfeed'
                      ? 'rgba(99,102,241,0.12)'
                      : 'rgba(16,185,129,0.12)',
                    color: firm.connector === 'dxfeed' ? '#818CF8' : '#34D399',
                  }}
                >
                  <span className="w-1 h-1 rounded-full" style={{
                    background: firm.connector === 'dxfeed' ? '#818CF8' : '#34D399'
                  }} />
                  {firm.connectorLabel}
                </div>

                {/* Connect CTA on hover */}
                {!connected && (
                  <div
                    className="mt-2 text-[9px] font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: 'var(--primary)' }}
                  >
                    {configured ? 'Reconfigure →' : 'Connect →'}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Footnote */}
        <p className="mt-4 text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
          Les données restent chiffrées côté serveur. Tes credentials ne sont jamais exposés côté client.
          Rithmic natif (FTMO, Leeloo) n&apos;est pas supporté — nécessite un gateway local.
        </p>
      </div>
    </div>
  );
}
