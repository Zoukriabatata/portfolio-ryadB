// Indicators dropdown + detached config panel.
// Left panel  → toggle LED + gear icon per indicator.
// Right panel → glassmorphism config panel with sections + reset.
// Both panels rendered via createPortal (position:fixed) to escape
// .app-shell overflow:hidden.

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { useFootprintSettingsStore } from "../../stores/useFootprintSettingsStore";
import type { FootprintSettings } from "../../stores/useFootprintSettingsStore";
import "./IndicatorsButton.css";

// ── Types ────────────────────────────────────────────────────────────────────

type BoolKey = {
  [K in keyof FootprintSettings]: FootprintSettings[K] extends boolean ? K : never;
}[keyof FootprintSettings];

type NumKey = {
  [K in keyof FootprintSettings]: FootprintSettings[K] extends number ? K : never;
}[keyof FootprintSettings];

type ParamSpec =
  | { type: "number"; key: NumKey;   label: string; min: number; max: number; step: number; unit?: string; section?: string; default?: number }
  | { type: "select"; key: keyof FootprintSettings; label: string; options: { value: string; label: string }[]; section?: string; default?: string }
  | { type: "toggle"; key: BoolKey;  label: string; section?: string; default?: boolean };

type IndicatorEntry = {
  key: BoolKey;
  label: string;
  description?: string;
  group?: string;
  params?: ParamSpec[];
};

// ── Registry ─────────────────────────────────────────────────────────────────

const INDICATORS: IndicatorEntry[] = [
  {
    key: "showVwapIndicator",
    label: "VWAP",
    description: "Volume-Weighted Average Price · CME session (17:00 CT)",
    group: "Overlays",
  },
  {
    key: "showStackedImbalances",
    label: "Stacked Imbalances",
    description: "N consecutive imbalanced levels in the same direction",
    group: "Overlays",
    params: [
      { type: "number", key: "imbalanceRatio",            label: "Ratio",       min: 1.5, max: 10,   step: 0.5, default: 3.0, section: "Detection"     },
      { type: "number", key: "imbalanceMinConsecutive",   label: "Min levels",  min: 2,   max: 8,    step: 1,   default: 3,   section: "Detection"     },
      { type: "number", key: "imbalanceCellRate",         label: "Rate %",      min: 100, max: 1000, step: 50,  default: 200, section: "Cell coloring" },
      { type: "number", key: "imbalanceCellVolumeFilter", label: "Vol filter",  min: 0,   max: 500,  step: 5,   default: 20,  section: "Cell coloring" },
      { type: "number", key: "imbalanceCellMinDiff",      label: "Min diff",    min: 0,   max: 100,  step: 5,   default: 10,  section: "Cell coloring" },
      { type: "toggle", key: "imbalanceCellIgnoreZero",   label: "Ignore zero",                                 default: false, section: "Cell coloring" },
    ],
  },
  {
    key: "showNakedPOCs",
    label: "Naked POCs",
    description: "Highest-volume price of past bars not yet revisited",
    group: "Overlays",
  },
  {
    key: "showUnfinishedAuctions",
    label: "Unfinished Auctions",
    description: "Bar extreme with zero aggressive volume — likely retested",
    group: "Overlays",
  },
  {
    key: "showAbsorption",
    label: "Absorption",
    description: "Heavy aggressive volume absorbed without price breaking through",
    group: "Overlays",
  },
  {
    key: "showAbsorptionZones",
    label: "Absorption Zones",
    description: "ATAS V1 — N stacked levels · extended rectangle until price returns",
    group: "Overlays",
    params: [
      { type: "number", key: "absorptionZoneRatio",         label: "Ratio",         min: 100, max: 1000, step: 10,  default: 150, section: "Detection",    unit: "×100" },
      { type: "number", key: "absorptionZoneStackedLevels", label: "Stacked levels",min: 2,   max: 10,   step: 1,   default: 3,   section: "Detection"    },
      { type: "number", key: "absorptionZoneMinVolume",     label: "Min vol/level", min: 1,   max: 1000, step: 5,   default: 50,  section: "Detection"    },
      { type: "number", key: "absorptionZoneDaysBack",      label: "Days look back",min: 1,   max: 365,  step: 1,   default: 80,  section: "Detection",    unit: "d" },
      { type: "toggle", key: "absorptionZoneLastBarOnly",   label: "Last bar only",                                 default: false, section: "Detection"  },
      { type: "number", key: "absorptionZoneLineWidth",     label: "Border width",  min: 1,   max: 4,    step: 1,   default: 1,   section: "Appearance"   },
      { type: "toggle", key: "absorptionZoneUseAlert",      label: "Alert on detect",                               default: true,  section: "Alerts"     },
    ],
  },
  {
    key: "showCvdDivergence",
    label: "CVD Divergence",
    description: "Trendlines on price / CVD pivot pairs — bearish & bullish divergence",
    group: "Overlays",
    params: [
      { type: "number", key: "cvdDivergencePivotBars", label: "Pivot lookback", min: 2, max: 20, step: 1, default: 5, section: "Detection" },
    ],
  },
  {
    key: "showClusterStat",
    label: "Cluster Statistic",
    description: "Per-bar Ask / Bid / Delta / Vol row under each candle",
    group: "Panels",
  },
  {
    key: "showBarDelta",
    label: "Bar Delta",
    description: "Net delta label above each bar's high",
    group: "Panels",
  },
  {
    key: "showDeltaProfile",
    label: "Delta Profile",
    description: "Vertical histogram of net delta per price level",
    group: "Panels",
  },
  {
    key: "showCvd",
    label: "CVD",
    description: "Cumulative Volume Delta oscillator",
    group: "Panels",
    params: [
      {
        type: "select", key: "cvdMode", label: "Display", default: "candles",
        options: [{ value: "candles", label: "Candles" }, { value: "line", label: "Line" }],
        section: "Appearance",
      },
      { type: "number", key: "cvdPanelHeight", label: "Height", min: 40, max: 300, step: 10, unit: "px", default: 80, section: "Appearance" },
    ],
  },
  {
    key: "showDom",
    label: "DOM",
    description: "Bid / Ask depth-of-market volume bars (left panel)",
    group: "Panels",
    params: [
      { type: "number", key: "domProportion", label: "Width", min: 50, max: 400, step: 10, unit: "px", default: 100, section: "Layout" },
    ],
  },
];

// ── Param controls ────────────────────────────────────────────────────────────

function ParamNumber({ spec }: { spec: Extract<ParamSpec, { type: "number" }> }) {
  const value = useFootprintSettingsStore((s) => s[spec.key] as number);
  const set   = useFootprintSettingsStore((s) => s.set);
  const round = (n: number) => parseFloat(n.toFixed(10));
  const dec = () => set(spec.key, Math.max(spec.min, round(value - spec.step)));
  const inc = () => set(spec.key, Math.min(spec.max, round(value + spec.step)));
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = parseFloat(e.target.value);
    if (Number.isFinite(n)) set(spec.key, Math.min(spec.max, Math.max(spec.min, n)));
  };
  const pct = ((value - spec.min) / (spec.max - spec.min)) * 100;
  return (
    <div className="ind-param-row">
      <span className="ind-param-label">{spec.label}</span>
      <div className="ind-param-right">
        <div className="ind-param-stepper">
          <button type="button" className="ind-param-step" onClick={dec}>−</button>
          <div className="ind-param-input-wrap">
            <div className="ind-param-track" style={{ width: `${pct}%` }} />
            <input
              type="number" className="ind-param-input"
              value={value} min={spec.min} max={spec.max} step={spec.step}
              onChange={onChange}
            />
          </div>
          {spec.unit && <span className="ind-param-unit">{spec.unit}</span>}
          <button type="button" className="ind-param-step" onClick={inc}>+</button>
        </div>
      </div>
    </div>
  );
}

function ParamSelect({ spec }: { spec: Extract<ParamSpec, { type: "select" }> }) {
  const value = useFootprintSettingsStore((s) => s[spec.key] as string);
  const set   = useFootprintSettingsStore((s) => s.set);
  return (
    <div className="ind-param-row">
      <span className="ind-param-label">{spec.label}</span>
      <div className="ind-param-right">
        <select
          className="ind-param-select"
          value={value}
          onChange={(e) => set(spec.key, e.target.value as FootprintSettings[typeof spec.key])}
        >
          {spec.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    </div>
  );
}

function ParamToggle({ spec }: { spec: Extract<ParamSpec, { type: "toggle" }> }) {
  const value  = useFootprintSettingsStore((s) => s[spec.key] as boolean);
  const toggle = useFootprintSettingsStore((s) => s.toggle);
  return (
    <div className="ind-param-row">
      <span className="ind-param-label">{spec.label}</span>
      <div className="ind-param-right">
        <button
          type="button"
          className={`ind-param-toggle ${value ? "ind-param-toggle-on" : ""}`}
          onClick={() => toggle(spec.key)}
          aria-pressed={value}
        >
          <span className="ind-param-toggle-track">
            <span className="ind-param-toggle-thumb" />
          </span>
          <span className="ind-param-toggle-val">{value ? "ON" : "OFF"}</span>
        </button>
      </div>
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const GearIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06
      a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09
      a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83
      l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4
      h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83
      l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09
      a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83
      l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4
      h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

// ── Config panel ──────────────────────────────────────────────────────────────

function ConfigPanel({
  entry, pos, onClose, panelRef,
}: {
  entry: IndicatorEntry;
  pos: { top: number; left: number };
  onClose: () => void;
  panelRef: React.RefObject<HTMLDivElement | null>;
}) {
  const set   = useFootprintSettingsStore((s) => s.set);
  const toggle = useFootprintSettingsStore((s) => s.toggle);
  const PANEL_W = 288;
  const safeLeft = Math.min(pos.left, window.innerWidth - PANEL_W - 12);

  // Group params by section.
  const sections: { name: string; items: ParamSpec[] }[] = [];
  for (const p of entry.params ?? []) {
    const s = p.section ?? "";
    let sec = sections.find((x) => x.name === s);
    if (!sec) { sec = { name: s, items: [] }; sections.push(sec); }
    sec.items.push(p);
  }

  function handleReset() {
    for (const p of entry.params ?? []) {
      if (p.default === undefined) continue;
      if (p.type === "toggle") {
        const cur = useFootprintSettingsStore.getState()[p.key] as boolean;
        if (cur !== p.default) toggle(p.key);
      } else {
        set(p.key, p.default as FootprintSettings[typeof p.key]);
      }
    }
  }

  const renderParam = (p: ParamSpec, i: number) => {
    if (p.type === "number") return <ParamNumber key={i} spec={p} />;
    if (p.type === "select") return <ParamSelect key={i} spec={p} />;
    return <ParamToggle key={i} spec={p} />;
  };

  return createPortal(
    <div
      ref={panelRef}
      className="ind-config-panel"
      style={{ position: "fixed", top: pos.top, left: safeLeft, width: PANEL_W }}
    >
      {/* Top accent bar */}
      <div className="ind-config-stripe" />

      {/* Header */}
      <div className="ind-config-header">
        <div className="ind-config-title">
          <span className="ind-config-title-icon"><GearIcon /></span>
          <span>{entry.label}</span>
        </div>
        <button type="button" className="ind-config-close" onClick={onClose} aria-label="Close">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Params */}
      <div className="ind-config-body">
        {sections.map((sec, si) => (
          <div key={si} className="ind-config-section">
            {sec.name && <div className="ind-config-section-label">{sec.name}</div>}
            <div className="ind-config-section-body">
              {sec.items.map(renderParam)}
            </div>
          </div>
        ))}
      </div>

      {/* Footer with reset */}
      {(entry.params ?? []).some((p) => p.default !== undefined) && (
        <div className="ind-config-footer">
          <button type="button" className="ind-config-reset" onClick={handleReset}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.36 2.64L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            Reset to defaults
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function IndicatorsButton() {
  const [open, setOpen]             = useState(false);
  const [configKey, setConfigKey]   = useState<BoolKey | null>(null);
  const [configPos, setConfigPos]   = useState<{ top: number; left: number } | null>(null);

  const btnRef    = useRef<HTMLButtonElement>(null);
  const menuRef   = useRef<HTMLDivElement>(null);
  const configRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  const settings = useFootprintSettingsStore();
  const toggle   = useFootprintSettingsStore((s) => s.toggle);

  useEffect(() => {
    if (!open) { setMenuPos(null); setConfigKey(null); setConfigPos(null); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setMenuPos({ top: r.bottom + 6, left: r.left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !configRef.current?.contains(t) && !btnRef.current?.contains(t))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { if (configKey) setConfigKey(null); else setOpen(false); }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open, configKey]);

  const activeCount = INDICATORS.filter((it) => settings[it.key]).length;

  const groups: { name: string; items: IndicatorEntry[] }[] = [];
  for (const ind of INDICATORS) {
    const g = ind.group ?? "";
    let grp = groups.find((x) => x.name === g);
    if (!grp) { grp = { name: g, items: [] }; groups.push(grp); }
    grp.items.push(ind);
  }

  function openConfig(key: BoolKey, gearEl: HTMLElement) {
    if (configKey === key) { setConfigKey(null); setConfigPos(null); return; }
    const menuRect = menuRef.current?.getBoundingClientRect();
    const gearRect = gearEl.getBoundingClientRect();
    if (menuRect) setConfigPos({ top: gearRect.top - 4, left: menuRect.right + 10 });
    setConfigKey(key);
  }

  const configEntry = configKey ? INDICATORS.find((it) => it.key === configKey) ?? null : null;

  return (
    <>
      <button ref={btnRef} type="button"
        className={`ind-btn ${open ? "ind-btn-open" : ""} ${activeCount > 0 ? "ind-btn-has-active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title="Indicators" aria-label="Indicators" aria-haspopup="menu" aria-expanded={open}>
        <span className="ind-icon" aria-hidden>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 17l4-6 4 4 4-9 4 7 2-1" />
          </svg>
        </span>
        <span className="ind-label">Indicators</span>
        {activeCount > 0 && <span className="ind-count">{activeCount}</span>}
        <span className="ind-caret" aria-hidden>▾</span>
      </button>

      {/* Dropdown */}
      {open && menuPos && createPortal(
        <div ref={menuRef} className="ind-menu" role="menu"
          style={{ position: "fixed", top: menuPos.top, left: menuPos.left }}>
          {groups.map((grp) => (
            <div key={grp.name} className="ind-group">
              {grp.name && (
                <div className="ind-group-header">
                  <span className="ind-group-label">{grp.name}</span>
                  <span className="ind-group-line" />
                </div>
              )}
              {grp.items.map((it) => {
                const active    = !!settings[it.key];
                const hasParams = (it.params?.length ?? 0) > 0;
                const cfgOpen   = configKey === it.key;
                return (
                  <div key={it.key}
                    className={`ind-row ${active ? "ind-row-active" : ""} ${cfgOpen ? "ind-row-cfg" : ""}`}>
                    <button type="button" role="menuitemcheckbox" aria-checked={active}
                      className="ind-row-toggle" onClick={() => toggle(it.key)}>
                      <span className={`ind-led ${active ? "ind-led-on" : ""}`} aria-hidden />
                      <span className="ind-row-text">
                        <span className="ind-row-label">{it.label}</span>
                        {it.description && <span className="ind-row-desc">{it.description}</span>}
                      </span>
                    </button>
                    {hasParams && (
                      <button type="button"
                        className={`ind-gear ${cfgOpen ? "ind-gear-open" : ""}`}
                        onClick={(e) => openConfig(it.key, e.currentTarget)}
                        aria-label={`${it.label} settings`}>
                        <GearIcon />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>,
        document.body,
      )}

      {/* Config panel */}
      {configEntry && configPos && (
        <ConfigPanel entry={configEntry} pos={configPos}
          onClose={() => { setConfigKey(null); setConfigPos(null); }}
          panelRef={configRef} />
      )}
    </>
  );
}
