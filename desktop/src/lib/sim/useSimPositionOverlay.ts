// Bridges the sim trading position to the chart's TradeDrawing system.
//
// Behaviour:
//  • When the sim position opens → a synthetic TradeDrawing is inserted
//    into useToolDrawingsStore with a stable id (SIM_DRAWING_ID) so the
//    renderer paints the entry / stop / target lines on the chart.
//  • While the position is live → the drawing's stop / target are kept
//    in sync BOTH WAYS :
//       sim store changes  → drawing patched   (e.g. typed SL in panel)
//       drawing changes    → sim store patched (e.g. user drags SL line)
//    The last-update wins, with a 50 ms re-entry guard so the mirror
//    doesn't ping-pong.
//  • When the position closes → the drawing is removed.
//
// We deliberately reuse the existing tradeDrawings system instead of
// rolling a custom overlay so we get the drag-handle UX, R:R zone fill,
// and price labels for free — exactly like the user-drawn LONG/SHORT
// setups produced by the toolbar tools.

import { useEffect, useRef } from "react";
import { useSimAccountStore } from "./useSimAccountStore";
import { useToolDrawingsStore } from "../../stores/useToolDrawingsStore";
import { computePnl, getContractSpec } from "./contractSpecs";
import type { HLineDrawing } from "../footprint/tradeDrawings";

/** Stable id prefix for working-order h-lines so they're easy to
 *  find, remove and update without colliding with user-drawn lines. */
const WORKING_ORDER_LINE_PREFIX = "sim:working:";

/** Stable id for the live position's entry h-line (one at a time —
 *  the sim store models a single net position, not a multi-leg book).
 *  Exported so the canvas hit-test can skip it (the line is read-only
 *  signage — no drag, no properties panel). */
export const POSITION_ENTRY_LINE_ID = "sim:position:entry";

/** Stable id for the position's stop-loss h-line. Draggable to adjust;
 *  drag commits back to `position.stopLoss` via setBrackets. */
const POSITION_SL_LINE_ID = "sim:position:sl";

/** Stable id for the position's take-profit h-line. Same drag-back
 *  semantics as the SL line. */
const POSITION_TP_LINE_ID = "sim:position:tp";

/** Legacy id from the now-removed sim-position TradeDrawing mirror.
 *  Kept so the one-shot purge below can find and remove any leftover
 *  drawing persisted from a session run before the feature was cut. */
const SIM_DRAWING_ID = "sim:active-position";

/** Bidirectional reflection guard. Set just before we trigger a write
 *  on either side; the receiving side checks it and skips. Cleared
 *  shortly after via a microtask. */
const ECHO_WINDOW_MS = 80;

/** Subscribe the chart's trade-drawing layer to the live sim position.
 *  Pass the *full* symbol the chart is displaying (incl. exchange,
 *  e.g. "MNQM6.CME") so the drawing's symbol-filter matches.
 *
 *  Returns nothing — side effects only. */
export function useSimPositionOverlay(fullSymbol: string) {
  // The renderer filters drawings by `currentSymbol` which is the raw
  // trading symbol WITHOUT the exchange suffix (e.g. "MNQM6", not
  // "MNQM6.CME"). All drawings we emit must use this same shape or
  // they'll be silently filtered out.
  const chartSymbol = fullSymbol.split(".")[0] ?? fullSymbol;

  const position = useSimAccountStore((s) => s.position);
  // Live price for the position's symbol — used to compute the
  // unrealised PnL we surface in the entry-line center label. We
  // intentionally select by symbol so the effect only re-runs when
  // *this* instrument's price ticks, not every other symbol.
  const livePrice = useSimAccountStore((s) =>
    position ? s.livePrices[position.symbol] ?? null : null,
  );
  const setBrackets = useSimAccountStore((s) => s.setBrackets);
  const workingOrders = useSimAccountStore((s) => s.workingOrders);
  const modifyWorkingOrder = useSimAccountStore((s) => s.modifyWorkingOrder);

  const drawings = useToolDrawingsStore((s) => s.drawings);
  const removeDrawing = useToolDrawingsStore((s) => s.removeDrawing);

  // lineDrawings is subscribed reactively here, but ONLY consumed by
  // the two "drag-back" effects at the bottom of this hook (they need
  // to detect when the user dragged a line so they can commit the
  // change to the sim store). The three "sim → drawing" effects above
  // (workingOrders→lines, position→entry, position→SL/TP) read it via
  // `useToolDrawingsStore.getState().lineDrawings` instead, because
  // listing it in their deps caused an infinite loop : each effect
  // writes via add/updateLineDrawing → new array ref → effect re-runs
  // → writes again. Drag-back effects are safe because their guard
  // (snapped === position.stopLoss / order.triggerPrice) holds after
  // one round-trip.
  const lineDrawings = useToolDrawingsStore((s) => s.lineDrawings);
  const addLineDrawing = useToolDrawingsStore((s) => s.addLineDrawing);
  const updateLineDrawing = useToolDrawingsStore((s) => s.updateLineDrawing);
  const removeLineDrawing = useToolDrawingsStore((s) => s.removeLineDrawing);

  // Echo guards — kept for the working-order h-line reconciliation
  // below so a drag-driven update doesn't ping-pong back into the
  // store.
  const lastWorkingWriteRef = useRef(0);
  const lastLineWriteRef = useRef(0);
  // SL/TP write echo : set when *this* hook writes the bracket lines,
  // checked by the drag-back effect to skip its own setBrackets call
  // for ECHO_WINDOW_MS. Without this, snap-to-tick FP drift causes
  // setBrackets → position → re-write → drag-back → setBrackets to
  // loop indefinitely on mount.
  const lastBracketsWriteRef = useRef(0);

  // The sim position → LONG/SHORT TradeDrawing mirror has been
  // removed: the user prefers a clean chart and doesn't want the
  // entry / SL / TP lines auto-injected when they buy or sell. The
  // sim store still holds the position; only the chart overlay is
  // suppressed. Working-order h-lines below are kept untouched.
  // This effect just sweeps a leftover drawing (from a previous
  // session run when the overlay was on) at mount.
  useEffect(() => {
    const stale = drawings.find((d) => d.id === SIM_DRAWING_ID);
    if (stale) removeDrawing(SIM_DRAWING_ID);
    // Intentionally run-once: cleanup needs to happen at mount, not
    // every drawings update, otherwise the user couldn't draw a real
    // tool with the same id (which they can't, but the intent is to
    // be a one-shot purge).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── workingOrders → h-lines on chart ──────────────────────
  useEffect(() => {
    const now = Date.now();

    // Build the set of expected line ids for the *current* symbol.
    const desired = new Map<string, HLineDrawing>();
    for (const o of workingOrders) {
      if (o.symbol !== chartSymbol) continue;
      const isBuy = o.type === "buy_limit" || o.type === "buy_stop";
      const id = `${WORKING_ORDER_LINE_PREFIX}${o.id}`;
      desired.set(id, {
        kind: "h-line",
        id,
        symbol: chartSymbol,
        price: o.triggerPrice,
        createdAt: o.createdAtMs,
        color: isBuy ? "#22c55e" : "#ff3d71",
        lineStyle: "dashed",
        lineWidth: 1.5,
      });
    }

    // Reconcile : add missing, update divergent, remove orphans.
    if (now - lastLineWriteRef.current < ECHO_WINDOW_MS) return;

    const lineDrawings = useToolDrawingsStore.getState().lineDrawings;
    const existingByIdForOurs = new Map<string, HLineDrawing>();
    for (const ld of lineDrawings) {
      if (ld.kind === "h-line" && ld.id.startsWith(WORKING_ORDER_LINE_PREFIX)) {
        existingByIdForOurs.set(ld.id, ld);
      }
    }

    // Remove orphans (working order no longer exists for this symbol).
    for (const [id] of existingByIdForOurs) {
      if (!desired.has(id)) {
        lastWorkingWriteRef.current = now;
        removeLineDrawing(id);
      }
    }
    // Add or patch desired lines.
    for (const [id, line] of desired) {
      const existing = existingByIdForOurs.get(id);
      if (!existing) {
        lastWorkingWriteRef.current = now;
        addLineDrawing(line);
      } else if (existing.price !== line.price) {
        lastWorkingWriteRef.current = now;
        updateLineDrawing(id, { price: line.price });
      }
    }
  }, [
    workingOrders,
    chartSymbol,
    addLineDrawing,
    updateLineDrawing,
    removeLineDrawing,
  ]);

  // ── live position → entry h-line ──────────────────────────
  // Single horizontal line at the fill price. Green for longs, red
  // for shorts. No SL/TP, no R:R zone — just the entry level so the
  // user can read the position context without the LONG/SHORT
  // trade-drawing overlay they explicitly opted out of.
  useEffect(() => {
    const lineDrawings = useToolDrawingsStore.getState().lineDrawings;
    const existing = lineDrawings.find(
      (ld) => ld.kind === "h-line" && ld.id === POSITION_ENTRY_LINE_ID,
    ) as HLineDrawing | undefined;

    // No position OR wrong symbol → make sure the line is gone.
    if (!position || position.symbol !== chartSymbol) {
      if (existing) removeLineDrawing(POSITION_ENTRY_LINE_ID);
      return;
    }

    const color = position.side === "long" ? "#22c55e" : "#ff3d71";
    // Center label = "entry · ±$pnl". PnL is computed against the
    // last live tick we've seen for this instrument; if no tick has
    // arrived yet (just-opened position, no footprint-update since)
    // we display "—" rather than fake a 0.00.
    const spec = getContractSpec(position.symbol);
    const entryText = position.entryPrice.toFixed(
      spec.tickSize < 1 ? 2 : 0,
    );
    let pnlText = "—";
    if (livePrice !== null && Number.isFinite(livePrice)) {
      const pnl = computePnl(
        spec,
        position.side,
        position.entryPrice,
        livePrice,
        position.qty,
      );
      const sign = pnl >= 0 ? "+" : "−";
      pnlText = `${sign}$${Math.abs(pnl).toFixed(2)}`;
    }
    const centerLabel = `${entryText}  ·  ${pnlText}`;
    if (!existing) {
      addLineDrawing({
        kind: "h-line",
        id: POSITION_ENTRY_LINE_ID,
        symbol: chartSymbol,
        price: position.entryPrice,
        createdAt: position.openedAtMs,
        color,
        lineStyle: "solid",
        lineWidth: 2.5,
        centerLabel,
      });
      return;
    }
    if (
      existing.price !== position.entryPrice ||
      existing.color !== color ||
      existing.centerLabel !== centerLabel
    ) {
      updateLineDrawing(POSITION_ENTRY_LINE_ID, {
        price: position.entryPrice,
        color,
        centerLabel,
      });
    }
  }, [
    position,
    livePrice,
    chartSymbol,
    addLineDrawing,
    updateLineDrawing,
    removeLineDrawing,
  ]);

  // ── position brackets → SL / TP h-lines (with zones + P&L) ─
  // SL = solid red h-line, dashed-stroke fill between entry and SL
  // (red translucent). TP = same in green. Both expose a center pill
  // showing the realized $loss / $profit if the bracket fires.
  useEffect(() => {
    const lineDrawings = useToolDrawingsStore.getState().lineDrawings;
    const slExisting = lineDrawings.find(
      (ld) => ld.kind === "h-line" && ld.id === POSITION_SL_LINE_ID,
    ) as HLineDrawing | undefined;
    const tpExisting = lineDrawings.find(
      (ld) => ld.kind === "h-line" && ld.id === POSITION_TP_LINE_ID,
    ) as HLineDrawing | undefined;

    // No position OR wrong symbol → strip both lines.
    if (!position || position.symbol !== chartSymbol) {
      if (slExisting) {
        lastBracketsWriteRef.current = Date.now();
        removeLineDrawing(POSITION_SL_LINE_ID);
      }
      if (tpExisting) {
        lastBracketsWriteRef.current = Date.now();
        removeLineDrawing(POSITION_TP_LINE_ID);
      }
      return;
    }

    const spec = getContractSpec(position.symbol);
    const decimals = spec.tickSize < 1 ? 2 : 0;
    const fmtPrice = (p: number) => p.toFixed(decimals);
    const fmtPnl = (pnl: number) => {
      const sign = pnl >= 0 ? "+" : "−";
      return `${sign}$${Math.abs(pnl).toFixed(2)}`;
    };

    // ── SL ──
    if (position.stopLoss !== null && Number.isFinite(position.stopLoss)) {
      const slPnl = computePnl(
        spec,
        position.side,
        position.entryPrice,
        position.stopLoss,
        position.qty,
      );
      const slLabel = `${fmtPrice(position.stopLoss)}  ·  ${fmtPnl(slPnl)}`;
      const slPayload: HLineDrawing = {
        kind: "h-line",
        id: POSITION_SL_LINE_ID,
        symbol: chartSymbol,
        price: position.stopLoss,
        createdAt: position.openedAtMs,
        color: "#ff3d71",
        lineStyle: "solid",
        lineWidth: 2.5,
        centerLabel: slLabel,
      };
      if (!slExisting) {
        lastBracketsWriteRef.current = Date.now();
        addLineDrawing(slPayload);
      } else if (
        slExisting.price !== position.stopLoss ||
        slExisting.centerLabel !== slLabel ||
        slExisting.fillToPrice !== undefined
      ) {
        lastBracketsWriteRef.current = Date.now();
        updateLineDrawing(POSITION_SL_LINE_ID, {
          price: position.stopLoss,
          centerLabel: slLabel,
          fillToPrice: undefined,
          fillColor: undefined,
        });
      }
    } else if (slExisting) {
      lastBracketsWriteRef.current = Date.now();
      removeLineDrawing(POSITION_SL_LINE_ID);
    }

    // ── TP ──
    if (position.takeProfit !== null && Number.isFinite(position.takeProfit)) {
      const tpPnl = computePnl(
        spec,
        position.side,
        position.entryPrice,
        position.takeProfit,
        position.qty,
      );
      const tpLabel = `${fmtPrice(position.takeProfit)}  ·  ${fmtPnl(tpPnl)}`;
      const tpPayload: HLineDrawing = {
        kind: "h-line",
        id: POSITION_TP_LINE_ID,
        symbol: chartSymbol,
        price: position.takeProfit,
        createdAt: position.openedAtMs,
        color: "#22c55e",
        lineStyle: "solid",
        lineWidth: 2.5,
        centerLabel: tpLabel,
      };
      if (!tpExisting) {
        lastBracketsWriteRef.current = Date.now();
        addLineDrawing(tpPayload);
      } else if (
        tpExisting.price !== position.takeProfit ||
        tpExisting.centerLabel !== tpLabel ||
        tpExisting.fillToPrice !== undefined
      ) {
        lastBracketsWriteRef.current = Date.now();
        updateLineDrawing(POSITION_TP_LINE_ID, {
          price: position.takeProfit,
          centerLabel: tpLabel,
          fillToPrice: undefined,
          fillColor: undefined,
        });
      }
    } else if (tpExisting) {
      lastBracketsWriteRef.current = Date.now();
      removeLineDrawing(POSITION_TP_LINE_ID);
    }
  }, [
    position,
    chartSymbol,
    addLineDrawing,
    updateLineDrawing,
    removeLineDrawing,
  ]);

  // ── SL / TP line drag → position.stopLoss / takeProfit ───
  // User dragged one of the bracket lines. Snap to tick, route to
  // setBrackets. Skips drags driven by our own store→drawing write
  // (echo window) so we don't ping-pong.
  useEffect(() => {
    if (!position) return;
    // Skip if we (the position→SL/TP write effect above) just wrote
    // the bracket lines ourselves — otherwise snap-to-tick FP drift
    // can re-feed setBrackets and loop infinitely on mount.
    if (Date.now() - lastBracketsWriteRef.current < ECHO_WINDOW_MS) return;
    const sl = lineDrawings.find(
      (ld) => ld.kind === "h-line" && ld.id === POSITION_SL_LINE_ID,
    ) as HLineDrawing | undefined;
    const tp = lineDrawings.find(
      (ld) => ld.kind === "h-line" && ld.id === POSITION_TP_LINE_ID,
    ) as HLineDrawing | undefined;
    if (!sl && !tp) return;
    const spec = getContractSpec(position.symbol);
    const snap = (p: number) => Math.round(p / spec.tickSize) * spec.tickSize;

    const nextSl = sl ? snap(sl.price) : position.stopLoss;
    const nextTp = tp ? snap(tp.price) : position.takeProfit;
    if (nextSl === position.stopLoss && nextTp === position.takeProfit) return;
    setBrackets(nextSl, nextTp);
  }, [lineDrawings, position, setBrackets]);

  // ── h-line drag → working order trigger price ─────────────
  useEffect(() => {
    if (workingOrders.length === 0) return;
    const now = Date.now();
    if (now - lastWorkingWriteRef.current < ECHO_WINDOW_MS) return;

    for (const ld of lineDrawings) {
      if (ld.kind !== "h-line") continue;
      if (!ld.id.startsWith(WORKING_ORDER_LINE_PREFIX)) continue;
      const orderId = ld.id.slice(WORKING_ORDER_LINE_PREFIX.length);
      const order = workingOrders.find((o) => o.id === orderId);
      if (!order) continue;
      const spec = getContractSpec(order.symbol);
      const snapped = Math.round(ld.price / spec.tickSize) * spec.tickSize;
      if (snapped !== order.triggerPrice) {
        lastLineWriteRef.current = now;
        modifyWorkingOrder(orderId, { triggerPrice: snapped });
      }
    }
  }, [lineDrawings, workingOrders, modifyWorkingOrder]);
}
