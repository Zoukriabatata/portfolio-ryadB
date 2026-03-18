'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import {
  Activity, Grid3x3, Layers, Zap, Compass, Newspaper,
  History, Store, TrendingUp, BrainCircuit, Wifi,
  ArrowRight, Clock, CheckCircle2,
} from 'lucide-react';

// ── Custom candlestick icon ────────────────────────────────────────────────
function CandlestickSvg({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <line x1="9" y1="3" x2="9" y2="21" />
      <rect x="6" y="7" width="6" height="8" rx="1" fill="currentColor" opacity="0.15" />
      <line x1="17" y1="5" x2="17" y2="19" />
      <rect x="14" y="9" width="6" height="5" rx="1" fill="currentColor" opacity="0.15" />
    </svg>
  );
}

// ── Navigation data ────────────────────────────────────────────────────────
const SECTIONS = [
  {
    id: 'charts',
    label: 'Charts',
    description: 'Real-time market visualization',
    color: '#10b981',
    items: [
      { href: '/live',       label: 'Live',       sub: 'Candlestick & order flow', shortcut: '1', Icon: CandlestickSvg },
      { href: '/footprint',  label: 'Footprint',  sub: 'Delta & volume profile',   shortcut: '2', Icon: Grid3x3 },
      { href: '/liquidity',  label: 'Heatmap',    sub: 'Liquidity depth map',      shortcut: '3', Icon: Layers },
    ],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    description: 'Quantitative signal engine',
    color: '#06b6d4',
    items: [
      { href: '/gex',        label: 'GEX',        sub: 'Gamma exposure',           shortcut: '4', Icon: Zap },
      { href: '/volatility', label: 'Volatility', sub: 'IV surface & skew',        shortcut: '5', Icon: Activity },
      { href: '/bias',       label: 'Bias',       sub: 'Directional engine',       shortcut: '6', Icon: Compass },
      { href: '/flow',       label: 'Flow',       sub: 'Options order flow',        shortcut: '',  Icon: TrendingUp },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    description: 'Research & management',
    color: '#8b5cf6',
    items: [
      { href: '/journal',   label: 'Journal',     sub: 'Trade log & analytics',    shortcut: '8', Icon: History },
      { href: '/news',      label: 'News',        sub: 'Economic calendar',        shortcut: '7', Icon: Newspaper },
      { href: '/ai',        label: 'AI Signals',  sub: 'Agent analysis',           shortcut: '',  Icon: BrainCircuit },
      { href: '/boutique',  label: 'Data Feeds',  sub: 'Market data config',       shortcut: '0', Icon: Store },
    ],
  },
] as const;

const STATUS_ITEMS = [
  { label: 'WebSocket Feed',     ok: true },
  { label: 'Options Data',       ok: true },
  { label: 'Data Processing',    ok: true },
];

const SHORTCUTS = [
  { keys: 'Alt + 1–0', desc: 'Navigate pages' },
  { keys: '+ / −',     desc: 'Zoom chart' },
  { keys: 'Ctrl + T',  desc: 'Change theme' },
  { keys: 'Esc',       desc: 'Close panels' },
];

// ── Greeting ──────────────────────────────────────────────────────────────
function useGreeting() {
  const [greeting, setGreeting] = useState('');
  const [time, setTime] = useState('');
  useEffect(() => {
    const tick = () => {
      const h = new Date().getHours();
      setGreeting(h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening');
      setTime(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  return { greeting, time };
}

// ── NavCard ───────────────────────────────────────────────────────────────
function NavCard({
  href, label, sub, shortcut, Icon, accent,
}: {
  href: string; label: string; sub: string;
  shortcut: string; Icon: any; accent: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[var(--border)]
                 hover:border-[var(--border-light)] transition-all duration-200"
      style={{ background: 'var(--surface)' }}
    >
      {/* Icon */}
      <div
        className="flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center
                   transition-transform duration-200 group-hover:scale-105"
        style={{ background: `${accent}14`, color: accent }}
      >
        <Icon size={16} strokeWidth={1.5} />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold text-[var(--text-primary)] leading-tight">
          {label}
        </div>
        <div className="text-[10px] text-[var(--text-muted)] leading-tight mt-0.5 truncate">
          {sub}
        </div>
      </div>

      {/* Shortcut + arrow */}
      <div className="flex-shrink-0 flex items-center gap-1.5">
        {shortcut && (
          <kbd className="hidden sm:inline-flex text-[9px] font-mono px-1.5 py-0.5 rounded border
                          border-[var(--border)] text-[var(--text-dimmed)]"
            style={{ background: 'var(--surface-elevated)' }}>
            {shortcut}
          </kbd>
        )}
        <ArrowRight
          size={12}
          className="text-[var(--text-dimmed)] opacity-0 group-hover:opacity-100
                     -translate-x-1 group-hover:translate-x-0 transition-all duration-200"
        />
      </div>
    </Link>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { greeting, time } = useGreeting();

  return (
    <div className="h-full overflow-auto custom-scrollbar">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6 animate-fadeIn">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-[var(--text-primary)]">
              {greeting}, Trader
            </h1>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Ready to analyze the markets
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <Clock size={12} strokeWidth={1.5} />
            <span className="font-mono">{time}</span>
            <span className="w-px h-3 bg-[var(--border)]" />
            <div className="flex items-center gap-1.5">
              <div className="relative flex items-center justify-center w-2 h-2">
                <div className="absolute w-2 h-2 rounded-full bg-emerald-500 animate-ping opacity-30" />
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              </div>
              <span className="text-emerald-500 font-medium text-[11px]">Live</span>
            </div>
          </div>
        </div>

        {/* ── Nav Sections ─────────────────────────────────────────────── */}
        {SECTIONS.map((section) => (
          <div key={section.id}>
            {/* Section header */}
            <div className="flex items-center gap-3 mb-3">
              <div className="w-1 h-4 rounded-full" style={{ background: section.color }} />
              <div>
                <span className="text-[11px] font-bold uppercase tracking-widest"
                  style={{ color: section.color }}>
                  {section.label}
                </span>
                <span className="text-[11px] text-[var(--text-muted)] ml-2">
                  — {section.description}
                </span>
              </div>
            </div>

            {/* Cards grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {section.items.map((item) => (
                <NavCard key={item.href} {...item} accent={section.color} />
              ))}
            </div>
          </div>
        ))}

        {/* ── Bottom row: Status + Shortcuts ───────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">

          {/* Platform Status */}
          <div className="rounded-xl border border-[var(--border)] p-4"
            style={{ background: 'var(--surface)' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                Platform Status
              </span>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                style={{ background: '#10b98115', color: '#10b981' }}>
                All Operational
              </span>
            </div>
            <div className="space-y-2.5">
              {STATUS_ITEMS.map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <CheckCircle2 size={12} strokeWidth={2}
                    className={item.ok ? 'text-emerald-500' : 'text-red-400'} />
                  <span className="text-[11px] text-[var(--text-secondary)]">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Keyboard Shortcuts */}
          <div className="rounded-xl border border-[var(--border)] p-4"
            style={{ background: 'var(--surface)' }}>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] block mb-3">
              Keyboard Shortcuts
            </span>
            <div className="grid grid-cols-2 gap-y-2.5 gap-x-4">
              {SHORTCUTS.map((s) => (
                <div key={s.keys} className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-[var(--text-secondary)]">{s.desc}</span>
                  <kbd className="text-[9px] font-mono px-1.5 py-0.5 rounded border
                                  border-[var(--border)] text-[var(--text-dimmed)] whitespace-nowrap"
                    style={{ background: 'var(--surface-elevated)' }}>
                    {s.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <p className="text-[10px] text-[var(--text-dimmed)] text-center pb-2">
          Senzoukria v1.0 — Professional Order Flow Analytics
        </p>
      </div>
    </div>
  );
}
