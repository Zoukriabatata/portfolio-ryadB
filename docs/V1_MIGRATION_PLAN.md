# V1.0.0 — Plan de migration Senzoukria → Tauri

## Vue d'ensemble

**Objectif** : un seul produit desktop Tauri qui combine la **belle UI Senzoukria** (regl WebGL + Tailwind + 250 composants React mature) et les **vraies data temps réel** (Rithmic Apex CME + Binance/Bybit/Deribit crypto live + Deribit options).

**Durée estimée** : ~24 jours de dev focused, étalable selon disponibilité (user en sabbatique, pas de deadline rigide).

**Priorités**
1. Combo footprint Senzoukria UI + Rithmic live (M5) — c'est le différenciateur business
2. Heatmap WebGL (M3) — c'est le wow factor visuel
3. Le reste suit

**Non-objectifs V1**
- Mac/Linux build (Q3 2026 minimum, focus Windows)
- Auto-updater fix (TODO P1 actuel)
- Port `/journal`, `/ai`, `/news`, `/academy`, `/boutique` (restent iframe)
- Refactor des 50+ API routes Vercel (restent telles quelles, le shell tape via HTTPS+cookie)

---

## Stack cible Tauri V1.0.0

| Couche | Tech | Source |
|--------|------|--------|
| Bundler | Vite 7 | déjà en place (Phase 7) |
| Framework UI | React 19 + TypeScript strict | déjà en place |
| Routing | `react-router-dom` v7 MemoryRouter | déjà en place (Phase 7.7.5) |
| Styling | Tailwind v4 + design tokens CSS variables | **port depuis web** (M1) |
| Fonts | Geist sans + mono | port |
| Icons | lucide-react | port |
| State | Zustand 5 | port (38 stores) |
| Toasts | sonner | port |
| Charts (candles) | lightweight-charts 5.1 | port |
| WebGL (heatmap/IV) | regl 2.1 + shaders GLSL custom | port (31 fichiers `lib/heatmap-webgl/`) |
| Footprint engine front | port direct | port (14 fichiers `lib/orderflow/` + 9 fichiers `lib/footprint/`) |
| WS crypto | TS Binance/Bybit/Deribit (`lib/websocket/`) | **port direct** dans webview |
| WS CME | **Rithmic Rust** (Phase 7) — pas de JS WS | déjà en place |
| Auth | NextAuth cookie via bridge token (Phase 7.8) | déjà en place |
| Backend | Vercel Next.js API routes (50+) | **inchangé**, shell tape via HTTPS+cookie |

---

## Milestones

Chaque milestone produit un livrable visible (build qui lance, screen qui rend). Pas de big-bang.

### M1 — Foundations Tauri (1-2 jours)

**Goal** : le shell Tauri ressemble à Senzoukria (couleurs, fonts, navbar) avant qu'on porte le moindre chart.

**Tâches**
- Setup Tailwind v4 dans `desktop/` (port `postcss.config.mjs` + `app/globals.css` design tokens)
- Port `styles/animations.css` + `styles/chart-animations.css`
- Port Geist sans + mono via Tailwind v4
- Port lucide-react + sonner
- Port `useThemeStore` + `useUIThemeStore` (Zustand)
- Refondre `AppNavbar` actuel pour matcher la navbar Senzoukria (sidebar verticale ?)
- Init theme blocking script dans le `index.html` Vite (équivalent du script dans `app/layout.tsx`)

**Critères de succès**
- App Tauri lance avec couleurs Senzoukria (`#07080f` background, etc.)
- Navbar visible avec branding cohérent
- 4 routes existantes (Welcome / Footprint / Live / Account) toujours fonctionnelles
- `npm run build` clean

**Risques**
- Tailwind v4 + Vite peut nécessiter un plugin différent du PostCSS plugin Next.js — à vérifier
- CSS variables qui dépendent de classes Tailwind dynamiques — pas vu dans l'audit, à confirmer

---

### M2 — Crypto data layer (1-2 jours)

**Goal** : `useLiveFootprint`, `useOrderbook`, `useTrades` reçoivent des ticks BTC/USDT live dans le shell Tauri.

**Tâches**
- Port `lib/websocket/BinanceWS.ts` + `BybitWS.ts` + `DeribitWS.ts` + `WebSocketManager.ts` dans `desktop/src/lib/websocket/`
- Port `useLiveFootprint`, `useOrderbook`, `useTrades`, `useLiveVolumeProfile` dans `desktop/src/hooks/`
- Port stores associés : `useMarketStore`, `useLiveStore`, `useDataFeedStore`, `useOrderbookStore`, `useFootprintStore`
- Composant minimal de test qui mount un Binance subscription + affiche le tick stream (texte brut, pas de chart)

**Critères de succès**
- Subscribe BTC/USDT → ticks affichés à ~50/sec dans une debug page
- Subscribe ETH-PERP Bybit → ticks affichés
- Subscribe BTC options Deribit → quotes affichés
- Aucun build error / runtime error

**Architecture** : 100% TypeScript dans le webview, pas de Rust. Les WS crypto publics ne nécessitent pas de credentials sensibles.

---

### M3 — Heatmap WebGL (3-4 jours)

**Goal** : `/heatmap` route native dans le shell, regl rendu, BTC orderbook depth visualisé en temps réel.

**Tâches**
- Port `lib/heatmap-webgl/` complet (31 fichiers : `core/`, `commands/`, `shaders/`, `themes/`, `adapters/`)
- Port `components/charts/LiquidityHeatmapPro/` (sous-dossier)
- Port `components/charts/InstitutionalHeatmap.tsx` + `MiniDepthHeatmap.tsx` + `SmoothedHeatmap.tsx` + `StaircaseHeatmap.tsx`
- Port `useHeatmapSettingsStore`
- Wire route `/heatmap` dans router Tauri
- Adapter pour consommer le BinanceWS depth stream (M2)

**Critères de succès**
- Heatmap render BTC live à 60fps
- Settings panel fonctionnel (gradient, theme, smoothing)
- Switch BTC ↔ ETH symbol triggers re-subscribe sans glitch

**Risques**
- WebGL context perte au switch de tab (le keep-alive pattern actuel doit être reproduit)
- regl version compat avec React 19 strict mode — à vérifier dès M2

---

### M4 — Footprint UI Senzoukria + crypto live (2 jours)

**Goal** : `/footprint` route native (REMPLACE l'écran HTML/CSS basique actuel) avec la vraie UI Senzoukria, branchée sur BTC/USDT live.

**Tâches**
- Port `lib/orderflow/` (14 fichiers : `FootprintEngine`, `FootprintAggregator`, `OrderflowEngine`, `VolumeProfileEngine`, `VWAPEngine`, `TWAPEngine`, etc.)
- Port `lib/footprint/` (9 fichiers : `ATASFootprintEngine`, `FootprintCanvasRenderer`, `FootprintIndicators`, etc.)
- Port `components/charts/FootprintChartPro.tsx` + `FootprintReplayControls.tsx`
- Port `components/pages/FootprintPageContent.tsx`
- Port stores : `useFootprintStore`, `useFootprintSettingsStore`, `useChartSyncStore`, `useCrosshairStore`, `useDrawingStore`
- Garder l'ancien écran HTML/CSS sous une route `/footprint-legacy` ou supprimer (à décider)

**Critères de succès**
- Footprint Senzoukria render sur BTC/USDT
- Bars OHLC + delta + per-level buy/sell volume
- Settings panel fonctionnel (timeframe, imbalance ratio, indicators)
- Performance ≥ 60fps

---

### M5 — Footprint UI Senzoukria + Rithmic live 🌟 (1 jour)

**Goal** : LE différenciateur business. Footprint Senzoukria UI + Rithmic Apex live = combo qui n'existe nulle part ailleurs à $29/mois.

**Tâches**
- Adapter `useLiveFootprint` pour consommer les Tauri events `footprint-update` (Phase 7.7.2) en plus des WS crypto
- `DataSourceSelector` widget : dropdown crypto/CME pour switcher la source de footprint en live
- Wire le `BrokerSettings` Phase 7.7.4 dans la nouvelle UI Senzoukria (modal cohérente)
- Pour le mode Rithmic, le footprint engine front délègue au `FootprintEngine` Rust (déjà fait Phase 7.7.1) au lieu de re-calculer côté JS — ou les deux en parallèle pour valider equivalence

**Critères de succès**
- Switch BTC → MNQ via dropdown → footprint Senzoukria continue de render à 60fps
- Bars 5s/15s/1m/5m fluides
- Volume MNQM6 cash session ≥ 100 trades/sec sans frame drop

---

### M6 — Live charts native (2 jours)

**Goal** : `/live` route native avec candlestick chart + tape + DOM ladder, branchée sur les sources data.

**Tâches**
- Port `components/charts/LiveChartPro/` + `components/charts/PriceInfoBar.tsx` + `TimeSales.tsx` + `TopstepDOM.tsx` + `TradingDOM.tsx`
- Port `components/pages/LivePageContent.tsx`
- Port `components/live/`
- Port stores : `useLiveStore`, `useSymbolPriceStore`, `useSymbolPriceSync`
- Wire dropdown symboles (crypto + futures)

**Critères de succès**
- Candlestick chart BTC/USDT live
- DOM ladder MNQ live (Rithmic)
- Time & Sales tape
- Switch symbol fluide

---

### M7 — GEX dashboard (3 jours)

**Goal** : `/gex` route native avec gamma exposure heatmap + KPIs.

**Tâches**
- Port `components/charts/GEXDashboard.tsx` + `GEXChart.tsx` + `CumulativeGEXChart.tsx` + `GEXHeatmap.tsx` + `GEX3DRenderer`
- Port widgets `GEXIntensityGauge`, `GEXKPIGrid`, `GEXMetricCard`, `GEXNarrativePanel`
- Port `components/pages/GEXPageContent.tsx`
- Port stores : `useGEXStore`, `useOptionsStore`, `useEquityOptionsStore`
- Le shell tape `/api/gex-data`, `/api/gex-live`, `/api/options-data` côté Vercel via HTTPS+cookie

**Critères de succès**
- GEX dashboard render avec data Vercel
- Strike-level gamma visible
- 3D renderer fonctionnel

---

### M8 — IV Surface + Volatility (3 jours)

**Goal** : `/volatility` route native avec IV surface 3D + skew + term structure.

**Tâches**
- Port `components/charts/IVSurface3D.tsx` + `IVSmileChart.tsx` + `IVSmileSimulated.tsx` + `IVTermStructure.tsx` + `VolatilitySkewChart.tsx` + `VolatilitySmile.tsx`
- Port `lib/heatmap-webgl/IVSurface3DRenderer.ts` + `commands/IVSurfaceCommand.ts` + shader `ivSurface3d.ts`
- Port `components/pages/VolatilityPageContent.tsx`
- Tape `/api/volatility-live` via HTTPS+cookie

**Critères de succès**
- IV surface 3D render avec data Deribit
- Skew + smile chart par expiry
- Term structure visible

---

### M9 — Session Replay (3 jours)

**Goal** : `/replay` route fonctionnelle (utile pour journaling).

**Tâches**
- Port `useReplay`, `useReplayKeyboard`
- Port `components/replay/` (controls + UI)
- Port `useReplayUIStore`
- Tape `/api/history`, `/api/futures-history` via HTTPS+cookie pour récupérer les snapshots tick-par-tick

**Critères de succès**
- Replay d'une session passée (ex: NQ 2025-01-15)
- Vitesse 1x / 5x / 10x / pause / step
- Reprend la session sans glitch

---

### M10 — Polish + ship V1.0.0 (2 jours)

**Tâches**
- Page `/account` reste en iframe (Phase 7.7.5/7.8 marche déjà)
- Page `/journal`, `/ai`, `/news`, `/academy`, `/boutique` en iframe
- Branding final : logo, nom "Senzoukria" partout (vs "OrderflowV2" actuel)
- Update `tauri.conf.json::productName` → "Senzoukria"
- Update web `/download` page : screenshots de la nouvelle UI
- Update README desktop avec nouvelles routes
- Bump version desktop `0.1.12` → `1.0.0`
- Tag `v1.0.0` → GitHub Actions release → .msi
- Discord blast aux 236 users : "Senzoukria V1.0.0 ships — beautiful UI + live CME data"

**Critères de succès**
- v1.0.0 .msi téléchargeable depuis `/download`
- Au moins 1 user externe valide le download + login + footprint Apex
- Pas de régression sur les flows critiques (license login, vault, footprint, heatmap, GEX)

---

## Risques globaux

| Risque | Mitigation |
|--------|------------|
| **Volume de code à porter** (~250 components, 38 stores, 27 hooks) | Travailler par milestone, livrer en continu plutôt qu'en big-bang |
| **WebGL keep-alive pattern complexe** (DashboardClientLayout monstrueux) | Simplifier : pas besoin de keep-alive si le user passe ≤ 4 routes (Welcome/Footprint/Live/Heatmap). Le pattern devient utile à partir de M6. |
| **Tailwind v4 + Vite** différent de Tailwind v4 + Next.js | Tester en M1 avant tout port. Si galère, fallback v3 (perte de design tokens dynamiques mais marche). |
| **Cookie NextAuth dans webview ≠ iframe** | Tester en M2 : un fetch direct du webview Tauri vers `/api/futures-price` doit ramener du data authentifié, pas du 401 |
| **regl + React 19 strict mode** | Tester tôt en M3, fallback à `<StrictMode>` désactivé sur les charts si besoin |
| **Auto-updater cassé** (TODO P1 hérité) | Discord blast V1.0.0 doit dire "manual download" — fix updater en V1.0.1 ou V1.1 |
| **Performance Rithmic 100 trades/sec dans la UI Senzoukria** | À tester en M5. Si le renderer Senzoukria perd des frames, downsample côté Rust avant broadcast |
| **Dérive entre web et desktop** pendant la migration | Geler les changements UI sur le web pendant M1-M9. Tout fix design va d'abord dans desktop, peut être backporté web après. |

---

## Timeline réaliste

- **Total focused** : ~24 jours de dev (~5 semaines à 5h/jour, ou 3 semaines à 8h/jour)
- **Pas de pression deadline** — user en année sabbatique
- **Possibilité d'étalement** sur 2-3 mois en mode "1-2 milestones par semaine"

Découpage typique :
- Semaine 1 : M1 + M2 (foundations + data layer)
- Semaine 2 : M3 (heatmap)
- Semaine 3 : M4 + M5 (footprint complet)
- Semaine 4 : M6 (live charts)
- Semaine 5 : M7 + M8 (GEX + Volatility)
- Semaine 6 : M9 + M10 (replay + ship)

---

## Décisions à prendre AVANT M1

Le user doit trancher ces points avant qu'on commence à coder :

### 1. Branche de travail

- **A.** Continuer sur `feat/rithmic-integration` (déjà 27 commits ahead de main)
- **B.** Créer une nouvelle `feat/v1-senzoukria` qui part de main, et merge `feat/rithmic-integration` d'abord
- **C.** Merger `feat/rithmic-integration` → main d'abord (release 0.2.0), puis nouvelle branche pour V1

→ Reco : **C**. Release 0.2.0 maintenant donne aux 236 users de la vraie data Apex avec l'UI basique. Pendant 5 semaines de M1-M10, eux ont déjà une amélioration. V1.0.0 = upgrade UI plus tard.

### 2. Backend Vercel — keep tel quel ou refactor ?

- **A.** Garder Vercel comme backend HTTP (50+ API routes inchangées). Shell tape via HTTPS+cookie.
- **B.** Porter une partie en Rust local (latence -, complexité ++)
- **C.** Tout porter en Rust (4-6 mois supplémentaires, hors V1)

→ Reco : **A**. C'est la stratégie ATAS. Le frontend desktop est local mais le backend cloud reste cloud. Pas de refactor à V1.

### 3. Site web `orderflow-v2.vercel.app` après V1.0.0 — keep ou décom ?

- **A.** Garder en funnel marketing (landing/pricing/signup/démo crypto/download). Retirer les liens vers /live /footprint /heatmap (qui sont dans l'app).
- **B.** Garder TOUT le web actif (l'app est juste une "version desktop", le web fait pareil avec data delayed)
- **C.** Décommissionner le web, tout dans l'app

→ Reco : **A**. Le site garde son rôle marketing/SEO/crypto-demo. Pages chart marquées "Upgrade to Desktop for live CME data".

### 4. Naming branding — "OrderflowV2" ou "Senzoukria" ?

- Le code dit "OrderflowV2" partout (productName Tauri, README, commits)
- Le site dit "Senzoukria"
- L'electron-builder dit `productName: "Senzoukria"` (lol legacy)
- Email du user : `prof.mifizi@gmail.com`, brand mention `Senzoukria`

→ Reco : trancher. Si **Senzoukria** → renommer dans `tauri.conf.json`, `package.json`, README, .msi metadata, GitHub Actions release name. Si **OrderflowV2** → rebrand le site et la landing.

### 5. Le "wow factor" pour la démo de release

- **A.** Footprint MNQ live au cash open NY (M5 = différenciateur business pur)
- **B.** Heatmap NQ orderbook 3D (M3 = wow factor visuel pur)
- **C.** GEX dashboard SPX (M7 = features qui n'existe nulle part à $29/mois)

→ Reco : **A** + **B** combinés. Vidéo de 60s pour Discord/Twitter/site download : "Senzoukria V1 — live ATAS-class UI + your prop firm data feed in one app for $29/month".

---

## Ce qui n'est PAS dans V1.0.0

À l'aise pour défendre dans le release notes :

- ❌ macOS/Linux build (Q3 2026 ; "Coming soon")
- ❌ Auto-updater (TODO P1 ; "Manual download for now")
- ❌ Order execution (data only ; "Trading via your broker, analytics via Senzoukria")
- ❌ Backtest engine côté desktop (reste en iframe Vercel)
- ❌ AI agent natif (reste en iframe ; "Powered by Claude API")
- ❌ Journal natif (reste en iframe ; DB-heavy, futur V1.1)
- ❌ Mobile app (jamais explicitement promis)

C'est un produit **finite et clair** : data live CME + UI ATAS-class + paiement $29/mois. Le reste est bonus.
