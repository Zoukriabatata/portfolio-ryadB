'use client';

import dynamic from 'next/dynamic';

const FootprintTESTChart = dynamic(
  () => import('./FootprintTESTChart'),
  { ssr: false, loading: () => <div style={{ width: '100%', height: '100%', background: '#06080f' }} /> }
);

export const TICK: Record<string, number> = {
  // ── CME Micro Futures ──────────────────────────────────────────────────────
  mnq: 0.25, mes: 0.25, mym: 1, m2k: 0.1,
  // ── Crypto Futures (Binance) ───────────────────────────────────────────────
  btcusdt: 0.1,   ethusdt: 0.01,  solusdt: 0.001,  bnbusdt: 0.01,
  xrpusdt: 0.0001, adausdt: 0.0001, dogeusdt: 0.00001, trxusdt: 0.00001,
  avaxusdt: 0.01, linkusdt: 0.001, dotusdt: 0.001,  ltcusdt: 0.01,
  arbusdt: 0.0001, opusdt: 0.0001, suiusdt: 0.0001, aptusdt: 0.001,
  nearusdt: 0.001, injusdt: 0.001, fetusdt: 0.0001, pepeusdt: 0.0000001,
};

// Symbol groups shown in the toolbar
export const SYMBOL_GROUPS = [
  {
    label: 'CME',
    symbols: [
      { key: 'mnq',  label: 'MNQ'  },
      { key: 'mes',  label: 'MES'  },
      { key: 'mym',  label: 'MYM'  },
      { key: 'm2k',  label: 'M2K'  },
    ],
  },
  {
    label: 'Majors',
    symbols: [
      { key: 'btcusdt',  label: 'BTC'  },
      { key: 'ethusdt',  label: 'ETH'  },
      { key: 'solusdt',  label: 'SOL'  },
      { key: 'bnbusdt',  label: 'BNB'  },
      { key: 'xrpusdt',  label: 'XRP'  },
      { key: 'adausdt',  label: 'ADA'  },
      { key: 'dogeusdt', label: 'DOGE' },
      { key: 'trxusdt',  label: 'TRX'  },
    ],
  },
  {
    label: 'Alts',
    symbols: [
      { key: 'avaxusdt', label: 'AVAX' },
      { key: 'linkusdt', label: 'LINK' },
      { key: 'dotusdt',  label: 'DOT'  },
      { key: 'ltcusdt',  label: 'LTC'  },
      { key: 'arbusdt',  label: 'ARB'  },
      { key: 'opusdt',   label: 'OP'   },
      { key: 'suiusdt',  label: 'SUI'  },
      { key: 'aptusdt',  label: 'APT'  },
      { key: 'nearusdt', label: 'NEAR' },
      { key: 'injusdt',  label: 'INJ'  },
    ],
  },
] as const;

interface Props {
  symbol         ?: string;
  onSymbolChange ?: (s: string) => void;
}

export default function DeepChart({ symbol = 'btcusdt', onSymbolChange }: Props) {
  const sym      = symbol.toLowerCase();
  const tickSize = TICK[sym] ?? 0.1;

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden', background: '#06080f' }}>
      <div style={{ flex: 1, minWidth: 0, height: '100%' }}>
        <FootprintTESTChart
          symbol={sym.toUpperCase()}
          tickSize={tickSize}
          onSymbolChange={onSymbolChange}
        />
      </div>
    </div>
  );
}
