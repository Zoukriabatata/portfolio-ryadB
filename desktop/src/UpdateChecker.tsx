import { useEffect, useState } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

type State =
  | { kind: 'idle' }
  | { kind: 'available';  update: Update }
  | { kind: 'installing'; update: Update; progress: number }
  | { kind: 'error';      update: Update; message: string };

/**
 * Mounted once the user is logged in. Hits the /api/updater manifest
 * endpoint via the Tauri plugin, and surfaces a modal if a newer .msi
 * is available on GitHub Releases. The user opts in: nothing happens
 * if they hit "Remind me later". The check re-runs on every fresh app
 * launch — no persistent snooze for the MVP.
 */
export function UpdateChecker() {
  const [state, setState] = useState<State>({ kind: 'idle' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const update = await check();
        if (cancelled || !update) return;
        setState({ kind: 'available', update });
      } catch (err) {
        // Network error, GitHub down, missing signature on the latest
        // release — none of these should block the user from using the
        // app, so swallow.
        console.warn('updater.check failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (state.kind === 'idle') return null;

  const { update } = state;
  const installing = state.kind === 'installing';

  const install = async () => {
    setState({ kind: 'installing', update, progress: 0 });
    try {
      let downloaded = 0;
      let total = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started')  total = event.data.contentLength ?? 0;
        if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          if (total > 0) {
            setState({ kind: 'installing', update, progress: downloaded / total });
          }
        }
      });
      await relaunch();
    } catch (err) {
      setState({
        kind:    'error',
        update,
        message: err instanceof Error ? err.message : 'Install failed',
      });
    }
  };

  const dismiss = () => setState({ kind: 'idle' });

  return (
    <div className="updater-overlay">
      <div className="card updater-card">
        <h1>Update available</h1>
        <p className="muted">
          Version <strong>{update.version}</strong> is available
          {update.currentVersion && <> (you have <strong>{update.currentVersion}</strong>)</>}.
        </p>

        {update.body && <pre className="updater-notes">{update.body}</pre>}

        {state.kind === 'installing' && (
          <div className="updater-progress">
            <div style={{ width: `${(state.progress * 100).toFixed(0)}%` }} />
          </div>
        )}

        {state.kind === 'error' && (
          <div className="error">Install failed: {state.message}</div>
        )}

        <button type="button" onClick={install} disabled={installing}>
          {installing ? 'Installing…' : 'Install now'}
        </button>
        <button type="button" className="secondary" onClick={dismiss} disabled={installing}>
          Remind me later
        </button>
      </div>
    </div>
  );
}
