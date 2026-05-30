// Phase B / M4.7b — advanced footprint settings modal.
//
// Backed by `useFootprintSettingsStore` (Zustand + persist). All
// state mutations flow through the store actions, so the modal
// stays presentational and the changes propagate to the renderer
// via the shared store subscription in CryptoFootprint.

import { useEffect, useState } from "react";
import {
  useFootprintSettingsStore,
  type PriceDecimalsMode,
  type VolumeFormat,
  type CrosshairLineStyle,
} from "../../stores/useFootprintSettingsStore";
import { useChartPresetsStore } from "../../stores/useChartPresetsStore";
import "./AdvancedSettingsModal.css";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function AdvancedSettingsModal({ open, onClose }: Props) {
  // Reading the entire store is fine for the modal — it only mounts
  // when open and the perf cost (one closure per render) is dwarfed
  // by the modal's own paint.
  const settings = useFootprintSettingsStore();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="asm-backdrop" onClick={onClose}>
      <div
        className="asm-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Footprint settings"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="asm-header">
          <h3>Footprint settings</h3>
          <button
            type="button"
            className="asm-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="asm-body">
          <ChartPresetsSection />

          <section className="asm-section">
            <h4>Visibility</h4>
            <ToggleRow
              label="Grid lines"
              checked={settings.showGrid}
              onChange={() => settings.toggle("showGrid")}
            />
            <ToggleRow
              label="POC session"
              checked={settings.showPocSession}
              onChange={() => settings.toggle("showPocSession")}
            />
            <ToggleRow
              label="POC bar"
              checked={settings.showPocBar}
              onChange={() => settings.toggle("showPocBar")}
            />
            <ToggleRow
              label="Volume tooltip on hover"
              checked={settings.showVolumeTooltip}
              onChange={() => settings.toggle("showVolumeTooltip")}
            />
            <ToggleRow
              label="OHLC label on each bar"
              checked={settings.showOhlcHeader}
              onChange={() => settings.toggle("showOhlcHeader")}
            />
          </section>

          <section className="asm-section">
            <h4>Numeric format</h4>
            <SelectRow
              label="Price decimals"
              value={settings.priceDecimalsMode}
              onChange={(v) =>
                settings.set("priceDecimalsMode", v as PriceDecimalsMode)
              }
              options={[
                { value: "auto", label: "Auto (infer from data)" },
                { value: "2", label: "2 decimals" },
                { value: "4", label: "4 decimals" },
                { value: "8", label: "8 decimals (memes)" },
              ]}
            />
            <SelectRow
              label="Volume format"
              value={settings.volumeFormat}
              onChange={(v) =>
                settings.set("volumeFormat", v as VolumeFormat)
              }
              options={[
                { value: "raw", label: "Raw (1234)" },
                { value: "K", label: "Thousands (1.2K)" },
                { value: "M", label: "Millions (1.2M)" },
              ]}
            />
          </section>

          <section className="asm-section">
            <h4>Indicators</h4>
            <ToggleRow
              label="Bar delta (above each candle)"
              checked={settings.showBarDelta}
              onChange={() => settings.toggle("showBarDelta")}
            />
            <ToggleRow
              label="Stacked imbalances"
              checked={settings.showStackedImbalances}
              onChange={() => settings.toggle("showStackedImbalances")}
            />
            <ToggleRow
              label="Naked POCs"
              checked={settings.showNakedPOCs}
              onChange={() => settings.toggle("showNakedPOCs")}
            />
            <ToggleRow
              label="Unfinished auctions"
              checked={settings.showUnfinishedAuctions}
              onChange={() => settings.toggle("showUnfinishedAuctions")}
            />
            <SliderRow
              label="Imbalance ratio"
              value={settings.imbalanceRatio}
              valueText={`${settings.imbalanceRatio.toFixed(1)}×`}
              min={1.5}
              max={5.0}
              step={0.1}
              onChange={(v) => settings.set("imbalanceRatio", v)}
            />
            <SliderRow
              label="Min consecutive levels"
              value={settings.imbalanceMinConsecutive}
              valueText={settings.imbalanceMinConsecutive.toString()}
              min={2}
              max={6}
              step={1}
              onChange={(v) =>
                settings.set("imbalanceMinConsecutive", Math.round(v))
              }
            />
          </section>

          <section className="asm-section">
            <h4>Chart colors</h4>
            <p className="asm-section-hint">
              Hex pickers — every primitive on the chart. The footprint
              cell "state bar" mirrors the candle body color so the
              two surfaces always agree on bullish vs bearish.
            </p>
            <ColorRow
              label="Background"
              value={settings.chartBgColor}
              onChange={(v) => settings.set("chartBgColor", v)}
            />
            <ColorRow
              label="Grid lines"
              value={settings.chartGridColor}
              onChange={(v) => settings.set("chartGridColor", v)}
            />
            <ColorPairRow
              label="Candle body"
              up={settings.candleBodyUp}
              down={settings.candleBodyDown}
              onUp={(v) => settings.set("candleBodyUp", v)}
              onDown={(v) => settings.set("candleBodyDown", v)}
            />
            <ColorPairRow
              label="Candle border"
              up={settings.candleBorderUp}
              down={settings.candleBorderDown}
              onUp={(v) => settings.set("candleBorderUp", v)}
              onDown={(v) => settings.set("candleBorderDown", v)}
            />
            <ColorPairRow
              label="Wick"
              up={settings.candleWickUp}
              down={settings.candleWickDown}
              onUp={(v) => settings.set("candleWickUp", v)}
              onDown={(v) => settings.set("candleWickDown", v)}
            />
            <ColorRow
              label="Bid"
              value={settings.bidColor}
              onChange={(v) => settings.set("bidColor", v)}
            />
            <ColorRow
              label="Ask"
              value={settings.askColor}
              onChange={(v) => settings.set("askColor", v)}
            />
          </section>

          <section className="asm-section">
            <h4>Crosshair</h4>
            <p className="asm-section-hint">
              Cursor guides + axis labels — pick a hue that contrasts
              with your chart background. Opacity tunes how
              prominent the lines feel.
            </p>
            <ColorRow
              label="Color"
              value={settings.crosshairColor}
              onChange={(v) => settings.set("crosshairColor", v)}
            />
            <SliderRow
              label="Opacity"
              value={settings.crosshairOpacity}
              valueText={`${Math.round(settings.crosshairOpacity * 100)}%`}
              min={0.1}
              max={1}
              step={0.05}
              onChange={(v) => settings.set("crosshairOpacity", v)}
            />
            <SelectRow
              label="Line style"
              value={settings.crosshairStyle}
              onChange={(v) =>
                settings.set("crosshairStyle", v as CrosshairLineStyle)
              }
              options={[
                { value: "solid", label: "Solid" },
                { value: "dashed", label: "Dashed (default)" },
                { value: "dotted", label: "Dotted" },
              ]}
            />
            <SliderRow
              label="Line width"
              value={settings.crosshairWidth}
              valueText={`${settings.crosshairWidth.toFixed(1)} px`}
              min={1}
              max={3}
              step={0.5}
              onChange={(v) => settings.set("crosshairWidth", v)}
            />
          </section>

          <section className="asm-section asm-section-danger">
            <button
              type="button"
              className="asm-reset"
              onClick={settings.resetToDefaults}
            >
              Reset to defaults
            </button>
            <p className="asm-reset-hint">
              Restores all toggles + formats. Magnet mode is preserved
              — cycle that with the magnet button.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="asm-toggle">
      <span className="asm-toggle-label">{label}</span>
      <span className={`asm-toggle-switch ${checked ? "asm-toggle-on" : ""}`}>
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="asm-toggle-input"
        />
        <span className="asm-toggle-thumb" />
      </span>
    </label>
  );
}

function SliderRow({
  label,
  value,
  valueText,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  valueText: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="asm-slider">
      <span className="asm-slider-row">
        <span className="asm-slider-label">{label}</span>
        <span className="asm-slider-value">{valueText}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="asm-slider-input"
      />
    </label>
  );
}

function ChartPresetsSection() {
  const presets = useChartPresetsStore((s) => s.presets);
  const saveCurrent = useChartPresetsStore((s) => s.saveCurrent);
  const apply = useChartPresetsStore((s) => s.apply);
  const remove = useChartPresetsStore((s) => s.remove);
  const [name, setName] = useState("");

  return (
    <section className="asm-section">
      <h4>Chart templates</h4>
      <p className="asm-section-hint">
        Save the current chart style (colors, indicators, crosshair,
        visibility) as a named template. Apply any saved template
        with one click — useful for switching between a "screen
        share" palette and a "focus mode" palette.
      </p>
      <div className="asm-preset-save">
        <input
          type="text"
          className="asm-preset-name-input"
          placeholder="Template name (e.g. Focus mode)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={48}
          spellCheck={false}
        />
        <button
          type="button"
          className="asm-preset-save-btn"
          onClick={() => {
            saveCurrent(name);
            setName("");
          }}
          disabled={name.trim().length === 0}
          title="Capture the current chart style under this name"
        >
          Save
        </button>
      </div>
      {presets.length === 0 ? (
        <div className="asm-preset-empty">No saved templates yet</div>
      ) : (
        <ul className="asm-preset-list">
          {presets.map((p) => (
            <li key={p.id} className="asm-preset-row">
              <span className="asm-preset-name">{p.name}</span>
              <span className="asm-preset-actions">
                <button
                  type="button"
                  className="asm-preset-apply"
                  onClick={() => apply(p.id)}
                  title="Apply this template to the chart"
                >
                  Apply
                </button>
                <button
                  type="button"
                  className="asm-preset-delete"
                  onClick={() => remove(p.id)}
                  title="Delete this template"
                  aria-label={`Delete ${p.name}`}
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="asm-color">
      <span className="asm-color-label">{label}</span>
      <span className="asm-color-right">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="asm-color-input"
          aria-label={label}
        />
        <span className="asm-color-hex">{value.toUpperCase()}</span>
      </span>
    </label>
  );
}

function ColorPairRow({
  label,
  up,
  down,
  onUp,
  onDown,
}: {
  label: string;
  up: string;
  down: string;
  onUp: (v: string) => void;
  onDown: (v: string) => void;
}) {
  return (
    <div className="asm-color">
      <span className="asm-color-label">{label}</span>
      <span className="asm-color-pair">
        <span className="asm-color-pair-cell">
          <input
            type="color"
            value={up}
            onChange={(e) => onUp(e.target.value)}
            className="asm-color-input"
            aria-label={`${label} bullish`}
            title={`${label} bullish`}
          />
          <span className="asm-color-pair-label">UP</span>
        </span>
        <span className="asm-color-pair-cell">
          <input
            type="color"
            value={down}
            onChange={(e) => onDown(e.target.value)}
            className="asm-color-input"
            aria-label={`${label} bearish`}
            title={`${label} bearish`}
          />
          <span className="asm-color-pair-label">DN</span>
        </span>
      </span>
    </div>
  );
}

type SelectOpt<T extends string> = { value: T; label: string };

function SelectRow<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: SelectOpt<T>[];
}) {
  return (
    <label className="asm-select">
      <span className="asm-select-label">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="asm-select-input"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
