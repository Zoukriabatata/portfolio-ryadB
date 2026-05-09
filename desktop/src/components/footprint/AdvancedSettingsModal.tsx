// Phase B / M4.7b — advanced footprint settings modal.
//
// Backed by `useFootprintSettingsStore` (Zustand + persist). All
// state mutations flow through the store actions, so the modal
// stays presentational and the changes propagate to the renderer
// via the shared store subscription in CryptoFootprint.

import { useEffect } from "react";
import {
  useFootprintSettingsStore,
  type PriceDecimalsMode,
  type VolumeFormat,
} from "../../stores/useFootprintSettingsStore";
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
          <section className="asm-section">
            <h4>Visibility</h4>
            <ToggleRow
              label="Grid lines"
              checked={settings.showGrid}
              onChange={() => settings.toggle("showGrid")}
            />
            <ToggleRow
              label="POC session (gold)"
              checked={settings.showPocSession}
              onChange={() => settings.toggle("showPocSession")}
            />
            <ToggleRow
              label="POC bar (cyan)"
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
