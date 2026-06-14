// Custom window controls (minimize / maximize-restore / close) for the
// decorationless main window. With `decorations: false` (tauri.conf.json)
// the OS titlebar is gone, so the app must provide these affordances.
//
// The maximize icon swaps to a "restore" glyph while the window is
// maximized, mirroring the native Windows chrome. State is kept in sync
// via the window's `onResized` event (covers maximize, restore, snap).

import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./WindowControls.css";

const appWindow = getCurrentWindow();

export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let alive = true;

    void appWindow.isMaximized().then((m) => {
      if (alive) setMaximized(m);
    });

    // onResized fires on maximize / restore / snap / manual resize.
    void appWindow
      .onResized(() => {
        void appWindow.isMaximized().then((m) => {
          if (alive) setMaximized(m);
        });
      })
      .then((fn) => {
        if (alive) unlisten = fn;
        else fn();
      });

    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);

  return (
    <div className="win-controls">
      <button
        type="button"
        className="win-ctl"
        title="Minimize"
        aria-label="Minimize"
        onClick={() => void appWindow.minimize()}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <rect x="0" y="4.5" width="10" height="1" fill="currentColor" />
        </svg>
      </button>
      <button
        type="button"
        className="win-ctl"
        title={maximized ? "Restore" : "Maximize"}
        aria-label={maximized ? "Restore" : "Maximize"}
        onClick={() => void appWindow.toggleMaximize()}
      >
        {maximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <rect
              x="0.5"
              y="2.5"
              width="6"
              height="6"
              fill="none"
              stroke="currentColor"
            />
            <path
              d="M2.5 2.5 V0.5 H9.5 V7.5 H7.5"
              fill="none"
              stroke="currentColor"
            />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <rect
              x="0.5"
              y="0.5"
              width="9"
              height="9"
              fill="none"
              stroke="currentColor"
            />
          </svg>
        )}
      </button>
      <button
        type="button"
        className="win-ctl win-ctl-close"
        title="Close"
        aria-label="Close"
        onClick={() => void appWindow.close()}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path
            d="M0.5 0.5 L9.5 9.5 M9.5 0.5 L0.5 9.5"
            stroke="currentColor"
            strokeWidth="1.1"
          />
        </svg>
      </button>
    </div>
  );
}
