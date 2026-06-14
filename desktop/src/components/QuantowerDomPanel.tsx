// Live L2 Depth-of-Market sidebar for the Quantower bridge.
// Mirror of BridgeDomPanel.tsx — same layout, different event + API.

import { useEffect, useMemo, useRef, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  fetchQuantowerDepth,
  type DepthLevel,
  type DepthSnapshot,
} from "../lib/quantower_depth/api";

const PALETTE = {
  bid: "#089981",
  ask: "#F2385A",
  text: "#D1D4DC",
  textDim: "#787B86",
  bestBidBg: "rgba(8, 153, 129, 0.15)",
  bestAskBg: "rgba(242, 56, 90, 0.15)",
  divider: "rgba(255, 255, 255, 0.05)",
};

const HEADER_HEIGHT = 26;
const ROW_HEIGHT_PX = 16;

export type PriceMap = {
  minPrice: number;
  maxPrice: number;
  areaTopPx: number;
  areaHeightPx: number;
};

type Props = {
  symbol: string;
  depth?: number;
  priceMap: PriceMap | null;
};

export function QuantowerDomPanel({ symbol, depth = 15, priceMap }: Props) {
  const [snap, setSnap] = useState<DepthSnapshot | null>(null);
  const lastSeenRef = useRef<number>(0);
  const [tickCounter, setTickCounter] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const fresh = await fetchQuantowerDepth(symbol);
        if (cancelled || !fresh) return;
        setSnap(fresh);
        lastSeenRef.current = Date.now();
      } catch (e) {
        console.warn("quantower_get_depth seed failed:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let cancelled = false;
    void listen<DepthSnapshot[]>("quantower-depth-update", (event) => {
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

  useEffect(() => {
    const id = setInterval(() => setTickCounter((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

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
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          padding: "6px 10px",
          height: HEADER_HEIGHT,
          boxSizing: "border-box",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          fontSize: 10,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: PALETTE.textDim,
          flexShrink: 0,
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
            Requires L2 data subscription on the Quantower feed.
          </div>
        </div>
      ) : priceMap ? (
        <AlignedLadder
          bids={visible.bids}
          asks={visible.asks}
          maxVol={visible.maxVol}
          priceMap={priceMap}
        />
      ) : (
        <StackedLadder
          bids={visible.bids}
          asks={visible.asks}
          maxVol={visible.maxVol}
        />
      )}
    </div>
  );
}

function AlignedLadder({
  bids,
  asks,
  maxVol,
  priceMap,
}: {
  bids: DepthLevel[];
  asks: DepthLevel[];
  maxVol: number;
  priceMap: PriceMap;
}) {
  const { minPrice, maxPrice, areaTopPx, areaHeightPx } = priceMap;
  const range = Math.max(maxPrice - minPrice, 1e-9);
  const priceToY = (p: number) => areaTopPx + ((maxPrice - p) / range) * areaHeightPx;

  const bestBidPrice = bids[0]?.price;
  const bestAskPrice = asks[0]?.price;

  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
      {bids
        .filter((l) => l.price >= minPrice && l.price <= maxPrice)
        .map((l) => (
          <Row
            key={`bid-${l.price}`}
            level={l}
            maxVol={maxVol}
            side="bid"
            y={priceToY(l.price)}
            best={l.price === bestBidPrice}
          />
        ))}
      {asks
        .filter((l) => l.price >= minPrice && l.price <= maxPrice)
        .map((l) => (
          <Row
            key={`ask-${l.price}`}
            level={l}
            maxVol={maxVol}
            side="ask"
            y={priceToY(l.price)}
            best={l.price === bestAskPrice}
          />
        ))}
    </div>
  );
}

function Row({
  level,
  maxVol,
  side,
  y,
  best,
}: {
  level: DepthLevel;
  maxVol: number;
  side: "bid" | "ask";
  y: number;
  best: boolean;
}) {
  const color = side === "bid" ? PALETTE.bid : PALETTE.ask;
  const bestBg = side === "bid" ? PALETTE.bestBidBg : PALETTE.bestAskBg;
  const wPct = Math.min(1, level.volume / maxVol);
  const barAlignRight = side === "ask";
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: Math.round(y - ROW_HEIGHT_PX / 2),
        height: ROW_HEIGHT_PX,
        display: "grid",
        gridTemplateColumns: "1fr 64px 1fr",
        alignItems: "center",
        padding: "0 8px",
        background: best ? bestBg : undefined,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 1,
          bottom: 1,
          left: barAlignRight ? undefined : "calc(50% - 32px)",
          right: barAlignRight ? "calc(50% - 32px)" : undefined,
          width: `${wPct * 60}%`,
          maxWidth: "calc(50% - 32px)",
          background: `${color}33`,
          borderTop: best ? `1px solid ${color}` : undefined,
          borderBottom: best ? `1px solid ${color}` : undefined,
        }}
      />
      <span
        style={{
          textAlign: "right",
          color: side === "bid" ? color : "transparent",
          fontVariantNumeric: "tabular-nums",
          zIndex: 1,
        }}
      >
        {side === "bid" ? level.volume.toLocaleString() : ""}
      </span>
      <span
        style={{
          textAlign: "center",
          color: best ? "#ffffff" : PALETTE.text,
          fontWeight: best ? 700 : 500,
          zIndex: 1,
        }}
      >
        {level.price.toFixed(2)}
      </span>
      <span
        style={{
          textAlign: "left",
          color: side === "ask" ? color : "transparent",
          fontVariantNumeric: "tabular-nums",
          zIndex: 1,
        }}
      >
        {side === "ask" ? level.volume.toLocaleString() : ""}
      </span>
    </div>
  );
}

function StackedLadder({
  bids,
  asks,
  maxVol,
}: {
  bids: DepthLevel[];
  asks: DepthLevel[];
  maxVol: number;
}) {
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
      <StackedSide
        levels={[...asks].reverse()}
        maxVol={maxVol}
        side="ask"
        isBest={(i) => i === asks.length - 1}
      />
      <div style={{ height: 1, background: PALETTE.divider, flexShrink: 0 }} />
      <StackedSide
        levels={bids}
        maxVol={maxVol}
        side="bid"
        isBest={(i) => i === 0}
      />
    </div>
  );
}

function StackedSide({
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
              background: best
                ? side === "bid"
                  ? PALETTE.bestBidBg
                  : PALETTE.bestAskBg
                : undefined,
              minHeight: 18,
            }}
          >
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
