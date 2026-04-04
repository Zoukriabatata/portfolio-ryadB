'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useState, useEffect, useCallback, useRef } from 'react';

const DashboardAIChat = dynamic(() => import('@/components/ai/DashboardAIChat'), { ssr: false });
const WelcomeModal = dynamic(() => import('@/components/ui/WelcomeModal'), { ssr: false });
import { useSession } from 'next-auth/react';
import {
  Activity, Zap, BarChart3, MessageSquare, RefreshCw,
  ChevronDown, Flame,
} from 'lucide-react';

// ── Custom icons ────────────────────────────────────────────────────────────

function IconLive({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
      <line x1="8" y1="2" x2="8" y2="22" />
      <rect x="5" y="6" width="6" height="9" rx="1" fill="currentColor" fillOpacity={0.2} stroke="none" />
      <line x1="17" y1="4" x2="17" y2="20" />
      <rect x="14" y="8" width="6" height="6" rx="1" fill="currentColor" fillOpacity={0.25} stroke="none" />
      <path d="M2 17 L5 14 L8 15.5 L12 12 L16 13.5 L20 11" strokeWidth={1.2} opacity={0.6} />
    </svg>
  );
}

function IconFootprint({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeLinecap="round">
      <rect x="2" y="2" width="9" height="4" rx="1" fill="currentColor" fillOpacity={0.15} />
      <rect x="13" y="2" width="9" height="4" rx="1" fill="currentColor" fillOpacity={0.45} />
      <rect x="2" y="9" width="9" height="4" rx="1" fill="currentColor" fillOpacity={0.45} />
      <rect x="13" y="9" width="9" height="4" rx="1" fill="currentColor" fillOpacity={0.15} />
      <rect x="2" y="16" width="9" height="4" rx="1" fill="currentColor" fillOpacity={0.25} />
      <rect x="13" y="16" width="9" height="4" rx="1" fill="currentColor" fillOpacity={0.35} />
      <line x1="11" y1="4" x2="13" y2="4" stroke="currentColor" strokeWidth={1.4} opacity={0.5} />
      <line x1="11" y1="11" x2="13" y2="11" stroke="currentColor" strokeWidth={1.4} opacity={0.5} />
      <line x1="11" y1="18" x2="13" y2="18" stroke="currentColor" strokeWidth={1.4} opacity={0.5} />
    </svg>
  );
}

function IconHeatmap({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="2" width="9" height="9" rx="1.5" fill="currentColor" opacity={0.85} />
      <rect x="13" y="2" width="9" height="9" rx="1.5" fill="currentColor" opacity={0.3} />
      <rect x="2" y="13" width="9" height="9" rx="1.5" fill="currentColor" opacity={0.45} />
      <rect x="13" y="13" width="9" height="9" rx="1.5" fill="currentColor" opacity={0.7} />
    </svg>
  );
}

function IconGEX({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M2 20 C5 20 7 5 12 5 C17 5 19 20 22 20" />
      <line x1="12" y1="2" x2="12" y2="22" strokeDasharray="2 2" strokeWidth={1} opacity={0.35} />
      <circle cx="12" cy="5" r="2" fill="currentColor" fillOpacity={0.45} stroke="none" />
    </svg>
  );
}

function IconVolatility({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2,15 5,7 8,17 11,9 14,15 17,8 20,13 22,12" />
    </svg>
  );
}

function IconBias({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <polygon points="12,4 13.5,11 12,13 10.5,11" fill="currentColor" fillOpacity={0.9} stroke="none" />
      <polygon points="12,13 13.5,13 12,20 10.5,13" fill="currentColor" fillOpacity={0.18} stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconReplay({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12 A8 8 0 1 0 7.5 5.5" />
      <polyline points="3,7 4,12 9,11" />
      <polyline points="12,7 12,12 15.5,14" />
    </svg>
  );
}

function IconNews({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="7" y1="8" x2="17" y2="8" />
      <line x1="7" y1="12" x2="17" y2="12" />
      <line x1="7" y1="16" x2="11" y2="16" />
      <rect x="13" y="14" width="4" height="4" rx="0.5" fill="currentColor" fillOpacity={0.2} />
    </svg>
  );
}

function IconAI({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
      <circle cx="12" cy="12" r="2.5" fill="currentColor" fillOpacity={0.3} />
      <circle cx="4" cy="7" r="1.8" />
      <circle cx="20" cy="7" r="1.8" />
      <circle cx="4" cy="17" r="1.8" />
      <circle cx="20" cy="17" r="1.8" />
      <line x1="5.7" y1="7.9" x2="9.8" y2="10.5" />
      <line x1="18.3" y1="7.9" x2="14.2" y2="10.5" />
      <line x1="5.7" y1="16.1" x2="9.8" y2="13.5" />
      <line x1="18.3" y1="16.1" x2="14.2" y2="13.5" />
    </svg>
  );
}

// ── Types ───────────────────────────────────────────────────────────────────

interface TickerData {
  symbol: string;
  price: number;
  changePercent: number;
  quoteVolume24h: number;
}

interface MoverRow extends TickerData {
  rank: number;
  maxVol: number;
}

interface FundingData {
  symbol: string;
  fundingRate: number;
  nextFundingTime: number;
}

interface LiquidationEvent {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  valueUSD: number;
  price: number;
  time: number;
}

// ── Constants ───────────────────────────────────────────────────────────────

const ALL_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT',
  'AVAXUSDT', 'ADAUSDT', 'DOTUSDT', 'LINKUSDT', 'NEARUSDT', 'ATOMUSDT',
  'UNIUSDT', 'APTUSDT', 'ARBUSDT', 'OPUSDT', 'SUIUSDT', 'INJUSDT',
  'PEPEUSDT', 'WIFUSDT', 'FETUSDT', 'LTCUSDT', 'TRXUSDT', 'MATICUSDT',
];

const DISPLAY_NAMES: Record<string, string> = {
  BTCUSDT: 'BTC', ETHUSDT: 'ETH', SOLUSDT: 'SOL', BNBUSDT: 'BNB',
  XRPUSDT: 'XRP', DOGEUSDT: 'DOGE', AVAXUSDT: 'AVAX', ADAUSDT: 'ADA',
  DOTUSDT: 'DOT', LINKUSDT: 'LINK', NEARUSDT: 'NEAR', ATOMUSDT: 'ATOM',
  UNIUSDT: 'UNI', APTUSDT: 'APT', ARBUSDT: 'ARB', OPUSDT: 'OP',
  SUIUSDT: 'SUI', INJUSDT: 'INJ', PEPEUSDT: 'PEPE', WIFUSDT: 'WIF',
  FETUSDT: 'FET', LTCUSDT: 'LTC', TRXUSDT: 'TRX', MATICUSDT: 'MATIC',
};

const NEWS_ITEMS = [
  {
    id: 1, title: 'Bitcoin ETF inflows hit weekly high of $886M as price reclaims $69K',
    source: 'CoinDesk', time: '2m ago', sentiment: 'bullish' as const, isNew: true,
  },
  {
    id: 2, title: 'Solana surpasses Ethereum in weekly DEX volume for second consecutive week',
    source: 'The Block', time: '15m ago', sentiment: 'bullish' as const, isNew: true,
  },
  {
    id: 3, title: 'Fed officials signal cautious approach to rate cuts, dollar strengthens',
    source: 'Reuters', time: '52m ago', sentiment: 'bearish' as const, isNew: false,
  },
  {
    id: 4, title: 'Arbitrum DAO approves $92M strategic diversification proposal',
    source: 'Decrypt', time: '1h ago', sentiment: 'neutral' as const, isNew: false,
  },
  {
    id: 5, title: 'BlackRock IBIT records largest single-day BTC purchase since January launch',
    source: 'Bitcoin Magazine', time: '2h ago', sentiment: 'bullish' as const, isNew: false,
  },
  {
    id: 6, title: 'SEC delays spot ETH ETF options approval, requests additional comments',
    source: 'CoinDesk', time: '4h ago', sentiment: 'bearish' as const, isNew: false,
  },
];

const CHAT_MESSAGES = [
  {
    id: 1, user: 'deltaflow', avatar: 'DF', color: '#4ade80',
    message: 'BTC stacked bids at 68,400 on the footprint — clear demand zone 🔥',
    time: '1m', reactions: [{ emoji: '🔥', count: 12 }, { emoji: '✅', count: 8 }],
  },
  {
    id: 2, user: 'algo_senku', avatar: 'AS', color: '#2dd4bf',
    message: 'SOL/USD printing bullish CVD divergence on the 15m, watching 155 break',
    time: '4m', reactions: [{ emoji: '👀', count: 6 }],
  },
  {
    id: 3, user: 'trader_rex', avatar: 'TR', color: '#f59e0b',
    message: 'ETH GEX flip at 3500 — dealers gonna hedge hard above that level',
    time: '7m', reactions: [{ emoji: '💡', count: 9 }, { emoji: '🎯', count: 4 }],
  },
  {
    id: 4, user: 'vol_wizard', avatar: 'VW', color: '#a78bfa',
    message: 'IV rank on ETH options at 24 — cheap vol before the move imo',
    time: '12m', reactions: [{ emoji: '💰', count: 3 }],
  },
  {
    id: 5, user: 'heatmap_pro', avatar: 'HP', color: '#fb923c',
    message: 'massive passive order wall at 68k on BTC perp liquidating slowly',
    time: '18m', reactions: [{ emoji: '👁', count: 15 }, { emoji: '📊', count: 7 }],
  },
  {
    id: 6, user: 'deltaflow', avatar: 'DF', color: '#4ade80',
    message: 'closed +340 ticks on ES replay session, footprint setup worked again 🏆',
    time: '25m', reactions: [{ emoji: '🏆', count: 21 }, { emoji: '🚀', count: 11 }],
  },
  {
    id: 7, user: 'macro_view', avatar: 'MV', color: '#60a5fa',
    message: 'DXY rejection at 106.2 resistance — risk-on bid into close possible',
    time: '31m', reactions: [{ emoji: '📈', count: 5 }],
  },
];

const QUICK_LAUNCH = [
  { href: '/live',       label: 'Live',       desc: 'Candle chart', shortcut: '1', Icon: IconLive       },
  { href: '/footprint',  label: 'Footprint',  desc: 'Order flow',   shortcut: '2', Icon: IconFootprint  },
  { href: '/gex',        label: 'GEX',        desc: 'Gamma expo.',  shortcut: '4', Icon: IconGEX        },
  { href: '/volatility', label: 'Volatility', desc: 'IV skew',      shortcut: '5', Icon: IconVolatility },
  { href: '/bias',       label: 'Bias',       desc: 'Direction',    shortcut: '6', Icon: IconBias       },
  { href: '/replay',     label: 'Replay',     desc: 'Backtest',     shortcut: '9', Icon: IconReplay     },
  { href: '/news',       label: 'News',       desc: 'Market intel', shortcut: '7', Icon: IconNews       },
  { href: '/ai',         label: 'AI',         desc: 'Assistant',    shortcut: '',  Icon: IconAI         },
];

const OI_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'] as const;

const FUNDING_SYMBOLS_LIST = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT',
  'XRPUSDT', 'AVAXUSDT', 'LINKUSDT', 'ARBUSDT', 'APTUSDT', 'OPUSDT',
];

// ── Formatters ──────────────────────────────────────────────────────────────

function fmtPrice(price: number): string {
  if (price >= 10000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(3);
  if (price >= 0.001) return price.toFixed(5);
  return price.toFixed(8);
}

function fmtVolume(vol: number): string {
  if (vol >= 1e9) return '$' + (vol / 1e9).toFixed(2) + 'B';
  if (vol >= 1e6) return '$' + (vol / 1e6).toFixed(1) + 'M';
  if (vol >= 1e3) return '$' + (vol / 1e3).toFixed(1) + 'K';
  return '$' + vol.toFixed(0);
}

function fmtPercent(pct: number): string {
  return (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
}

// ── Hooks ───────────────────────────────────────────────────────────────────

function useClock() {
  const [time, setTime] = useState('');
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const h = now.getHours();
      setGreeting(h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening');
      setTime(
        now.toLocaleTimeString('en-US', {
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        })
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return { time, greeting };
}

function useMarketTickers() {
  const [tickers, setTickers] = useState<TickerData[]>([]);
  const [lastFetch, setLastFetch] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      const symbolsParam = '[' + ALL_SYMBOLS.map(s => `"${s}"`).join(',') + ']';
      const res = await fetch(
        `https://fapi.binance.com/fapi/v1/ticker/24hr?symbols=${encodeURIComponent(symbolsParam)}`
      );
      if (!res.ok) return;
      const raw = await res.json() as Array<{
        symbol: string;
        lastPrice: string;
        priceChangePercent: string;
        quoteVolume: string;
      }>;

      const mapped: TickerData[] = raw.map(t => ({
        symbol: t.symbol,
        price: parseFloat(t.lastPrice),
        changePercent: parseFloat(t.priceChangePercent),
        quoteVolume24h: parseFloat(t.quoteVolume),
      }));

      setTickers(mapped);
      setLastFetch(Date.now());
    } catch {
      // network error — keep previous data
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 5000);
    return () => clearInterval(id);
  }, [fetchData]);

  return { tickers, lastFetch };
}

function useFundingRates() {
  const [rates, setRates] = useState<FundingData[]>([]);

  const fetchRates = useCallback(async () => {
    try {
      const res = await fetch('https://fapi.binance.com/fapi/v1/premiumIndex');
      if (!res.ok) return;
      const raw = await res.json() as Array<{
        symbol: string; lastFundingRate: string; nextFundingTime: number;
      }>;
      const filtered = raw
        .filter(r => FUNDING_SYMBOLS_LIST.includes(r.symbol))
        .map(r => ({
          symbol: r.symbol,
          fundingRate: parseFloat(r.lastFundingRate) * 100,
          nextFundingTime: r.nextFundingTime,
        }))
        .sort((a, b) => FUNDING_SYMBOLS_LIST.indexOf(a.symbol) - FUNDING_SYMBOLS_LIST.indexOf(b.symbol));
      setRates(filtered);
    } catch { /* network */ }
  }, []);

  useEffect(() => {
    fetchRates();
    const id = setInterval(fetchRates, 30_000);
    return () => clearInterval(id);
  }, [fetchRates]);

  return rates;
}

function useOpenInterest() {
  const [oi, setOi] = useState<Record<string, { current: number; prev: number }>>({});

  const fetchOI = useCallback(async () => {
    try {
      const results = await Promise.all(
        OI_SYMBOLS.map(sym =>
          fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${sym}`)
            .then(r => r.json())
            .then((d: { symbol: string; openInterest: string }) => ({
              symbol: d.symbol,
              openInterest: parseFloat(d.openInterest),
            }))
            .catch(() => null)
        )
      );
      setOi(prev => {
        const next = { ...prev };
        results.forEach(r => {
          if (!r) return;
          next[r.symbol] = {
            current: r.openInterest,
            prev: prev[r.symbol]?.current ?? r.openInterest,
          };
        });
        return next;
      });
    } catch { /* network */ }
  }, []);

  useEffect(() => {
    fetchOI();
    const id = setInterval(fetchOI, 30_000);
    return () => clearInterval(id);
  }, [fetchOI]);

  return oi;
}

function useLiquidations() {
  const [liquidations, setLiquidations] = useState<LiquidationEvent[]>([]);
  const counterRef = useRef(0);

  useEffect(() => {
    const ws = new WebSocket('wss://fstream.binance.com/ws/!forceOrder@arr');
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as { o: {
          s: string; S: string; ap: string; p: string; q: string; T: number;
        } };
        const o = msg.o;
        if (!o) return;
        const price = parseFloat(o.ap || o.p);
        const qty = parseFloat(o.q);
        const valueUSD = price * qty;
        if (valueUSD < 10_000) return;
        const liq: LiquidationEvent = {
          id: String(++counterRef.current),
          symbol: o.s,
          side: o.S === 'SELL' ? 'LONG' : 'SHORT',
          valueUSD,
          price,
          time: o.T || Date.now(),
        };
        setLiquidations(prev => [liq, ...prev.slice(0, 24)]);
      } catch { /* parse error */ }
    };
    return () => ws.close();
  }, []);

  return liquidations;
}

function useFearGreed() {
  const [data, setData] = useState<{ value: number; classification: string } | null>(null);
  useEffect(() => {
    // Use local cached route — Fear & Greed updates once per day max
    fetch('/api/fear-greed')
      .then(r => r.json())
      .then((json: { value: number; classification: string }) => {
        if (json.value) setData(json);
      })
      .catch(() => {});
  }, []);
  return data;
}

// ── Skeleton helpers ─────────────────────────────────────────────────────────

function Sk({ w = '100%', h = 10, r = 6 }: { w?: string | number; h?: number; r?: number }) {
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: r,
        background: 'var(--surface-elevated)',
        animation: 'skPulse 1.6s ease-in-out infinite',
      }}
    />
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function CardHeader({
  icon, label, right, accent, iconColor,
}: {
  icon?: React.ReactNode;
  label: string;
  right?: React.ReactNode;
  accent?: string;
  iconColor?: string;
}) {
  return (
    <div
      className="px-4 pt-3 pb-2.5 flex items-center gap-2.5 border-b flex-shrink-0"
      style={{ borderColor: 'var(--border)', borderLeft: accent ? `3px solid ${accent}` : undefined }}
    >
      {icon && (
        <div
          className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
          style={{
            background: iconColor ? iconColor + '18' : 'var(--surface-elevated)',
            color: iconColor ?? 'var(--text-muted)',
            border: iconColor ? `1px solid ${iconColor}25` : '1px solid var(--border)',
          }}
        >
          {icon}
        </div>
      )}
      <span className="text-[10px] font-bold uppercase tracking-widest flex-1 whitespace-nowrap"
        style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      {right}
    </div>
  );
}

function LiveDot({ color = 'var(--bull)' }: { color?: string }) {
  return (
    <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
      <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ background: color }} />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: color }} />
    </span>
  );
}

// legacy alias used by NewsFeed
function SectionHeader({ left, right }: { left: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] font-bold uppercase tracking-widest whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
        {left}
      </span>
      <span className="flex-1 h-px" style={{ background: 'var(--border)' }} />
      {right && <span className="text-[9px] whitespace-nowrap" style={{ color: 'var(--text-dimmed)' }}>{right}</span>}
    </div>
  );
}

// ── Hero Bar ────────────────────────────────────────────────────────────────

function PriceChip({ ticker, label }: { ticker: TickerData | undefined; label: string }) {
  const prevRef = useRef(ticker?.price ?? 0);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const isUp = ticker ? ticker.changePercent >= 0 : true;

  useEffect(() => {
    if (!ticker) return;
    if (ticker.price !== prevRef.current && prevRef.current !== 0) {
      setFlash(ticker.price > prevRef.current ? 'up' : 'down');
      const t = setTimeout(() => setFlash(null), 600);
      prevRef.current = ticker.price;
      return () => clearTimeout(t);
    }
    prevRef.current = ticker.price;
  }, [ticker?.price]);

  return (
    <div className="relative flex items-center gap-2.5 px-3.5 py-2 rounded-xl overflow-hidden"
      style={{
        background: 'var(--surface-elevated)',
        border: '1px solid var(--border)',
        transition: 'border-color 0.3s',
        borderColor: flash === 'up' ? 'rgba(38,217,127,0.4)' : flash === 'down' ? 'rgba(240,79,79,0.3)' : 'var(--border)',
      }}>
      {flash && (
        <div className="absolute inset-0 pointer-events-none" style={{
          background: flash === 'up' ? 'rgba(38,217,127,0.06)' : 'rgba(240,79,79,0.06)',
        }} />
      )}
      <span className="text-[10px] font-black tracking-wider" style={{ color: 'var(--text-dimmed)' }}>{label}</span>
      <span className="text-[15px] font-bold tabular-nums font-mono" style={{ color: 'var(--text-primary)' }}>
        {ticker ? `$${fmtPrice(ticker.price)}` : '—'}
      </span>
      {ticker && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md tabular-nums flex items-center gap-0.5"
          style={{
            background: isUp ? 'rgba(38,217,127,0.12)' : 'rgba(240,79,79,0.12)',
            color: isUp ? 'var(--bull)' : 'var(--bear)',
          }}>
          {isUp ? '▲' : '▼'} {Math.abs(ticker.changePercent).toFixed(2)}%
        </span>
      )}
    </div>
  );
}

function HeroBar({ greeting, time, btc, eth }: {
  greeting: string; time: string;
  btc: TickerData | undefined; eth: TickerData | undefined;
}) {
  return (
    <div className="rounded-xl border overflow-hidden"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      {/* top accent line */}
      <div className="h-0.5 w-full" style={{ background: 'linear-gradient(90deg, var(--primary), var(--accent), transparent)' }} />
      <div className="px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
        {/* Left: greeting */}
        <div className="min-w-0">
          <div className="text-[15px] font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            {greeting} 👋
          </div>
          <div className="text-[10px] mt-0.5 font-medium" style={{ color: 'var(--text-dimmed)' }}>
            OrderFlow · Binance Futures
          </div>
        </div>

        {/* Center: prices */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <PriceChip ticker={btc} label="BTC" />
          <PriceChip ticker={eth} label="ETH" />
        </div>

        {/* Right: clock + live */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-[13px] font-mono tabular-nums" style={{ color: 'var(--text-secondary)' }}>
            {time}
          </span>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full"
            style={{ background: 'rgba(38,217,127,0.08)', border: '1px solid rgba(38,217,127,0.2)' }}>
            <LiveDot />
            <span className="text-[9px] font-bold tracking-widest uppercase" style={{ color: 'var(--bull)' }}>LIVE</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Coin color map ───────────────────────────────────────────────────────────

const COIN_COLORS: Record<string, string> = {
  BTC: '#f7931a', ETH: '#627eea', SOL: '#9945ff', BNB: '#f0b90b',
  XRP: '#00aae4', DOGE: '#c2a633', AVAX: '#e84142', ADA: '#0033ad',
  DOT: '#e6007a', LINK: '#2a5ada', NEAR: '#00c08b', ATOM: '#6f7390',
  UNI: '#ff007a', APT: '#16b5f0', ARB: '#28a0f0', OP: '#ff0420',
  SUI: '#4da2ff', INJ: '#00b2ff', PEPE: '#4caf50', WIF: '#e8a020',
  FET: '#1d2951', LTC: '#bfbbbb', TRX: '#ef0027', MATIC: '#8247e5',
};

function symbolColor(sym: string): string {
  const name = DISPLAY_NAMES[sym] ?? sym.replace('USDT', '');
  return COIN_COLORS[name] ?? 'var(--text-muted)';
}

// ── Top Movers Leaderboard ──────────────────────────────────────────────────

function MoverRowItem({ row }: { row: MoverRow }) {
  const prevRef = useRef(row.price);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const isUp = row.changePercent >= 0;
  const volPct = row.maxVol > 0 ? Math.round((row.quoteVolume24h / row.maxVol) * 100) : 0;
  const coinColor = symbolColor(row.symbol);
  const name = DISPLAY_NAMES[row.symbol] ?? row.symbol.replace('USDT', '');

  useEffect(() => {
    if (row.price !== prevRef.current && prevRef.current !== 0) {
      setFlash(row.price > prevRef.current ? 'up' : 'down');
      const t = setTimeout(() => setFlash(null), 500);
      prevRef.current = row.price;
      return () => clearTimeout(t);
    }
    prevRef.current = row.price;
  }, [row.price]);

  return (
    <div
      className="relative flex items-center gap-3 px-3 py-2 transition-colors duration-100 cursor-default"
      style={{ borderBottom: '1px solid var(--border)' }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-elevated)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
    >
      {flash && (
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: flash === 'up' ? 'rgba(38,217,127,0.06)' : 'rgba(240,79,79,0.06)' }} />
      )}

      {/* Rank */}
      <div className="w-5 flex-shrink-0 text-center">
        {row.rank <= 3 ? (
          <span className="text-[11px]">{row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : '🥉'}</span>
        ) : (
          <span className="text-[10px] font-mono tabular-nums" style={{ color: 'var(--text-dimmed)' }}>{row.rank}</span>
        )}
      </div>

      {/* Coin badge */}
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-black"
        style={{ background: coinColor + '18', color: coinColor, border: `1px solid ${coinColor}30` }}>
        {name.slice(0, 3)}
      </div>

      {/* Name + price */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[12px] font-bold" style={{ color: 'var(--text-primary)' }}>{name}</span>
          <span className="text-[10px] font-mono tabular-nums" style={{ color: 'var(--text-secondary)' }}>
            ${fmtPrice(row.price)}
          </span>
        </div>
        {/* Volume bar */}
        <div className="flex items-center gap-1.5 mt-0.5">
          <div className="h-0.5 rounded-full overflow-hidden flex-1" style={{ background: 'var(--border)' }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${Math.max(volPct, 2)}%`, background: coinColor, opacity: 0.7 }} />
          </div>
          <span className="text-[9px] font-mono tabular-nums flex-shrink-0" style={{ color: 'var(--text-dimmed)' }}>
            {fmtVolume(row.quoteVolume24h)}
          </span>
        </div>
      </div>

      {/* % badge */}
      <div className="flex-shrink-0">
        <span className="text-[11px] font-bold px-2 py-1 rounded-lg tabular-nums"
          style={{
            background: isUp ? 'rgba(38,217,127,0.1)' : 'rgba(240,79,79,0.1)',
            color: isUp ? 'var(--bull)' : 'var(--bear)',
            fontVariantNumeric: 'tabular-nums',
          }}>
          {isUp ? '▲' : '▼'} {Math.abs(row.changePercent).toFixed(2)}%
        </span>
      </div>
    </div>
  );
}

function TopMovers({ tickers }: { tickers: TickerData[] }) {
  const [tab, setTab] = useState<'gainers' | 'losers'>('gainers');

  const sorted = [...tickers].sort((a, b) =>
    tab === 'gainers' ? b.changePercent - a.changePercent : a.changePercent - b.changePercent
  );

  const top12 = sorted.slice(0, 12);
  const maxVol = Math.max(...top12.map(t => t.quoteVolume24h), 1);
  const rows: MoverRow[] = top12.map((t, i) => ({ ...t, rank: i + 1, maxVol }));

  return (
    <div className="rounded-xl border flex flex-col h-full" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      {/* Header */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2.5">
          {/* icon badge */}
          <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.2)', color: 'var(--primary)' }}>
            <IconLive size={11} />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            Top Movers
          </span>
          <LiveDot />
        </div>

        <div className="flex items-center gap-2.5">
          <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>Binance · 24h</span>
          {/* pill tab switcher */}
          <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)' }}>
            {(['gainers', 'losers'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all duration-150 flex items-center gap-1"
                style={{
                  background: tab === t ? 'var(--surface)' : 'transparent',
                  color: tab === t ? (t === 'gainers' ? 'var(--bull)' : 'var(--bear)') : 'var(--text-dimmed)',
                  boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
                }}
              >
                <span>{t === 'gainers' ? '▲' : '▼'}</span>
                <span>{t === 'gainers' ? 'Gainers' : 'Losers'}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Column labels */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b"
        style={{ borderColor: 'var(--border)' }}>
        <div className="w-6 flex-shrink-0" />
        <div className="w-12 flex-shrink-0">
          <span className="text-[8px] uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
            Coin
          </span>
        </div>
        <div className="w-24 flex-shrink-0 text-right">
          <span className="text-[8px] uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
            Price
          </span>
        </div>
        <div className="w-16 flex-shrink-0 text-center">
          <span className="text-[8px] uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
            24h %
          </span>
        </div>
        <div className="flex-1 text-right">
          <span className="text-[8px] uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
            Volume
          </span>
        </div>
      </div>

      {/* Rows */}
      <div className="flex-1 px-1 py-1">
        {tickers.length === 0 ? (
          <div className="px-3 py-2 space-y-0">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-2 py-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
                <Sk w={16} h={16} r={8} />
                <Sk w={28} h={28} r={14} />
                <div className="flex-1 space-y-1.5">
                  <Sk w="55%" h={10} />
                  <Sk w="80%" h={5} r={3} />
                </div>
                <Sk w={52} h={22} r={8} />
              </div>
            ))}
          </div>
        ) : (
          rows.map(row => <MoverRowItem key={row.symbol} row={row} />)
        )}
      </div>
    </div>
  );
}

// ── Market Stats Card ───────────────────────────────────────────────────────

function MarketStatsCard({ tickers }: { tickers: TickerData[] }) {
  const totalVol = tickers.reduce((s, t) => s + t.quoteVolume24h, 0);
  const btcVol = tickers.find(t => t.symbol === 'BTCUSDT')?.quoteVolume24h ?? 0;
  const btcDom = totalVol > 0 ? (btcVol / totalVol) * 100 : 0;
  const sorted = [...tickers].sort((a, b) => b.changePercent - a.changePercent);
  const topGainer = sorted[0];
  const topLoser = sorted[sorted.length - 1];

  return (
    <div className="rounded-xl border h-full flex flex-col" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <CardHeader icon={<BarChart3 size={11} />} label="Market Stats" iconColor="var(--warning)" />
      {tickers.length === 0 ? (
        <div className="px-4 py-3 space-y-3 flex-1">
          <div className="flex items-center justify-between"><Sk w="40%" h={9} /><Sk w="28%" h={11} /></div>
          <div className="space-y-1.5"><div className="flex items-center justify-between"><Sk w="35%" h={9} /><Sk w="20%" h={9} /></div><Sk h={5} r={3} /></div>
          <div className="grid grid-cols-2 gap-2">
            <Sk h={60} r={8} />
            <Sk h={60} r={8} />
          </div>
        </div>
      ) : (
      <div className="px-4 py-3 space-y-3 flex-1">

        {/* Total Volume */}
        <div className="flex items-center justify-between">
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Volume 24h</span>
          <span className="text-[12px] font-bold font-mono tabular-nums" style={{ color: 'var(--accent)' }}>
            {totalVol > 0 ? fmtVolume(totalVol) : '—'}
          </span>
        </div>

        {/* BTC Dominance with bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>BTC Dominance</span>
            <span className="text-[11px] font-bold font-mono" style={{ color: 'var(--warning)' }}>
              {totalVol > 0 ? `${btcDom.toFixed(1)}%` : '—'}
            </span>
          </div>
          <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-elevated)' }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${btcDom}%`, background: '#f7931a' }} />
          </div>
        </div>

        {/* Top gainer / loser side by side */}
        <div className="grid grid-cols-2 gap-2">
          {topGainer && (
            <div className="flex flex-col gap-0.5 px-2.5 py-2 rounded-lg"
              style={{ background: 'rgba(38,217,127,0.06)', border: '1px solid rgba(38,217,127,0.15)' }}>
              <span className="text-[8px] uppercase tracking-wider font-bold" style={{ color: 'var(--bull)' }}>Top Gainer</span>
              <span className="text-[12px] font-bold" style={{ color: 'var(--text-primary)' }}>
                {DISPLAY_NAMES[topGainer.symbol] ?? topGainer.symbol.replace('USDT', '')}
              </span>
              <span className="text-[10px] font-bold font-mono" style={{ color: 'var(--bull)' }}>
                ▲ {topGainer.changePercent.toFixed(2)}%
              </span>
            </div>
          )}
          {topLoser && (
            <div className="flex flex-col gap-0.5 px-2.5 py-2 rounded-lg"
              style={{ background: 'rgba(240,79,79,0.06)', border: '1px solid rgba(240,79,79,0.15)' }}>
              <span className="text-[8px] uppercase tracking-wider font-bold" style={{ color: 'var(--bear)' }}>Top Loser</span>
              <span className="text-[12px] font-bold" style={{ color: 'var(--text-primary)' }}>
                {DISPLAY_NAMES[topLoser.symbol] ?? topLoser.symbol.replace('USDT', '')}
              </span>
              <span className="text-[10px] font-bold font-mono" style={{ color: 'var(--bear)' }}>
                ▼ {Math.abs(topLoser.changePercent).toFixed(2)}%
              </span>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

// ── Quick Launch Grid ───────────────────────────────────────────────────────

const LAUNCH_COLORS: Record<string, string> = {
  '/live':       '#4ade80',
  '/footprint':  '#2dd4bf',
  '/gex':        '#fb923c',
  '/volatility': '#f472b6',
  '/bias':       '#facc15',
  '/replay':     '#60a5fa',
  '/news':       '#94a3b8',
  '/ai':         '#a78bfa',
};

function QuickLaunchGrid() {
  return (
    <div className="rounded-xl border h-full flex flex-col" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <CardHeader icon={<Zap size={11} />} label="Quick Launch" iconColor="var(--primary)" />
      <div className="p-2.5 grid grid-cols-3 gap-2 flex-1 content-start">
        {QUICK_LAUNCH.map(({ href, label, desc, shortcut, Icon }) => {
          const c = LAUNCH_COLORS[href] ?? 'var(--primary)';
          return (
            <Link
              key={href} href={href}
              className="relative flex flex-col items-center justify-center gap-2 py-3.5 px-1 rounded-xl border transition-all duration-150 overflow-hidden group"
              style={{ background: 'var(--surface-elevated)', borderColor: 'var(--border)' }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLAnchorElement;
                el.style.borderColor = c + '55';
                el.style.boxShadow = `0 0 0 1px ${c}18, 0 4px 20px ${c}18`;
                el.style.background = c + '0d';
                el.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLAnchorElement;
                el.style.borderColor = 'var(--border)';
                el.style.boxShadow = 'none';
                el.style.background = 'var(--surface-elevated)';
                el.style.transform = 'translateY(0)';
              }}
            >
              {/* Keyboard shortcut badge */}
              {shortcut && (
                <span
                  className="absolute top-1.5 right-1.5 text-[8px] font-mono font-bold px-1 py-0.5 rounded leading-none"
                  style={{ background: 'var(--surface)', color: 'var(--text-dimmed)', border: '1px solid var(--border)' }}
                >
                  {shortcut}
                </span>
              )}
              {/* Gradient icon container */}
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${c}22, ${c}0c)`,
                  color: c,
                  border: `1px solid ${c}28`,
                  boxShadow: `0 2px 10px ${c}15`,
                }}
              >
                <Icon size={19} />
              </div>
              {/* Label + desc */}
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[10px] font-bold leading-none" style={{ color: 'var(--text-primary)' }}>
                  {label}
                </span>
                <span className="text-[8px] leading-none text-center" style={{ color: 'var(--text-dimmed)' }}>
                  {desc}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ── News Feed ───────────────────────────────────────────────────────────────

const SENTIMENT_COLOR: Record<'bullish' | 'bearish' | 'neutral', string> = {
  bullish: 'var(--bull)',
  bearish: 'var(--bear)',
  neutral: 'var(--text-dimmed)',
};

function NewsFeed() {
  return (
    <div
      className="rounded-xl border flex flex-col h-full"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <CardHeader icon={<IconNews size={11} />} label="Market Intelligence" iconColor="#94a3b8" />

      <div className="flex-1">
        {NEWS_ITEMS.map((item, idx) => (
          <div
            key={item.id}
            className="px-4 py-3 flex items-start gap-3 transition-colors duration-100 cursor-pointer"
            style={{
              borderBottom: idx < NEWS_ITEMS.length - 1 ? '1px solid var(--border)' : 'none',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-elevated)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLDivElement).style.background = 'transparent';
            }}
          >
            {/* Dot + new badge */}
            <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-0.5">
              <div
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: SENTIMENT_COLOR[item.sentiment] }}
              />
              {item.isNew && (
                <span
                  className="text-[7px] font-bold px-1 py-0.5 rounded"
                  style={{ background: 'rgba(74,222,128,0.15)', color: 'var(--primary)', lineHeight: 1 }}
                >
                  NEW
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p
                className="text-[12px] leading-snug line-clamp-2 hover:underline"
                style={{ color: 'var(--text-primary)' }}
              >
                {item.title}
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
                  {item.source}
                </span>
                <span className="text-[9px]" style={{ color: 'var(--border-light)' }}>·</span>
                <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
                  {item.time}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Community Feed (live Discord #général) ───────────────────────────────────

interface DiscordMsg {
  id: string;
  user: string;
  avatar: string;
  color: string;
  message: string;
  timestamp: string;
  reactions: { emoji: string; count: number }[];
  hasImage: boolean;
}

function useDiscordMessages() {
  const [messages, setMessages] = useState<DiscordMsg[]>([]);
  const [status, setStatus] = useState<'loading' | 'ok' | 'unconfigured' | 'error'>('loading');
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const prevIds = useRef<Set<string>>(new Set());

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch('/api/discord/messages?limit=25');
      if (res.status === 503) { setStatus('unconfigured'); return; }
      if (!res.ok) { setStatus('error'); return; }
      const data: DiscordMsg[] = await res.json();
      // detect truly new messages for animation
      const incoming = new Set(data.map(m => m.id));
      const fresh = new Set([...incoming].filter(id => !prevIds.current.has(id)));
      if (fresh.size > 0 && prevIds.current.size > 0) setNewIds(fresh);
      prevIds.current = incoming;
      setMessages(data);
      setStatus('ok');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    fetch_();
    const id = setInterval(fetch_, 15_000);
    return () => clearInterval(id);
  }, [fetch_]);

  // clear "new" flags after animation
  useEffect(() => {
    if (newIds.size === 0) return;
    const t = setTimeout(() => setNewIds(new Set()), 800);
    return () => clearTimeout(t);
  }, [newIds]);

  return { messages, status, refresh: fetch_, newIds };
}

function fmtDiscordTime(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'à l\'instant';
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  return d.toLocaleDateString('fr', { day: 'numeric', month: 'short' });
}

// Group consecutive messages from same author (Discord-style)
function groupMessages(msgs: DiscordMsg[]): Array<{ head: DiscordMsg; tail: DiscordMsg[] }> {
  const groups: Array<{ head: DiscordMsg; tail: DiscordMsg[] }> = [];
  for (const msg of msgs) {
    const last = groups[groups.length - 1];
    const gap = last
      ? (new Date(msg.timestamp).getTime() - new Date(last.head.timestamp).getTime()) / 60_000
      : Infinity;
    if (last && last.head.user === msg.user && gap < 5) {
      last.tail.push(msg);
    } else {
      groups.push({ head: msg, tail: [] });
    }
  }
  return groups;
}

function DiscordSkeleton() {
  return (
    <div className="px-4 py-3 space-y-4" style={{ animation: 'pulse 1.6s ease-in-out infinite' }}>
      {[44, 60, 36, 52].map((w, i) => (
        <div key={i} className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full flex-shrink-0" style={{ background: 'var(--surface-elevated)' }} />
          <div className="flex-1 space-y-1.5">
            <div className="h-2.5 rounded-full w-20" style={{ background: 'var(--surface-elevated)' }} />
            <div className="h-2 rounded-full" style={{ background: 'var(--surface-elevated)', width: `${w}%` }} />
            {i % 2 === 0 && <div className="h-2 rounded-full" style={{ background: 'var(--surface-elevated)', width: `${w - 15}%` }} />}
          </div>
        </div>
      ))}
    </div>
  );
}

function CommunityFeed() {
  const { messages, status, refresh, newIds } = useDiscordMessages();
  const listRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [unread, setUnread] = useState(0);

  // track scroll position
  const onScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAtBottom(bottom);
    if (bottom) setUnread(0);
  }, []);

  // auto-scroll or show unread badge
  useEffect(() => {
    if (status !== 'ok' || newIds.size === 0) return;
    if (atBottom) {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    } else {
      setUnread(n => n + newIds.size);
    }
  }, [newIds, status, atBottom]);

  // initial scroll to bottom
  useEffect(() => {
    if (status === 'ok' && messages.length > 0) {
      requestAnimationFrame(() => {
        if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
      });
    }
  }, [status]);

  const groups = groupMessages([...messages].reverse());

  return (
    <div
      className="rounded-xl border flex flex-col h-full overflow-hidden"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)', minHeight: 300 }}
    >
      {/* ── Header ── */}
      <div
        className="px-3 py-2.5 flex items-center gap-2 flex-shrink-0"
        style={{
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
        }}
      >
        {/* Discord blurple icon */}
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(88,101,242,0.15)' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="#5865f2">
            <path d="M20.317 4.37a19.8 19.8 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.032.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
          </svg>
        </div>

        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[11px] font-semibold leading-none" style={{ color: 'var(--text-primary)' }}>
            # général
          </span>
          <span className="text-[9px] leading-none mt-0.5" style={{ color: 'var(--text-dimmed)' }}>
            Serveur Discord
          </span>
        </div>

        {/* live dot */}
        {status === 'ok' && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full flex-shrink-0"
            style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)' }}>
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ background: 'var(--bull)' }} />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: 'var(--bull)' }} />
            </span>
            <span className="text-[9px] font-medium" style={{ color: 'var(--bull)' }}>live</span>
          </div>
        )}

        <button
          onClick={refresh}
          className="w-6 h-6 flex items-center justify-center rounded-md transition-all duration-150 flex-shrink-0"
          style={{ color: 'var(--text-dimmed)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-elevated)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-dimmed)'; }}
          title="Actualiser"
        >
          <RefreshCw size={11} />
        </button>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 relative" style={{ background: 'var(--background)' }}>

        {status === 'loading' && <DiscordSkeleton />}

        {status === 'unconfigured' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(88,101,242,0.1)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#5865f2">
                <path d="M20.317 4.37a19.8 19.8 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.032.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
            </div>
            <div>
              <p className="text-[12px] font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Discord non connecté</p>
              <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-dimmed)' }}>
                Configure <code style={{ background: 'var(--surface-elevated)', padding: '1px 4px', borderRadius: 3, fontSize: 9 }}>DISCORD_BOT_TOKEN</code> et <code style={{ background: 'var(--surface-elevated)', padding: '1px 4px', borderRadius: 3, fontSize: 9 }}>DISCORD_CHANNEL_ID</code>
              </p>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--bear)" strokeWidth={2}>
                <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              </svg>
            </div>
            <p className="text-[11px]" style={{ color: 'var(--bear)' }}>Erreur de connexion</p>
            <button onClick={refresh} className="text-[10px] px-3 py-1 rounded-full transition-colors"
              style={{ background: 'var(--surface-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
              Réessayer
            </button>
          </div>
        )}

        {status === 'ok' && (
          <div
            ref={listRef}
            onScroll={onScroll}
            className="overflow-y-auto custom-scrollbar"
            style={{ maxHeight: 380, paddingTop: 8, paddingBottom: 8 }}
          >
            {groups.length === 0 && (
              <p className="text-center py-8 text-[11px]" style={{ color: 'var(--text-dimmed)' }}>Aucun message récent</p>
            )}

            {groups.map(({ head, tail }) => {
              const allMsgs = [head, ...tail];
              const isNew = newIds.has(head.id);
              return (
                <div
                  key={head.id}
                  className="group flex items-start gap-3 px-3 py-1.5 transition-colors duration-100"
                  style={{
                    background: isNew ? 'rgba(74,222,128,0.04)' : 'transparent',
                    animation: isNew ? 'slideUp 0.3s cubic-bezier(0.22,1,0.36,1)' : 'none',
                    borderLeft: isNew ? '2px solid rgba(74,222,128,0.4)' : '2px solid transparent',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-elevated)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = isNew ? 'rgba(74,222,128,0.04)' : 'transparent'; }}
                >
                  {/* Avatar */}
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold mt-0.5 select-none"
                    style={{
                      background: `linear-gradient(135deg, ${head.color}33, ${head.color}18)`,
                      color: head.color,
                      border: `1.5px solid ${head.color}44`,
                      boxShadow: `0 0 0 2px ${head.color}10`,
                    }}
                  >
                    {head.avatar}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Username + timestamp */}
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span className="text-[12px] font-bold leading-none" style={{ color: head.color }}>
                        {head.user}
                      </span>
                      <span className="text-[9px] opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-dimmed)' }}>
                        {fmtDiscordTime(head.timestamp)}
                      </span>
                    </div>

                    {/* All messages in group */}
                    {allMsgs.map((m, idx) => (
                      <div key={m.id} className={idx > 0 ? 'mt-0.5' : ''}>
                        {m.message && (
                          <p className="text-[12px] leading-relaxed break-words" style={{ color: 'var(--text-secondary)' }}>
                            {m.message}
                          </p>
                        )}
                        {m.hasImage && !m.message && (
                          <div className="flex items-center gap-1.5 mt-0.5"
                            style={{ color: 'var(--text-dimmed)', fontSize: 10 }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <rect x="3" y="3" width="18" height="18" rx="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <path d="m21 15-5-5L5 21" />
                            </svg>
                            <span>image</span>
                          </div>
                        )}
                        {m.hasImage && m.message && (
                          <div className="inline-flex items-center gap-1 mt-1"
                            style={{ color: 'var(--text-dimmed)', fontSize: 10 }}>
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <rect x="3" y="3" width="18" height="18" rx="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <path d="m21 15-5-5L5 21" />
                            </svg>
                          </div>
                        )}
                        {/* Reactions */}
                        {m.reactions.length > 0 && (
                          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                            {m.reactions.map((r, i) => (
                              <span
                                key={i}
                                className="flex items-center gap-1 px-2 py-0.5 rounded-full transition-all duration-100 cursor-default"
                                style={{
                                  background: 'var(--surface-elevated)',
                                  border: '1px solid var(--border)',
                                  fontSize: 10,
                                }}
                                onMouseEnter={e => { (e.currentTarget as HTMLSpanElement).style.borderColor = 'var(--border-light)'; (e.currentTarget as HTMLSpanElement).style.background = 'var(--surface-active)'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLSpanElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLSpanElement).style.background = 'var(--surface-elevated)'; }}
                              >
                                <span>{r.emoji}</span>
                                <span className="font-mono tabular-nums text-[9px]" style={{ color: 'var(--text-muted)' }}>{r.count}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Unread badge */}
        {unread > 0 && (
          <button
            onClick={() => {
              listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
              setUnread(0);
            }}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-semibold shadow-lg transition-all"
            style={{
              background: 'var(--primary)',
              color: '#000',
              animation: 'slideUp 0.2s cubic-bezier(0.22,1,0.36,1)',
            }}
          >
            <ChevronDown size={11} />
            {unread} nouveau{unread > 1 ? 'x' : ''}
          </button>
        )}
      </div>

      {/* ── Footer (divider line) ── */}
      <div className="px-3 py-2 flex items-center gap-2 flex-shrink-0"
        style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div className="flex-1 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
          style={{ background: 'var(--background)', border: '1px solid var(--border)' }}>
          <MessageSquare size={10} style={{ color: 'var(--text-dimmed)', flexShrink: 0 }} />
          <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>Rejoins le Discord pour écrire…</span>
        </div>
      </div>
    </div>
  );
}

// ── Funding Rates Strip ──────────────────────────────────────────────────────

function FundingRatesStrip({ rates }: { rates: FundingData[] }) {
  const [countdown, setCountdown] = useState('');
  useEffect(() => {
    const tick = () => {
      const next = rates[0]?.nextFundingTime;
      if (!next) return;
      const diff = next - Date.now();
      if (diff <= 0) { setCountdown('00:00:00'); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setCountdown(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    };
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [rates]);

  if (rates.length === 0) return null;

  return (
    <div className="rounded-xl border flex items-center gap-3 px-4 py-2.5 overflow-x-auto custom-scrollbar"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>

      {/* Label + countdown */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="w-6 h-6 rounded-md flex items-center justify-center"
          style={{ background: 'rgba(251,146,60,0.12)', border: '1px solid rgba(251,146,60,0.2)' }}>
          <Flame size={11} style={{ color: 'var(--warning)' }} />
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Funding</span>
          {countdown && (
            <span className="text-[9px] font-mono font-bold tabular-nums mt-0.5" style={{ color: 'var(--text-dimmed)' }}>
              {countdown}
            </span>
          )}
        </div>
      </div>

      <div className="w-px h-5 flex-shrink-0" style={{ background: 'var(--border)' }} />

      {/* Rate pills */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {rates.map(r => {
          const neutral = Math.abs(r.fundingRate) < 0.005;
          const positive = r.fundingRate >= 0;
          const color = neutral ? 'var(--text-muted)' : positive ? 'var(--bear)' : 'var(--bull)';
          const bg = neutral ? 'var(--surface-elevated)' : positive ? 'rgba(240,79,79,0.08)' : 'rgba(38,217,127,0.08)';
          const border = neutral ? 'var(--border)' : positive ? 'rgba(240,79,79,0.2)' : 'rgba(38,217,127,0.2)';
          const arrow = neutral ? '·' : positive ? '▲' : '▼';
          const coinColor = symbolColor(r.symbol);
          return (
            <div key={r.symbol}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg flex-shrink-0"
              style={{ background: bg, border: `1px solid ${border}` }}>
              {/* coin dot */}
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: coinColor }} />
              <span className="text-[9px] font-black tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                {DISPLAY_NAMES[r.symbol] ?? r.symbol.replace('USDT', '')}
              </span>
              <span className="text-[8px]" style={{ color }}>{arrow}</span>
              <span className="text-[9px] font-mono font-bold tabular-nums" style={{ color }}>
                {r.fundingRate >= 0 ? '+' : ''}{r.fundingRate.toFixed(4)}%
              </span>
            </div>
          );
        })}
      </div>

      <div className="hidden md:flex items-center gap-2 flex-shrink-0 text-[8px]" style={{ color: 'var(--text-dimmed)' }}>
        <span className="flex items-center gap-1"><span style={{ color: 'var(--bull)' }}>▲</span>shorts pay</span>
        <span className="flex items-center gap-1"><span style={{ color: 'var(--bear)' }}>▲</span>longs pay</span>
      </div>
    </div>
  );
}

// ── Open Interest Panel ───────────────────────────────────────────────────────

function fmtOI(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(0);
}

function OpenInterestPanel({ oi }: { oi: Record<string, { current: number; prev: number }> }) {
  const items = OI_SYMBOLS.map(sym => {
    const data = oi[sym];
    const change = data && data.prev > 0 ? ((data.current - data.prev) / data.prev) * 100 : 0;
    return { symbol: sym, name: DISPLAY_NAMES[sym] ?? sym.replace('USDT', ''), current: data?.current ?? 0, change };
  });
  const hasData = items.some(i => i.current > 0);
  const maxOI = Math.max(...items.map(i => i.current), 1);

  return (
    <div className="rounded-xl border flex flex-col h-full" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <CardHeader
        icon={<BarChart3 size={11} />}
        label="Open Interest"
        iconColor="var(--accent)"
        right={<span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>Perp · 30s</span>}
      />
      <div className="p-3 space-y-1">
        {!hasData ? (
          <div className="flex items-center justify-center h-20">
            <RefreshCw size={12} className="animate-spin" style={{ color: 'var(--text-dimmed)' }} />
          </div>
        ) : items.map(item => {
          const barPct = maxOI > 0 ? (item.current / maxOI) * 100 : 0;
          const color = symbolColor(item.symbol);
          return (
            <div key={item.symbol} className="group px-2 py-2 rounded-lg transition-colors"
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-elevated)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 text-[8px] font-black"
                  style={{ background: color + '18', color }}>
                  {item.name.slice(0, 1)}
                </div>
                <span className="text-[12px] font-bold flex-1" style={{ color: 'var(--text-primary)' }}>{item.name}</span>
                <span className="text-[11px] font-mono font-bold tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                  {item.current > 0 ? fmtOI(item.current) : '—'}
                </span>
                {item.current > 0 && (
                  <span className="text-[10px] font-bold tabular-nums w-14 text-right"
                    style={{ color: item.change >= 0 ? 'var(--bull)' : 'var(--bear)' }}>
                    {item.change >= 0 ? '▲' : '▼'} {Math.abs(item.change).toFixed(2)}%
                  </span>
                )}
              </div>
              <div className="h-0.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${barPct}%`, background: color, opacity: 0.6 }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Liquidations Feed ─────────────────────────────────────────────────────────

function LiquidationsFeed({ liquidations }: { liquidations: LiquidationEvent[] }) {
  function fmtAge(ms: number): string {
    const d = Date.now() - ms;
    if (d < 60_000) return `${Math.floor(d / 1_000)}s`;
    if (d < 3_600_000) return `${Math.floor(d / 60_000)}m`;
    return `${Math.floor(d / 3_600_000)}h`;
  }
  const isWhale = (v: number) => v >= 500_000;

  return (
    <div className="rounded-xl border flex flex-col h-full" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <CardHeader
        icon={<Zap size={11} />}
        label="Liquidations"
        iconColor="var(--warning)"
        right={
          <div className="flex items-center gap-1.5">
            {liquidations.length > 0 && <LiveDot color="var(--warning)" />}
            <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>
              {liquidations.length > 0 ? `${liquidations.length}` : 'waiting'}
            </span>
          </div>
        }
      />
      <div className="flex-1 overflow-y-auto custom-scrollbar" style={{ maxHeight: 220 }}>
        {liquidations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-28 gap-2">
            <div className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(251,146,60,0.08)' }}>
              <Zap size={18} style={{ color: 'var(--warning)', opacity: 0.5 }} />
            </div>
            <span className="text-[11px]" style={{ color: 'var(--text-dimmed)' }}>Watching for liquidations…</span>
            <span className="text-[9px] px-2 py-0.5 rounded-full"
              style={{ background: 'var(--surface-elevated)', color: 'var(--text-dimmed)' }}>Min. $10K</span>
          </div>
        ) : liquidations.map(liq => {
          const isLong = liq.side === 'LONG';
          const color = isLong ? 'var(--bear)' : 'var(--bull)';
          const whale = isWhale(liq.valueUSD);
          return (
            <div key={liq.id}
              className="flex items-center gap-2 px-3 py-2 border-b"
              style={{
                borderColor: 'var(--border)',
                background: whale ? (isLong ? 'rgba(240,79,79,0.04)' : 'rgba(38,217,127,0.04)') : 'transparent',
              }}>
              {/* side badge */}
              <span className="text-[8px] font-black px-1.5 py-0.5 rounded flex-shrink-0 tracking-wide"
                style={{
                  background: isLong ? 'rgba(240,79,79,0.12)' : 'rgba(38,217,127,0.12)',
                  color,
                }}>
                {liq.side}
              </span>
              {/* coin */}
              <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 text-[7px] font-black"
                style={{ background: symbolColor(liq.symbol) + '18', color: symbolColor(liq.symbol) }}>
                {(DISPLAY_NAMES[liq.symbol] ?? liq.symbol.replace('USDT', '')).slice(0, 2)}
              </div>
              <span className="text-[11px] font-bold flex-1" style={{ color: 'var(--text-primary)' }}>
                {DISPLAY_NAMES[liq.symbol] ?? liq.symbol.replace('USDT', '')}
              </span>
              {whale && <span className="text-[9px]">🐳</span>}
              <span className="text-[11px] font-bold font-mono tabular-nums" style={{ color }}>
                {fmtVolume(liq.valueUSD)}
              </span>
              <span className="text-[9px] font-mono w-6 text-right flex-shrink-0" style={{ color: 'var(--text-dimmed)' }}>
                {fmtAge(liq.time)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Fear & Greed Widget ───────────────────────────────────────────────────────

function getFGColor(v: number): string {
  if (v <= 25) return '#f04f4f';
  if (v <= 45) return '#fb923c';
  if (v <= 55) return '#e8a020';
  if (v <= 75) return '#4ade80';
  return '#22c55e';
}

const FG_SCALE = [
  { label: 'Extreme Fear', c: '#f04f4f' },
  { label: 'Fear',         c: '#fb923c' },
  { label: 'Neutral',      c: '#e8a020' },
  { label: 'Greed',        c: '#4ade80' },
  { label: 'Extreme Greed',c: '#22c55e' },
];

function FearGreedWidget({ fg }: { fg: { value: number; classification: string } | null }) {
  const value = fg?.value ?? 0;
  const color = fg ? getFGColor(value) : 'var(--border)';

  // Semicircular arc gauge (180° arc)
  const W = 140; const H = 78;
  const cx = W / 2; const cy = H - 4;
  const r = 56;
  // arc from left (180°) to right (0°)
  const startAngle = Math.PI;   // left
  const endAngle = 0;           // right
  const arcLen = Math.PI;
  const needleAngle = Math.PI - (value / 100) * Math.PI;

  function polarToXY(angle: number, radius: number) {
    return { x: cx + radius * Math.cos(angle), y: cy - radius * Math.sin(angle) };
  }

  const trackStart = polarToXY(startAngle, r);
  const trackEnd  = polarToXY(endAngle, r);
  const fillEnd   = polarToXY(Math.PI - (value / 100) * Math.PI, r);
  const needle    = polarToXY(needleAngle, r - 8);

  const trackD = `M ${trackStart.x} ${trackStart.y} A ${r} ${r} 0 0 1 ${trackEnd.x} ${trackEnd.y}`;
  const fillD  = value > 0
    ? `M ${trackStart.x} ${trackStart.y} A ${r} ${r} 0 ${value > 50 ? 1 : 0} 1 ${fillEnd.x} ${fillEnd.y}`
    : '';

  // gradient colors: red → orange → yellow → green
  const STOPS = [
    { offset: '0%',   color: '#f04f4f' },
    { offset: '25%',  color: '#fb923c' },
    { offset: '50%',  color: '#e8a020' },
    { offset: '75%',  color: '#4ade80' },
    { offset: '100%', color: '#22c55e' },
  ];
  void arcLen; // used above

  return (
    <div className="rounded-xl border flex flex-col h-full" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <CardHeader
        icon={<Activity size={11} />}
        label="Fear & Greed"
        iconColor="var(--primary)"
        right={<span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>Crypto · Daily</span>}
      />
      <div className="flex flex-col items-center px-4 py-3 gap-2">
        {/* Semicircle gauge */}
        <div className="relative">
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
            <defs>
              <linearGradient id="fg-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                {STOPS.map(s => <stop key={s.offset} offset={s.offset} stopColor={s.color} />)}
              </linearGradient>
            </defs>
            {/* track */}
            <path d={trackD} fill="none" stroke="var(--surface-elevated)" strokeWidth={10} strokeLinecap="round" />
            {/* fill arc */}
            {fillD && (
              <path d={fillD} fill="none" stroke="url(#fg-grad)" strokeWidth={10} strokeLinecap="round"
                style={{ transition: 'all 1.2s ease' }} />
            )}
            {/* needle dot */}
            {fg && (
              <circle cx={needle.x} cy={needle.y} r={4} fill={color}
                style={{ transition: 'all 1.2s ease', filter: `drop-shadow(0 0 4px ${color}88)` }} />
            )}
            {/* center value */}
            <text x={cx} y={cy - 4} textAnchor="middle" fontSize={22} fontWeight={900}
              fontFamily="var(--font-mono, monospace)" fill={color}
              style={{ transition: 'fill 0.5s' }}>
              {fg ? value : '—'}
            </text>
          </svg>
        </div>

        {/* Classification label */}
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-[14px] font-bold tracking-tight" style={{ color }}>
            {fg?.classification ?? 'Loading…'}
          </span>
          {/* scale dots */}
          <div className="flex items-center gap-1.5">
            {FG_SCALE.map((l, i) => {
              const active = fg && getFGColor(value) === l.c;
              return (
                <div key={i} className="flex flex-col items-center gap-0.5">
                  <div className="w-2 h-2 rounded-full transition-all"
                    style={{ background: l.c, opacity: active ? 1 : 0.2, transform: active ? 'scale(1.4)' : 'scale(1)' }} />
                  <span className="text-[7px] text-center leading-none hidden sm:block"
                    style={{ color: active ? 'var(--text-secondary)' : 'var(--text-dimmed)', maxWidth: 36 }}>
                    {l.label.replace(' ', '\n')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Export ─────────────────────────────────────────────────────────────

function UpgradeBanner() {
  const { data: session } = useSession();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || session?.user?.tier === 'ULTRA') return null;
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-[12px] relative"
      style={{ background: 'linear-gradient(to right, rgba(74,222,128,0.06), rgba(139,92,246,0.06))', border: '1px solid rgba(74,222,128,0.12)' }}>
      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
      <span style={{ color: 'rgba(255,255,255,0.5)' }}>
        <span style={{ color: '#86efac', fontWeight: 600 }}>Launch offer:</span> Unlock footprint charts, heatmap, GEX & more for <strong style={{ color: 'rgba(255,255,255,0.8)' }}>$29/mo</strong> — locked for life.
      </span>
      <a href="/pricing" className="flex-shrink-0 px-3 py-1 rounded-lg text-[11px] font-bold transition-all hover:-translate-y-px"
        style={{ background: 'linear-gradient(to right, #86efac, #4ade80)', color: '#0a0a0f' }}>
        Upgrade →
      </a>
      <button onClick={() => setDismissed(true)} className="absolute right-2 top-1/2 -translate-y-1/2 opacity-25 hover:opacity-60 transition-opacity p-1" aria-label="Dismiss">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
  );
}

export default function DashboardPage() {
  const { time, greeting } = useClock();
  const { tickers } = useMarketTickers();
  const fundingRates = useFundingRates();
  const oi = useOpenInterest();
  const liquidations = useLiquidations();
  const fearGreed = useFearGreed();

  const btc = tickers.find(t => t.symbol === 'BTCUSDT');
  const eth = tickers.find(t => t.symbol === 'ETHUSDT');

  return (
    <div className="h-full overflow-auto custom-scrollbar">
      <WelcomeModal />
      <div className="max-w-[1400px] mx-auto px-3 py-3 space-y-3 animate-fadeIn">
        <UpgradeBanner />

        {/* ── 1. Hero Bar ──────────────────────────────────────────── */}
        <HeroBar greeting={greeting} time={time} btc={btc} eth={eth} />

        {/* ── 2. Funding Rates Strip ───────────────────────────────── */}
        <FundingRatesStrip rates={fundingRates} />

        {/* ── 3. Market Overview — Leaderboard + Sidebar ──────────── */}
        <div className="grid lg:grid-cols-3 gap-3" style={{ alignItems: 'stretch' }}>
          <div className="lg:col-span-2">
            <TopMovers tickers={tickers} />
          </div>
          <div className="flex flex-col gap-3">
            <FearGreedWidget fg={fearGreed} />
            <div className="flex-1 flex flex-col">
              <MarketStatsCard tickers={tickers} />
            </div>
          </div>
        </div>

        {/* ── 4. Live Flow — Liquidations · OI · Quick Launch ─────── */}
        <div className="grid lg:grid-cols-3 gap-3" style={{ alignItems: 'stretch' }}>
          <LiquidationsFeed liquidations={liquidations} />
          <OpenInterestPanel oi={oi} />
          <QuickLaunchGrid />
        </div>

        {/* ── 5. Information Feeds — News · Community · AI ─────────── */}
        <div className="grid lg:grid-cols-3 gap-3" style={{ alignItems: 'stretch' }}>
          <NewsFeed />
          <CommunityFeed />
          <DashboardAIChat />
        </div>

      </div>
    </div>
  );
}
