import { useEffect, useMemo, useRef, useState } from "react";
import {
  CATEGORY_LABELS,
  PRESETS,
  type PresetCategory,
  type PresetDef,
} from "../../lib/news/articleTags";
import { useNewsStore } from "../../lib/news/useNewsStore";

/** Detect which preset's tag set exactly matches the currently active
 *  filter set, so we can mark it as "active" in the panel. */
function findActivePresetKey(
  active: Record<string, boolean>,
): string | null {
  const activeKeys = Object.entries(active)
    .filter(([, on]) => on)
    .map(([t]) => t)
    .sort();
  if (activeKeys.length === 0) return null;
  for (const p of PRESETS) {
    const tags = [...p.tags].sort();
    if (tags.length === activeKeys.length && tags.every((t, i) => t === activeKeys[i])) {
      return p.key;
    }
  }
  return null;
}

const CATEGORY_ORDER: PresetCategory[] = [
  "indices",
  "energy",
  "metals",
  "fx",
  "rates",
  "crypto",
  "ags",
];

export function SymbolPresetPicker() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const tagFilters = useNewsStore((s) => s.filters.articleTags);
  const applyPreset = useNewsStore((s) => s.applyTagPreset);
  const clearTags = useNewsStore((s) => s.clearTagFilters);

  const activeKey = useMemo(() => findActivePresetKey(tagFilters), [tagFilters]);
  const activeLabel = activeKey
    ? PRESETS.find((p) => p.key === activeKey)?.label ?? activeKey
    : null;

  // Group presets by category, filtered by search query.
  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? PRESETS.filter(
          (p) =>
            p.key.toLowerCase().includes(q) ||
            p.label.toLowerCase().includes(q) ||
            p.fullName.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q),
        )
      : PRESETS;
    const map = new Map<PresetCategory, PresetDef[]>();
    for (const p of filtered) {
      const arr = map.get(p.category);
      if (arr) arr.push(p);
      else map.set(p.category, [p]);
    }
    return CATEGORY_ORDER.map((c) => [c, map.get(c) ?? []] as const).filter(
      ([, arr]) => arr.length > 0,
    );
  }, [query]);

  // Close on outside click / Escape.
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

  const handleSelect = (key: string) => {
    applyPreset(key);
    setOpen(false);
    setQuery("");
  };

  const handleClear = () => {
    clearTags();
    setOpen(false);
  };

  return (
    <div className="symbol-picker" ref={wrapperRef}>
      <button
        type="button"
        className={`symbol-picker-trigger ${open ? "symbol-picker-trigger-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="symbol-picker-trigger-label">
          {activeLabel ? `Preset · ${activeLabel}` : "Pick your symbol"}
        </span>
        <span className="symbol-picker-trigger-chevron" aria-hidden>▾</span>
      </button>

      {open && (
        <div className="symbol-picker-panel" role="dialog" aria-label="Symbol presets">
          <div className="symbol-picker-search-wrap">
            <input
              type="text"
              className="symbol-picker-search"
              placeholder="Search symbol (e.g. MNQ, oil, euro)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            {activeKey && (
              <button
                type="button"
                className="symbol-picker-clear"
                onClick={handleClear}
              >
                Clear
              </button>
            )}
          </div>

          <div className="symbol-picker-list">
            {grouped.length === 0 && (
              <div className="symbol-picker-empty">No symbol matches.</div>
            )}
            {grouped.map(([cat, presets]) => (
              <div key={cat} className="symbol-picker-group">
                <div className="symbol-picker-group-header">
                  {CATEGORY_LABELS[cat]}
                </div>
                <div className="symbol-picker-group-items">
                  {presets.map((p) => {
                    const isActive = p.key === activeKey;
                    return (
                      <button
                        key={p.key}
                        type="button"
                        className={`symbol-picker-item ${
                          isActive ? "symbol-picker-item-active" : ""
                        }`}
                        onClick={() => handleSelect(p.key)}
                      >
                        <div className="symbol-picker-item-head">
                          <span className="symbol-picker-item-label">{p.label}</span>
                          <span className="symbol-picker-item-full">{p.fullName}</span>
                        </div>
                        <div className="symbol-picker-item-desc">{p.description}</div>
                        <div className="symbol-picker-item-tags">
                          {p.tags.map((t) => (
                            <span key={t} className="symbol-picker-item-tag">{t}</span>
                          ))}
                        </div>
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
