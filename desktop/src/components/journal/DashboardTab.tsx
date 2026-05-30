// Dashboard (Day 4) — analytics on the local journal.
// All charts are pure SVG built from the trade list (no dep). Refetches
// when the route mounts; analytics are pure functions over `entries`.

import { useEffect, useMemo, useState } from "react";
import { listTrades } from "../../lib/journal/api";
import { formatCurrency } from "../../lib/journal/format";
import type { JournalEntry } from "../../types/journal";

const SENZ = "#7ed321";
const SENZ_DIM = "rgba(126, 211, 33, 0.18)";
const NEG = "#ffffff";

export default function DashboardTab() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Pull a big window — analytics span everything we've got.
    listTrades({ limit: 5000, offset: 0 })
      .then((r) => {
        if (!cancelled) setEntries(r.entries);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const closed = useMemo(
    () => entries.filter((e) => e.pnl !== null).sort((a, b) => a.entryTime.localeCompare(b.entryTime)),
    [entries],
  );
  const stats = useMemo(() => computeStats(closed), [closed]);
  const equity = useMemo(() => computeEquity(closed), [closed]);
  const dayOfWeek = useMemo(() => computeByDayOfWeek(closed), [closed]);
  const setupAgg = useMemo(() => computeBySetup(closed), [closed]);
  const symbolAgg = useMemo(() => computeBySymbol(closed), [closed]);

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto h-full overflow-y-auto space-y-4">
        <div className="j-skeleton" style={{ height: 96 }} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="j-skeleton" style={{ height: 240 }} />
          <div className="j-skeleton" style={{ height: 240 }} />
        </div>
      </div>
    );
  }

  if (closed.length === 0) {
    return (
      <div className="p-6 max-w-6xl mx-auto h-full overflow-y-auto">
        <div className="j-empty">
          <div className="j-empty-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          </div>
          <div className="j-empty-title">No closed trades yet</div>
          <div className="j-empty-sub">Log a trade (or import a CSV) to see analytics.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto h-full overflow-y-auto space-y-5">
      {/* KPI row */}
      <div className="j-stat-row">
        <div className="j-stat">
          <div className="j-stat-label">Net P&L</div>
          <div className={`j-stat-value ${stats.totalPnl >= 0 ? "is-pos" : "is-neg"}`}>
            {formatCurrency(stats.totalPnl)}
          </div>
          <div className="j-stat-sub">{closed.length} closed trades</div>
        </div>
        <div className="j-stat">
          <div className="j-stat-label">Win Rate</div>
          <div className="j-stat-value">{stats.winRate.toFixed(1)}%</div>
          <div className="j-stat-sub">
            <span style={{ color: SENZ }}>{stats.wins}W</span>
            <span className="opacity-30 mx-1">·</span>
            <span>{stats.losses}L</span>
          </div>
        </div>
        <div className="j-stat">
          <div className="j-stat-label">Profit Factor</div>
          <div className="j-stat-value">
            {stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)}
          </div>
          <div className="j-stat-sub">gross win / loss</div>
        </div>
        <div className="j-stat">
          <div className="j-stat-label">Streak</div>
          <div className="j-stat-value">
            <span style={{ color: stats.currentStreak >= 0 ? SENZ : NEG }}>
              {stats.currentStreak >= 0 ? "+" : ""}
              {stats.currentStreak}
            </span>
          </div>
          <div className="j-stat-sub">
            best <span style={{ color: SENZ }}>+{stats.bestStreak}</span>
            <span className="opacity-30 mx-1">·</span>
            worst <span>{stats.worstStreak}</span>
          </div>
        </div>
      </div>

      {/* Equity curve full-width */}
      <Card title="Equity Curve" subtitle="Cumulative P&L over closed trades">
        <EquityCurve points={equity} />
      </Card>

      {/* P&L by day-of-week + win rate by setup */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="P&L by Day of Week" subtitle="Weekday breakdown — UTC entry time">
          <DayOfWeekBars rows={dayOfWeek} />
        </Card>
        <Card title="Win Rate by Setup" subtitle={`${setupAgg.length} setup${setupAgg.length === 1 ? "" : "s"} tracked`}>
          <SetupBars rows={setupAgg} />
        </Card>
      </div>

      {/* Symbol breakdown full-width */}
      <Card title="Symbol Breakdown" subtitle="Trades, win rate, and P&L per symbol">
        <SymbolTable rows={symbolAgg} />
      </Card>
    </div>
  );
}

// ── Reusable card ──────────────────────────────────────────────────────

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.010))",
        border: "1px solid rgba(160, 160, 160, 0.14)",
      }}
    >
      <div className="mb-3">
        <div className="text-sm font-semibold text-white">{title}</div>
        {subtitle && <div className="text-[11px] text-white/55 mt-0.5">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

// ── Equity curve (SVG line + filled area) ─────────────────────────────

function EquityCurve({ points }: { points: { t: number; pnl: number }[] }) {
  const W = 720;
  const H = 220;
  const PAD = { l: 50, r: 12, t: 12, b: 26 };
  if (points.length < 2) {
    return <div className="text-xs text-white/40 text-center py-8">Not enough data</div>;
  }
  const xs = points.map((p) => p.t);
  const ys = points.map((p) => p.pnl);
  const xMin = xs[0];
  const xMax = xs[xs.length - 1];
  const yMin = Math.min(0, ...ys);
  const yMax = Math.max(0, ...ys);
  const yPad = (yMax - yMin) * 0.08 || 1;
  const yLo = yMin - yPad;
  const yHi = yMax + yPad;

  const sx = (t: number) => PAD.l + ((t - xMin) / (xMax - xMin || 1)) * (W - PAD.l - PAD.r);
  const sy = (v: number) => PAD.t + (1 - (v - yLo) / (yHi - yLo || 1)) * (H - PAD.t - PAD.b);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.t).toFixed(1)},${sy(p.pnl).toFixed(1)}`).join(" ");
  const area = `${line} L${sx(xMax).toFixed(1)},${sy(0).toFixed(1)} L${sx(xMin).toFixed(1)},${sy(0).toFixed(1)} Z`;

  const lastPnl = points[points.length - 1].pnl;
  const lineColor = lastPnl >= 0 ? SENZ : NEG;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
      {/* Zero baseline */}
      <line x1={PAD.l} y1={sy(0)} x2={W - PAD.r} y2={sy(0)} stroke="rgba(255,255,255,0.10)" strokeDasharray="2 4" />
      {/* Y ticks (3 levels) */}
      {[yLo, (yLo + yHi) / 2, yHi].map((v, i) => (
        <g key={i}>
          <text x={PAD.l - 6} y={sy(v) + 4} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.40)">
            {formatCurrency(v)}
          </text>
        </g>
      ))}
      <path d={area} fill={SENZ_DIM} opacity={lastPnl >= 0 ? 1 : 0.3} />
      <path d={line} fill="none" stroke={lineColor} strokeWidth={1.6} />
      {/* X ticks: first + last */}
      <text x={PAD.l} y={H - 6} fontSize="10" fill="rgba(255,255,255,0.40)">
        {new Date(xMin).toLocaleDateString()}
      </text>
      <text x={W - PAD.r} y={H - 6} fontSize="10" fill="rgba(255,255,255,0.40)" textAnchor="end">
        {new Date(xMax).toLocaleDateString()}
      </text>
    </svg>
  );
}

// ── Day-of-week bars ───────────────────────────────────────────────────

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function DayOfWeekBars({ rows }: { rows: { pnl: number; count: number }[] }) {
  const W = 360;
  const H = 200;
  const PAD = { l: 36, r: 8, t: 12, b: 24 };
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.pnl)));
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const colW = innerW / 7;
  const zeroY = PAD.t + innerH / 2;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
      <line x1={PAD.l} y1={zeroY} x2={W - PAD.r} y2={zeroY} stroke="rgba(255,255,255,0.10)" />
      {rows.map((r, i) => {
        if (r.count === 0) return null;
        const x = PAD.l + i * colW + colW * 0.18;
        const w = colW * 0.64;
        const h = (Math.abs(r.pnl) / max) * (innerH / 2 - 4);
        const y = r.pnl >= 0 ? zeroY - h : zeroY;
        const color = r.pnl >= 0 ? SENZ : NEG;
        return (
          <g key={i}>
            <rect x={x} y={y} width={w} height={h} fill={color} opacity={0.85} rx={2} />
            <text x={x + w / 2} y={H - 8} fontSize="10" fill="rgba(255,255,255,0.55)" textAnchor="middle">
              {DOW[i]}
            </text>
            <text x={x + w / 2} y={r.pnl >= 0 ? y - 4 : y + h + 11} fontSize="9" fill="rgba(255,255,255,0.55)" textAnchor="middle">
              {r.count}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Setup horizontal bars ──────────────────────────────────────────────

function SetupBars({ rows }: { rows: { setup: string; winRate: number; total: number; pnl: number }[] }) {
  if (rows.length === 0) {
    return <div className="text-xs text-white/40 text-center py-8">No tagged trades yet</div>;
  }
  return (
    <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
      {rows.map((r) => (
        <div key={r.setup}>
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="text-white/85 font-medium truncate">{r.setup}</span>
            <span className="font-mono">
              <span className="text-white/40">{r.total} · </span>
              <span style={{ color: r.pnl >= 0 ? SENZ : NEG }}>{formatCurrency(r.pnl)}</span>
            </span>
          </div>
          <div className="relative h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div
              className="absolute inset-y-0 left-0"
              style={{
                width: `${r.winRate}%`,
                background: SENZ,
                boxShadow: `0 0 8px ${SENZ}55`,
              }}
            />
          </div>
          <div className="text-[10px] text-white/40 mt-0.5">{r.winRate.toFixed(0)}% win rate</div>
        </div>
      ))}
    </div>
  );
}

// ── Symbol table ───────────────────────────────────────────────────────

function SymbolTable({ rows }: { rows: { symbol: string; total: number; wins: number; winRate: number; pnl: number }[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <Th>Symbol</Th>
            <Th align="right">Trades</Th>
            <Th align="right">Win rate</Th>
            <Th align="right">Net P&L</Th>
            <Th align="right">Avg / trade</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.symbol} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
              <Td><span className="font-mono font-bold text-white">{r.symbol}</span></Td>
              <Td align="right" className="text-white/62">{r.total}</Td>
              <Td align="right" className="text-white">{r.winRate.toFixed(0)}%</Td>
              <Td align="right" className="font-mono" color={r.pnl >= 0 ? SENZ : NEG}>
                {formatCurrency(r.pnl)}
              </Td>
              <Td align="right" className="font-mono" color={r.pnl >= 0 ? SENZ : NEG}>
                {formatCurrency(r.pnl / Math.max(1, r.total))}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      style={{
        textAlign: align,
        padding: "8px 10px",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.42)",
      }}
    >
      {children}
    </th>
  );
}
function Td({ children, align = "left", color, className }: { children: React.ReactNode; align?: "left" | "right"; color?: string; className?: string }) {
  return (
    <td
      className={className}
      style={{ textAlign: align, padding: "8px 10px", color: color ?? undefined }}
    >
      {children}
    </td>
  );
}

// ── Pure computation ───────────────────────────────────────────────────

function computeStats(trades: JournalEntry[]) {
  let totalPnl = 0;
  let wins = 0;
  let losses = 0;
  let grossWin = 0;
  let grossLoss = 0;
  for (const t of trades) {
    if (t.pnl === null) continue;
    totalPnl += t.pnl;
    if (t.pnl > 0) {
      wins++;
      grossWin += t.pnl;
    } else if (t.pnl < 0) {
      losses++;
      grossLoss += -t.pnl;
    }
  }
  const closed = wins + losses;
  const winRate = closed > 0 ? (wins / closed) * 100 : 0;
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;

  // Streak: walk in chronological order (trades already sorted).
  let currentStreak = 0;
  let bestStreak = 0;
  let worstStreak = 0;
  let s = 0;
  for (const t of trades) {
    if (t.pnl === null || t.pnl === 0) continue;
    if (t.pnl > 0) s = s > 0 ? s + 1 : 1;
    else s = s < 0 ? s - 1 : -1;
    currentStreak = s;
    if (s > bestStreak) bestStreak = s;
    if (s < worstStreak) worstStreak = s;
  }

  return { totalPnl, wins, losses, winRate, profitFactor, currentStreak, bestStreak, worstStreak };
}

function computeEquity(trades: JournalEntry[]): { t: number; pnl: number }[] {
  const out: { t: number; pnl: number }[] = [];
  let cum = 0;
  for (const t of trades) {
    if (t.pnl === null) continue;
    cum += t.pnl;
    const time = new Date(t.entryTime).getTime();
    if (Number.isFinite(time)) out.push({ t: time, pnl: cum });
  }
  return out;
}

function computeByDayOfWeek(trades: JournalEntry[]): { pnl: number; count: number }[] {
  const buckets = Array.from({ length: 7 }, () => ({ pnl: 0, count: 0 }));
  for (const t of trades) {
    if (t.pnl === null) continue;
    const d = new Date(t.entryTime).getUTCDay();
    buckets[d].pnl += t.pnl;
    buckets[d].count += 1;
  }
  return buckets;
}

function computeBySetup(trades: JournalEntry[]) {
  const m = new Map<string, { wins: number; total: number; pnl: number }>();
  for (const t of trades) {
    if (t.pnl === null) continue;
    const key = (t.setup ?? "").trim() || "Untagged";
    const cur = m.get(key) ?? { wins: 0, total: 0, pnl: 0 };
    cur.total += 1;
    cur.pnl += t.pnl;
    if (t.pnl > 0) cur.wins += 1;
    m.set(key, cur);
  }
  return Array.from(m.entries())
    .map(([setup, v]) => ({
      setup,
      total: v.total,
      pnl: v.pnl,
      winRate: v.total > 0 ? (v.wins / v.total) * 100 : 0,
    }))
    .sort((a, b) => b.pnl - a.pnl)
    .slice(0, 12);
}

function computeBySymbol(trades: JournalEntry[]) {
  const m = new Map<string, { wins: number; total: number; pnl: number }>();
  for (const t of trades) {
    if (t.pnl === null) continue;
    const cur = m.get(t.symbol) ?? { wins: 0, total: 0, pnl: 0 };
    cur.total += 1;
    cur.pnl += t.pnl;
    if (t.pnl > 0) cur.wins += 1;
    m.set(t.symbol, cur);
  }
  return Array.from(m.entries())
    .map(([symbol, v]) => ({
      symbol,
      total: v.total,
      wins: v.wins,
      winRate: v.total > 0 ? (v.wins / v.total) * 100 : 0,
      pnl: v.pnl,
    }))
    .sort((a, b) => b.pnl - a.pnl)
    .slice(0, 15);
}
