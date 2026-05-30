// One-shot "Sync from Rithmic" button + last-sync pill. Lives in the
// TradesTab toolbar and drives the `journal_sync_rithmic` Tauri command.
//
// UX: idle → loading (button disabled, shows spinner + count) →
// success toast (inline message) OR error toast.

import { useEffect, useState } from "react";
import {
  syncRithmic,
  getRithmicSyncStatus,
  type RithmicLocalStatus,
} from "../../lib/journal/api";
import type { RithmicSyncResult } from "../../types/journal";

interface Props {
  /** Called after a successful sync so the parent can refetch the
   *  trade list / stats. */
  onSynced: () => void;
}

type SyncState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; result: RithmicSyncResult }
  | { kind: "error"; message: string };

function formatRelative(iso: string | null): string {
  if (!iso) return "Never synced";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "Never synced";
  const diffMin = Math.max(0, (Date.now() - then) / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${Math.floor(diffMin)} min ago`;
  if (diffMin < 60 * 24) return `${Math.floor(diffMin / 60)} h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function SyncRithmicButton({ onSynced }: Props) {
  const [state, setState] = useState<SyncState>({ kind: "idle" });
  const [status, setStatus] = useState<RithmicLocalStatus | null>(null);

  // Fetch current local status on mount + after every successful sync.
  useEffect(() => {
    let cancelled = false;
    getRithmicSyncStatus()
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {
        if (!cancelled) setStatus({ importedCount: 0, lastImportedAt: null });
      });
    return () => {
      cancelled = true;
    };
  }, [state.kind]);

  const handleClick = async () => {
    if (state.kind === "running") return;
    setState({ kind: "running" });
    try {
      const result = await syncRithmic();
      setState({ kind: "ok", result });
      onSynced();
    } catch (e) {
      setState({ kind: "error", message: String(e) });
    }
  };

  const running = state.kind === "running";

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Status pill — shown on the left of the button. */}
      <div
        className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-medium"
        style={{
          background: "rgba(255, 255, 255, 0.025)",
          border: "1px solid rgba(255, 255, 255, 0.10)",
          color: "rgba(255, 255, 255, 0.62)",
        }}
        title="Imported from Rithmic / Apex"
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{
            background:
              status && status.importedCount > 0
                ? "#7ed321"
                : "rgba(255,255,255,0.30)",
            boxShadow:
              status && status.importedCount > 0
                ? "0 0 6px rgba(126, 211, 33, 0.65)"
                : "none",
          }}
        />
        <span>
          {status?.importedCount ?? 0}{" "}
          <span className="opacity-60">synced</span>
        </span>
        <span className="opacity-30">·</span>
        <span className="opacity-60">{formatRelative(status?.lastImportedAt ?? null)}</span>
      </div>

      <button
        type="button"
        onClick={handleClick}
        disabled={running}
        className="j-btn-ghost"
        style={running ? { opacity: 0.6, cursor: "wait" } : undefined}
      >
        {running ? (
          <>
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              style={{ animation: "spin 1s linear infinite" }}
            >
              <path d="M21 12a9 9 0 11-6.2-8.55" />
            </svg>
            Syncing…
          </>
        ) : (
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 4v6h-6" />
              <path d="M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10" />
              <path d="M20.49 15a9 9 0 01-14.85 3.36L1 14" />
            </svg>
            Sync from Rithmic
          </>
        )}
      </button>

      {/* Inline result toast — auto-dismisses after 5s. */}
      {state.kind === "ok" && (
        <SyncToast
          tone="ok"
          text={`+${state.result.inserted} new · ${state.result.updated} updated · ${state.result.accounts.length} account${state.result.accounts.length === 1 ? "" : "s"}`}
          onDone={() => setState({ kind: "idle" })}
        />
      )}
      {state.kind === "error" && (
        <SyncToast
          tone="error"
          text={state.message}
          onDone={() => setState({ kind: "idle" })}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function SyncToast({
  tone,
  text,
  onDone,
}: {
  tone: "ok" | "error";
  text: string;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = window.setTimeout(onDone, tone === "ok" ? 5000 : 8000);
    return () => window.clearTimeout(t);
  }, [tone, onDone]);
  return (
    <span
      className="text-[11px] px-2.5 py-1 rounded-md font-medium"
      style={{
        background:
          tone === "ok"
            ? "rgba(126, 211, 33, 0.08)"
            : "rgba(255, 255, 255, 0.04)",
        color: tone === "ok" ? "#a3e635" : "#ffffff",
        border: `1px solid ${tone === "ok" ? "rgba(126, 211, 33, 0.30)" : "rgba(255, 255, 255, 0.18)"}`,
        maxWidth: 380,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
      title={text}
    >
      {text}
    </span>
  );
}
