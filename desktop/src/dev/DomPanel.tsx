import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { DOM_PANEL_DEPTH } from "../core";
import type { HeatmapEngine } from "../render/HeatmapEngine";

// DOM latéral (REFONTE-5). Composant React imperatif :
// - 40 rows pré-créées au mount (20 asks au-dessus, 20 bids en-dessous).
// - setInterval 10 Hz lit `engine.getLastOrderbookSnap()` (ref zero-copy)
//   et update textContent + style.background des rows existantes.
// - Pas de useState à 10 Hz (cause re-render React inutile à 100 ms).
// - Color bar 4 px à gauche : alpha proportionnel à qty / max(qty top N).

interface DomPanelProps {
  engineRef: RefObject<HeatmapEngine | null>;
}

export function DomPanel({ engineRef }: DomPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const N = DOM_PANEL_DEPTH;

    interface Row {
      el: HTMLDivElement;
      bar: HTMLDivElement;
      price: HTMLSpanElement;
      qty: HTMLSpanElement;
    }
    const rows: Row[] = [];
    for (let i = 0; i < N * 2; i++) {
      const el = document.createElement("div");
      el.className = "dom-panel-row";
      const bar = document.createElement("div");
      bar.className = "dom-panel-bar";
      const price = document.createElement("span");
      price.className = "dom-panel-price";
      const qty = document.createElement("span");
      qty.className = "dom-panel-qty";
      el.appendChild(bar);
      el.appendChild(price);
      el.appendChild(qty);
      container.appendChild(el);
      rows.push({ el, bar, price, qty });
    }

    const ticker = window.setInterval(() => {
      const engine = engineRef.current;
      if (!engine) return;
      const snap = engine.getLastOrderbookSnap();
      if (!snap) return;
      const asks = snap.asks.slice(0, N);
      const bids = snap.bids.slice(0, N);

      let maxQty = 0;
      for (let i = 0; i < asks.length; i++) {
        if (asks[i].size > maxQty) maxQty = asks[i].size;
      }
      for (let i = 0; i < bids.length; i++) {
        if (bids[i].size > maxQty) maxQty = bids[i].size;
      }

      // Asks affichés du HAUT (highest ask = furthest from mid) vers le centre.
      // i=0 → asks[N-1], i=N-1 → asks[0] (best ask juste au-dessus du mid).
      for (let i = 0; i < N; i++) {
        const r = rows[i];
        const a = asks[N - 1 - i];
        if (a) {
          r.price.textContent = a.price.toFixed(2);
          r.qty.textContent = a.size.toFixed(3);
          r.bar.style.background = `rgba(239, 83, 80, ${
            maxQty > 0 ? Math.min(1, a.size / maxQty).toFixed(2) : "0"
          })`;
          r.el.style.visibility = "visible";
        } else {
          r.el.style.visibility = "hidden";
        }
      }
      // Bids du centre (best bid juste en-dessous du mid) vers le BAS.
      // i=0 → bids[0] (highest bid), i=N-1 → bids[N-1] (lowest).
      for (let i = 0; i < N; i++) {
        const r = rows[N + i];
        const b = bids[i];
        if (b) {
          r.price.textContent = b.price.toFixed(2);
          r.qty.textContent = b.size.toFixed(3);
          r.bar.style.background = `rgba(38, 166, 154, ${
            maxQty > 0 ? Math.min(1, b.size / maxQty).toFixed(2) : "0"
          })`;
          r.el.style.visibility = "visible";
        } else {
          r.el.style.visibility = "hidden";
        }
      }
    }, 100);

    return () => {
      window.clearInterval(ticker);
      container.innerHTML = "";
    };
  }, [engineRef]);

  return <div ref={containerRef} className="dom-panel" />;
}
