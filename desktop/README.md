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
`http://localhost:3000` by default.

## Configuring the backend URL

The desktop app talks to the web backend from two places (Rust client +
React webview), each with its own env var because they have different
lifecycles:

| Var | Side | Lifecycle | Set in… |
|---|---|---|---|
| `VITE_API_BASE` | Frontend (Vite) | **Build-time** — inlined into the JS bundle by `tauri build` | `desktop/.env.production` (committed) or `desktop/.env.local` (gitignored) |
| `ORDERFLOWV2_API_BASE` | Rust (`auth.rs`) | **Runtime** — read on every launch, can be overridden without rebuild | Shell env before launching the binary |

Fallback behavior differs by side and build profile:

- **`VITE_API_BASE`** falls back to `http://localhost:3000` when unset
  (used both in `tauri dev` and a `tauri build` without `.env.production`).
- **`ORDERFLOWV2_API_BASE`** falls back to `http://localhost:3000` in
  **dev builds** (`cargo run`, `tauri dev`) and to
  `https://orderflow-v2.vercel.app` in **release builds**
  (`tauri build`, the .msi distributable). The split uses
  `cfg!(debug_assertions)` — set the env var to override either mode
  (handy for staging/QA on a signed binary without rebuilding).

For a production release, `tauri build` auto-loads `.env.production`
to bake `VITE_API_BASE` into the bundle; the Rust release fallback
covers the IPC path (`/api/license/login`, `/api/license/heartbeat`)
that does not flow through the frontend.

## What this MVP does

- Reads the hardware machine UUID via `machine-uid` and sends it to
  `/api/license/login` along with email + password.
- Persists the returned 24h Ed25519 JWT to
  `<app-data>/session.json` (plaintext for now — Stronghold migration
  is queued for the license token specifically).
- Calls `/api/license/heartbeat` every 4 hours while the app is open
  to refresh the JWT and update `Machine.lastHeartbeatAt`.
- Signs out automatically if the backend revokes the session
  (subscription cancelled, license suspended, machine removed, etc.).
- Connects to a Rithmic R|Protocol gateway from the Rust side and
  streams `LastTrade` + `BestBidOffer` ticks into a footprint engine
  whose updates are emitted to the React UI as `footprint-update`
  events.

## Broker credentials

After the license login, the desktop asks for **broker credentials** in
a separate panel (`BrokerSettings`). These are the username/password
that route to a Rithmic gateway (Rithmic Test UAT, Apex, MyFundedFutures,
etc.) — distinct from the OrderflowV2 web account.

### Storage

Broker credentials live in the OS-native credential manager via the
[`keyring`](https://docs.rs/keyring) crate:

- Windows : Credential Manager (DPAPI under the hood)
- macOS : Keychain
- Linux : libsecret / Secret Service

Storage key: `service="OrderflowV2"`, `account="broker_credentials_v1"`.
The full record (including username + gateway URL + system_name) is
JSON-serialized and stored as a single keyring entry, so all reads
return everything the connector needs in one call.

> **Note:** the project's original spec called for Tauri Stronghold.
> We chose `keyring` instead because Stronghold v2's plugin is JS-first
> and would force us to manage a snapshot password. The vault interface
> in `brokers/vault.rs` is opaque, so swapping back to Stronghold or
> running both is a single-file change.

### Preset registry

`desktop/src-tauri/src/brokers/presets.rs` is the single source of truth
for the broker dropdown. Exposed to the React UI via `list_broker_presets`,
so the JS list is always in sync with the Rust registry.

| Preset | Default `system_name` | Default gateway URL | Notes |
|---|---|---|---|
| RithmicTest | `Rithmic Test` | `wss://rituz00100.rithmic.com:443` | UAT — throttled, dev only |
| RithmicPaperTrading | `Rithmic Paper Trading` | _user-supplied_ | retail Paper Trading |
| Rithmic01 | `Rithmic 01` | _user-supplied_ | retail live via FCM |
| Apex | `Apex` | _user-supplied_ | Apex Trader Funding |
| MyFundedFutures | `Rithmic Paper Trading` | _user-supplied_ | ⚠ system varies eval/funded |
| BluSky | `Rithmic Paper Trading` | _user-supplied_ | |
| Bulenox | `Rithmic Paper Trading` | _user-supplied_ | per Bulenox docs |
| TakeProfitTrader | `Rithmic Paper Trading` | _user-supplied_ | ⚠ PRO+ uses `Rithmic 01-US` |
| FourPropTrader | `Rithmic Paper Trading` | _user-supplied_ | per ATAS integration |
| Topstep | `TopstepTrader` | _user-supplied_ | dedicated system |
| Custom | _empty_ | _empty_ | user enters everything |

Most presets ship `default_gateway_url=None` because for R|Protocol API
(versus R|Trader Pro) Rithmic does not publish their prod gateway URLs.
The URL arrives by email at onboarding; the UI lets the user paste it.

**Open TODOs** (flagged inline in `presets.rs`):

- Confirm MFFU R|Protocol `system_name` (eval vs funded — current default
  is "Rithmic Paper Trading", a best guess).
- Take Profit Trader: the eval (`Rithmic Paper Trading`) vs PRO+
  (`Rithmic 01-US`) split is currently a manual override; could be
  auto-detected via `RequestRithmicSystemInfo`.
- Confirm Apex prod gateway URL once we have a contributor with Apex
  access.

### Connection lifecycle

```
First launch:
  React mount → load_broker_credentials → null
              → render <BrokerSettings>
  User saves → save_broker_credentials (creds → OS keyring)
             → rithmic_login_from_vault (vault → connector)
             → render <FootprintLive>

Subsequent launches:
  React mount → load_broker_credentials → redacted record
              → rithmic_login_from_vault → render <FootprintLive>
  (the plaintext password never re-enters the React tree;
   it stays in the OS vault and is read directly by the Rust side)
```

`rithmic_login(args)` and `test_broker_connection(args)` exist for
manual / dev paths but the production flow only uses
`rithmic_login_from_vault()`.

## Production build

```pwsh
npm run tauri build
```

Outputs an MSI / NSIS installer under `src-tauri/target/release/bundle/`.
