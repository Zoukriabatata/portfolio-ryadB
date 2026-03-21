'use client';

import { useState } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface FootprintCell {
  bid: number;
  ask: number;
  highlight?: 'absorption' | 'imbalance' | 'neutral';
}

interface CandleData {
  open: number;
  high: number;
  low: number;
  close: number;
  cells: FootprintCell[]; // indexed bottom→top
  priceLow: number;
}

interface ProfileLevel {
  price: number;
  volume: number;
  delta: number; // positive = buy dominated
}

interface CVDBar {
  value: number;
}

interface ChartExample {
  id: string;
  title: string;
  subtitle: string;
  type: 'long' | 'short';
  timeframe: string;
  instrument: string;
  confluences: string[];
  candles: CandleData[];
  profile: ProfileLevel[];
  cvd: CVDBar[];
  vwapPrice: number;
  vpocPrice: number;
  vahPrice: number;
  valPrice: number;
  entryPrice: number;
  targetPrice: number;
  stopPrice: number;
  entryCandle: number; // index
  annotations: AnnotationItem[];
  narrative: string[];
}

interface AnnotationItem {
  label: string;
  text: string;
  color: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CHART_W = 880;
const CHART_H = 420;
const PROFILE_W = 100;
const CVD_H = 100;
const TOTAL_W = CHART_W + PROFILE_W + 60;
const TOTAL_H = CHART_H + CVD_H + 40;
const PRICE_AXIS_W = 55;
const CANDLE_GAP = 4;

const C = {
  bg: '#07080f',
  surface: '#0d0f1b',
  border: 'rgba(255,255,255,0.07)',
  grid: 'rgba(255,255,255,0.04)',
  textPrimary: '#e8eaf6',
  textSecondary: '#8890b0',
  textMuted: '#515878',
  bull: '#22c55e',
  bear: '#ef4444',
  bullDim: 'rgba(34,197,94,0.25)',
  bearDim: 'rgba(239,68,68,0.25)',
  bullBg: 'rgba(34,197,94,0.08)',
  bearBg: 'rgba(239,68,68,0.08)',
  accent: '#6366f1',
  vwap: '#3b82f6',
  vpoc: '#a78bfa',
  vah: '#f59e0b',
  val: '#f59e0b',
  entry: '#6366f1',
  target: '#22c55e',
  stop: '#ef4444',
  absorption: '#f59e0b',
  imbalance: '#ef4444',
};

/* ------------------------------------------------------------------ */
/*  Example data                                                       */
/* ------------------------------------------------------------------ */

const EXAMPLES: ChartExample[] = [
  {
    id: 'absorption-bounce',
    title: 'Absorption Bounce — Long Entry at VAL',
    subtitle: 'MNQ 300T • Footprint + CVD divergence + Volume Profile confluence',
    type: 'long',
    timeframe: '300 Tick',
    instrument: 'MNQ (Micro Nasdaq)',
    confluences: ['Absorption au bid', 'CVD divergence bullish', 'VAL support', 'Volume Profile POC target'],
    vwapPrice: 25668,
    vpocPrice: 25670,
    vahPrice: 25673,
    valPrice: 25660,
    entryPrice: 25662,
    targetPrice: 25670,
    stopPrice: 25657,
    entryCandle: 8,
    candles: [
      { open: 25672, high: 25673, low: 25669, close: 25670, priceLow: 25669, cells: [{ bid: 22, ask: 19, highlight: 'neutral' }, { bid: 15, ask: 30, highlight: 'neutral' }, { bid: 10, ask: 17 }, { bid: 20, ask: 27 }] },
      { open: 25670, high: 25671, low: 25667, close: 25668, priceLow: 25667, cells: [{ bid: 28, ask: 22 }, { bid: 14, ask: 12 }, { bid: 21, ask: 19 }, { bid: 15, ask: 20 }] },
      { open: 25668, high: 25669, low: 25664, close: 25665, priceLow: 25664, cells: [{ bid: 25, ask: 14 }, { bid: 12, ask: 20 }, { bid: 7, ask: 30, highlight: 'imbalance' }, { bid: 14, ask: 25, highlight: 'imbalance' }, { bid: 22, ask: 36 }] },
      { open: 25665, high: 25666, low: 25661, close: 25662, priceLow: 25661, cells: [{ bid: 38, ask: 22, highlight: 'absorption' }, { bid: 25, ask: 14, highlight: 'absorption' }, { bid: 21, ask: 11 }, { bid: 12, ask: 20 }, { bid: 4, ask: 15 }] },
      { open: 25662, high: 25663, low: 25659, close: 25660, priceLow: 25659, cells: [{ bid: 42, ask: 10, highlight: 'absorption' }, { bid: 35, ask: 8, highlight: 'absorption' }, { bid: 28, ask: 12, highlight: 'absorption' }, { bid: 18, ask: 15 }] },
      { open: 25660, high: 25661, low: 25658, close: 25659, priceLow: 25658, cells: [{ bid: 45, ask: 6, highlight: 'absorption' }, { bid: 38, ask: 9, highlight: 'absorption' }, { bid: 18, ask: 42, highlight: 'imbalance' }] },
      { open: 25659, high: 25662, low: 25658, close: 25661, priceLow: 25658, cells: [{ bid: 26, ask: 36 }, { bid: 9, ask: 10 }, { bid: 15, ask: 20 }, { bid: 24, ask: 21 }] },
      { open: 25661, high: 25663, low: 25660, close: 25662, priceLow: 25660, cells: [{ bid: 31, ask: 5, highlight: 'absorption' }, { bid: 23, ask: 13 }, { bid: 6, ask: 13 }] },
      { open: 25662, high: 25665, low: 25661, close: 25665, priceLow: 25661, cells: [{ bid: 15, ask: 20 }, { bid: 23, ask: 28 }, { bid: 4, ask: 21 }, { bid: 1, ask: 10 }] },
      { open: 25665, high: 25668, low: 25664, close: 25667, priceLow: 25664, cells: [{ bid: 6, ask: 13 }, { bid: 15, ask: 24 }, { bid: 23, ask: 33 }, { bid: 1, ask: 15 }] },
      { open: 25667, high: 25670, low: 25666, close: 25669, priceLow: 25666, cells: [{ bid: 8, ask: 10 }, { bid: 12, ask: 20 }, { bid: 18, ask: 28 }, { bid: 5, ask: 15 }] },
      { open: 25669, high: 25672, low: 25668, close: 25671, priceLow: 25668, cells: [{ bid: 10, ask: 8 }, { bid: 14, ask: 22 }, { bid: 20, ask: 30 }, { bid: 5, ask: 12 }] },
    ],
    profile: [
      { price: 25673, volume: 380, delta: 50 },
      { price: 25672, volume: 520, delta: 80 },
      { price: 25671, volume: 680, delta: 120 },
      { price: 25670, volume: 1250, delta: 180 },
      { price: 25669, volume: 890, delta: 90 },
      { price: 25668, volume: 780, delta: -40 },
      { price: 25667, volume: 650, delta: -80 },
      { price: 25666, volume: 420, delta: -60 },
      { price: 25665, volume: 580, delta: -30 },
      { price: 25664, volume: 350, delta: -100 },
      { price: 25663, volume: 280, delta: -50 },
      { price: 25662, volume: 450, delta: 40 },
      { price: 25661, volume: 520, delta: 120 },
      { price: 25660, volume: 680, delta: 250 },
      { price: 25659, volume: 480, delta: 180 },
      { price: 25658, volume: 320, delta: 80 },
      { price: 25657, volume: 180, delta: 20 },
    ],
    cvd: [
      { value: 0 }, { value: -120 }, { value: -380 }, { value: -620 },
      { value: -550 }, { value: -480 }, { value: -400 }, { value: -350 },
      { value: -200 }, { value: -50 }, { value: 120 }, { value: 280 },
    ],
    annotations: [
      { label: 'Absorption', text: 'Bid vol >> Ask vol sur 25658-25660. Les passifs achètent massivement (45×6, 38×9, 42×10). Square-root law : 2800 lots → seulement 2 ticks de mouvement.', color: C.absorption },
      { label: 'CVD Divergence', text: 'Prix fait lower low (25658) mais CVD fait higher low (-480 vs -620). Divergence bullish = accumulation cachée. Le flow Hawkes se retourne.', color: C.bull },
      { label: 'Imbalance Sell', text: 'Candles 3-4 : ask vol 3-4× bid vol (30×7, 25×14). C\'est la pression vendeuse qui sera absorbée. Le delta négatif extrême précède l\'absorption.', color: C.imbalance },
      { label: 'Entry Signal', text: 'Candle 9 : premier close au-dessus du point d\'absorption + CVD qui repasse en positif. Delta flip confirmed. Entry au break de 25665.', color: C.entry },
    ],
    narrative: [
      '1. Le prix descend depuis VAH (25673) vers VAL (25660) avec des imbalances sell (candles rouge avec ask >> bid).',
      '2. Au niveau VAL, les bids passifs apparaissent : 42×10, 45×6, 38×9 — c\'est l\'absorption. Le volume est énorme mais le prix bouge à peine.',
      '3. Le CVD touche -620 puis commence à remonter malgré un prix qui fait encore un lower low → divergence bullish.',
      '4. Candle 7-8 : le delta flip (négatif → positif). Les buyers agressifs prennent le relais. Entry sur la candle 9 qui break 25665.',
      '5. Target : vPOC à 25670 (le volume profile montre le gros cluster là). Stop sous le bas de l\'absorption (25657).',
    ],
  },
  {
    id: 'selling-cascade',
    title: 'Selling Cascade — Short Entry at VAH Rejection',
    subtitle: 'MNQ 300T • Imbalance stacking + VWAP rejection + CVD breakdown',
    type: 'short',
    timeframe: '300 Tick',
    instrument: 'MNQ (Micro Nasdaq)',
    confluences: ['Imbalance sell stacking', 'VWAP rejection', 'CVD breakdown', 'Ask wall descending on heatmap'],
    vwapPrice: 25668,
    vpocPrice: 25665,
    vahPrice: 25672,
    valPrice: 25660,
    entryPrice: 25670,
    targetPrice: 25662,
    stopPrice: 25674,
    entryCandle: 5,
    candles: [
      { open: 25664, high: 25666, low: 25663, close: 25665, priceLow: 25663, cells: [{ bid: 18, ask: 12 }, { bid: 22, ask: 15 }, { bid: 10, ask: 8 }] },
      { open: 25665, high: 25668, low: 25664, close: 25667, priceLow: 25664, cells: [{ bid: 12, ask: 20 }, { bid: 8, ask: 15 }, { bid: 14, ask: 22 }, { bid: 5, ask: 10 }] },
      { open: 25667, high: 25670, low: 25666, close: 25669, priceLow: 25666, cells: [{ bid: 10, ask: 14 }, { bid: 15, ask: 25 }, { bid: 8, ask: 18 }, { bid: 6, ask: 12 }] },
      { open: 25669, high: 25672, low: 25668, close: 25671, priceLow: 25668, cells: [{ bid: 8, ask: 15 }, { bid: 12, ask: 20 }, { bid: 5, ask: 10 }, { bid: 3, ask: 8 }] },
      { open: 25671, high: 25673, low: 25670, close: 25672, priceLow: 25670, cells: [{ bid: 5, ask: 28, highlight: 'imbalance' }, { bid: 8, ask: 35, highlight: 'imbalance' }, { bid: 3, ask: 12 }] },
      { open: 25672, high: 25673, low: 25669, close: 25670, priceLow: 25669, cells: [{ bid: 12, ask: 45, highlight: 'imbalance' }, { bid: 8, ask: 38, highlight: 'imbalance' }, { bid: 15, ask: 42, highlight: 'imbalance' }, { bid: 20, ask: 25 }] },
      { open: 25670, high: 25671, low: 25667, close: 25668, priceLow: 25667, cells: [{ bid: 18, ask: 30, highlight: 'imbalance' }, { bid: 22, ask: 35, highlight: 'imbalance' }, { bid: 28, ask: 32 }, { bid: 15, ask: 20 }] },
      { open: 25668, high: 25669, low: 25665, close: 25666, priceLow: 25665, cells: [{ bid: 20, ask: 28 }, { bid: 25, ask: 30 }, { bid: 30, ask: 35 }, { bid: 18, ask: 22 }] },
      { open: 25666, high: 25667, low: 25663, close: 25664, priceLow: 25663, cells: [{ bid: 22, ask: 25 }, { bid: 28, ask: 32 }, { bid: 30, ask: 38 }, { bid: 15, ask: 20 }] },
      { open: 25664, high: 25665, low: 25661, close: 25662, priceLow: 25661, cells: [{ bid: 25, ask: 28 }, { bid: 30, ask: 35 }, { bid: 35, ask: 40 }, { bid: 20, ask: 25 }] },
    ],
    profile: [
      { price: 25673, volume: 180, delta: -40 },
      { price: 25672, volume: 380, delta: -120 },
      { price: 25671, volume: 520, delta: -80 },
      { price: 25670, volume: 650, delta: -180 },
      { price: 25669, volume: 480, delta: -90 },
      { price: 25668, volume: 780, delta: 40 },
      { price: 25667, volume: 620, delta: 60 },
      { price: 25666, volume: 550, delta: 30 },
      { price: 25665, volume: 1100, delta: 150 },
      { price: 25664, volume: 480, delta: 80 },
      { price: 25663, volume: 350, delta: 40 },
      { price: 25662, volume: 280, delta: 20 },
      { price: 25661, volume: 200, delta: 10 },
    ],
    cvd: [
      { value: 200 }, { value: 350 }, { value: 480 }, { value: 520 },
      { value: 400 }, { value: 180 }, { value: -50 }, { value: -280 },
      { value: -480 }, { value: -680 },
    ],
    annotations: [
      { label: 'Imbalance Sell', text: 'Candles 5-7 : ask vol 3-5× bid vol sur 3 niveaux consécutifs (45×12, 38×8, 42×15). Selling cascade Hawkes — chaque sell trigger 0.5 child sells.', color: C.imbalance },
      { label: 'VWAP Rejection', text: 'Le prix touche VAH (25672-73), rejette, et repasse sous le VWAP (25668). La pente du VWAP est plate → pas de biais directionnel des institutions.', color: C.vwap },
      { label: 'CVD Breakdown', text: 'CVD passe de +520 à -680. Pas de divergence ici — le CVD CONFIRME la vente. Quand CVD et prix descendent ensemble = trend, pas un piège.', color: C.bear },
      { label: 'Entry Signal', text: 'Candle 6 : close sous 25670 avec imbalance sell sur 3 niveaux. Le CVD croise zéro. Short entry à 25670, target vPOC 25665 → VAL 25662.', color: C.entry },
    ],
    narrative: [
      '1. Le prix monte progressivement de 25664 vers VAH à 25672. Le CVD monte aussi — move légitime.',
      '2. Au VAH (25672-73), EXPLOSION de sells : ask vol de 28, 35, 45, 38, 42 vs bid vol de 3-12. Imbalance sell 3-5×.',
      '3. Le VWAP (25668) est cassé à la baisse. Le CVD croise zéro et accélère en négatif — confirmation.',
      '4. Entry short sur la candle 6 (close 25670 après le rejet). Le footprint montre que les sellers contrôlent chaque niveau.',
      '5. Target : vPOC à 25665 (prise partielle) puis VAL à 25660 (full target). Stop au-dessus du VAH à 25674.',
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Rendering helpers                                                  */
/* ------------------------------------------------------------------ */

function priceToY(price: number, minP: number, maxP: number, top: number, height: number): number {
  return top + height - ((price - minP) / (maxP - minP)) * height;
}

/* ------------------------------------------------------------------ */
/*  SVG Chart renderer                                                 */
/* ------------------------------------------------------------------ */

function AtasChart({ example }: { example: ChartExample }) {
  const { candles, profile, cvd } = example;

  // Price range
  const allPrices = candles.flatMap((c) => [c.high, c.low]);
  profile.forEach((p) => allPrices.push(p.price));
  allPrices.push(example.entryPrice, example.targetPrice, example.stopPrice);
  const minP = Math.min(...allPrices) - 1;
  const maxP = Math.max(...allPrices) + 1;

  const chartLeft = 10;
  const chartTop = 20;
  const chartRight = CHART_W - PRICE_AXIS_W;
  const chartWidth = chartRight - chartLeft;
  const chartHeight = CHART_H - 30;

  const candleW = Math.min(70, (chartWidth - candles.length * CANDLE_GAP) / candles.length);
  const totalCandleSpace = candles.length * (candleW + CANDLE_GAP);
  const candleStartX = chartLeft + (chartWidth - totalCandleSpace) / 2;

  const pY = (price: number) => priceToY(price, minP, maxP, chartTop, chartHeight);

  // CVD range
  const cvdMin = Math.min(...cvd.map((c) => c.value));
  const cvdMax = Math.max(...cvd.map((c) => c.value));
  const cvdRange = Math.max(Math.abs(cvdMin), Math.abs(cvdMax)) || 1;
  const cvdTop = CHART_H + 10;
  const cvdHeight = CVD_H - 20;
  const cvdZeroY = cvdTop + cvdHeight / 2;

  // Profile range
  const maxVol = Math.max(...profile.map((p) => p.volume));
  const profileLeft = chartRight + PRICE_AXIS_W + 5;

  // Grid prices
  const gridStep = Math.ceil((maxP - minP) / 8);
  const gridPrices: number[] = [];
  for (let p = Math.ceil(minP); p <= maxP; p += gridStep) gridPrices.push(p);

  return (
    <svg
      viewBox={`0 0 ${TOTAL_W} ${TOTAL_H}`}
      className="w-full"
      style={{ maxHeight: 560 }}
    >
      {/* Background */}
      <rect width={TOTAL_W} height={TOTAL_H} fill={C.bg} rx="8" />

      {/* Grid lines */}
      {gridPrices.map((p) => (
        <g key={p}>
          <line x1={chartLeft} y1={pY(p)} x2={chartRight} y2={pY(p)} stroke={C.grid} strokeWidth="1" />
          <text x={chartRight + 5} y={pY(p) + 4} fill={C.textMuted} fontSize="9" fontFamily="monospace">
            {p.toLocaleString()}
          </text>
        </g>
      ))}

      {/* ── Level lines (VWAP, vPOC, VAH, VAL) ── */}
      {[
        { price: example.vwapPrice, color: C.vwap, label: 'VWAP', dash: '4,3' },
        { price: example.vpocPrice, color: C.vpoc, label: 'vPOC', dash: '6,3' },
        { price: example.vahPrice, color: C.vah, label: 'VAH', dash: '3,3' },
        { price: example.valPrice, color: C.val, label: 'VAL', dash: '3,3' },
      ].map((lv) => (
        <g key={lv.label}>
          <line
            x1={chartLeft} y1={pY(lv.price)} x2={chartRight} y2={pY(lv.price)}
            stroke={lv.color} strokeWidth="1" strokeDasharray={lv.dash} opacity={0.6}
          />
          <rect x={chartRight + 2} y={pY(lv.price) - 7} width={50} height={14} rx="2" fill={lv.color} opacity={0.15} />
          <text x={chartRight + 5} y={pY(lv.price) + 3} fill={lv.color} fontSize="8" fontWeight="bold" fontFamily="monospace">
            {lv.label}
          </text>
        </g>
      ))}

      {/* ── Entry / Target / Stop lines ── */}
      {[
        { price: example.entryPrice, color: C.entry, label: 'ENTRY →' },
        { price: example.targetPrice, color: C.target, label: 'TARGET ◎' },
        { price: example.stopPrice, color: C.stop, label: 'STOP ✕' },
      ].map((lv) => (
        <g key={lv.label}>
          <line
            x1={chartLeft} y1={pY(lv.price)} x2={chartRight} y2={pY(lv.price)}
            stroke={lv.color} strokeWidth="1.5" strokeDasharray="8,4" opacity={0.8}
          />
          <rect x={chartLeft} y={pY(lv.price) - 8} width={58} height={16} rx="3" fill={lv.color} opacity={0.2} />
          <text x={chartLeft + 4} y={pY(lv.price) + 4} fill={lv.color} fontSize="8" fontWeight="bold" fontFamily="monospace">
            {lv.label}
          </text>
        </g>
      ))}

      {/* ── Candles with footprint cells ── */}
      {candles.map((candle, ci) => {
        const x = candleStartX + ci * (candleW + CANDLE_GAP);
        const isUp = candle.close >= candle.open;
        const bodyTop = pY(Math.max(candle.open, candle.close));
        const bodyBot = pY(Math.min(candle.open, candle.close));
        const bodyH = Math.max(bodyBot - bodyTop, 1);
        const color = isUp ? C.bull : C.bear;
        const bgColor = isUp ? C.bullBg : C.bearBg;

        return (
          <g key={ci}>
            {/* Candle background */}
            <rect x={x} y={pY(candle.high)} width={candleW} height={pY(candle.low) - pY(candle.high)} fill={bgColor} rx="1" />

            {/* Wick */}
            <line
              x1={x + candleW / 2} y1={pY(candle.high)}
              x2={x + candleW / 2} y2={pY(candle.low)}
              stroke={color} strokeWidth="1" opacity={0.5}
            />

            {/* Body */}
            <rect x={x + 2} y={bodyTop} width={candleW - 4} height={bodyH} fill={color} opacity={0.3} rx="1" />
            <rect x={x + 2} y={bodyTop} width={candleW - 4} height={bodyH} fill="none" stroke={color} strokeWidth="1" rx="1" />

            {/* Footprint cells (bid × ask) */}
            {candle.cells.map((cell, ri) => {
              const cellPrice = candle.priceLow + ri;
              const cy = pY(cellPrice + 0.5);
              const cellH = Math.abs(pY(cellPrice) - pY(cellPrice + 1));
              const halfW = (candleW - 6) / 2;

              let cellBg = 'transparent';
              if (cell.highlight === 'absorption') cellBg = 'rgba(245,158,11,0.12)';
              if (cell.highlight === 'imbalance') cellBg = 'rgba(239,68,68,0.12)';

              return (
                <g key={ri}>
                  {cellBg !== 'transparent' && (
                    <rect x={x + 1} y={cy - cellH / 2} width={candleW - 2} height={cellH} fill={cellBg} />
                  )}
                  {/* Bid (left, green) */}
                  <text
                    x={x + 3 + halfW / 2} y={cy + 3}
                    fill={cell.bid > cell.ask ? C.bull : C.textMuted}
                    fontSize={cell.highlight ? '8' : '7'}
                    fontWeight={cell.highlight ? 'bold' : 'normal'}
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {cell.bid}
                  </text>
                  {/* Separator */}
                  <line x1={x + candleW / 2} y1={cy - cellH / 2 + 1} x2={x + candleW / 2} y2={cy + cellH / 2 - 1} stroke={C.border} strokeWidth="0.5" />
                  {/* Ask (right, red) */}
                  <text
                    x={x + 3 + halfW + halfW / 2} y={cy + 3}
                    fill={cell.ask > cell.bid ? C.bear : C.textMuted}
                    fontSize={cell.highlight ? '8' : '7'}
                    fontWeight={cell.highlight ? 'bold' : 'normal'}
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {cell.ask}
                  </text>
                </g>
              );
            })}

            {/* Entry arrow */}
            {ci === example.entryCandle && (
              <g>
                <polygon
                  points={`${x + candleW + 3},${pY(example.entryPrice)} ${x + candleW + 10},${pY(example.entryPrice) - 5} ${x + candleW + 10},${pY(example.entryPrice) + 5}`}
                  fill={example.type === 'long' ? C.bull : C.bear}
                />
              </g>
            )}
          </g>
        );
      })}

      {/* ── Volume Profile (right side) ── */}
      <line x1={profileLeft - 3} y1={chartTop} x2={profileLeft - 3} y2={chartTop + chartHeight} stroke={C.border} strokeWidth="1" />
      <text x={profileLeft + PROFILE_W / 2} y={chartTop - 5} fill={C.textMuted} fontSize="8" textAnchor="middle" fontFamily="monospace">
        Volume Profile
      </text>
      {profile.map((lv) => {
        const y = pY(lv.price + 0.5);
        const barW = (lv.volume / maxVol) * (PROFILE_W - 5);
        const barH = Math.abs(pY(lv.price) - pY(lv.price + 1)) * 0.8;
        const color = lv.delta >= 0 ? C.bull : C.bear;
        const isVpoc = lv.price === example.vpocPrice;

        return (
          <g key={lv.price}>
            <rect x={profileLeft} y={y - barH / 2} width={barW} height={barH} fill={color} opacity={isVpoc ? 0.6 : 0.25} rx="1" />
            {isVpoc && (
              <rect x={profileLeft} y={y - barH / 2} width={barW} height={barH} fill="none" stroke={C.vpoc} strokeWidth="1" rx="1" />
            )}
          </g>
        );
      })}

      {/* ── CVD section ── */}
      <line x1={chartLeft} y1={CHART_H} x2={profileLeft + PROFILE_W} y2={CHART_H} stroke={C.border} strokeWidth="1" />
      <text x={chartLeft + 5} y={cvdTop - 2} fill={C.textMuted} fontSize="8" fontFamily="monospace">
        CVD — Cumulative Volume Delta
      </text>
      {/* Zero line */}
      <line x1={chartLeft} y1={cvdZeroY} x2={chartRight} y2={cvdZeroY} stroke={C.textMuted} strokeWidth="0.5" strokeDasharray="2,2" />
      <text x={chartRight + 5} y={cvdZeroY + 3} fill={C.textMuted} fontSize="7" fontFamily="monospace">0</text>

      {/* CVD bars */}
      {cvd.map((bar, i) => {
        const x = candleStartX + i * (candleW + CANDLE_GAP);
        const barH = (Math.abs(bar.value) / cvdRange) * (cvdHeight / 2);
        const y = bar.value >= 0 ? cvdZeroY - barH : cvdZeroY;
        const color = bar.value >= 0 ? C.bull : C.bear;

        return (
          <rect key={i} x={x + 2} y={y} width={candleW - 4} height={barH} fill={color} opacity={0.5} rx="1" />
        );
      })}

      {/* CVD divergence arrow if applicable */}
      {example.type === 'long' && (
        <g>
          <line
            x1={candleStartX + 3 * (candleW + CANDLE_GAP) + candleW / 2}
            y1={cvdZeroY + (620 / cvdRange) * (cvdHeight / 2)}
            x2={candleStartX + 7 * (candleW + CANDLE_GAP) + candleW / 2}
            y2={cvdZeroY + (350 / cvdRange) * (cvdHeight / 2)}
            stroke={C.bull} strokeWidth="1.5" strokeDasharray="4,2"
          />
          <text
            x={candleStartX + 5 * (candleW + CANDLE_GAP)}
            y={cvdZeroY + (500 / cvdRange) * (cvdHeight / 2) - 5}
            fill={C.bull} fontSize="7" fontWeight="bold" fontFamily="monospace"
          >
            ↗ CVD DIVERGENCE
          </text>
        </g>
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Main export                                                        */
/* ------------------------------------------------------------------ */

export default function AtasChartExamples() {
  const [activeId, setActiveId] = useState(EXAMPLES[0].id);
  const active = EXAMPLES.find((e) => e.id === activeId) ?? EXAMPLES[0];

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          Exemples de Charts — Style ATAS
        </h2>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Schémas interactifs reproduisant un footprint ATAS avec Volume Profile, CVD, niveaux vPOC/VAH/VAL, et annotations Entry/Target/Stop.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex.id}
            onClick={() => setActiveId(ex.id)}
            className="rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
            style={{
              borderColor: activeId === ex.id ? (ex.type === 'long' ? C.bull : C.bear) : 'var(--border)',
              background: activeId === ex.id ? (ex.type === 'long' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)') : 'var(--surface)',
              color: activeId === ex.id ? (ex.type === 'long' ? C.bull : C.bear) : 'var(--text-secondary)',
            }}
          >
            <span className={`mr-1 inline-block h-2 w-2 rounded-full ${ex.type === 'long' ? 'bg-green-500' : 'bg-red-500'}`} />
            {ex.title.split('—')[0].trim()}
          </button>
        ))}
      </div>

      {/* Active chart */}
      <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3" style={{ borderColor: 'var(--border)' }}>
          <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${active.type === 'long' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
            {active.type}
          </span>
          <span className="rounded px-2 py-0.5 text-[10px] font-mono" style={{ background: 'var(--border)', color: 'var(--text-secondary)' }}>
            {active.instrument} • {active.timeframe}
          </span>
          {active.confluences.map((c) => (
            <span key={c} className="rounded px-2 py-0.5 text-[10px]" style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--accent)' }}>
              {c}
            </span>
          ))}
        </div>

        {/* Title */}
        <div className="px-5 pt-4">
          <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            {active.title}
          </h3>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {active.subtitle}
          </p>
        </div>

        {/* SVG Chart */}
        <div className="px-3 py-4">
          <AtasChart example={active} />
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 border-t px-5 py-3" style={{ borderColor: 'var(--border)' }}>
          {[
            { color: C.bull, label: 'Bid dominant (achat passif)' },
            { color: C.bear, label: 'Ask dominant (vente agressive)' },
            { color: C.absorption, label: 'Zone d\'absorption' },
            { color: C.imbalance, label: 'Zone d\'imbalance' },
            { color: C.vpoc, label: 'vPOC' },
            { color: C.vah, label: 'VAH / VAL' },
            { color: C.vwap, label: 'VWAP' },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
              <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{item.label}</span>
            </div>
          ))}
        </div>

        {/* Annotations */}
        <div className="space-y-3 border-t px-5 py-4" style={{ borderColor: 'var(--border)' }}>
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
            Lecture du chart
          </p>
          {active.annotations.map((a, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[9px] font-bold" style={{ background: `${a.color}22`, color: a.color }}>
                {i + 1}
              </span>
              <div>
                <p className="text-xs font-semibold" style={{ color: a.color }}>{a.label}</p>
                <p className="mt-0.5 text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{a.text}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Narrative */}
        <div className="border-t px-5 py-4" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
            Narration step-by-step
          </p>
          <div className="space-y-2">
            {active.narrative.map((step, i) => (
              <p key={i} className="text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {step}
              </p>
            ))}
          </div>
        </div>

        {/* Trade summary */}
        <div className="grid grid-cols-3 gap-px border-t" style={{ borderColor: 'var(--border)' }}>
          {[
            { label: 'Entry', value: active.entryPrice.toLocaleString(), color: C.entry },
            { label: 'Target', value: active.targetPrice.toLocaleString(), color: C.target },
            { label: 'Stop', value: active.stopPrice.toLocaleString(), color: C.stop },
          ].map((item) => (
            <div key={item.label} className="px-5 py-3 text-center" style={{ background: `${item.color}08` }}>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: item.color }}>{item.label}</p>
              <p className="mt-0.5 font-mono text-sm font-bold" style={{ color: item.color }}>{item.value}</p>
            </div>
          ))}
        </div>

        {/* R:R */}
        <div className="border-t px-5 py-3 text-center" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Risk/Reward : </span>
          <span className="font-mono text-sm font-bold" style={{ color: 'var(--accent)' }}>
            1 : {((Math.abs(active.targetPrice - active.entryPrice)) / Math.abs(active.stopPrice - active.entryPrice)).toFixed(1)}
          </span>
          <span className="ml-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Risk = {Math.abs(active.stopPrice - active.entryPrice)} ticks • Reward = {Math.abs(active.targetPrice - active.entryPrice)} ticks
          </span>
        </div>
      </div>
    </section>
  );
}
