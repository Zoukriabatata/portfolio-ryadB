'use client';
import { useEffect, useState } from 'react';
import LogoMark from '@/components/ui/brand/LogoMark';
import { useReducedMotion } from '@/components/ui/brand/useReducedMotion';

// Simulation déterministe au SSR ; jitter live côté client (post-hydratation).
const SEED: [number, number][] = [[40, 72], [55, 88], [63, 120], [140, 96], [110, 150], [175, 130], [260, 240], [95, 210], [80, 120], [60, 70], [44, 52]];
const BASE = 20375.75;
const POC = 6;
const MAX = 260;
const fmt = (n: number) => n.toLocaleString('en-US');

export default function HeroFootprint() {
  const [rows, setRows] = useState<[number, number][]>(SEED);
  const [delta, setDelta] = useState(1284);
  const [cvd, setCvd] = useState(6910);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => {
      setRows((prev) => {
        const next = prev.map((r) => [r[0], r[1]] as [number, number]);
        for (let k = 0; k < 3; k++) {
          const i = Math.floor(Math.random() * next.length);
          next[i][0] = Math.max(20, Math.min(MAX, next[i][0] + Math.round((Math.random() - 0.5) * 18)));
          next[i][1] = Math.max(20, Math.min(MAX, next[i][1] + Math.round((Math.random() - 0.5) * 18)));
        }
        return next;
      });
      setDelta(1284 + Math.round((Math.random() - 0.4) * 130));
      setCvd(6910 + Math.round((Math.random() - 0.3) * 220));
    }, 1700);
    return () => clearInterval(id);
  }, [reduced]);

  return (
    <>
      {/* Title bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06]" style={{ background: 'rgba(255,255,255,0.015)' }}>
        <LogoMark size={14} minimal animated={false} />
        <span className="font-mono text-[10px]" style={{ color: 'var(--text-secondary)' }}>MNQ M6 · 1m · Footprint</span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="relative inline-flex w-1.5 h-1.5">
            <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
            <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-emerald-400" />
          </span>
          <span className="font-mono text-[9px]" style={{ color: 'var(--primary)' }}>LIVE</span>
        </div>
      </div>

      {/* Rows — bid (red, right) | price | ask (green, left), POC surligné */}
      <div className="px-3.5 py-3 font-mono">
        {rows.map((r, i) => {
          const px = (BASE - i * 0.25).toFixed(2);
          const bw = Math.round((r[0] / MAX) * 100);
          const aw = Math.round((r[1] / MAX) * 100);
          const poc = i === POC;
          return (
            <div key={i} className="grid items-center gap-2" style={{ gridTemplateColumns: '1fr 54px 1fr', height: 16 }}>
              <div className="relative h-[11px] overflow-hidden rounded-[2px]">
                <div className="absolute top-0 bottom-0 right-0" style={{ width: `${bw}%`, background: 'linear-gradient(90deg, rgba(240,79,79,0), rgba(240,79,79,0.6))', transition: 'width 1.1s cubic-bezier(.22,1,.36,1)' }} />
                <span className="absolute right-[5px] top-0 text-[8px] leading-[11px] tabular-nums" style={{ color: 'rgba(245,150,150,0.95)' }}>{r[0]}</span>
              </div>
              <div className="text-center text-[9px]" style={poc ? { color: '#07080f', background: 'var(--primary)', borderRadius: 3, fontWeight: 600 } : { color: 'var(--text-muted)' }}>{px}</div>
              <div className="relative h-[11px] overflow-hidden rounded-[2px]">
                <div className="absolute top-0 bottom-0 left-0" style={{ width: `${aw}%`, background: 'linear-gradient(90deg, rgb(var(--primary-rgb) / 0.6), rgb(var(--primary-rgb) / 0))', transition: 'width 1.1s cubic-bezier(.22,1,.36,1)' }} />
                <span className="absolute left-[5px] top-0 text-[8px] leading-[11px] tabular-nums" style={{ color: 'rgba(134,239,172,0.95)' }}>{r[1]}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer — Σ Delta / POC / CVD */}
      <div className="flex justify-between px-3.5 py-2 border-t border-white/[0.06] font-mono text-[9px]" style={{ color: 'var(--text-muted)' }}>
        <span>Σ Delta <b className="tabular-nums" style={{ color: 'var(--primary)', fontWeight: 500 }}>+{fmt(delta)}</b></span>
        <span>POC 20,374.25</span>
        <span>CVD <b className="tabular-nums" style={{ color: 'var(--primary)', fontWeight: 500 }}>↑ +{fmt(cvd)}</b></span>
      </div>
    </>
  );
}
