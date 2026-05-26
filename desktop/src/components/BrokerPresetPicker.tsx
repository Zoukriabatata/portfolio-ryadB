import { useEffect, useMemo, useRef, useState } from "react";

type BrokerPreset =
  | "RithmicTest"
  | "RithmicPaperTrading"
  | "Rithmic01"
  | "Apex"
  | "MyFundedFutures"
  | "BluSky"
  | "Bulenox"
  | "TakeProfitTrader"
  | "FourPropTrader"
  | "Topstep"
  | "Custom";

type PresetInfo = {
  preset: BrokerPreset;
  displayName: string;
  defaultSystemName: string;
  defaultGatewayUrl: string | null;
  helpText: string;
};

type Category = "rithmic" | "props" | "custom";

const CATEGORY_OF: Record<BrokerPreset, Category> = {
  RithmicTest: "rithmic",
  RithmicPaperTrading: "rithmic",
  Rithmic01: "rithmic",
  Apex: "props",
  MyFundedFutures: "props",
  BluSky: "props",
  Bulenox: "props",
  TakeProfitTrader: "props",
  FourPropTrader: "props",
  Topstep: "props",
  Custom: "custom",
};

const CATEGORY_LABEL: Record<Category, string> = {
  rithmic: "Rithmic Direct",
  props: "Prop Firms",
  custom: "Other",
};

const CATEGORY_ORDER: Category[] = ["props", "rithmic", "custom"];

type Props = {
  value: BrokerPreset;
  presets: PresetInfo[];
  onChange: (preset: BrokerPreset) => void;
  disabled?: boolean;
};

export function BrokerPresetPicker({ value, presets, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  const activePreset = presets.find((p) => p.preset === value);
  const activeLabel = activePreset?.displayName ?? value;

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? presets.filter(
          (p) =>
            p.preset.toLowerCase().includes(q) ||
            p.displayName.toLowerCase().includes(q) ||
            p.helpText.toLowerCase().includes(q),
        )
      : presets;
    const map = new Map<Category, PresetInfo[]>();
    for (const p of filtered) {
      const c = CATEGORY_OF[p.preset];
      const arr = map.get(c);
      if (arr) arr.push(p);
      else map.set(c, [p]);
    }
    return CATEGORY_ORDER.map((c) => [c, map.get(c) ?? []] as const).filter(
      ([, arr]) => arr.length > 0,
    );
  }, [presets, query]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleSelect = (p: BrokerPreset) => {
    onChange(p);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="bs-picker" ref={wrapperRef}>
      <button
        type="button"
        className={`bs-picker-trigger ${open ? "bs-picker-trigger-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
      >
        <span className="bs-picker-trigger-label">{activeLabel}</span>
        <span className="bs-picker-trigger-chevron" aria-hidden>▾</span>
      </button>

      {open && (
        <div className="bs-picker-panel" role="dialog" aria-label="Broker preset">
          <div className="bs-picker-search-wrap">
            <input
              type="text"
              className="bs-picker-search"
              placeholder="Search broker (e.g. Apex, MFFU, Rithmic)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>

          <div className="bs-picker-list">
            {grouped.length === 0 && (
              <div className="bs-picker-empty">No broker matches.</div>
            )}
            {grouped.map(([cat, items]) => (
              <div key={cat} className="bs-picker-group">
                <div className="bs-picker-group-header">{CATEGORY_LABEL[cat]}</div>
                <div className="bs-picker-group-items">
                  {items.map((p) => {
                    const isActive = p.preset === value;
                    return (
                      <button
                        key={p.preset}
                        type="button"
                        className={`bs-picker-item ${
                          isActive ? "bs-picker-item-active" : ""
                        }`}
                        onClick={() => handleSelect(p.preset)}
                      >
                        <div className="bs-picker-item-head">
                          <span className="bs-picker-item-label">
                            {p.displayName}
                          </span>
                          {p.defaultSystemName && (
                            <span className="bs-picker-item-system">
                              {p.defaultSystemName}
                            </span>
                          )}
                        </div>
                        {p.helpText && (
                          <div className="bs-picker-item-desc">{p.helpText}</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
