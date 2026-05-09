// Phase B / M6b-1 — toolbar with 5 visibility toggles for the
// heatmap overlays. Reads + writes the shared
// useFootprintSettingsStore (cross-surface — toggling POC here
// also flips it on the footprint canvas, matches the operator's
// mental model of "POC visibility is one global preference").

import { useFootprintSettingsStore } from "../../stores/useFootprintSettingsStore";
import "./HeatmapToolbar.css";

type ToggleKey =
  | "showTradeBubbles"
  | "showPocSession"
  | "showVAH"
  | "showVAL"
  | "showVWAP";

const TOGGLES: { key: ToggleKey; label: string; tone: string }[] = [
  { key: "showTradeBubbles", label: "Trades", tone: "tone-buy" },
  { key: "showPocSession", label: "POC", tone: "tone-poc" },
  { key: "showVAH", label: "VAH", tone: "tone-amber" },
  { key: "showVAL", label: "VAL", tone: "tone-amber" },
  { key: "showVWAP", label: "VWAP", tone: "tone-vwap" },
];

export function HeatmapToolbar() {
  const settings = useFootprintSettingsStore();

  return (
    <div className="hmt-bar" role="toolbar" aria-label="Heatmap overlays">
      {TOGGLES.map(({ key, label, tone }) => {
        const active = settings[key];
        return (
          <button
            key={key}
            type="button"
            className={`hmt-pill hmt-${tone} ${active ? "hmt-active" : ""}`}
            onClick={() => settings.toggle(key)}
            aria-pressed={active}
            title={`${active ? "Hide" : "Show"} ${label}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
