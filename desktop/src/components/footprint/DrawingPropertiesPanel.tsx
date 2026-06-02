// Floating properties toolbar — opens above the currently-selected
// drawing on the chart. Compact horizontal layout (one row, no
// stacking) so it stays out of the way of the chart underneath.
// Each drawing kind decides which fields render. Same brand chrome
// as the right-click context menu and modals.
//
// Position is owned by the caller (FootprintCanvas) so the toolbar
// can follow the drawing across pan / zoom.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  TradeDrawing,
  LineDrawing,
  LineStyle,
} from "../../lib/footprint/tradeDrawings";
import { computeRR } from "../../lib/footprint/tradeDrawings";
import {
  useDrawingPresetsStore,
  presetToPatch,
  type DrawingPresetKind,
} from "../../stores/useDrawingPresetsStore";
import "./DrawingPropertiesPanel.css";

type Props = {
  drawing: TradeDrawing | LineDrawing;
  clientX: number;
  clientY: number;
  onUpdateLine: (id: string, patch: Partial<LineDrawing>) => void;
  onUpdateTrade: (id: string, patch: Partial<TradeDrawing>) => void;
  onClose: () => void;
};

export function DrawingPropertiesPanel({
  drawing,
  clientX,
  clientY,
  onUpdateLine,
  onUpdateTrade,
  onClose,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({
    x: clientX,
    y: clientY,
  });

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    // Centre horizontally around the anchor X (toolbar is much
    // wider than tall now, so a centred placement reads as
    // attached to the drawing). Anchor above by default with a
    // flip-below fallback.
    let nx = clientX - rect.width / 2;
    let ny = clientY - rect.height - 12;
    if (ny < margin) ny = clientY + 16;
    if (nx + rect.width + margin > vw) nx = vw - rect.width - margin;
    if (nx < margin) nx = margin;
    if (ny + rect.height + margin > vh) ny = vh - rect.height - margin;
    setPos({ x: nx, y: ny });
  }, [clientX, clientY, drawing.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (
          wrapRef.current &&
          wrapRef.current.contains(document.activeElement)
        ) {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      ref={wrapRef}
      className="dpp"
      role="dialog"
      aria-label="Drawing properties"
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span className="dpp-handle">{drawingKindLabel(drawing)}</span>
      <div className="dpp-body">
        {renderFields(drawing, onUpdateLine, onUpdateTrade)}
        {presetKindFor(drawing) && (
          <>
            <Sep />
            <PresetField
              drawing={drawing as LineDrawing}
              onUpdateLine={onUpdateLine}
            />
          </>
        )}
      </div>
    </div>
  );
}

function presetKindFor(d: TradeDrawing | LineDrawing): DrawingPresetKind | null {
  if ("type" in d) return null; // trade drawings excluded for now
  if (
    d.kind === "h-line" ||
    d.kind === "h-ray" ||
    d.kind === "trend" ||
    d.kind === "rect" ||
    d.kind === "ruler" ||
    d.kind === "text"
  ) {
    return d.kind;
  }
  return null;
}

function drawingKindLabel(d: TradeDrawing | LineDrawing): string {
  if ("type" in d) return d.type;
  switch (d.kind) {
    case "h-line":
      return d.isAlert ? "Alert" : "H-Line";
    case "h-ray":
      return "H-Ray";
    case "trend":
      return "Trend";
    case "rect":
      return "Rect";
    case "text":
      return "Text";
    case "ruler":
      return "Ruler";
  }
}

function renderFields(
  d: TradeDrawing | LineDrawing,
  onUpdateLine: (id: string, patch: Partial<LineDrawing>) => void,
  onUpdateTrade: (id: string, patch: Partial<TradeDrawing>) => void,
) {
  // LONG / SHORT — entry/stop/target inline + zone opacity + R:R badge.
  if ("type" in d) {
    const rr = computeRR(d);
    const rrText = Number.isFinite(rr) ? `${rr.toFixed(2)} : 1` : "∞ : 1";
    return (
      <>
        <NumField
          label="Entry"
          value={d.entryPrice}
          step={0.25}
          onChange={(v) => onUpdateTrade(d.id, { entryPrice: v })}
        />
        <NumField
          label="Stop"
          value={d.stopPrice}
          step={0.25}
          onChange={(v) => onUpdateTrade(d.id, { stopPrice: v })}
        />
        <NumField
          label="Target"
          value={d.targetPrice}
          step={0.25}
          onChange={(v) => onUpdateTrade(d.id, { targetPrice: v })}
        />
        <Sep />
        <OpacityField
          label="Fill"
          value={d.zoneOpacity ?? 1}
          min={0}
          max={1.5}
          onChange={(v) => onUpdateTrade(d.id, { zoneOpacity: v })}
        />
        <Sep />
        <ReadOnlyField label="R:R" value={rrText} />
      </>
    );
  }

  if (d.kind === "h-line") {
    return (
      <>
        <ColorField
          label="Color"
          value={d.color ?? "#7ed321"}
          onChange={(v) => onUpdateLine(d.id, { color: v })}
        />
        <Sep />
        <StyleField
          value={d.lineStyle ?? "solid"}
          onChange={(v) => onUpdateLine(d.id, { lineStyle: v })}
        />
        <WidthField
          value={d.lineWidth ?? 1.5}
          onChange={(v) => onUpdateLine(d.id, { lineWidth: v })}
        />
        {d.isAlert && (
          <>
            <Sep />
            <span className="dpp-note">Beeps on cross</span>
          </>
        )}
      </>
    );
  }
  if (d.kind === "h-ray") {
    return (
      <>
        <ColorField
          label="Color"
          value={d.color ?? "#7ed321"}
          onChange={(v) => onUpdateLine(d.id, { color: v })}
        />
        <Sep />
        <StyleField
          value={d.lineStyle ?? "solid"}
          onChange={(v) => onUpdateLine(d.id, { lineStyle: v })}
        />
        <WidthField
          value={d.lineWidth ?? 1.5}
          onChange={(v) => onUpdateLine(d.id, { lineWidth: v })}
        />
        <Sep />
        <ExtendField
          extendLeft={d.extendLeft === true}
          extendRight={d.extendRight !== false}
          onChange={(patch) => onUpdateLine(d.id, patch)}
        />
      </>
    );
  }
  if (d.kind === "trend") {
    return (
      <>
        <ColorField
          label="Color"
          value={d.color ?? "#7ed321"}
          onChange={(v) => onUpdateLine(d.id, { color: v })}
        />
        <Sep />
        <StyleField
          value={d.lineStyle ?? "solid"}
          onChange={(v) => onUpdateLine(d.id, { lineStyle: v })}
        />
        <WidthField
          value={d.lineWidth ?? 1.5}
          onChange={(v) => onUpdateLine(d.id, { lineWidth: v })}
        />
        <Sep />
        <ExtendField
          extendLeft={d.extendLeft === true}
          extendRight={d.extendRight === true}
          onChange={(patch) => onUpdateLine(d.id, patch)}
        />
      </>
    );
  }
  if (d.kind === "ruler") {
    return (
      <>
        <ColorField
          label="Color"
          value={d.color ?? "#7ed321"}
          onChange={(v) => onUpdateLine(d.id, { color: v })}
        />
        <Sep />
        <StyleField
          value={d.lineStyle ?? "dashed"}
          onChange={(v) => onUpdateLine(d.id, { lineStyle: v })}
        />
        <WidthField
          value={d.lineWidth ?? 1.5}
          onChange={(v) => onUpdateLine(d.id, { lineWidth: v })}
        />
      </>
    );
  }
  if (d.kind === "rect") {
    return (
      <>
        <ColorField
          label="Border"
          value={d.borderColor ?? "#7ed321"}
          onChange={(v) => onUpdateLine(d.id, { borderColor: v })}
        />
        <ColorField
          label="Fill"
          value={d.fillColor ?? "#7ed321"}
          alpha
          onChange={(v) => onUpdateLine(d.id, { fillColor: v })}
        />
        <OpacityField
          label="Opacity"
          value={d.fillOpacity ?? 0.1}
          min={0}
          max={1}
          onChange={(v) => onUpdateLine(d.id, { fillOpacity: v })}
        />
        <Sep />
        <StyleField
          value={d.lineStyle ?? "solid"}
          onChange={(v) => onUpdateLine(d.id, { lineStyle: v })}
        />
        <WidthField
          value={d.borderWidth ?? 1.5}
          onChange={(v) => onUpdateLine(d.id, { borderWidth: v })}
        />
        <Sep />
        <ExtendField
          extendLeft={d.extendLeft === true}
          extendRight={d.extendRight === true}
          onChange={(patch) => onUpdateLine(d.id, patch)}
        />
      </>
    );
  }
  // text
  return (
    <>
      <TextContentField
        value={d.content}
        onChange={(v) => onUpdateLine(d.id, { content: v })}
      />
      <Sep />
      <FontSizeField
        value={d.fontSize ?? 12}
        onChange={(v) => onUpdateLine(d.id, { fontSize: v })}
      />
      <ToggleField
        label="B"
        title="Bold"
        active={!!d.bold}
        onClick={() => onUpdateLine(d.id, { bold: !d.bold })}
        style="bold"
      />
      <ToggleField
        label="I"
        title="Italic"
        active={!!d.italic}
        onClick={() => onUpdateLine(d.id, { italic: !d.italic })}
        style="italic"
      />
      <Sep />
      <ColorField
        label="Text"
        value={d.color ?? "#ffffff"}
        onChange={(v) => onUpdateLine(d.id, { color: v })}
      />
      <ColorField
        label="BG"
        value={d.bgColor ?? "#121216"}
        onChange={(v) => onUpdateLine(d.id, { bgColor: v })}
      />
    </>
  );
}

// ── Inline field components ────────────────────────────────────────────

function ColorField({
  label,
  value,
  alpha,
  onChange,
}: {
  label: string;
  value: string;
  alpha?: boolean;
  onChange: (v: string) => void;
}) {
  const display = alpha ? hexFromRgbaIfPossible(value) : value;
  return (
    <label className="dpp-field">
      <span className="dpp-label">{label}</span>
      <input
        type="color"
        value={display}
        onChange={(e) =>
          onChange(alpha ? toFillRgba(e.target.value) : e.target.value)
        }
        className="dpp-color"
        aria-label={label}
      />
    </label>
  );
}

function StyleField({
  value,
  onChange,
}: {
  value: LineStyle;
  onChange: (v: LineStyle) => void;
}) {
  const opts: { value: LineStyle; label: string }[] = [
    { value: "solid", label: "—" },
    { value: "dashed", label: "- -" },
    { value: "dotted", label: "···" },
  ];
  return (
    <div className="dpp-field">
      <span className="dpp-label">Style</span>
      <div className="dpp-seg" role="radiogroup" aria-label="Line style">
        {opts.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            title={o.value}
            className={`dpp-seg-btn ${value === o.value ? "dpp-seg-on" : ""}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function WidthField({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const opts = [1, 1.5, 2, 3];
  return (
    <div className="dpp-field">
      <span className="dpp-label">Width</span>
      <div className="dpp-seg" role="radiogroup" aria-label="Line width">
        {opts.map((w) => (
          <button
            key={w}
            type="button"
            role="radio"
            aria-checked={Math.abs(value - w) < 0.01}
            className={`dpp-seg-btn ${
              Math.abs(value - w) < 0.01 ? "dpp-seg-on" : ""
            }`}
            onClick={() => onChange(w)}
          >
            {w}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Two-button toggle for "extend left" / "extend right" — used by
 *  h-ray, trend, and rect drawings to project the shape beyond its
 *  anchored endpoints to the chart edges. Each side is independent. */
function ExtendField({
  extendLeft,
  extendRight,
  onChange,
}: {
  extendLeft: boolean;
  extendRight: boolean;
  onChange: (patch: { extendLeft?: boolean; extendRight?: boolean }) => void;
}) {
  return (
    <div className="dpp-field">
      <span className="dpp-label">Extend</span>
      <div className="dpp-seg" role="group" aria-label="Extend drawing">
        <button
          type="button"
          aria-pressed={extendLeft}
          title="Extend to the left"
          className={`dpp-seg-btn ${extendLeft ? "dpp-seg-on" : ""}`}
          onClick={() => onChange({ extendLeft: !extendLeft })}
        >
          ←
        </button>
        <button
          type="button"
          aria-pressed={extendRight}
          title="Extend to the right"
          className={`dpp-seg-btn ${extendRight ? "dpp-seg-on" : ""}`}
          onClick={() => onChange({ extendRight: !extendRight })}
        >
          →
        </button>
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="dpp-field">
      <span className="dpp-label">{label}</span>
      <input
        type="number"
        className="dpp-num"
        value={value}
        step={step}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
    </label>
  );
}

function TextContentField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="dpp-field dpp-field-stretch">
      <span className="dpp-label">Text</span>
      <input
        type="text"
        className="dpp-text-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        autoComplete="off"
      />
    </label>
  );
}

function OpacityField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const clamped = Math.max(min, Math.min(max, value));
  const pct = Math.round((clamped / (max === 0 ? 1 : max)) * 100);
  return (
    <label className="dpp-field">
      <span className="dpp-label">{label}</span>
      <span className="dpp-opacity">
        <input
          type="range"
          min={min}
          max={max}
          step={0.05}
          value={clamped}
          className="dpp-opacity-slider"
          onChange={(e) => onChange(parseFloat(e.target.value))}
          aria-label={`${label} opacity`}
        />
        <span className="dpp-opacity-val">{pct}%</span>
      </span>
    </label>
  );
}

function FontSizeField({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  // Discrete sizes — covers small annotations to header-style
  // labels without an open-ended numeric input crowding the
  // toolbar.
  const opts = [10, 12, 14, 18, 24];
  return (
    <div className="dpp-field">
      <span className="dpp-label">Size</span>
      <div className="dpp-seg" role="radiogroup" aria-label="Font size">
        {opts.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={value === s}
            className={`dpp-seg-btn ${value === s ? "dpp-seg-on" : ""}`}
            onClick={() => onChange(s)}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToggleField({
  label,
  title,
  active,
  onClick,
  style,
}: {
  label: string;
  title: string;
  active: boolean;
  onClick: () => void;
  style?: "bold" | "italic";
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`dpp-toggle ${active ? "dpp-toggle-on" : ""} ${
        style === "bold" ? "dpp-toggle-bold" : ""
      } ${style === "italic" ? "dpp-toggle-italic" : ""}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="dpp-field">
      <span className="dpp-label">{label}</span>
      <span className="dpp-readonly">{value}</span>
    </div>
  );
}

function Sep() {
  return <span className="dpp-sep" aria-hidden />;
}

function PresetField({
  drawing,
  onUpdateLine,
}: {
  drawing: LineDrawing;
  onUpdateLine: (id: string, patch: Partial<LineDrawing>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  // Select the raw presets array (stable reference until the store
  // mutates) and derive the per-kind filter via useMemo. Returning a
  // freshly-filtered array directly from the Zustand selector breaks
  // useSyncExternalStore's caching contract — getSnapshot is required
  // to return the same reference until the underlying state changes,
  // otherwise React loops "Maximum update depth exceeded" → unmount
  // (manifested here as the chart going blank when posing a Rectangle
  // because that's when DrawingPropertiesPanel mounts).
  const presets = useDrawingPresetsStore((s) => s.presets);
  const presetsForKind = useMemo(
    () => presets.filter((p) => p.kind === drawing.kind),
    [presets, drawing.kind],
  );
  const saveFromDrawing = useDrawingPresetsStore((s) => s.saveFromDrawing);
  const remove = useDrawingPresetsStore((s) => s.remove);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDocClick, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDocClick, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="dpp-field" ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        className={`dpp-preset-btn ${open ? "dpp-preset-btn-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title="Save / apply style preset"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden>
          <path
            d="M12 3l2.5 5.5L20 9.5l-4 4 1 5.5L12 16.5 7 19l1-5.5-4-4 5.5-1L12 3z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
        <span>Presets</span>
        {presetsForKind.length > 0 && (
          <span className="dpp-preset-count">{presetsForKind.length}</span>
        )}
      </button>
      {open && (
        <div className="dpp-preset-pop" role="menu">
          <div className="dpp-preset-save-row">
            <input
              type="text"
              className="dpp-preset-name"
              placeholder="Save current style as…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={32}
              spellCheck={false}
            />
            <button
              type="button"
              className="dpp-preset-save"
              disabled={name.trim().length === 0}
              onClick={() => {
                saveFromDrawing(name, drawing);
                setName("");
              }}
            >
              Save
            </button>
          </div>
          {presetsForKind.length === 0 ? (
            <div className="dpp-preset-empty">
              No presets for this tool yet
            </div>
          ) : (
            <ul className="dpp-preset-list">
              {presetsForKind.map((p) => (
                <li key={p.id} className="dpp-preset-item">
                  <button
                    type="button"
                    className="dpp-preset-apply"
                    onClick={() => {
                      onUpdateLine(drawing.id, presetToPatch(p));
                      setOpen(false);
                    }}
                    title={`Apply ${p.name}`}
                  >
                    {p.name}
                  </button>
                  <button
                    type="button"
                    className="dpp-preset-del"
                    onClick={() => remove(p.id)}
                    title="Delete preset"
                    aria-label={`Delete ${p.name}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── Colour helpers ───────────────────────────────────────────────────────

function hexFromRgbaIfPossible(s: string): string {
  if (s.startsWith("#") && s.length === 7) return s;
  const m = s.match(
    /rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)/i,
  );
  if (!m) return "#7ed321";
  const r = clamp255(parseInt(m[1], 10));
  const g = clamp255(parseInt(m[2], 10));
  const b = clamp255(parseInt(m[3], 10));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function toFillRgba(hex: string): string {
  if (!hex.startsWith("#") || hex.length !== 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.10)`;
}

function clamp255(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(255, Math.round(n)));
}
