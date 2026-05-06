# OrderflowV2 Desktop

Tauri 2 + React shell that authenticates against the OrderflowV2 web
backend and keeps a desktop license session alive.

## Prerequisites

- **Node.js 20+** (already installed at the repo root)
- **Rust toolchain** — install once via:
  ```pwsh
  winget install Rustlang.Rustup
  rustup default stable
  ```
- **MSVC build tools** — required by Tauri on Windows. The Rustup installer
  prompts for them; pick "Desktop development with C++" in the Visual
  Studio Installer if needed.
- **WebView2 runtime** — preinstalled on Windows 11; download manually
  on older Windows 10 builds.

Full prereqs list: <https://tauri.app/start/prerequisites/>

## First-time setup

```pwsh
cd desktop
npm install
```

## Development

In one terminal, start the web backend at the repo root:
```pwsh
npm run dev          # http://localhost:3000
```

In another terminal, launch the desktop app:
```pwsh
cd desktop
npm run tauri dev
```

The app opens a window with a sign-in screen. Use a PRO web account to
log in — the desktop authenticates against `/api/license/login` on
`http://localhost:3000` (override with `ORDERFLOWV2_API_BASE` env var).

## What this MVP does

- Reads the hardware machine UUID via `machine-uid` and sends it to
  `/api/license/login` along with email + password.
- Persists the returned 24h Ed25519 JWT to
  `<app-data>/session.json` (plaintext for now — Stronghold migration
  is queued).
- Calls `/api/license/heartbeat` every 4 hours while the app is open
  to refresh the JWT and update `Machine.lastHeartbeatAt`.
- Signs out automatically if the backend revokes the session
  (subscription cancelled, license suspended, machine removed, etc.).

## Production build

```pwsh
npm run tauri build
```

Outputs an MSI / NSIS installer under `src-tauri/target/release/bundle/`.
