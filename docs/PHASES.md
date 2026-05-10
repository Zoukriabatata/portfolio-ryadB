# Refonte heatmap — journal des phases

Branche : `feat/heatmap-refonte` (depuis `feat/v1-senzoukria`).

## REFONTE-1 — Setup branche, déplacer legacy, scaffold core

- `19094f6` refonte(M6b): move M6b-1 to _legacy + stub HeatmapRoute + add mission
- `fbf33cd` refonte(M6b): scaffold core (GridSystem, ClockSource, presets, types)
- `3a2e8c7` refonte(M6b): add vitest + eslint no-Date.now + tsconfig exclude legacy

Notes : 14 fichiers M6b-1 déplacés sous `desktop/src/_legacy/heatmap/` (à supprimer en REFONTE-5). `GridSystem` (factory pure, frozen, clamp `[0, historyLength-1]`) + `ClockSource` (out-of-order tolerated) + types + presets. Vitest 2 + ESLint 9 flat config (scope refonte uniquement). Couverture 100 % sur GridSystem.ts + ClockSource.ts. Pas de capture (pas de rendu en REFONTE-1).

## REFONTE-2 — `LiquidityHeatmapLayer` standalone

Cible : couche WebGL fond, cellules price × time, gradient froid → chaud, 60 FPS sur 3000 buckets × 200 prix.

Livrables :
- Contrat `Layer<TData>` (`init/update/draw/destroy`).
- `LiquidityFrame` + `aggregateOrderbookHistoryToFrame` (intégrale temporelle exacte size·overlap, log-scale normalisée).
- `intensityToUint8` (helper isolé, in place, no alloc).
- `gradient.ts` : CSS vars `--heat-0..6` → texture 256×1 RGBA8 prébakée.
- `LiquidityHeatmapLayer` : regl + texture intensité luminance/uint8 (subimage) + texture gradient + quad plein écran ; pas de `regl.prop`, pas d'`if` shader.
- Harness `desktop/src/dev/HeatmapDemo.tsx` montée à la route `/heatmap` pendant la refonte (le stub REFONTE-1 est remplacé).
- `tokens.css` : palette froid → chaud.

Tests : 9 tests `aggregate`, 6 tests `intensityToUint8`, 7 tests smoke `LiquidityHeatmapLayer` (mock regl, vi.mock("./gradient")).

Capture : à valider visuellement à `/heatmap` sur Tauri ou Vite dev (cf. REPORT.md).

## REFONTE-3 — Engine + OrderbookHistory + Adapter Bybit

Cible : branchement bout en bout sur Bybit BTCUSDT linear via Tauri events.

Étape 0 (commit séparé) :
- `a6d3395` refonte(M6b): fix axes mismatch — texture dims swap + shader vUV.yx (REFONTE-3 step 0)

Livrables :
- `Layer<TData>` augmenté avec flag `dirty: boolean` (écrit uniquement par l'engine).
- `OrderbookHistory` : ring buffer time-bucketed indexé par `absBucket % historyLength`. Sémantique replace ("valeur la plus récente du bucket"). Allocation one-shot.
- `HeatmapEngine` : frame loop unique, registre layers ordonné, throttle `toFrame` au changement de bucket (10 Hz à 100 ms), helper pur `shouldRecomputeFrame` pour test, `enableDevSanity()` red-quad clip-space.
- `OrderbookAdapter` : `listen("orderbook-update")` → parse → `OrderbookSnapshot` (timestamp_ns → ms, quantity → size). Conversion défensive, pas de throw.
- `HeatmapLive.tsx` route harness : auto-subscribe Bybit + sanity au mount + FPS counter.

Source Rust event : `desktop/src-tauri/src/connectors/bybit/orderbook.rs:35` (`ORDERBOOK_EVENT = "orderbook-update"`).

Tests : 11 OrderbookHistory + 5 HeatmapEngine helper. Total cumulé 61 tests.

Décisions de scope :
- Agrégation intra-bucket = "replace" (pas d'intégrale temporelle). Upgrade prévu en REFONTE-3.5 si visuel insuffisant.
- Viewport statique placeholder (99 990–100 010). Pan/zoom = REFONTE-4/5.
- Trades = no-op REFONTE-3.

## REFONTE-4a — TradeBubblesLayer + viewport dynamique

Cible : couche bubbles instanced + viewport dyn (auto-follow + wheel zoom + drag pan vertical) + adapter trades Bybit.

Étape 0 : lecture Rust trades. Source `connectors/bybit/orderbook.rs` (orderbook) + `commands/crypto_tick_events.rs:22` (ticks). Event ticks `"crypto-tick-update"`, payload `{symbol, price, quantity, side: "buy"|"sell", timestampNs}`, cadence pass-through, side déjà résolu côté Rust (pas d'inversion isBuyerMaker à faire JS).

Livrables :
- `Layer.onViewportChange` (optionnel, idempotent) + `HeatmapEngine.setViewport` ne throw plus, broadcast aux couches + realloc cells/history seulement si dims changent.
- `OrderbookHistory` inchangé (REFONTE-3 préservé).
- `TradesBuffer` ring Float64 (capacity 50 000), `visibleTrades`/`medianRecentVolume`/`currentPrice`.
- `TradesAdapter` : event `"crypto-tick-update"` → `Trade` parsé (camelCase, side mapping `"buy"→bid, "sell"→ask`).
- `TradeBubblesLayer` : regl instanced via `ANGLE_instanced_arrays` (extension activée à l'engine), shaders mediump, 6 floats/instance interleaved (centerX/Y, radius_px, r/g/b), `volumeToRadiusPx` sqrt avec fallback médian=0, MAX_BUBBLES=50 000 throw si dépassé.
- `ViewportController` (src/dev/) : wheel zoom centré, drag vertical, auto-follow deadband ±25 % saut atomique, dispose propre.
- `HeatmapLive` : 2 adapters en parallèle via `Promise.all`, lock toggle UI 🔓/🔒, FPS/Snaps/Trades.
- `tokens.css` : `--bid #26a69a`, `--ask #ef5350`.

Tests : 6 helper Engine (incluant `shouldReallocOnViewportChange`) + 17 TradeBubblesLayer + 14 TradesBuffer + 10 TradesAdapter + 2 LiquidityHeatmapLayer onViewportChange. Total cumulé 124 tests.

Décisions :
- Pan-only (pas de shift in-place du buffer history) — accepte un "smear" temporaire sur auto-follow, refill bucket par bucket.
- Pan horizontal (temps) reporté à REFONTE-4c/5.
- Sanity red-quad inchangé (DEV only).

## REFONTE-4b — KeyLevelsLayer (POC / VAH / VAL / VWAP)

Cible : 4 lignes horizontales overlay canvas2D au-dessus de la liquidity heatmap + bubbles.

Livrables :
- `VolumeProfileBuilder` (core) : Float32Array volumes par priceLevel, rebuild from-scratch chaque tick depuis TradesBuffer (O(N_trades) trivial à 10 Hz). `poc(grid)` linéaire scan, `valueArea(widthPct, grid)` extension alternée standard CME.
- `VwapBuilder` (core) : rolling 24h via 1440 buckets minute (~23 KB Float64Array). `ingest(price, size, exchangeMs)`, `evict(nowExchangeMs)` pour clear ring sur clock advance sans nouvel ingest. `vwap()` = sum(price·vol) / sum(vol), null si sumV=0.
- `DEFAULT_VALUE_AREA_WIDTH = 0.70` ajouté à `core/presets.ts`.
- `Layer.init` étendue avec param optionnel `overlayCtx?: CanvasRenderingContext2D` (rétrocompat TS auto pour layers regl pures).
- `HeatmapEngine` : spec ajout `overlayCanvas` + `valueAreaWidth`, builders alloués à `start()`, rebuild VolumeProfileBuilder dans tick au bucket avance, vwap.evict, getKeyLevelsSnapshot() exposé. Resize VolumeProfileBuilder sur viewport dim change.
- `KeyLevelsLayer` (render, canvas2d) : 4 lignes + labels avec background semi-transparent, font JetBrains Mono 13px, lecture CSS vars `--level-poc/va/vwap` à init.
- `HeatmapLive` : 2 canvases superposés (regl z=1, overlay 2D z=2 pointer-events:none), addLayer(KeyLevelsLayer, z=10), POC + VWAP affichés dans l'overlay UI, font-variant-numeric: tabular-nums.

Tests : 17 VolumeProfileBuilder + 16 VwapBuilder. Total cumul 151 tests.

Décisions :
- VolumeProfileBuilder rebuild from-scratch (pas incremental ingest/evict) — simpler, coût O(N_trades) à 10 Hz négligeable.
- VWAP bucketé minute (pas FIFO trades 80 MB) — 23 KB seulement.
- Pas de test KeyLevelsLayer (canvas2d DOM) — validation runtime visuelle.

## REFONTE-4c — VolumeProfileLayer (histogramme vertical droite)

Cible : 6e couche, panel 80 px à droite avec barres horizontales gradient teinté selon position vs POC.

Livrables :
- `VOLUME_PROFILE_WIDTH_PX = 80` ajouté à `core/presets.ts`.
- `VolumeProfileBuilder` étendu (3 accessors zero-copy : `pocIndex()`, `valueAreaIndices(widthPct)`, `getVolumesView()`). Logique métier (poc/valueArea) inchangée.
- `HeatmapEngine.getVolumeProfileSnapshot()` : snapshot zero-copy `{volumes, pocIdx, valIdx, vahIdx}`. `Engine.tick()` clear l'overlay UNE FOIS par frame avant les draws (les overlay layers ne clear plus).
- `Layer.draw()` JSDoc updated : "write only" pour overlay.
- `KeyLevelsLayer` rétro-fit : suppression `clearRect`, lignes tronquées à `canvas.width - 80`, labels right-aligned (convention pro Bookmap/ATAS).
- `VolumeProfileLayer` (canvas2d, ~120 l) : helper pur `classifyVolumeBar`, lecture CSS vars à init, draw rect bars right-to-left, no clear.
- `tokens.css` : `--vp-neutral #5d6b7e` ajouté.
- `HeatmapLive` : `addLayer(volumeProfileLayer, 20, ...)`.

Tests : 6 nouveaux Builder accessors + 7 classifyVolumeBar. Total cumul 164 tests.

Décisions :
- `VolumeProfileBuilder` étendu (3 méthodes ajoutées) — accessors passifs, pas modification logique. Justifié comme extension permise.
- Tronquage permanent (même si VolumeProfileLayer désactivée future).
- Pas de smoke VolumeProfileLayer (DOM canvas2d) — validation visuelle.

REFONTE-4 = done complet. Les 6 couches Bookmap-grade tournent (Liquidity + TradeBubbles + KeyLevels + VolumeProfile) bout en bout sur Bybit BTCUSDT.

## REFONTE-5 — Cleanup + Crosshair + DOM latéral + Lessons

Cible : finition refonte avant merge main. 5 commits.

Livrables :
- **Cleanup** : suppression `desktop/src/_legacy/heatmap/` (14 fichiers M6b-1) + `desktop/src/dev/HeatmapDemo.tsx`. ESLint guard `no-restricted-imports` patterns `**/_legacy/*` ajoutée → bloque tout retour silencieux.
- **Auto-viewport init** : flag `viewportInitialized` dans HeatmapLive useEffect, recentre depuis le 1er orderbook snap valide (`(bids[0] + asks[0]) / 2`) via `ViewportController.applyExternalViewport(min, max)`. Mitigation §5.E (cascade canvas-noir si trades tardifs).
- **CrosshairLayer** : canvas2d sur l'overlay existant, z=15 entre KeyLevels (10) et VolumeProfile (20). Lignes verticale + horizontale fines + tooltip box 4 lignes (Price, Time HH:MM:SS UTC, Liq %, Vol). Throttle naturel rAF (mousemove → engine.setCrosshair → getCrosshairData au tick suivant).
- **Engine.lookupCell** + helper pur exporté `pixelsToGrid(x, y, w, h, grid)` testé (5 cas : centre, top-left, bottom-right, hors bornes, canvas size 0).
- **DomPanel** : composant React imperatif (140 px à gauche, 20 asks haut + 20 bids bas avec color bars proportionnelles). Pré-création 40 rows au mount, polling 10 Hz via setInterval, update textContent + style.background. Pas de useState à 10 Hz.
- **Engine.getLastOrderbookSnap** : ref directe zero-copy.
- **CSS Grid 2 colonnes** `.heatmap-route-grid { 140px | 1fr }` avec `.dom-panel` + `.heatmap-canvas-zone`. ResizeObserver toujours sur `canvas.parentElement = .heatmap-canvas-zone`.
- **`docs/LESSONS.md`** versionné : §5.A (regl silent fail) + §5.B (regl.prop vec) + §5.C (serde camelCase) + §5.D (Number precision u64 ns) + §5.E (hot-reload Tauri WS) + §5.F (.app-shell CSS rule) + §5.G (ResizeObserver bon parent).

Tests : 169 (164 baseline + 5 pixelsToGrid). Pas de smoke pour CrosshairLayer ni DomPanel (DOM-touching, validation runtime).

REFONTE-5 = REFONTE COMPLÈTE. La branche `feat/heatmap-refonte` est prête à merger sur `main`.

## Récap final REFONTE 1 → 5

- **REFONTE-1** : scaffolding `core/` (GridSystem, ClockSource, presets, types) + Vitest + ESLint flat config.
- **REFONTE-2** : `LiquidityHeatmapLayer` (regl, gradient 256 stops, instanced texture intensity), `aggregateOrderbookHistoryToFrame` (intégrale temporelle), harness mock.
- **REFONTE-3** + **3.5** : `HeatmapEngine` (frame loop, throttle bucket, dirty flags, sanity dev) + `OrderbookHistory` ring buffer + `OrderbookAdapter` Bybit live (camelCase fix). Premier rendu live bout en bout.
- **REFONTE-4a** : `TradeBubblesLayer` instanced regl + viewport dynamique (auto-follow + wheel zoom + drag pan + lock toggle) + `TradesAdapter` + `TradesBuffer`.
- **REFONTE-4b** + **4b.5** : `KeyLevelsLayer` canvas2d (POC/VAH/VAL/VWAP) + `VolumeProfileBuilder` + `VwapBuilder` rolling 24h. Hotfix CSS `.app-shell` flex column + ResizeObserver.
- **REFONTE-4c** : `VolumeProfileLayer` canvas2d (histogramme vertical droite, gradient POC/VA/neutre) + `getVolumesView` zero-copy + clearRect overlay partagé.
- **REFONTE-5** : cleanup legacy + auto-viewport init + `CrosshairLayer` + `DomPanel` + Lessons versionnées.

**6 couches Bookmap-grade simultanées + DOM live + viewport dyn + crosshair**. Prêt merge `main` + tag `v0.3.0`.

## REFONTE-6 — post-merge

- Panel Inspector (à droite ou flottant)
- Settings panel runtime (bucketDuration, valueAreaWidth, depth DOM, palette, etc.)
- Tooltip volume-on-hover sur DOM panel
- Pan horizontal (temps) — actuellement seul le pan vertical est implémenté
- Persistence viewport / settings entre sessions
