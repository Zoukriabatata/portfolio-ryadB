// Horizontal timeframe pill bar. All TFs are live + tick-replay
// (per-price bid/ask cells via rithmic_fetch_tick_history).

import "./TimeframePills.css";

export type SupportedTimeframe =
  | "15s" | "30s" | "1m" | "3m" | "5m" | "15m" | "1h" | "1d" | "100t";

const ALL_TIMEFRAMES: { value: SupportedTimeframe; label: string }[] = [
  { value: "15s",  label: "15s"  },
  { value: "30s",  label: "30s"  },
  { value: "1m",   label: "1m"   },
  { value: "3m",   label: "3m"   },
  { value: "5m",   label: "5m"   },
  { value: "15m",  label: "15m"  },
  { value: "1h",   label: "1H"   },
  { value: "1d",   label: "1D"   },
  // Tick-based — only meaningful for the NinjaTrader Bridge connector,
  // which populates a per-session tick counter so each bar holds exactly
  // 100 trades and aligns bar-for-bar with the NT 100-Tick reference
  // chart. On other connectors (Rithmic, Binance, …) the counter is
  // always 0 and every tick would land in the same bucket — those
  // sessions should hide this pill via the `disabled` mechanism.
  { value: "100t", label: "100T" },
];

type Props = {
  value: SupportedTimeframe;
  onChange: (tf: SupportedTimeframe) => void;
  disabled?: boolean;
  /** Hide tick-based pills (100T). Set true on connectors that don't
   *  populate `Tick.seq` (Rithmic, Binance, …) — letting the user pick
   *  100T there would collapse every tick into a single bar. */
  hideTickBased?: boolean;
};

export function TimeframePills({
  value,
  onChange,
  disabled = false,
  hideTickBased = false,
}: Props) {
  const tfs = hideTickBased
    ? ALL_TIMEFRAMES.filter((tf) => !tf.value.endsWith("t"))
    : ALL_TIMEFRAMES;
  return (
    <div className="tf-pills" role="tablist" aria-label="Timeframe">
      {tfs.map((tf) => {
        const active = value === tf.value;
        return (
          <button
            key={tf.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={`tf-pill ${active ? "tf-pill-active" : ""}`}
            onClick={() => onChange(tf.value)}
            disabled={disabled}
          >
            {tf.label}
          </button>
        );
      })}
    </div>
  );
}
