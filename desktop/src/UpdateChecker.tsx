import { useEffect, useState } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

/**
 * Hook: kick off a single updater check when `enabled` flips true.
 * Returns the resolved Update (or null) and a `checked` flag so the
 * caller can gate other side effects (e.g. the auto-handoff bridge)
 * on the check completing.
 *
 * Network errors, GitHub outages, missing signatures on the latest
 * release — none of these should block the user, so we swallow and
 * return `{ update: null, checked: true }`.
 */
export function useUpdateCheck(enabled: boolean): {
  update: Update | null;
  checked: boolean;
} {
  const [update, setUpdate] = useState<Update | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const u = await check();
        if (!cancelled && u) setUpdate(u);
      } catch (err) {
        console.warn('updater.check failed:', err);
      }
      if (!cancelled) setChecked(true);
    })();
    return () => { cancelled = true; };
  }, [enabled]);

  return { update, checked };
}

/**
 * Presentational modal — receives an Update object and a dismiss
 * callback. Renders the install / progress / error UI. The "Remind
 * me later" path is just `onDismiss()`; the parent decides what to
 * do (typically: clear the update state and proceed with the normal
 * flow).
 */
export function UpdateModal({
  update,
  onDismiss,
}: {
  update: Update;
  onDismiss: () => void;
}) {
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress]     = useState(0);
  const [error, setError]           = useState<string | null>(null);

  const install = async () => {
    setInstalling(true);
    setError(null);
    setProgress(0);
    try {
      let downloaded = 0;
      let total = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started')  total = event.data.contentLength ?? 0;
        if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          if (total > 0) setProgress(downloaded / total);
        }
      });
      await relaunch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Install failed');
      setInstalling(false);
    }
  };

  return (
    <div className="updater-overlay">
      <div className="card updater-card">
        <h1>Update available</h1>
        <p className="muted">
          Version <strong>{update.version}</strong> is available
          {update.currentVersion && <> (you have <strong>{update.currentVersion}</strong>)</>}.
        </p>

        {update.body && <pre className="updater-notes">{update.body}</pre>}

        {installing && (
          <div className="updater-progress">
            <div style={{ width: `${(progress * 100).toFixed(0)}%` }} />
          </div>
        )}

        {error && <div className="error">Install failed: {error}</div>}

        <button type="button" onClick={install} disabled={installing}>
          {installing ? 'Installing…' : 'Install now'}
        </button>
        <button type="button" className="secondary" onClick={onDismiss} disabled={installing}>
          Remind me later
        </button>
      </div>
    </div>
  );
}
