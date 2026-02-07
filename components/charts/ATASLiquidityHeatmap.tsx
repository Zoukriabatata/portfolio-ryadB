'use client';

/**
 * ATAS-STYLE LIQUIDITY HEATMAP
 *
 * Simulated passive liquidity visualization with:
 * - Normal liquidity (gradual appear/disappear)
 * - Stacking (vertical walls)
 * - Refill (rapid recharge)
 * - Absorption (persistent liquidity near price)
 * - Spoofing (rapid appear/disappear, detectable visually)
 *
 * CRITICAL: This visualizes PASSIVE ORDERS (limit orders), NOT trades or candles.
 */

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';

interface ATASLiquidityHeatmapProps {
  className?: string;
  height?: number;
  width?: number;
}

// ============ DATA STRUCTURES ============

interface LiquidityCell {
  price: number;
  timestamp: number;
  intensity: number;        // Current intensity (0-1)
  maxIntensity: number;     // Peak intensity
  age: number;              // Time since creation (ms)
  decayRate: number;        // Speed of decay (higher = faster)
  isSpoof: boolean;         // Spoofing marker
  isFreshAdd: boolean;      // Recently added
}

interface HeatmapColumn {
  timestamp: number;
  cells: Map<number, LiquidityCell>;
}

// ============ ATAS COLOR PALETTE ============

const getATASColor = (intensity: number, opacity: number = 1): string => {
  const i = Math.min(1, Math.max(0, intensity));

  if (i < 0.05) {
    // Near zero: very dark blue, almost invisible
    return `rgba(8, 12, 30, ${opacity * 0.3})`;
  } else if (i < 0.15) {
    // Very low: dark blue
    const t = (i - 0.05) / 0.1;
    return `rgba(${12 + t * 8}, ${20 + t * 30}, ${50 + t * 40}, ${opacity * (0.4 + t * 0.2)})`;
  } else if (i < 0.3) {
    // Low: blue
    const t = (i - 0.15) / 0.15;
    return `rgba(${20 + t * 10}, ${50 + t * 70}, ${90 + t * 60}, ${opacity * (0.6 + t * 0.15)})`;
  } else if (i < 0.45) {
    // Medium-low: blue to cyan
    const t = (i - 0.3) / 0.15;
    return `rgba(${30 - t * 20}, ${120 + t * 80}, ${150 + t * 50}, ${opacity * 0.75})`;
  } else if (i < 0.55) {
    // Medium: cyan to green
    const t = (i - 0.45) / 0.1;
    return `rgba(${10 + t * 60}, ${200 - t * 30}, ${200 - t * 100}, ${opacity * 0.8})`;
  } else if (i < 0.7) {
    // Medium-high: green to yellow
    const t = (i - 0.55) / 0.15;
    return `rgba(${70 + t * 185}, ${170 + t * 85}, ${100 - t * 100}, ${opacity * 0.85})`;
  } else if (i < 0.85) {
    // High: yellow to orange
    const t = (i - 0.7) / 0.15;
    return `rgba(255, ${255 - t * 100}, ${t * 30}, ${opacity * 0.9})`;
  } else {
    // Very high: orange to bright red-white
    const t = (i - 0.85) / 0.15;
    return `rgba(255, ${155 + t * 80}, ${30 + t * 100}, ${opacity})`;
  }
};

// ============ SIMULATION PARAMETERS ============

const CONFIG = {
  // Grid
  PRICE_LEVELS: 120,           // Number of visible price levels
  HISTORY_COLUMNS: 200,        // Time columns to keep
  UPDATE_INTERVAL: 50,         // ms between updates

  // Decay
  NORMAL_DECAY: 0.002,         // Slow decay for normal orders
  SPOOF_DECAY: 0.15,           // Fast decay for spoofing
  REFRESH_DECAY: 0.005,        // Medium decay

  // Generation
  NEW_ORDER_CHANCE: 0.3,       // Probability of new order each tick
  SPOOF_CHANCE: 0.02,          // Probability of spoof event
  STACK_CHANCE: 0.05,          // Probability of stacking event
  REFILL_CHANCE: 0.08,         // Probability of refill
  ABSORPTION_CHANCE: 0.03,     // Probability of absorption pattern

  // Intensity
  MIN_INTENSITY: 0.1,
  MAX_INTENSITY: 1.0,
  SPOOF_INTENSITY: 0.9,        // Spoofs appear bright
  STACK_INTENSITY: 0.7,        // Stacked orders

  // Visual
  CELL_HEIGHT_PX: 4,           // Pixel height per price level
  COLUMN_WIDTH_PX: 3,          // Pixel width per time column
};

// ============ SIMULATION ENGINE ============

class LiquiditySimulator {
  private columns: HeatmapColumn[] = [];
  private currentPrice: number = 100000; // Example: BTC price
  private tickSize: number = 10;
  private priceVolatility: number = 0.0001;

  constructor() {
    this.initializeHistory();
  }

  private initializeHistory(): void {
    const now = Date.now();
    for (let i = 0; i < CONFIG.HISTORY_COLUMNS; i++) {
      const column: HeatmapColumn = {
        timestamp: now - (CONFIG.HISTORY_COLUMNS - i) * CONFIG.UPDATE_INTERVAL,
        cells: new Map(),
      };

      // Generate initial liquidity around current price
      this.generateInitialLiquidity(column, i / CONFIG.HISTORY_COLUMNS);
      this.columns.push(column);
    }
  }

  private generateInitialLiquidity(column: HeatmapColumn, progress: number): void {
    const halfRange = CONFIG.PRICE_LEVELS / 2;

    for (let offset = -halfRange; offset <= halfRange; offset++) {
      const price = this.currentPrice + offset * this.tickSize;
      const distanceFromCenter = Math.abs(offset) / halfRange;

      // Base probability decreases with distance from center
      const baseProbability = Math.max(0, 1 - distanceFromCenter * 1.5);

      if (Math.random() < baseProbability * 0.4) {
        // Intensity based on distance (more liquidity near price)
        const baseIntensity = Math.random() * (1 - distanceFromCenter * 0.8);
        const intensity = Math.max(CONFIG.MIN_INTENSITY, Math.min(CONFIG.MAX_INTENSITY, baseIntensity));

        column.cells.set(price, {
          price,
          timestamp: column.timestamp,
          intensity,
          maxIntensity: intensity,
          age: (1 - progress) * CONFIG.HISTORY_COLUMNS * CONFIG.UPDATE_INTERVAL,
          decayRate: CONFIG.NORMAL_DECAY,
          isSpoof: false,
          isFreshAdd: false,
        });
      }
    }
  }

  public tick(): HeatmapColumn[] {
    // Move price randomly
    this.updatePrice();

    // Age and decay existing cells
    this.decayLiquidity();

    // Generate new column
    this.generateNewColumn();

    // Simulate behaviors
    this.simulateSpoofing();
    this.simulateStacking();
    this.simulateRefill();
    this.simulateAbsorption();

    return this.columns;
  }

  private updatePrice(): void {
    // Random walk with mean reversion
    const change = (Math.random() - 0.5) * 2 * this.priceVolatility * this.currentPrice;
    this.currentPrice += change;
    this.currentPrice = Math.round(this.currentPrice / this.tickSize) * this.tickSize;
  }

  private decayLiquidity(): void {
    for (const column of this.columns) {
      const toRemove: number[] = [];

      column.cells.forEach((cell, price) => {
        cell.age += CONFIG.UPDATE_INTERVAL;

        // Calculate opacity based on age (older = more faded)
        const ageFactor = Math.max(0, 1 - (cell.age / 30000)); // Fade over 30 seconds

        // Apply decay
        cell.intensity *= (1 - cell.decayRate);

        // Mark for removal if too faint
        if (cell.intensity < 0.02 || ageFactor < 0.1) {
          toRemove.push(price);
        }

        cell.isFreshAdd = false;
      });

      toRemove.forEach(price => column.cells.delete(price));
    }
  }

  private generateNewColumn(): void {
    const now = Date.now();
    const newColumn: HeatmapColumn = {
      timestamp: now,
      cells: new Map(),
    };

    // Copy and age existing liquidity from previous column
    const prevColumn = this.columns[this.columns.length - 1];
    if (prevColumn) {
      prevColumn.cells.forEach((cell, price) => {
        if (cell.intensity > 0.05) {
          newColumn.cells.set(price, {
            ...cell,
            timestamp: now,
          });
        }
      });
    }

    // Add new random liquidity
    const halfRange = CONFIG.PRICE_LEVELS / 2;
    for (let i = 0; i < 5; i++) {
      if (Math.random() < CONFIG.NEW_ORDER_CHANCE) {
        const offset = (Math.random() - 0.5) * halfRange * 2;
        const price = this.currentPrice + Math.round(offset) * this.tickSize;
        const distanceFromCenter = Math.abs(offset) / halfRange;

        // New orders tend to be near current price
        if (Math.random() > distanceFromCenter * 0.7) {
          const intensity = Math.random() * (1 - distanceFromCenter * 0.5);

          const existing = newColumn.cells.get(price);
          if (existing) {
            existing.intensity = Math.min(1, existing.intensity + intensity * 0.5);
            existing.maxIntensity = Math.max(existing.maxIntensity, existing.intensity);
            existing.isFreshAdd = true;
          } else {
            newColumn.cells.set(price, {
              price,
              timestamp: now,
              intensity: Math.max(CONFIG.MIN_INTENSITY, intensity),
              maxIntensity: intensity,
              age: 0,
              decayRate: CONFIG.NORMAL_DECAY,
              isSpoof: false,
              isFreshAdd: true,
            });
          }
        }
      }
    }

    this.columns.push(newColumn);

    // Remove oldest column
    if (this.columns.length > CONFIG.HISTORY_COLUMNS) {
      this.columns.shift();
    }
  }

  private simulateSpoofing(): void {
    if (Math.random() > CONFIG.SPOOF_CHANCE) return;

    // Spoofing: Large order appears and quickly disappears
    const halfRange = CONFIG.PRICE_LEVELS / 2;
    const spoofOffset = (Math.random() > 0.5 ? 1 : -1) * (Math.random() * halfRange * 0.3 + 5);
    const spoofPrice = this.currentPrice + Math.round(spoofOffset) * this.tickSize;

    const lastColumn = this.columns[this.columns.length - 1];

    // Add spoof order (high intensity, fast decay)
    lastColumn.cells.set(spoofPrice, {
      price: spoofPrice,
      timestamp: Date.now(),
      intensity: CONFIG.SPOOF_INTENSITY + Math.random() * 0.1,
      maxIntensity: CONFIG.SPOOF_INTENSITY,
      age: 0,
      decayRate: CONFIG.SPOOF_DECAY, // Fast decay = spoofing signature
      isSpoof: true,
      isFreshAdd: true,
    });
  }

  private simulateStacking(): void {
    if (Math.random() > CONFIG.STACK_CHANCE) return;

    // Stacking: Multiple adjacent levels with significant liquidity
    const halfRange = CONFIG.PRICE_LEVELS / 2;
    const stackCenter = (Math.random() > 0.5 ? 1 : -1) * (Math.random() * halfRange * 0.4 + 10);
    const stackSize = Math.floor(Math.random() * 5) + 3; // 3-7 levels

    const lastColumn = this.columns[this.columns.length - 1];

    for (let i = 0; i < stackSize; i++) {
      const price = this.currentPrice + Math.round(stackCenter + i) * this.tickSize;
      const intensity = CONFIG.STACK_INTENSITY * (0.8 + Math.random() * 0.2);

      const existing = lastColumn.cells.get(price);
      if (existing) {
        existing.intensity = Math.min(1, existing.intensity + intensity * 0.3);
      } else {
        lastColumn.cells.set(price, {
          price,
          timestamp: Date.now(),
          intensity,
          maxIntensity: intensity,
          age: 0,
          decayRate: CONFIG.NORMAL_DECAY * 0.5, // Stacks are persistent
          isSpoof: false,
          isFreshAdd: true,
        });
      }
    }
  }

  private simulateRefill(): void {
    if (Math.random() > CONFIG.REFILL_CHANCE) return;

    // Refill: Liquidity returns quickly to same level
    const lastColumn = this.columns[this.columns.length - 1];
    const prevColumn = this.columns[this.columns.length - 5];

    if (!prevColumn) return;

    // Find levels that had high liquidity before but are now low
    prevColumn.cells.forEach((oldCell, price) => {
      const currentCell = lastColumn.cells.get(price);

      if (oldCell.maxIntensity > 0.5 && (!currentCell || currentCell.intensity < 0.3)) {
        // Refill this level
        const refillIntensity = oldCell.maxIntensity * (0.7 + Math.random() * 0.3);

        if (currentCell) {
          currentCell.intensity = refillIntensity;
          currentCell.isFreshAdd = true;
        } else {
          lastColumn.cells.set(price, {
            price,
            timestamp: Date.now(),
            intensity: refillIntensity,
            maxIntensity: refillIntensity,
            age: 0,
            decayRate: CONFIG.REFRESH_DECAY,
            isSpoof: false,
            isFreshAdd: true,
          });
        }
      }
    });
  }

  private simulateAbsorption(): void {
    if (Math.random() > CONFIG.ABSORPTION_CHANCE) return;

    // Absorption: Strong liquidity persists near price, price approaches but doesn't cross
    const side = Math.random() > 0.5 ? 1 : -1;
    const distance = Math.floor(Math.random() * 5) + 2;
    const absorbPrice = this.currentPrice + side * distance * this.tickSize;

    // Add/reinforce absorption level across recent columns
    const recentColumns = this.columns.slice(-10);
    recentColumns.forEach((column, idx) => {
      const intensity = 0.6 + Math.random() * 0.3;
      const existing = column.cells.get(absorbPrice);

      if (existing) {
        existing.intensity = Math.min(1, existing.intensity + intensity * 0.2);
        existing.decayRate = CONFIG.NORMAL_DECAY * 0.3; // Very persistent
      } else {
        column.cells.set(absorbPrice, {
          price: absorbPrice,
          timestamp: column.timestamp,
          intensity: intensity * (0.5 + idx * 0.05),
          maxIntensity: intensity,
          age: (10 - idx) * CONFIG.UPDATE_INTERVAL,
          decayRate: CONFIG.NORMAL_DECAY * 0.3,
          isSpoof: false,
          isFreshAdd: idx > 7,
        });
      }
    });
  }

  public getCurrentPrice(): number {
    return this.currentPrice;
  }

  public getTickSize(): number {
    return this.tickSize;
  }
}

// ============ MAIN COMPONENT ============

export default function ATASLiquidityHeatmap({
  className,
  height = 600,
  width,
}: ATASLiquidityHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulatorRef = useRef<LiquiditySimulator | null>(null);
  const animationRef = useRef<number | undefined>(undefined);

  const [isPaused, setIsPaused] = useState(false);
  const [contrast, setContrast] = useState(1.2);
  const [zoomY, setZoomY] = useState(1);
  const [mousePos, setMousePos] = useState<{ x: number; y: number; price: number; intensity: number } | null>(null);

  // Initialize simulator
  useEffect(() => {
    simulatorRef.current = new LiquiditySimulator();
    return () => {
      simulatorRef.current = null;
    };
  }, []);

  const renderHeatmap = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const simulator = simulatorRef.current;

    if (!canvas || !container || !simulator) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const canvasWidth = width || container.clientWidth;
    const canvasHeight = height;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // Dark background
    ctx.fillStyle = '#06080d';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Get data
    const columns = isPaused ? simulatorRef.current?.tick() || [] : simulator.tick();
    const currentPrice = simulator.getCurrentPrice();
    const tickSize = simulator.getTickSize();

    // Calculate price range
    const visiblePriceLevels = Math.floor(CONFIG.PRICE_LEVELS / zoomY);
    const halfRange = visiblePriceLevels / 2;
    const minPrice = currentPrice - halfRange * tickSize;
    const maxPrice = currentPrice + halfRange * tickSize;
    const priceRange = maxPrice - minPrice;

    // Price ladder width
    const priceLadderWidth = 70;
    const chartWidth = canvasWidth - priceLadderWidth;

    // Calculate cell dimensions
    const cellHeight = canvasHeight / visiblePriceLevels;
    const columnWidth = chartWidth / CONFIG.HISTORY_COLUMNS;

    // Draw heatmap cells
    columns.forEach((column, colIndex) => {
      const x = colIndex * columnWidth;

      column.cells.forEach((cell) => {
        if (cell.price < minPrice || cell.price > maxPrice) return;

        // Calculate Y position (inverted: higher price = lower Y)
        const y = canvasHeight - ((cell.price - minPrice) / priceRange) * canvasHeight;

        // Apply contrast and age-based opacity
        const adjustedIntensity = Math.pow(cell.intensity, 1 / contrast);
        const ageFactor = Math.max(0.3, 1 - (cell.age / 30000));
        const opacity = ageFactor;

        // Get color
        ctx.fillStyle = getATASColor(adjustedIntensity, opacity);

        // Draw cell
        ctx.fillRect(x, y - cellHeight / 2, columnWidth + 0.5, cellHeight);

        // Highlight fresh additions
        if (cell.isFreshAdd && colIndex > CONFIG.HISTORY_COLUMNS - 5) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
          ctx.fillRect(x, y - cellHeight / 2, columnWidth + 0.5, cellHeight);
        }

        // Mark spoofing with distinct visual
        if (cell.isSpoof && cell.intensity > 0.3) {
          ctx.strokeStyle = 'rgba(255, 100, 100, 0.5)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y - cellHeight / 2, columnWidth, cellHeight);
        }
      });
    });

    // Draw grid lines (subtle)
    ctx.strokeStyle = 'rgba(50, 60, 80, 0.3)';
    ctx.lineWidth = 0.5;

    // Horizontal grid
    const gridStepY = Math.ceil(visiblePriceLevels / 20);
    for (let i = 0; i < visiblePriceLevels; i += gridStepY) {
      const y = (i / visiblePriceLevels) * canvasHeight;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartWidth, y);
      ctx.stroke();
    }

    // Vertical grid (time)
    const gridStepX = Math.ceil(CONFIG.HISTORY_COLUMNS / 10);
    for (let i = 0; i < CONFIG.HISTORY_COLUMNS; i += gridStepX) {
      const x = (i / CONFIG.HISTORY_COLUMNS) * chartWidth;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasHeight);
      ctx.stroke();
    }

    // Draw price ladder background
    ctx.fillStyle = '#0c0e14';
    ctx.fillRect(chartWidth, 0, priceLadderWidth, canvasHeight);

    // Draw price ladder border
    ctx.strokeStyle = '#2a3040';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartWidth, 0);
    ctx.lineTo(chartWidth, canvasHeight);
    ctx.stroke();

    // Draw current price marker
    const currentPriceY = canvasHeight / 2;

    // Current price highlight bar
    ctx.fillStyle = '#2563eb';
    ctx.fillRect(chartWidth, currentPriceY - 12, priceLadderWidth, 24);

    // Current price text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(
      currentPrice.toLocaleString('en-US', { maximumFractionDigits: 0 }),
      chartWidth + priceLadderWidth / 2,
      currentPriceY + 4
    );

    // Draw price levels on ladder
    ctx.fillStyle = '#6b7280';
    ctx.font = '10px monospace';

    const priceLabelStep = Math.ceil(visiblePriceLevels / 15) * tickSize;
    for (let price = Math.ceil(minPrice / priceLabelStep) * priceLabelStep; price <= maxPrice; price += priceLabelStep) {
      if (Math.abs(price - currentPrice) < priceLabelStep * 0.5) continue;

      const y = canvasHeight - ((price - minPrice) / priceRange) * canvasHeight;

      // Subtle line across chart
      ctx.strokeStyle = '#1a2030';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartWidth, y);
      ctx.stroke();

      // Price label
      ctx.fillStyle = '#4b5563';
      ctx.fillText(
        price.toLocaleString('en-US', { maximumFractionDigits: 0 }),
        chartWidth + priceLadderWidth / 2,
        y + 4
      );
    }

    // Draw mid price line (dashed)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, currentPriceY);
    ctx.lineTo(chartWidth, currentPriceY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw mouse hover info
    if (mousePos && mousePos.x < chartWidth) {
      // Crosshair
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(mousePos.x, 0);
      ctx.lineTo(mousePos.x, canvasHeight);
      ctx.moveTo(0, mousePos.y);
      ctx.lineTo(chartWidth, mousePos.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Info box
      const boxWidth = 120;
      const boxHeight = 50;
      const boxX = Math.min(mousePos.x + 10, chartWidth - boxWidth - 10);
      const boxY = Math.max(mousePos.y - boxHeight - 10, 10);

      ctx.fillStyle = 'rgba(10, 15, 25, 0.9)';
      ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
      ctx.strokeStyle = '#3b4050';
      ctx.lineWidth = 1;
      ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

      ctx.fillStyle = '#9ca3af';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`Price: ${mousePos.price.toLocaleString()}`, boxX + 8, boxY + 18);
      ctx.fillText(`Intensity: ${(mousePos.intensity * 100).toFixed(1)}%`, boxX + 8, boxY + 34);
    }

  }, [height, width, isPaused, contrast, zoomY, mousePos]);

  // Animation loop
  useEffect(() => {
    let lastTime = 0;

    const animate = (time: number) => {
      if (!isPaused && time - lastTime >= CONFIG.UPDATE_INTERVAL) {
        renderHeatmap();
        lastTime = time;
      } else if (isPaused) {
        renderHeatmap();
      }
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [renderHeatmap, isPaused]);

  // Mouse tracking
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const simulator = simulatorRef.current;
    if (!canvas || !simulator) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const priceLadderWidth = 70;
    const chartWidth = canvas.width - priceLadderWidth;

    if (x > chartWidth) {
      setMousePos(null);
      return;
    }

    const currentPrice = simulator.getCurrentPrice();
    const tickSize = simulator.getTickSize();
    const visiblePriceLevels = Math.floor(CONFIG.PRICE_LEVELS / zoomY);
    const halfRange = visiblePriceLevels / 2;
    const minPrice = currentPrice - halfRange * tickSize;
    const maxPrice = currentPrice + halfRange * tickSize;

    const price = maxPrice - (y / canvas.height) * (maxPrice - minPrice);

    // Find intensity at this position
    const columns = simulatorRef.current?.tick() || [];
    const colIndex = Math.floor((x / chartWidth) * CONFIG.HISTORY_COLUMNS);
    const column = columns[colIndex];

    let intensity = 0;
    if (column) {
      const roundedPrice = Math.round(price / tickSize) * tickSize;
      const cell = column.cells.get(roundedPrice);
      if (cell) {
        intensity = cell.intensity;
      }
    }

    setMousePos({ x, y, price, intensity });
  }, [zoomY]);

  const handleMouseLeave = useCallback(() => {
    setMousePos(null);
  }, []);

  // Handle wheel for zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoomY(prev => Math.min(3, Math.max(0.5, prev * delta)));
  }, []);

  return (
    <div className={`relative ${className || ''}`} ref={containerRef}>
      {/* Controls */}
      <div className="absolute top-2 left-2 z-10 flex flex-wrap gap-2">
        <button
          onClick={() => setIsPaused(!isPaused)}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
            isPaused
              ? 'bg-yellow-600 text-white'
              : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
          }`}
        >
          {isPaused ? 'Resume' : 'Pause'}
        </button>

        <div className="flex items-center gap-1 bg-zinc-900/90 rounded px-2 py-1">
          <span className="text-xs text-zinc-400">Contrast:</span>
          <input
            type="range"
            min="0.5"
            max="2.5"
            step="0.1"
            value={contrast}
            onChange={(e) => setContrast(parseFloat(e.target.value))}
            className="w-16 h-1 accent-blue-500"
          />
          <span className="text-xs text-zinc-500 w-6">{contrast.toFixed(1)}</span>
        </div>

        <div className="flex items-center gap-1 bg-zinc-900/90 rounded px-2 py-1">
          <span className="text-xs text-zinc-400">Zoom:</span>
          <button
            onClick={() => setZoomY(prev => Math.min(3, prev * 1.2))}
            className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          >
            +
          </button>
          <button
            onClick={() => setZoomY(prev => Math.max(0.5, prev / 1.2))}
            className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          >
            -
          </button>
          <button
            onClick={() => setZoomY(1)}
            className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          >
            1:1
          </button>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        className="w-full cursor-crosshair"
        style={{ height: `${height}px` }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
      />

      {/* Color Legend */}
      <div className="absolute bottom-2 left-2 flex items-center gap-2 bg-zinc-900/90 rounded px-3 py-2">
        <span className="text-xs text-zinc-400">Liquidity:</span>
        <div className="flex h-3 w-40 rounded overflow-hidden">
          {[0.05, 0.15, 0.3, 0.45, 0.55, 0.7, 0.85, 1].map((i, idx) => (
            <div
              key={idx}
              className="flex-1"
              style={{ backgroundColor: getATASColor(i, 1) }}
            />
          ))}
        </div>
        <span className="text-xs text-zinc-500">Low</span>
        <span className="text-xs text-zinc-400">→</span>
        <span className="text-xs text-orange-400">High</span>
      </div>

      {/* Behavior legend */}
      <div className="absolute bottom-2 right-2 flex items-center gap-3 bg-zinc-900/90 rounded px-3 py-2 text-xs">
        <span className="text-zinc-400">Patterns:</span>
        <span className="text-cyan-400">Stack</span>
        <span className="text-green-400">Refill</span>
        <span className="text-yellow-400">Absorption</span>
        <span className="text-red-400 border-b border-red-400/50">Spoof</span>
      </div>
    </div>
  );
}
