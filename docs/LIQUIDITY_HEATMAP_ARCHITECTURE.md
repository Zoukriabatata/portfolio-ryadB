# Institutional-Grade Liquidity Heatmap Architecture

## Overview

This document describes the architecture for a professional-grade liquidity heatmap visualization system, designed to exceed the capabilities of ATAS and match Bookmap's institutional quality.

## Why This Is Superior to ATAS

| Feature | ATAS | Our Implementation |
|---------|------|-------------------|
| Time Decay | Simple fade | EMA-based exponential decay with configurable half-life |
| Spoofing Detection | None | Multi-factor detection (size, duration, repetition) |
| Absorption Tracking | Basic | Tracks partial fills, cumulative absorption, bounce detection |
| Wall Detection | Threshold-based | Statistical (std dev) + machine learning ready |
| Color Mapping | Fixed gradient | Dynamic scaling with percentile cutoffs |
| Rendering | Basic canvas | Optimized WebGL-ready with dirty rect updates |
| Data Precision | Tick-based | Sub-tick precision with proper decimal handling |

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │  HeatmapCanvas  │  │  ControlPanel   │  │   InfoOverlay   │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                      RENDERING ENGINE                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ HeatmapRenderer │  │  TradeRenderer  │  │  OverlayRender  │ │
│  │  (Canvas 2D)    │  │   (Bubbles)     │  │ (Walls/Spoof)   │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                      ANALYTICS ENGINE                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ WallDetector    │  │AbsorptionTracker│  │ SpoofDetector   │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│  ┌─────────────────┐  ┌─────────────────┐                      │
│  │ DecayProcessor  │  │VolatilityNorm   │                      │
│  └─────────────────┘  └─────────────────┘                      │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                       DATA LAYER                                │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ OrderBookStore  │  │ HistoryBuffer   │  │  TradeStore     │ │
│  │ (Live L2 Data)  │  │ (Time Series)   │  │ (Executions)    │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                      INGESTION LAYER                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ WebSocketClient │  │  DataNormalizer │  │  TickPrecision  │ │
│  │ (Binance/Bybit) │  │ (L2 → Internal) │  │    Handler      │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Core Data Structures

### 1. LiquidityCell (Single price-time point)
```typescript
interface LiquidityCell {
  price: number;           // Price level (tick-aligned)
  timestamp: number;       // Unix ms
  bidSize: number;         // Total bid liquidity
  askSize: number;         // Total ask liquidity
  bidDecay: number;        // Decayed bid value (EMA)
  askDecay: number;        // Decayed ask value (EMA)
  persistence: number;     // How long liquidity has been present (ms)
  absorptionBid: number;   // Cumulative absorbed bid volume
  absorptionAsk: number;   // Cumulative absorbed ask volume
  flags: CellFlags;        // Wall, spoof, absorption markers
}

interface CellFlags {
  isWall: boolean;
  isSpoofSuspect: boolean;
  isAbsorption: boolean;
  absorptionStrength: number; // 0-1
}
```

### 2. HistoryBuffer (Ring buffer for time series)
```typescript
interface HistoryBuffer {
  capacity: number;        // Max columns (e.g., 1000)
  columnWidth: number;     // Time per column (ms)
  columns: LiquidityColumn[];
  headIndex: number;       // Current write position

  // Methods
  push(column: LiquidityColumn): void;
  getRange(startTime: number, endTime: number): LiquidityColumn[];
  getLatest(count: number): LiquidityColumn[];
}

interface LiquidityColumn {
  timestamp: number;
  cells: Map<number, LiquidityCell>; // price -> cell
  maxBidSize: number;      // For normalization
  maxAskSize: number;
  volatility: number;      // ATR or std dev at this moment
}
```

### 3. OrderBookState (Live state)
```typescript
interface OrderBookState {
  bids: Map<number, OrderLevel>;
  asks: Map<number, OrderLevel>;
  bestBid: number;
  bestAsk: number;
  midPrice: number;
  spread: number;
  imbalance: number;       // (bidVol - askVol) / total
  lastUpdateTime: number;
}

interface OrderLevel {
  price: number;
  size: number;
  orderCount: number;      // If available (L3)
  firstSeen: number;       // Timestamp when level appeared
  lastModified: number;    // Last size change
  previousSize: number;    // For delta tracking
  cumulativeAbsorption: number; // Volume absorbed at this level
}
```

## Analytics Algorithms

### 1. Wall Detection
```typescript
function detectWalls(orderBook: OrderBookState, history: HistoryBuffer): WallInfo[] {
  const walls: WallInfo[] = [];
  const allSizes = [...orderBook.bids.values(), ...orderBook.asks.values()]
    .map(l => l.size);

  const mean = average(allSizes);
  const stdDev = standardDeviation(allSizes);
  const threshold = mean + stdDev * 2.5; // 2.5 sigma

  // Check bid walls
  for (const [price, level] of orderBook.bids) {
    if (level.size >= threshold) {
      const persistence = Date.now() - level.firstSeen;
      const absorptionRatio = level.cumulativeAbsorption / level.size;

      walls.push({
        price,
        side: 'bid',
        size: level.size,
        strength: (level.size - threshold) / stdDev,
        persistence,
        absorptionRatio,
        isDefending: absorptionRatio > 0.3 && persistence > 5000
      });
    }
  }

  // Same for asks...
  return walls;
}
```

### 2. Spoofing Detection
```typescript
interface SpoofPattern {
  price: number;
  side: 'bid' | 'ask';
  confidence: number;      // 0-1
  reason: string;
  detectedAt: number;
}

function detectSpoofing(
  orderBook: OrderBookState,
  history: HistoryBuffer,
  trades: Trade[]
): SpoofPattern[] {
  const patterns: SpoofPattern[] = [];
  const now = Date.now();

  for (const [price, level] of orderBook.bids) {
    // Pattern 1: Large order that disappears quickly
    const lifetime = now - level.firstSeen;
    const isLarge = level.size > getThreshold(orderBook) * 3;

    if (isLarge && lifetime < 500) {
      // Check if it was pulled (not executed)
      const executed = trades.filter(t =>
        t.price === price &&
        t.timestamp > level.firstSeen
      ).reduce((sum, t) => sum + t.quantity, 0);

      if (executed < level.size * 0.1) {
        patterns.push({
          price,
          side: 'bid',
          confidence: 0.8,
          reason: 'Large order pulled without execution',
          detectedAt: now
        });
      }
    }

    // Pattern 2: Layering (multiple large orders at consecutive levels)
    // Pattern 3: Quote stuffing (rapid add/cancel cycles)
    // Pattern 4: Momentum ignition attempts
  }

  return patterns;
}
```

### 3. Absorption Tracking
```typescript
interface AbsorptionEvent {
  price: number;
  side: 'bid' | 'ask';
  totalAbsorbed: number;
  startTime: number;
  endTime: number;
  priceAction: 'bounce' | 'break' | 'ongoing';
  strength: number;        // Normalized 0-1
}

function trackAbsorption(
  level: OrderLevel,
  trades: Trade[],
  priceAfter: number
): AbsorptionEvent | null {
  const relevantTrades = trades.filter(t =>
    t.price === level.price &&
    t.timestamp > level.firstSeen
  );

  const totalAbsorbed = relevantTrades.reduce((sum, t) => sum + t.quantity, 0);

  if (totalAbsorbed < level.size * 0.2) return null;

  // Determine price action after absorption
  const priceAction = level.side === 'bid'
    ? (priceAfter > level.price ? 'bounce' : 'break')
    : (priceAfter < level.price ? 'bounce' : 'break');

  return {
    price: level.price,
    side: level.side,
    totalAbsorbed,
    startTime: level.firstSeen,
    endTime: Date.now(),
    priceAction: level.size > 0 ? 'ongoing' : priceAction,
    strength: Math.min(1, totalAbsorbed / (level.size * 2))
  };
}
```

### 4. Time Decay (EMA)
```typescript
function applyDecay(
  currentValue: number,
  previousDecayedValue: number,
  deltaTimeMs: number,
  halfLifeMs: number
): number {
  // Exponential decay factor
  const alpha = 1 - Math.exp(-deltaTimeMs * Math.LN2 / halfLifeMs);
  return previousDecayedValue + alpha * (currentValue - previousDecayedValue);
}

// Applied per cell each frame
function updateCellDecay(cell: LiquidityCell, deltaMs: number, settings: DecaySettings) {
  cell.bidDecay = applyDecay(cell.bidSize, cell.bidDecay, deltaMs, settings.halfLifeMs);
  cell.askDecay = applyDecay(cell.askSize, cell.askDecay, deltaMs, settings.halfLifeMs);
}
```

### 5. Volatility Normalization
```typescript
function normalizeByVolatility(
  size: number,
  currentVolatility: number,
  baselineVolatility: number
): number {
  // Adjust perceived size based on market conditions
  // High volatility = larger orders needed to be significant
  const volRatio = currentVolatility / baselineVolatility;
  return size / Math.max(0.5, volRatio);
}

function calculateVolatility(prices: number[], window: number): number {
  if (prices.length < window) return 1;

  const returns = [];
  for (let i = 1; i < Math.min(prices.length, window); i++) {
    returns.push(Math.log(prices[i] / prices[i - 1]));
  }

  return standardDeviation(returns) * Math.sqrt(252 * 24 * 60); // Annualized
}
```

## Color Mapping System

```typescript
interface ColorConfig {
  scheme: 'bookmap' | 'atas' | 'thermal' | 'custom';
  bidGradient: ColorStop[];
  askGradient: ColorStop[];
  upperCutoffPercentile: number;  // e.g., 97
  lowerCutoffPercentile: number;  // e.g., 5
  useLogScale: boolean;
  gamma: number;                   // Non-linear contrast adjustment
}

interface ColorStop {
  position: number;  // 0-1
  color: [number, number, number, number]; // RGBA
}

function getColor(
  intensity: number,
  side: 'bid' | 'ask',
  config: ColorConfig,
  stats: { p5: number; p50: number; p97: number }
): string {
  // Apply cutoffs
  const clampedIntensity = Math.max(
    0,
    Math.min(1, (intensity - stats.p5) / (stats.p97 - stats.p5))
  );

  // Apply log scale if enabled
  const scaledIntensity = config.useLogScale
    ? Math.log1p(clampedIntensity * 9) / Math.log(10) // log10(1 + x*9)
    : clampedIntensity;

  // Apply gamma correction
  const gammaIntensity = Math.pow(scaledIntensity, 1 / config.gamma);

  // Interpolate gradient
  const gradient = side === 'bid' ? config.bidGradient : config.askGradient;
  return interpolateGradient(gradient, gammaIntensity);
}
```

## Rendering Pipeline

```typescript
class HeatmapRenderPipeline {
  private offscreenCanvas: OffscreenCanvas;
  private dirtyRects: Rect[] = [];
  private lastRenderTime: number = 0;
  private framePool: ImageData[] = []; // Object pooling

  render(
    ctx: CanvasRenderingContext2D,
    history: HistoryBuffer,
    orderBook: OrderBookState,
    viewport: Viewport,
    settings: RenderSettings
  ): void {
    const now = performance.now();
    const deltaMs = now - this.lastRenderTime;

    // 1. Clear only dirty regions (optimization)
    for (const rect of this.dirtyRects) {
      ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
    }

    // 2. Render heatmap cells (batched by color for performance)
    this.renderHeatmapBatched(ctx, history, viewport, settings);

    // 3. Render current order book depth (rightmost column)
    this.renderCurrentDepth(ctx, orderBook, viewport, settings);

    // 4. Render overlays (walls, absorption, spoofing)
    this.renderAnalyticsOverlays(ctx, orderBook, history, viewport);

    // 5. Render trade bubbles
    this.renderTrades(ctx, settings.trades, viewport);

    // 6. Render UI elements (price scale, time scale, crosshair)
    this.renderUI(ctx, viewport, settings);

    this.lastRenderTime = now;
    this.dirtyRects = [];
  }

  private renderHeatmapBatched(
    ctx: CanvasRenderingContext2D,
    history: HistoryBuffer,
    viewport: Viewport,
    settings: RenderSettings
  ): void {
    // Group cells by color to minimize state changes
    const colorBatches = new Map<string, Rect[]>();

    const columns = history.getRange(viewport.startTime, viewport.endTime);
    const cellWidth = viewport.width / columns.length;

    for (let i = 0; i < columns.length; i++) {
      const column = columns[i];
      const x = i * cellWidth;

      for (const [price, cell] of column.cells) {
        if (price < viewport.minPrice || price > viewport.maxPrice) continue;

        const y = this.priceToY(price, viewport);
        const cellHeight = this.getCellHeight(viewport);

        // Get color based on decayed value (not raw)
        const bidColor = this.getColor(cell.bidDecay, 'bid', settings);
        const askColor = this.getColor(cell.askDecay, 'ask', settings);

        // Batch by color
        if (cell.bidDecay > 0) {
          const batch = colorBatches.get(bidColor) || [];
          batch.push({ x, y, width: cellWidth, height: cellHeight });
          colorBatches.set(bidColor, batch);
        }
        if (cell.askDecay > 0) {
          const batch = colorBatches.get(askColor) || [];
          batch.push({ x, y, width: cellWidth, height: cellHeight });
          colorBatches.set(askColor, batch);
        }
      }
    }

    // Render batches
    for (const [color, rects] of colorBatches) {
      ctx.fillStyle = color;
      for (const rect of rects) {
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      }
    }
  }
}
```

## User Controls Interface

```typescript
interface HeatmapSettings {
  // Liquidity Display
  liquidityThreshold: number;      // Min size to display (0-100%)
  upperCutoffPercent: number;      // 90-99%
  lowerCutoffPercent: number;      // 0-20%

  // Time Decay
  decayEnabled: boolean;
  decayHalfLifeMs: number;         // 1000-60000ms

  // Color
  colorScheme: 'bookmap' | 'atas' | 'thermal';
  bidBaseColor: string;
  askBaseColor: string;
  useLogScale: boolean;
  gamma: number;                   // 0.5-2.0

  // Analytics
  showWalls: boolean;
  wallThresholdSigma: number;      // 1.5-4.0
  showAbsorption: boolean;
  absorptionMinPercent: number;    // 10-50%
  showSpoofing: boolean;
  spoofingConfidenceThreshold: number; // 0.5-0.9

  // Display
  showBids: boolean;
  showAsks: boolean;
  showTrades: boolean;
  tradeMinSize: number;

  // Zoom
  priceZoom: number;               // 0.5-5.0
  timeZoom: number;                // 0.5-5.0
  autoCenter: boolean;

  // Performance
  updateIntervalMs: number;        // 50-500ms
  maxHistoryColumns: number;       // 500-5000
}
```

## File Structure

```
lib/heatmap/
├── core/
│   ├── LiquidityEngine.ts         # Main orchestrator
│   ├── HistoryBuffer.ts           # Ring buffer for time series
│   ├── OrderBookState.ts          # Live order book management
│   └── TickPrecision.ts           # Decimal precision handling
├── analytics/
│   ├── WallDetector.ts            # Statistical wall detection
│   ├── AbsorptionTracker.ts       # Absorption event tracking
│   ├── SpoofDetector.ts           # Spoofing pattern recognition
│   ├── DecayProcessor.ts          # EMA time decay
│   └── VolatilityNormalizer.ts    # Vol-adjusted sizing
├── rendering/
│   ├── HeatmapRenderer.ts         # Main canvas renderer
│   ├── ColorEngine.ts             # Gradient and color mapping
│   ├── TradeRenderer.ts           # Trade bubble visualization
│   └── OverlayRenderer.ts         # Walls, absorption, spoofing overlays
├── types/
│   └── index.ts                   # All type definitions
└── index.ts                       # Public exports

components/charts/LiquidityHeatmap/
├── LiquidityHeatmap.tsx           # Main React component
├── HeatmapCanvas.tsx              # Canvas wrapper
├── HeatmapControls.tsx            # Settings panel
├── HeatmapLegend.tsx              # Color legend
└── index.ts
```

## Implementation Phases

### Phase 1: Core Data Layer
- [ ] HistoryBuffer with ring buffer
- [ ] OrderBookState with delta tracking
- [ ] TickPrecision handler
- [ ] Basic WebSocket integration

### Phase 2: Basic Rendering
- [ ] HeatmapRenderer with batched rendering
- [ ] ColorEngine with gradients
- [ ] TradeRenderer for bubbles
- [ ] Price/Time scales

### Phase 3: Analytics
- [ ] WallDetector
- [ ] AbsorptionTracker
- [ ] SpoofDetector
- [ ] DecayProcessor
- [ ] VolatilityNormalizer

### Phase 4: UI/UX
- [ ] HeatmapControls panel
- [ ] Real-time settings updates
- [ ] Zoom/Pan interactions
- [ ] Crosshair with info tooltip

### Phase 5: Optimization
- [ ] Dirty rect rendering
- [ ] Object pooling
- [ ] Web Worker for analytics
- [ ] Optional WebGL renderer

## Performance Targets

- 60 FPS sustained
- < 16ms frame time
- < 100MB memory for 30min history
- < 5ms analytics update cycle
