// CSV import modal — drag-drop / file picker → preview → batch upsert.
// Designed for Apex / Rithmic / NinjaTrader exports but the column
// heuristics are generic enough for most futures-broker formats.

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { parseCsvTrades, type ParsedCsv } from "../../lib/journal/csvImport";
import { importTrades, type CsvImportResult } from "../../lib/journal/api";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after a successful import so the table refetches. */
  onImported: () => void;
}

const SOURCE_OPTIONS: { id: string; label: string }[] = [
  { id: "apex",         label: "Apex Trader Funding" },
  { id: "rithmic",      label: "Rithmic Trader" },
  { id: "ninjatrader",  label: "NinjaTrader" },
  { id: "tradingview",  label: "TradingView" },
  { id: "csv",          label: "Other CSV" },
];

export default function CsvImportModal({ open, onClose, onImported }: Props) {
  const [source, setSource] = useState("apex");
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setResult(null);
      setFileName(file.name);
      try {
        const text = await file.text();
        const p = parseCsvTrades(text, source);
        setParsed(p);
      } catch (e) {
        setError(`Failed to read file: ${e}`);
        setParsed(null);
      }
    },
    [source],
  );

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void handleFile(f);
  };

  const handleImport = async () => {
    if (!parsed || parsed.trades.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      const r = await importTrades(parsed.trades);
      setResult(r);
      onImported();
    } catch (e) {
      setError(`Import failed: ${e}`);
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setParsed(null);
    setFileName(null);
    setResult(null);
    setError(null);
  };

  if (!open) return null;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        animation: "csvFadeIn 200ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(900px, 92vw)",
          maxHeight: "85vh",
          overflowY: "auto",
          background: "#0a0a0a",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: 16,
          padding: 24,
          boxShadow: "0 24px 80px -16px rgba(0, 0, 0, 0.6)",
          color: "#fff",
          animation: "csvSlideIn 280ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Import trades from CSV</h2>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
              Export from your broker dashboard, drop the file here. Re-imports dedupe automatically.
            </p>
          </div>
          <button onClick={onClose} className="j-btn-ghost" style={{ padding: "5px 10px" }}>Close</button>
        </div>

        {/* Source selector */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.55)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Broker source
          </label>
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            {SOURCE_OPTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setSource(s.id)}
                className="j-btn-ghost"
                style={{
                  padding: "5px 12px",
                  fontSize: 11,
                  background:
                    source === s.id ? "rgba(126, 211, 33, 0.10)" : "rgba(255, 255, 255, 0.025)",
                  borderColor:
                    source === s.id ? "rgba(126, 211, 33, 0.45)" : "rgba(255, 255, 255, 0.10)",
                  color: source === s.id ? "#a3e635" : "rgba(255,255,255,0.78)",
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Drop zone */}
        {!parsed && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            style={{
              border: `2px dashed ${dragOver ? "rgba(126, 211, 33, 0.55)" : "rgba(255, 255, 255, 0.18)"}`,
              borderRadius: 12,
              padding: 36,
              textAlign: "center",
              background: dragOver ? "rgba(126, 211, 33, 0.04)" : "rgba(255, 255, 255, 0.012)",
              transition: "all 200ms ease",
              cursor: "pointer",
            }}
          >
            <div style={{
              width: 48, height: 48,
              borderRadius: 14,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              background: "rgba(126, 211, 33, 0.08)",
              color: "#7ed321",
              marginBottom: 10,
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
              Drop your CSV here
            </p>
            <p style={{ margin: "4px 0 12px", fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
              or
            </p>
            <label className="j-btn-ghost" style={{ display: "inline-flex", cursor: "pointer" }}>
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={onPick}
                style={{ display: "none" }}
              />
              Browse file
            </label>
          </div>
        )}

        {/* Preview */}
        {parsed && !result && (
          <div>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 14px", borderRadius: 10,
              background: "rgba(255, 255, 255, 0.025)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              marginBottom: 12,
            }}>
              <div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", fontWeight: 600 }}>
                  {fileName}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
                  <span style={{ color: "#7ed321" }}>{parsed.trades.length}</span> parsed
                  {parsed.skipped > 0 && (
                    <span> · <span style={{ color: "#ffffff" }}>{parsed.skipped}</span> skipped</span>
                  )}
                  {" · "}
                  {parsed.headers.length} columns
                </div>
              </div>
              <button onClick={handleReset} className="j-btn-ghost" style={{ padding: "5px 12px", fontSize: 11 }}>
                Pick another file
              </button>
            </div>

            {/* Column mapping recap */}
            <details style={{
              marginBottom: 12,
              padding: "10px 12px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.015)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}>
              <summary style={{ cursor: "pointer", fontSize: 12, color: "rgba(255,255,255,0.62)" }}>
                Column auto-mapping
              </summary>
              <div style={{ marginTop: 10, fontSize: 11, fontFamily: "var(--font-mono)" }}>
                {Object.entries(parsed.columnMap).map(([field, idx]) => (
                  <div key={field} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                    <span style={{ color: "rgba(255,255,255,0.55)" }}>{field}</span>
                    <span style={{ color: idx >= 0 ? "#a3e635" : "rgba(255,255,255,0.30)" }}>
                      {idx >= 0 ? `→ ${parsed.headers[idx]}` : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </details>

            {/* First 5 rows preview */}
            <div style={{
              maxHeight: 260, overflow: "auto",
              borderRadius: 10,
              border: "1px solid rgba(255, 255, 255, 0.06)",
              marginBottom: 12,
            }}>
              <table style={{ width: "100%", fontSize: 11, fontFamily: "var(--font-mono)", borderCollapse: "collapse" }}>
                <thead style={{ background: "rgba(255,255,255,0.025)" }}>
                  <tr>
                    <Th>Time</Th>
                    <Th>Symbol</Th>
                    <Th>Side</Th>
                    <Th>Qty</Th>
                    <Th>Entry</Th>
                    <Th>Exit</Th>
                    <Th>P&L</Th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.trades.slice(0, 8).map((t, i) => (
                    <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                      <Td>{t.entryTime.slice(0, 19).replace("T", " ")}</Td>
                      <Td>{t.symbol}</Td>
                      <Td color={t.side === "LONG" ? "#7ed321" : "#ffffff"}>{t.side}</Td>
                      <Td>{t.quantity}</Td>
                      <Td>{t.entryPrice}</Td>
                      <Td>{t.exitPrice ?? "—"}</Td>
                      <Td color={t.pnl === null ? undefined : t.pnl >= 0 ? "#7ed321" : "#ffffff"}>
                        {t.pnl === null ? "—" : t.pnl.toFixed(2)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.trades.length > 8 && (
                <div style={{ padding: 8, textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.40)" }}>
                  …and {parsed.trades.length - 8} more
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={onClose} className="j-btn-ghost">Cancel</button>
              <button
                onClick={handleImport}
                disabled={importing || parsed.trades.length === 0}
                className="j-btn-primary"
                style={importing ? { opacity: 0.6, cursor: "wait" } : undefined}
              >
                {importing ? "Importing…" : `Import ${parsed.trades.length} trade${parsed.trades.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        )}

        {/* Result */}
        {result && (
          <div style={{
            padding: 16,
            borderRadius: 12,
            background: "rgba(126, 211, 33, 0.06)",
            border: "1px solid rgba(126, 211, 33, 0.25)",
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#a3e635", marginBottom: 8 }}>
              Import complete
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.78)" }}>
              <span style={{ color: "#7ed321" }}>+{result.inserted}</span> new
              {" · "}
              <span style={{ color: "#ffffff" }}>{result.updated}</span> updated
              {result.failed > 0 && (
                <>
                  {" · "}
                  <span style={{ color: "rgba(255,255,255,0.55)" }}>{result.failed} failed</span>
                </>
              )}
            </div>
            <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={handleReset} className="j-btn-ghost">Import another</button>
              <button onClick={onClose} className="j-btn-primary">Done</button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            marginTop: 12,
            padding: "10px 14px",
            borderRadius: 10,
            background: "rgba(255, 255, 255, 0.04)",
            border: "1px solid rgba(255, 255, 255, 0.18)",
            fontSize: 12,
            color: "#ffffff",
          }}>
            {error}
          </div>
        )}

        <style>{`
          @keyframes csvFadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes csvSlideIn {
            from { opacity: 0; transform: translateY(12px) scale(0.985); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
          }
        `}</style>
      </div>
    </div>,
    document.body,
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{
      textAlign: "left",
      padding: "8px 10px",
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      color: "rgba(255,255,255,0.42)",
    }}>
      {children}
    </th>
  );
}

function Td({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <td style={{
      padding: "6px 10px",
      color: color ?? "rgba(255,255,255,0.85)",
      whiteSpace: "nowrap",
    }}>
      {children}
    </td>
  );
}
