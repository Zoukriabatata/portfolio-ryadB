# V1.0.0 — Audit Senzoukria web (M0)

**Date** : 2026-05-08
**Repo** : `orderflow-v2` (Next.js 15 / React 19 / TS strict / Tailwind v4)
**Verdict global** : portable Vite/Tauri **avec un effort calibré**, pas un rewrite. Stack moderne, code client-side ('use client'), zéro Server Component bloquant.

---

## 1. Pages / Routes

`app/` = Next.js App Router. **32 `page.tsx`** dont la plupart des charts sont des stubs SEO (`return null`) — le vrai contenu est rendu via `DashboardClientLayout.tsx` + un système keep-alive (mounted Set) qui garde les composants charts en mémoire entre navigations. C'est le bon pattern pour un trading shell — réutilisable tel quel en Tauri.

### Pages à porter (priorité V1 — données temps réel)

| Path | Statut | Composant principal | Data sources | Verdict |
|------|--------|---------------------|--------------|---------|
| `/live` | ✅ fonctionnel | `LivePageContent` (via shell) + `LiveChartPro/` | Binance/Bybit WS (crypto) + dxFeed (CME 15min delayed) | **Easy** — swap dxFeed→Rithmic |
| `/footprint` | ✅ fonctionnel | `FootprintPageContent` + `FootprintChartPro` | Idem | **Easy** — pipeline déjà connecté à `useLiveFootprint` |
| `/heatmap` | ✅ fonctionnel | `HeatmapPageContent` + `LiquidityHeatmapPro/` (regl WebGL) | Binance orderbook stream | **Medium** — port WebGL + adapter pour CME orderbook (Phase 8.2) |
| `/gex` | ✅ fonctionnel | `GEXPageContent` + `GEXDashboard` + `GEX3DRenderer` | API `/api/gex-data`, `/api/gex-live`, `/api/options-data` | **Medium** — backend reste sur Vercel, frontend port direct |
| `/volatility` | ✅ fonctionnel | `VolatilityPageContent` + `IVSurface3D` + `VolatilitySkewChart` | API `/api/volatility-live`, Deribit WS | **Medium** — IV surface 3D regl |
| `/replay` | ✅ fonctionnel | `useReplay` hook + `FootprintReplayControls` | DB Postgres via `/api/history` | **Medium** — historique côté Vercel, replay côté front |
| `/flow` | ✅ partiel | `OptionsFlowPanel` | `/api/options-flow` | Medium |

### Pages business (à garder en iframe ou port plus tard)

| Path | Statut | Note V1 |
|------|--------|---------|
| `/` | landing | Garder web (funnel marketing) |
| `/pricing`, `/auth/*`, `/legal/*` | landing/auth | Garder web |
| `/account`, `/account/setup`, `/upgrade` | session + Stripe | Iframe via bridge (Phase 7.8) |
| `/journal` | DB-heavy | Iframe v1, port en M11+ |
| `/ai`, `/news`, `/bias`, `/academy`, `/boutique`, `/contact` | content/AI | Iframe v1 |
| `/backtest`, `/trading`, `/orderflow`, `/dashboard`, `/admin` | utilitaires | Iframe v1 |
| `/download`, `/footprint`/legacy | marketing/redirect | Garder web |

### API routes (`app/api/`) — **50+ endpoints**

À garder côté Vercel (backend SaaS) : `auth/*`, `license/*`, `stripe/*`, `paypal/*`, `payment/*`, `account/*`, `admin/*`, `ai/*`, `journal/*`, `news/*`, `support/*`, `contact/*`, `databento/*`, `dxfeed/*`, `heatmap/*` (cache), `history/*`, `gex-data/*`, `gex-live/*`, `options-data/*`, `options-flow/*`, `volatility-live/*`, `releases/*`, `updater/*`, `ib/*`, `tradovate/*`, `discord/*`, `alerts/*`, `backtest/*`, `binance/*`, `bybit/*`, `deribit/*`, `market/*`, `fear-greed/*`, `futures-history/*`, `futures-price/*`, `spot-price/*`, `datafeed/*`, `trading/*`.

Le shell Tauri tape sur ces endpoints via HTTP (pas via iframe). Auth par cookie NextAuth via le bridge token Phase 7.8.

---

## 2. Composants réutilisables (`components/`)

Inventaire par dossier, focus V1 :

| Dossier | Fichiers clés | Use case | Portable Vite |
|---------|---------------|----------|---------------|
| `charts/` | `FootprintChartPro`, `LiquidityHeatmapPro/`, `LiveChartPro/`, `GEXDashboard`, `IVSurface3D`, `Heatmap3D`, `TopstepDOM`, `TradingDOM`, `TimeSales`, `MiniDepthHeatmap`, `VolatilitySkewChart`, `IVSmileChart` (×27 fichiers) | Vues de trading principales | ✅ direct port (regl + lightweight-charts + canvas) |
| `widgets/` | `BiasGauge`, `ClusterPanel`, `DataSourceSelector`, `DeltaWidget`, `FuturesMetricsWidget`, `GEXIntensityGauge`, `OptionsFlowPanel`, `SymbolSelector`, `TapeSpeedMeter` (×14) | Widgets dashboard | ✅ direct port |
| `live/` | LiveChart wrappers + controls | /live page content | ✅ direct port |
| `replay/` | `FootprintReplayControls` + replay UI | /replay | ✅ direct port |
| `journal/` | `CalendarGrid`, `CalendarTab`, `BulkActionsBar`, `CalendarDaySummary` | /journal | iframe v1 (DB-heavy) |
| `ai/` | `AIAgentsPage`, `DashboardAIChat`, `LiveAgentPanel`, `LiveSignalBadge`, `VisionPanel`, `TradingBias` | AI features | iframe v1 |
| `trading/dashboard/` | `AccountRulesCard`, `CertificateButton` + cards | /account | iframe v1 (Stripe) |
| `ui/` | shadcn-ish primitives (toasts, modals, toggles) | Cross-cutting | ✅ direct port |
| `landing/` | Hero, FAQ, Testimonials, etc. | Marketing | Garder côté web |
| `seo/` | `JsonLd` | SEO web | Garder côté web |
| `layouts/` | `DashboardClientLayout`, `ChartPageShell`, `SessionProviderWrapper` | Shell+keep-alive | ⚠ adapter — DashboardClientLayout est très Next.js, on porte juste le pattern |
| `providers/` | Context providers (theme, session) | Cross-cutting | ✅ port |
| `modals/` | Modales globales | Cross-cutting | ✅ port |
| `settings/` | Panneaux settings (chart, account) | Cross-cutting | ✅ port |
| `tools/` | Drawing tools, Fibo, etc. | charts | ✅ port |
| `pages/` | `*PageContent` (FootprintPageContent, HeatmapPageContent, GEXPageContent, VolatilityPageContent…) — c'est ICI que vit le vrai contenu rendu par DashboardClientLayout | Hosts pages charts | ✅ direct port (juste le routing change : React Router au lieu de Next App Router) |

**Total composants** : ~250 fichiers `.tsx` dans `components/`. Estimation: ~70% portables direct (chart/widget/UI/tools), ~20% à adapter (layouts/providers vs router), ~10% spécifique web (landing/SEO).

---

## 3. State management — Zustand 5

`stores/` = **38 stores Zustand** (zustand 5.0.10). Aucun Redux / Context lourd.

### Stores critiques V1 (charts + data)

| Store | Rôle | Persistence |
|-------|------|-------------|
| `useMarketStore` | symbol, exchange, price | mémoire |
| `useLiveStore` | live page state | mémoire |
| `useFootprintStore`, `useFootprintSettingsStore` | footprint data + settings | localStorage (settings) |
| `useHeatmapSettingsStore` | heatmap config | localStorage |
| `useOrderbookStore` | bid/ask depth | mémoire |
| `useDataFeedStore` | source actuelle (binance/bybit/dxfeed/rithmic) | localStorage |
| `useGEXStore` | gamma exposure | mémoire + cache |
| `useOptionsStore`, `useEquityOptionsStore` | options chain | mémoire |
| `useFuturesStore` | futures contracts | mémoire |
| `useSymbolPriceStore` | last price par symbol | mémoire |
| `useChartSyncStore`, `useCrosshairStore`, `useDrawingStore` | chart sync entre views | mémoire |
| `useFavoritesToolbarStore`, `useChartToolsStore`, `useChartTemplatesStore`, `useToolSettingsStore` | UI charts | localStorage |
| `useThemeStore`, `useUIThemeStore` | theming | localStorage |
| `useAlertsStore`, `useTradeStore` | trades + alerts | DB synced via API |

### Stores business (peuvent rester pas portés en V1)

`useJournalStore`, `useTradingStore`, `useAccountPrefsStore`, `useAccountRulesStore`, `useBacktestStore`, `useReplayUIStore`, `useNewsSettingsStore`, `useNewsThemeStore`, `useTimezoneStore`, `useMicrostructureStore`, `useIndicatorStore`, `usePreferencesStore`, `useWatchlistStore`.

Le hook `lib/hydrate-stores.ts` orchestre l'hydratation côté client. Pattern compatible Vite (juste pas de SSR).

**Compatibilité Tauri** : 100%. Zustand fonctionne sans Next.js. Le `persist` middleware utilise `localStorage` qui marche pareil dans le webview Tauri.

---

## 4. Hooks custom (`hooks/`) — 27 hooks

| Hook | Rôle | Portable Vite |
|------|------|----------------|
| `useLiveFootprint` | Subscribe footprint live (data layer entry point) | ✅ — câbler sur Tauri events au lieu de WS web |
| `useLiveVolumeProfile` | Volume profile live | ✅ idem |
| `useOrderbook` | Orderbook live | ✅ idem |
| `useTrades` | Tape live | ✅ idem |
| `useReplay`, `useReplayKeyboard` | Replay engine | ✅ |
| `useFuturesData`, `useHistoricalData` | Historical fetch | ✅ (HTTP) |
| `useSymbolPriceSync` | Sync prix entre charts | ✅ |
| `useLiveAgent`, `useEventNotifications` | AI/notifications | ✅ |
| `useJournalAnalytics`, `useJournalCalendar`, `useJournal`, `useDailyNotes`, `usePlaybook`, `useAutoTrackTrades`, `useTradovatePanel` | Journal | iframe v1 |
| `useEconomicCalendar`, `usePriceAlerts`, `useWallAlerts` | Alerts/news | ✅ |
| `usePageActive`, `useScrollAnimations`, `useAutoContrast`, `useOptimizedFilter`, `useOptimizedKeyboard` | Utilitaires UI | ✅ |
| `useIBConnection` | Interactive Brokers (IB Gateway) | reporté (Phase 8+) |

**Note critique** : `useLiveFootprint` est le point d'entrée du data flow. Il consomme actuellement `dxFeedFootprintService` (15min delayed) ou `BinanceWS` (crypto). C'est le hook à câbler sur les Tauri events pour V1.

---

## 5. Data layer — la pièce critique

### Source de vérité aujourd'hui (web)

| Source | Endpoint | Latence | Use |
|--------|----------|---------|-----|
| Binance Futures | `wss://fstream.binance.com/ws` | live, gratuit | Crypto (BTC, ETH, etc.) |
| Bybit | `wss://stream.bybit.com/v5` | live, gratuit | Crypto perp |
| Deribit | `wss://www.deribit.com/ws/api/v2` | live, gratuit | Options crypto |
| **dxFeed demo** | `wss://demo.dxfeed.com/webservice/cometd` | **15min delayed** | CME futures |
| Tradovate | WS | live (account-required) | CME alt |
| Databento (REST) | `/api/databento` | historical | Backtest |

### Pourquoi le délai 15min CME

**C'est un choix gratuit, pas un bug.** Le code dans `lib/dxfeed/DxFeedWS.ts` documente explicitement :

```ts
/**
 * FREE real-time data for CME futures with 15-minute delay
 * Note: 15-minute delayed data - perfect for analysis/learning
 */
```

Le tier dxFeed Retail (live) coûte ~$30-50/mois par user. Le tier demo est gratuit mais 15min delayed. Senzoukria utilise le demo pour ne pas grever son économie sub à $29/mois.

**Solution V1** : on a déjà la réponse. Le connecteur **Rithmic Apex** (Phase 7) donne du live CME via le compte prop firm de l'utilisateur — gratuit pour nous, le user paye sa data feed via sa prop firm. Plus besoin de dxFeed.

### Architecture WebSocket actuelle

`lib/websocket/WebSocketManager.ts` orchestre :
- `BinanceWS.ts` — futures aggregate trades + book ticker + depth
- `BybitWS.ts` — perp public stream
- `DeribitWS.ts` — options + futures
- `DxFeedWS.ts` — CME delayed
- `TradovateWS.ts` — CME live (account-gated)

Chaque WS expose un pattern observer (subscribe + emit). Les composants front consomment via les hooks (`useLiveFootprint`, `useOrderbook`, `useTrades`).

### Stratégie V1 desktop

| Source actuelle | Stratégie V1 |
|-----------------|--------------|
| Binance / Bybit / Deribit WS | **Garder côté webview Tauri** (TS), aucun changement nécessaire |
| dxFeed delayed CME | **Remplacer par Rithmic Rust** (déjà fait Phase 7) |
| Tradovate | Reporté (déjà a connecteur partiel, finir en M3+) |
| Databento historical | Garder via HTTP API Vercel |

Le shell Tauri exécute le code WebSocket TS (Binance/Bybit/Deribit) directement dans le webview — pas besoin de tout porter en Rust. Seules les sources qui exigent une auth lourde (Rithmic, Tradovate, IB) passent par le côté Rust pour la sécurité des credentials.

---

## 6. Auth / Account

### Stack actuel
- **NextAuth 4.24** avec credentials provider + Google probable (à confirmer côté `app/api/auth/`)
- **Prisma 5.22** + Postgres
- **bcrypt** pour password hash
- **jose 6.2** pour JWT signing (license JWT côté Rust desktop est Ed25519 via `lib/license/jwt`)
- Middleware NextAuth route-level
- Stripe + Paypal pour billing

### Bridge desktop ↔ web (déjà fait Phase 7.8)

`/api/auth/desktop-bridge?token=...&next=...` accepte un JWT Ed25519 license, valide la fraîcheur (60s), mint un cookie NextAuth, redirect.

### Modifs V1
- **Aucune côté serveur**. Le bridge marche.
- Côté shell Tauri : étendre l'allowlist de `next` paths si on ouvre de nouvelles vues web en iframe.
- Tous les API calls que le webview Tauri fait (futures-history, market, alerts…) bénéficient déjà du cookie NextAuth posé par le bridge.

---

## 7. Styling / Theming

### Stack
- **Tailwind v4** (PostCSS plugin only, pas de `tailwind.config.js` — config via CSS variables dans `globals.css`)
- **Geist font** (sans + mono)
- **Sonner** pour toasts
- **lucide-react** pour icônes
- **html2canvas + jspdf** pour exports

### Design tokens (extraits de `app/globals.css`)

```css
--background: #07080f
--surface: #0d0f1b
--surface-elevated: #12152a
--text-primary: #e8eaf6
--text-secondary: #8890b0
--border: rgba(255, 255, 255, 0.07)
```

Direction : navy-black warm, hierarchy de gris cool, palette restreinte. **Tradytics-inspired** d'après le commentaire en tête.

### CSS additionnel
- `styles/animations.css`
- `styles/landing-animations.css`
- `styles/chart-animations.css`

### Theme system
- `lib/themes/ThemeSystem.ts` (variants)
- `lib/heatmap-webgl/themes/OrderflowTheme.ts` (palettes WebGL — gradients RGBA 256 pixels)
- `useThemeStore` + `useUIThemeStore` (Zustand persist localStorage)
- Theme picker UI dans `DashboardClientLayout`
- Init blocking script dans `layout.tsx` pour pas avoir de FOUC au boot

**Portabilité Vite** : 100%. Tailwind v4 + PostCSS marche identique. Les 3 fichiers CSS sont juste des @import, copier-coller. Le init script doit migrer vers le `index.html` du Vite.

---

## 8. Dépendances NPM

### Critiques pour le port

| Package | Usage | Tauri ? |
|---------|-------|---------|
| `react@19.2.3` + `react-dom` | core | ✅ déjà dans Tauri |
| `next@15.5.11` | framework | ❌ remplacer par Vite + React Router |
| `next-auth@4.24` | auth web | reste côté Vercel |
| `@prisma/client@5.22` | DB | reste côté Vercel |
| `lightweight-charts@5.1` | candles | ✅ port direct |
| `regl@2.1.1` | WebGL abstraction | ✅ port direct |
| `lucide-react@0.575` | icons | ✅ port direct |
| `sonner@2.0.7` | toasts | ✅ port direct |
| `geist@1.7` | fonts | ✅ port direct (Tailwind v4 supporte) |
| `zustand@5.0.10` | state | ✅ port direct |
| `zod@4.3.6` | validation | ✅ port direct |
| `jose@6.2.3` | JWT verify | ✅ port direct |
| `html2canvas@1.4`, `jspdf@4.2` | exports | ✅ port direct |
| `ws@8.19` | WS server (Node) | reste côté Vercel uniquement |
| `@dxfeed/api@1.6` | CME delayed | **retiré V1** (remplacé par Rithmic) |
| `@anthropic-ai/sdk@0.79` | AI server-side | reste côté Vercel |
| `electron@34` + `electron-builder@25` | ancien packaging | retiré (Tauri remplace) |

### Conclusion
Aucune dep bloquante. Toutes les libs UI/WebGL/charts marchent dans Vite sans modif.

---

## 9. Tests existants

- **Vitest** pour unit tests (`__tests__/lib/`)
- **Playwright** pour E2E (`tests/e2e/`)
- Coverage actuelle inconnue — `__tests__/lib/` est le seul dir, donc light.

### Stratégie V1
- Conserver Vitest pour les libs core qu'on porte (orderflow engines, footprint engine côté front, websocket clients).
- E2E Playwright reste sur le web (vérifie /pricing, /signup, /auth).
- Côté Tauri shell, les tests E2E sur le binary lui-même nécessiteraient `tauri-driver` — TODO post-V1.

---

## 10. Évaluation finale

### Score effort migration : **7/10 (Medium)**

Pas un rewrite. Pas trivial non plus. Les bonnes nouvelles l'emportent largement :

**✅ Pros**
- Code 100% client-side ('use client'), aucun Server Component bloquant
- Tailwind v4 portable Vite sans config (juste PostCSS plugin)
- Zustand portable 1:1
- WebGL/chart engines déjà ATAS-class (regl + shaders custom + 14 fichiers footprint engine + 31 fichiers heatmap)
- Le shell Tauri Phase 7 a déjà React 19 + Vite + le bridge NextAuth → on peut porter incrémentalement
- Le bridge `/api/auth/desktop-bridge` permet de garder les pages business (account, journal, AI) en iframe authentifié
- Rithmic Apex (Phase 7) règle déjà le problème "data CME live" — pas besoin de chercher

**⚠ Risques techniques**
1. **Volume de code** : ~250 fichiers `.tsx` dans components/ + 38 stores + 27 hooks. Le port mécanique prend du temps même si chaque fichier individuel est facile.
2. **DashboardClientLayout** : 1 fichier monumental qui orchestre tout (theme, mounted set, navigation, shortcuts). Remplacer par un MemoryRouter Tauri = work non-trivial.
3. **WebGL keep-alive** : le pattern actuel monte les charts en background pour ne pas perdre l'état regl. Doit être reproduit côté Tauri shell.
4. **Cookie partage iframe ↔ webview principale** : le bridge marche pour l'iframe, mais si une vue native fait un fetch avec `credentials: 'include'` vers Vercel, il faut s'assurer que le cookie est posé dans le contexte du webview parent — pas testé.
5. **API routes lourdes (/api/databento, /api/heatmap cache)** : doivent rester côté Vercel. Latence aller-retour HTTPS pour chaque fetch — pas un problème si on fetch les snapshots, problème si on streamait via HTTP polling.
6. **Tailwind v4 sans config file** : les tokens vivent dans CSS variables. Reproductible, mais à documenter pour pas perdre le design language.

### Recommandations ordre des milestones

1. **Foundations (M1)** — Tailwind + design tokens + branding shell. Avant de toucher aux charts.
2. **Data layer (M2)** — câbler les WS crypto TS dans le webview Tauri (réutilisation 100%) puis valider que `useLiveFootprint`/`useOrderbook`/`useTrades` reçoivent les ticks.
3. **Heatmap (M3) avant Footprint UI (M4-M5)** — la heatmap c'est le wow factor visuel, et c'est le plus complexe (regl + 31 fichiers WebGL). Si on le casse, autant le casser tôt.
4. **Footprint = combo killer** — c'est le différenciateur. M5 = footprint UI Senzoukria + Rithmic live = le moment où l'app DEVIENT vraiment ATAS-class.
5. **GEX/Vol après** — secondaires en termes d'utilisation quotidienne. Mais visuellement spectaculaires (IV surface 3D, GEX heatmap), donc bon pour la démo.
6. **Replay tout à la fin** — utile mais pas killer. Les users Apex ont déjà le replay de Rithmic.
7. **Polish + ship** — branding final, screenshots store, page download mise à jour, Discord blast.

### Décision stratégique transversale

Le site web `orderflow-v2.vercel.app` reste vivant pour le funnel marketing : landing + pricing + signup + démo crypto + download. Mais les pages /live, /footprint, /heatmap, /gex, /volatility, /replay côté web peuvent être marquées "upgrade to desktop" ou laissées en démo crypto. À discuter au M10 (ship) — pas urgent maintenant.
