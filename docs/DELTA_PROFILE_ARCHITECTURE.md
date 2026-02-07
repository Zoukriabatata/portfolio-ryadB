# Delta Profile Architecture - ATAS Professional Style

## Critical Bug Fix Applied

### Problem
The delta profile rendering was broken because bars were drawn from edges instead of from a fixed center axis.

### Solution
Fixed in `lib/orderflow/FootprintRenderer.ts` - the `renderDeltaProfile` method now correctly renders delta bars from a **fixed vertical zero axis**.

---

## ATAS-Compliant Delta Rendering Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DELTA PROFILE COLUMN                                  │
│                                                                              │
│   RED (BID/SELLERS)    │    ZERO AXIS    │    GREEN (ASK/BUYERS)           │
│   ◄────────────────────│────────┬────────│────────────────────►             │
│                        │        │        │                                   │
│   ████████████████████ │        │        │                     delta = -500 │
│              ████████  │        │        │  ████████████████   delta = +400 │
│         ███████████    │        │        │  ██████             delta = -200 │
│                   ██   │        │        │  ██████████████████ delta = +600 │
│                        │        │        │                                   │
└────────────────────────┴────────┴────────┴───────────────────────────────────┘
                                  ▲
                           IMMUTABLE AXIS
                        (centerX = x + width/2)
```

---

## Core Rules (MUST FOLLOW)

### Rule 1: Delta Calculation
```typescript
// Per price level
level.delta = level.askVolume - level.bidVolume;

// Per candle (total)
candle.totalDelta = candle.totalBuyVolume - candle.totalSellVolume;
```

### Rule 2: Zero Axis is FIXED
```typescript
// CORRECT: Fixed center position
const centerX = x + width / 2;  // NEVER changes

// WRONG: Dynamic positioning based on data
// const centerX = calculateDynamicCenter(data);  // NO!
```

### Rule 3: Positive Delta = ASK = RIGHT = GREEN
```typescript
if (delta > 0) {
  ctx.fillStyle = GREEN_COLOR;
  ctx.fillRect(centerX, barY, barWidth, barHeight);  // FROM center, going RIGHT
}
```

### Rule 4: Negative Delta = BID = LEFT = RED
```typescript
if (delta < 0) {
  ctx.fillStyle = RED_COLOR;
  ctx.fillRect(centerX - barWidth, barY, barWidth, barHeight);  // FROM center, going LEFT
}
```

### Rule 5: Bar Width = Normalized Absolute Delta
```typescript
const normalizedDelta = Math.abs(delta) / maxAbsDelta;
const barWidth = normalizedDelta * halfWidth;
```

---

## isBuyerMaker Logic (Binance)

```typescript
// CORRECT interpretation:
if (tick.isBuyerMaker === true) {
  // The BUYER was the maker (limit order resting on book)
  // The SELLER was the aggressor (market sell order)
  // This trade HIT THE BID = SELL pressure
  level.bidVolume += tick.quantity;  // Add to BID/SELL side
}

if (tick.isBuyerMaker === false) {
  // The SELLER was the maker (limit order resting on book)
  // The BUYER was the aggressor (market buy order)
  // This trade HIT THE ASK = BUY pressure
  level.askVolume += tick.quantity;  // Add to ASK/BUY side
}
```

---

## Checklist: Common Errors to Avoid

### ❌ Error 1: Drawing from edges instead of center
```typescript
// WRONG - bars draw from opposite edges, never meeting
if (delta >= 0) {
  ctx.fillRect(x + 1, barY, barWidth, barHeight);  // From LEFT edge
} else {
  ctx.fillRect(x + width - barWidth, barY, barWidth, barHeight);  // From RIGHT edge
}

// CORRECT - bars draw from fixed center
const centerX = x + width / 2;
if (delta >= 0) {
  ctx.fillRect(centerX, barY, barWidth, barHeight);  // FROM center, going right
} else {
  ctx.fillRect(centerX - barWidth, barY, barWidth, barHeight);  // FROM center, going left
}
```

### ❌ Error 2: Inverting Bid/Ask interpretation
```typescript
// WRONG - inverted logic
if (tick.isBuyerMaker) {
  level.askVolume += tick.quantity;  // NO! This is SELL pressure
}

// CORRECT
if (tick.isBuyerMaker) {
  level.bidVolume += tick.quantity;  // Seller hit the bid
}
```

### ❌ Error 3: Dynamic zero axis
```typescript
// WRONG - zero axis moves based on data
const minDelta = Math.min(...deltas);
const maxDelta = Math.max(...deltas);
const centerX = x + ((0 - minDelta) / (maxDelta - minDelta)) * width;

// CORRECT - zero axis is always at center
const centerX = x + width / 2;
```

### ❌ Error 4: Using CSS for direction
```typescript
// WRONG - relying on CSS transform/direction
style={{ transform: delta < 0 ? 'scaleX(-1)' : 'none' }}

// CORRECT - explicit Canvas coordinates
if (delta < 0) {
  ctx.fillRect(centerX - barWidth, barY, barWidth, barHeight);
}
```

### ❌ Error 5: Recalculating center per candle
```typescript
// WRONG - each candle has different center
candles.forEach(candle => {
  const localMax = getMaxDelta(candle);
  const centerX = calculateCenter(localMax);  // Changes per candle!
});

// CORRECT - single fixed center for entire delta profile column
const centerX = deltaProfileX + deltaProfileWidth / 2;  // Same for all price levels
```

### ❌ Error 6: Forgetting to handle zero delta
```typescript
// WRONG - draws empty bar for delta = 0
const barWidth = normalizedDelta * halfWidth;  // = 0, but still calls fillRect

// CORRECT - skip zero delta
if (delta === 0) continue;
const barWidth = (Math.abs(delta) / maxAbsDelta) * halfWidth;
```

### ❌ Error 7: Not drawing the zero axis line
```typescript
// WRONG - no visual reference for zero
// (just the bars)

// CORRECT - always show the zero axis line
ctx.strokeStyle = 'rgba(80, 80, 80, 0.6)';
ctx.beginPath();
ctx.moveTo(centerX, areaTop);
ctx.lineTo(centerX, areaBottom);
ctx.stroke();
```

---

## Module Separation (Clean Architecture)

### 1. Data Module (`OrderflowEngine.ts`)
- Processes trades into price levels
- Calculates bid/ask volumes per level
- Computes delta = askVolume - bidVolume
- NO rendering logic

### 2. Calculation Module (`FootprintEngine.ts`)
- Computes aggregates (POC, VAH, VAL)
- Detects imbalances (diagonal comparison)
- Normalizes delta for rendering
- NO rendering logic

### 3. Rendering Module (`FootprintRenderer.ts`)
- Uses fixed center axis
- Draws bars from center outward
- Applies colors based on delta sign
- NO data processing

---

## Performance Considerations

1. **Pre-calculate maxAbsDelta** once per render frame, not per level
2. **Skip levels outside visible area** to reduce draw calls
3. **Batch similar operations** (all green bars, then all red bars)
4. **Use requestAnimationFrame** for smooth updates
5. **Limit visible levels** based on zoom level (LOD system)

---

## Testing Checklist

- [ ] Positive delta bars extend RIGHT from center
- [ ] Negative delta bars extend LEFT from center
- [ ] Zero axis remains fixed when zooming
- [ ] Zero axis remains fixed when scrolling
- [ ] Zero axis remains fixed when data updates
- [ ] Bar widths scale proportionally to delta magnitude
- [ ] Colors are correct (green = buy/ask, red = sell/bid)
- [ ] Rendering is correct at all zoom levels
- [ ] No visual inversion when timeframe changes
