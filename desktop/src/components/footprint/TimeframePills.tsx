// Phase B / M4.7a — horizontal timeframe pill bar.
//
// Backend currently exposes 4 timeframes (5s/15s/1m/5m); the
// remaining three (30s/3m/15m) are rendered greyed-out with a
// "Coming soon" tooltip so the UX shows the full intended grid
// without a Rust-side change. Adding them on the Rust side is a
// one-line patch in `engine/footprint.rs::Timeframe` plus mirroring
// in `state.rs::CryptoState::new()`.

import "./TimeframePills.css";

export type SupportedTimeframe = "5s" | "15s" | "1m" | "5m";

const ALL_TIMEFRAMES: { value: string; label: string; supported: boolean }[] = [
  { value: "5s", label: "5s", supported: true },
  { value: "15s", label: "15s", supported: true },
  { value: "30s", label: "30s", supported: false },
  { value: "1m", label: "1m", supported: true },
  { value: "3m", label: "3m", supported: false },
  { value: "5m", label: "5m", supported: true },
  { value: "15m", label: "15m", supported: false },
];

type Props = {
  value: SupportedTimeframe;
  onChange: (tf: SupportedTimeframe) => void;
  disabled?: boolean;
};

export function TimeframePills({ value, onChange, disabled = false }: Props) {
  return (
    <div className="tf-pills" role="tablist" aria-label="Timeframe">
      {ALL_TIMEFRAMES.map((tf) => {
        const active = tf.supported && value === tf.value;
        const cls = [
          "tf-pill",
          active ? "tf-pill-active" : "",
          !tf.supported ? "tf-pill-disabled" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <button
            key={tf.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={cls}
            onClick={() => {
              if (!tf.supported) return;
              onChange(tf.value as SupportedTimeframe);
            }}
            disabled={disabled || !tf.supported}
            title={tf.supported ? "" : "Coming soon — backend support pending"}
          >
            {tf.label}
          </button>
        );
      })}
    </div>
  );
}
