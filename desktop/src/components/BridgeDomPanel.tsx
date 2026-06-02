// Live L2 Depth-of-Market sidebar — mirrors the ATAS DOM column.
//
// Listens to the backend's `bridge-depth-update` Tauri event, keeps a
// per-symbol snapshot in component state, and renders a vertical
// ladder of (bid | price | ask) rows centred on the spread. Best bid
// + best ask get a subtle highlight; volume bars are proportional to
// the max in the current view so dominant levels read at a glance.
//
// The component is mounted as a right-side sibling of the chart in
// BridgeFootprint. It is symbol-driven by props (the parent already
// owns the current bridge symbol from the M header). Cold start: when
// no snapshot has arrived yet we render an empty ladder + "waiting for
// depth" hint instead of nothing.

import { useEffect, useMemo, useRef, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  fetchDepth,
  type DepthLevel,
  type DepthSnapshot,
} from "../lib/bridge_depth/api";

const PALETTE = {
  bid: "#089981",
  ask: "#F2385A",
  text: "#D1D4DC",
  textDim: "#787B86",
  rowBg: "transparent",
  bestRow: "rgba(255, 255, 255, 0.045)",
  divider: "rgba(255, 255, 255, 0.05)",
};

type Props = {
  symbol: string;
  /** Optional: number of levels to display on each side. Default 12. */
  depth?: number;
};

export function BridgeDomPanel({ symbol, depth = 12 }: Props) {
  const [snap, setSnap] = useState<DepthSnapshot | null>(null);
  // Last event timestamp — drives a tiny "X s ago" hint so the user
  // knows the panel is live (not frozen on a stale snapshot).
  const lastSeenRef = useRef<number>(0);
  const [tickCounter, setTickCounter] = useState(0);

  // Seed snapshot on mount + every time the symbol changes. The
  // periodic `bridge-depth-update` batch will overwrite this within
  // 16ms but the seed prevents a blank frame.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const fresh = await fetchDepth(symbol);
        if (cancelled || !fresh) return;
        setSnap(fresh);
        lastSeenRef.current = Date.now();
      } catch (e) {
        console.warn("bridge_get_depth seed failed:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  // Live listener — backend coalesces a 16 ms window and ships a
  // `Vec<DepthSnapshot>` per event. We pick the snapshot for our
  // current symbol and overwrite local state.
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let cancelled = false;
    void listen<DepthSnapshot[]>("bridge-depth-update", (event) => {
      const match = event.payload.find((s) => s.symbol === symbol);
      if (!match) return;
      setSnap(match);
      lastSeenRef.current = Date.now();
    }).then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      unlisten = fn;
    });
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [symbol]);

  // Lightweight tick counter so the "X s ago" hint refreshes
  // without forcing the listener handler to setState every frame.
  useEffect(() => {
    const id = setInterval(() => setTickCounter((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Slice the snapshot to the requested visible depth.
  const visible = useMemo(() => {
    if (!snap) return { bids: [] as DepthLevel[], asks: [] as DepthLevel[], maxVol: 1 };
    const bids = snap.bids.slice(0, depth);
    const asks = snap.asks.slice(0, depth);
    const maxVol = Math.max(
      1,
      ...bids.map((l) => l.volume),
      ...asks.map((l) => l.volume),
    );
    return { bids, asks, maxVol };
  }, [snap, depth]);

  const ageStr = useMemo(() => {
    if (!lastSeenRef.current) return "—";
    const ageS = Math.max(0, Math.floor((Date.now() - lastSeenRef.current) / 1000));
    if (ageS < 1) return "live";
    if (ageS < 60) return `${ageS}s ago`;
    return `${Math.floor(ageS / 60)}m ago`;
    // tickCounter is intentionally read so the memo re-fires every second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickCounter]);

  const empty = visible.bids.length === 0 && visible.asks.length === 0;

  return (
    <div
      style={{
        width: 200,
        display: "flex",
        flexDirection: "column",
        background: "#0a0a0a",
        borderLeft: "1px solid rgba(255, 255, 255, 0.06)",
        color: PALETTE.text,
        fontFamily: '"Consolas", "Monaco", monospace',
        fontSize: 11,
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          padding: "8px 10px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          fontSize: 10,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: PALETTE.textDim,
        }}
      >
        <span>DOM · {symbol || "—"}</span>
        <span style={{ fontSize: 9 }}>{ageStr}</span>
      </div>

      {empty ? (
        <div
          style={{
            padding: 24,
            color: PALETTE.textDim,
            fontSize: 11,
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          Waiting for depth events…
          <div style={{ marginTop: 6, fontSize: 10 }}>
            Requires L2 data subscription on the NinjaTrader feed.
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          {/* Asks rendered top-down with worst → best, so best ask
              sits adjacent to best bid in the middle (canonical
              ladder orientation). */}
          <DomSide
            levels={[...visible.asks].reverse()}
            maxVol={visible.maxVol}
            side="ask"
            isBest={(i) => i === visible.asks.length - 1}
          />
          <div
            style={{
              height: 1,
              background: PALETTE.divider,
              flexShrink: 0,
            }}
          />
          <DomSide
            levels={visible.bids}
            maxVol={visible.maxVol}
            side="bid"
            isBest={(i) => i === 0}
          />
        </div>
      )}
    </div>
  );
}

function DomSide({
  levels,
  maxVol,
  side,
  isBest,
}: {
  levels: DepthLevel[];
  maxVol: number;
  side: "bid" | "ask";
  isBest: (idx: number) => boolean;
}) {
  const color = side === "bid" ? PALETTE.bid : PALETTE.ask;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      {levels.map((lvl, i) => {
        const wPct = Math.min(100, (lvl.volume / maxVol) * 100);
        const best = isBest(i);
        // Bid bars grow rightwards from the price column; ask bars
        // grow leftwards (mirror) so the ladder feels symmetrical.
        const barAlignRight = side === "ask";
        return (
          <div
            key={`${side}-${lvl.price}-${i}`}
            style={{
              position: "relative",
              display: "grid",
              gridTemplateColumns: "1fr 64px 1fr",
              alignItems: "center",
              padding: "3px 8px",
              background: best ? PALETTE.bestRow : PALETTE.rowBg,
              minHeight: 18,
            }}
          >
            {/* Volume bar — positioned absolutely so it sits BEHIND
                the text without disturbing the grid. */}
            <div
              style={{
                position: "absolute",
                top: 1,
                bottom: 1,
                left: barAlignRight ? undefined : "calc(50% - 32px)",
                right: barAlignRight ? "calc(50% - 32px)" : undefined,
                width: `${(wPct / 100) * 60}%`,
                maxWidth: "calc(50% - 32px)",
                background: `${color}33`,
                borderTop: best ? `1px solid ${color}` : undefined,
                borderBottom: best ? `1px solid ${color}` : undefined,
                pointerEvents: "none",
              }}
            />
            {/* Bid volume column — left half */}
            <span
              style={{
                textAlign: "right",
                color: side === "bid" ? color : "transparent",
                fontVariantNumeric: "tabular-nums",
                zIndex: 1,
              }}
            >
              {side === "bid" ? lvl.volume.toLocaleString() : ""}
            </span>
            {/* Price column — centre, always visible. */}
            <span
              style={{
                textAlign: "center",
                color: best ? "#ffffff" : PALETTE.text,
                fontWeight: best ? 700 : 500,
                zIndex: 1,
              }}
            >
              {lvl.price.toFixed(2)}
            </span>
            {/* Ask volume column — right half */}
            <span
              style={{
                textAlign: "left",
                color: side === "ask" ? color : "transparent",
                fontVariantNumeric: "tabular-nums",
                zIndex: 1,
              }}
            >
              {side === "ask" ? lvl.volume.toLocaleString() : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}
