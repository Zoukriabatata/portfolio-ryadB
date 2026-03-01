/**
 * EXECUTION ENGINE — High/Low Based Position Evaluation
 *
 * Evaluates candle data against open positions to trigger SL/TP.
 * Separated from rendering and PnL calculation.
 */

import type { PositionTool, Tool } from './types';
import { getToolsEngine } from './ToolsEngine';

// ============ TYPES ============

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ExecutionResult {
  toolId: string;
  price: number;
  reason: 'stop' | 'target';
}

// ============ CORE EXECUTION ============

/**
 * Evaluate a single candle against a position.
 * Uses HIGH/LOW (not close) for realistic execution.
 * SL is always checked before TP (conservative default).
 */
export function evaluateCandle(
  tool: PositionTool,
  candle: CandleData,
  mode: 'conservative' | 'optimistic' = 'conservative',
): ExecutionResult | null {
  if (tool.positionStatus === 'closed') return null;

  const isLong = tool.type === 'longPosition';

  // Both SL and TP hit in same candle
  const slHit = isLong
    ? candle.low <= tool.stopLoss
    : candle.high >= tool.stopLoss;
  const tpHit = isLong
    ? candle.high >= tool.takeProfit
    : candle.low <= tool.takeProfit;

  if (slHit && tpHit) {
    // Ambiguous: both triggered in same candle
    if (mode === 'conservative') {
      return { toolId: tool.id, price: tool.stopLoss, reason: 'stop' };
    } else {
      return { toolId: tool.id, price: tool.takeProfit, reason: 'target' };
    }
  }

  // SL checked first (priority)
  if (slHit) {
    return { toolId: tool.id, price: tool.stopLoss, reason: 'stop' };
  }

  if (tpHit) {
    return { toolId: tool.id, price: tool.takeProfit, reason: 'target' };
  }

  return null;
}

/**
 * Close a position in the tools engine.
 * Sets status, exit price, exit reason. Tool remains unlocked.
 * Triggers a 120ms fade animation (renderer-side visual only).
 */
export function closePosition(toolId: string, execution: ExecutionResult): void {
  const engine = getToolsEngine();
  engine.updateTool(toolId, {
    positionStatus: 'closed',
    exitPrice: execution.price,
    exitReason: execution.reason,
  } as Partial<Tool>);
  // Trigger smooth fade animation (visual only — doesn't modify tool state)
  engine.animatePositionFade(toolId);
}

/**
 * Reopen a closed position (e.g. after user adjusts TP/SL).
 * Clears execution state and fade animation.
 */
export function reopenPosition(toolId: string): void {
  const engine = getToolsEngine();
  engine.updateTool(toolId, {
    positionStatus: 'open',
    exitPrice: undefined,
    exitReason: undefined,
  } as Partial<Tool>);
  engine.clearPositionFade(toolId);
}

// ============ PNL ENGINE ============

/**
 * Calculate P&L for a position.
 * Uses exitPrice if closed, currentPrice if open.
 */
export function calculatePnL(
  tool: PositionTool,
  currentPrice: number,
): { pnl: number; pnlPercent: number } {
  const isLong = tool.type === 'longPosition';
  const price = tool.positionStatus === 'closed' && tool.exitPrice != null
    ? tool.exitPrice
    : currentPrice;

  const priceDiff = isLong ? price - tool.entry : tool.entry - price;
  const pnlPercent = tool.entry > 0 ? (priceDiff / tool.entry) * 100 : 0;

  const accountSize = tool.accountSize || 10000;
  const riskPercent = tool.riskPercent || 1;
  const leverage = tool.leverage || 1;
  const risk = Math.abs(tool.entry - tool.stopLoss);
  const dollarRisk = accountSize * (riskPercent / 100);
  const positionSize = risk > 0 ? dollarRisk / risk : 0;
  const leveragedSize = positionSize * leverage;
  const pnl = leveragedSize * priceDiff;

  return { pnl, pnlPercent };
}

// ============ BATCH EVALUATION ============

/**
 * Evaluate all open positions against the latest candle.
 * Returns list of executions that triggered.
 */
export function evaluateAllPositions(candle: CandleData): ExecutionResult[] {
  const engine = getToolsEngine();
  const tools = engine.getAllTools();
  const results: ExecutionResult[] = [];

  for (const tool of tools) {
    if (tool.type !== 'longPosition' && tool.type !== 'shortPosition') continue;
    const pos = tool as PositionTool;
    if (pos.positionStatus === 'closed') continue;

    const mode = pos.executionMode || 'conservative';
    const result = evaluateCandle(pos, candle, mode);
    if (result) {
      closePosition(result.toolId, result);
      results.push(result);
    }
  }

  return results;
}
