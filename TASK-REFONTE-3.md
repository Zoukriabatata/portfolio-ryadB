# TASK-REFONTE-3 — `HeatmapEngine` + `OrderbookAdapter` + branchement Bybit live

> Pré-requis : avoir lu `CLAUDE.md` et `REPORT.md` (REFONTE-2).
> Branche courante : `feat/heatmap-refonte` (HEAD `691cd57`).
> Cette TASK est **auto-suffisante**. Tu produis `REPORT.md` à la fin (template en §11).
> Une seule sous-phase. Pas de raccourcis.

---

## 0. Contexte

REFONTE-2 a livré la couche de rendu liquidité standalone alimentée par mock data. REFONTE-3 fait 3 choses :

1. **Étape 0 obligatoire** : fix le bug d'axes texture détecté à la validation visuelle (REFONTE-2 a affiché des bandes verticales au lieu d'horizontales). Commit dédié, validation visuelle séparée.
2. Pose les **abstractions runtime** : `HeatmapEngine` (frame loop, registre couches, dirty flags, sanity dev) + `OrderbookHistory` (ring buffer time-bucketed) + `OrderbookAdapter` (events Tauri Bybit → snapshots JS).
3. Branche **bout en bout** : la route `/heatmap` consomme désormais des snapshots Bybit BTCUSDT linear via Tauri, plus la mock data.

Le mock data harness REFONTE-2 reste accessible (route ou mode toggle, à toi de choisir le moins invasif) pour debug visuel hors connexion.

---

## 1. Pré-requis git

1. `git rev-parse --abbrev-ref HEAD` → `feat/heatmap-refonte`.
2. `git log --oneline -3` doit montrer `691cd57 ... harness ...` au sommet.
3. Working tree clean (sauf éventuellement `REPORT.md` non committé — OK).

Si l'un est faux : STOP, REPORT en `blocked`.

---

## 2. ÉTAPE 0 OBLIGATOIRE — Fix axes mismatch

**À faire AVANT toute autre modification.** Commit séparé. Validation visuelle séparée.

### 2.1 Diagnostic (rappel REPORT REFONTE-2)

`LiquidityFrame` écrit `cells[t * priceLevels + p]` (contrat utilisateur). La texture WebGL était créée avec `width=historyLength, height=priceLevels`. WebGL lit `data[i]` comme texel `(x = i % width, y = i / width)` → chaque "row pixel" agrège 15 tranches temporelles → bandes verticales (moiré).

### 2.2 Fix (3 lignes)

`desktop/src/render/LiquidityHeatmapLayer.ts` :

```ts
// init() — texture intensité : SWAP width/height
this.intensityTex = regl.texture({
  width: this.priceLevels,    // était this.historyLength
  height: this.historyLength, // était this.priceLevels
  format: "luminance",
  type: "uint8",
  data: this.uint8Cells,
  min: "nearest",
  mag: "nearest",
  wrapS: "clamp",
  wrapT: "clamp",
});
```

Fragment shader source `FRAG_SRC` : sample avec `vUV.yx` :

```glsl
precision mediump float;
varying vec2 vUV;
uniform sampler2D uIntensity;
uniform sampler2D uGradient;
void main() {
  float i = texture2D(uIntensity, vUV.yx).r; // .yx swap : screen.x → time, screen.y → price
  vec3 color = texture2D(uGradient, vec2(i, 0.5)).rgb;
  gl_FragColor = vec4(color, 1.0);
}
```

`subimage(this.uint8Cells)` continue de fonctionner — la texture connaît ses dimensions.

### 2.3 Validation

- `npm run test` → 45/45 verts (le smoke test ne valide pas les dims, donc rien ne casse).
- `npm run build` → vert.
- **Validation visuelle utilisateur** (à demander dans REPORT en fin d'étape 0) : `npm run dev` ou `tauri dev`, naviguer à `/heatmap`, observer que les bandes sont maintenant **horizontales** (price levels qui persistent dans le temps). Si toujours verticales → revert le commit, REPORT en `blocked`.

### 2.4 Commit

`refonte(M6b): fix axes mismatch — texture dims swap + shader vUV.yx (REFONTE-3 step 0)`

**Tu peux continuer la TASK sans attendre la validation visuelle**, mais tu dois le signaler clairement dans REPORT (case dédiée). Si la validation arrive en cours de TASK et révèle un échec, tu reverts ce commit + tout ce qui en dépend.

---

## 3. Layer contract — ajout du flag `dirty`

`desktop/src/render/Layer.ts` :

```ts
export interface Layer<TData = unknown> {
  // Marqueur de re-update demandé. Mis à true par l'engine quand de la
  // nouvelle data est dispo. Reset à false par l'engine APRÈS l'appel à update().
  dirty: boolean;
  init(regl: Regl.Regl, grid: GridSystem): void;
  update(grid: GridSystem, data: TData): void;
  draw(): void;
  destroy(): void;
}
```

`LiquidityHeatmapLayer` doit déclarer `public dirty = false;` et n'a **rien d'autre à faire** — l'engine gère le flip. Met à jour le smoke test pour vérifier que `dirty` existe et démarre à `false`.

---

## 4. `OrderbookHistory` — ring buffer time-bucketed

`desktop/src/render/OrderbookHistory.ts` :

### 4.1 Contrat

```ts
import type { GridSystem, OrderbookSnapshot } from "../core";
import type { LiquidityFrame } from "./LiquidityFrame";

export class OrderbookHistory {
  constructor(historyLength: number, priceLevels: number);

  // Ingère un snapshot. Sémantique "remplacer le bucket courant" :
  // si plusieurs snapshots tombent dans le même absolute bucket, le plus
  // récent écrase les précédents. Buckets intermédiaires (gap) zero-out.
  // Snapshots out-of-order strictement antérieurs au _headBucket → ignorés.
  ingest(snapshot: OrderbookSnapshot, grid: GridSystem): void;

  // Remplit frame.cells in place avec les données ring buffer normalisées
  // log-scale pour le grid passé. Aucune allocation. frame.cells.length doit
  // == grid.historyLength * grid.priceLevels.
  toFrame(grid: GridSystem, frame: LiquidityFrame): void;
}
```

### 4.2 Implémentation

État interne :
- `private buffer: Float32Array` — taille `historyLength * priceLevels`, alloué une fois.
- `private headBucket: number` — index absolu du bucket le plus récent ingéré (`floor(exchangeMs / bucketDurationMs)`). Init = -Infinity.
- `private historyLength: number`, `private priceLevels: number` (depuis le constructeur).

`ingest(snap, grid)` :
1. Ignore si `snap.exchangeMs <= 0` ou si `grid.priceLevels !== this.priceLevels` (config divergente — throw).
2. `absBucket = Math.floor(snap.exchangeMs / grid.bucketDurationMs)`.
3. Si `absBucket < this.headBucket` → ignore (out-of-order).
4. Si `absBucket > this.headBucket` :
   - delta = `absBucket - this.headBucket`
   - Si `this.headBucket === -Infinity` (première ingestion) ou `delta >= historyLength` : zéro tout le buffer.
   - Sinon : pour chaque `b` dans `[this.headBucket + 1, absBucket - 1]` (intermédiaires, gap), zero out le slot `b % historyLength`.
   - Zero out le slot `absBucket % historyLength` (pour la sémantique "replace").
   - `this.headBucket = absBucket`.
5. Si `absBucket === this.headBucket` (re-write même bucket) : zero out le slot d'abord (replace).
6. Pour chaque level `(price, size)` dans `snap.bids ∪ snap.asks` :
   - `pIdx = grid.priceIndex(price)` ; si `-1` → skip.
   - `slot = absBucket % historyLength`
   - `buffer[slot * priceLevels + pIdx] = size` (overwrite — un seul level par price par snapshot).

**Important** : en sémantique "valeur la plus récente du bucket", on ne fait pas d'intégrale temporelle. C'est la version dégradée acceptée par l'utilisateur (REFONTE-3.5 si upgrade nécessaire, cf. §10).

`toFrame(grid, frame)` :
1. Vérifie `frame.cells.length === grid.historyLength * grid.priceLevels` ; sinon throw.
2. Calcule `absHead = floor(grid.nowExchangeMs / grid.bucketDurationMs)` et `absOldest = absHead - grid.historyLength + 1`.
3. Pour chaque `t ∈ [0, grid.historyLength - 1]` :
   - `absT = absOldest + t`
   - Si `absT > this.headBucket` (futur) ou `absT < this.headBucket - this.historyLength + 1` (overwritten) :
     - Pour chaque `p`, `frame.cells[t * priceLevels + p] = 0`.
   - Sinon :
     - `slot = ((absT % historyLength) + historyLength) % historyLength` (gestion modulo négatif si absT < 0).
     - Pour chaque `p ∈ [0, priceLevels - 1]` : `frame.cells[t * priceLevels + p] = this.buffer[slot * priceLevels + p]`.
4. Trouve `max` et applique log-scale `cells[i] = log(1 + cells[i]) / log(1 + max)` pour `max > 0`. Sinon ne touche pas (déjà à 0).

**Aucune allocation** dans `toFrame`. Tout in place sur `frame.cells`.

### 4.3 Tests `desktop/src/render/OrderbookHistory.test.ts`

Cas obligatoires :
- **Ingest unique** dans bucket 0 → toFrame retourne row 0 normalisée à 1.0.
- **Ingest 3 snapshots dans 3 buckets consécutifs** → 3 rows normalisées.
- **Ingest dans même bucket replace** : 2 ingests même `absBucket`, levels différents → 2e ingest seul retenu (premier overwritten).
- **Gap** : ingest bucket 0, puis bucket 5 → buckets 1..4 doivent être à zéro après toFrame.
- **Out-of-order ignoré** : ingest bucket 5, puis bucket 3 → bucket 3 ignoré, headBucket reste 5.
- **Wrap-around ring** : ingest sur `historyLength + 5` buckets différents → les 5 premiers buckets sont overwritten (slots recyclés). toFrame doit retourner 0 pour les anciens buckets.
- **Grid divergente** throw (priceLevels mismatch).
- **Frame mal dimensionné** dans toFrame throw.
- **Determinisme** : même séquence d'ingest → mêmes cells.

> 80 % coverage sur `OrderbookHistory.ts`.

---

## 5. `OrderbookAdapter` — events Tauri Bybit

### 5.1 Localisation et events

`desktop/src/adapters/OrderbookAdapter.ts`.

**Avant d'écrire**, lis le code Rust qui émet `orderbook_snapshot` (ou nom équivalent) pour confirmer le nom d'event et la shape du payload. Cherche dans `desktop/src-tauri/src/connectors/`, `commands/`, ou similaire — `grep -rn "orderbook_snapshot\|emit" desktop/src-tauri/src` te donnera l'emplacement.

Note attendue dans REPORT : nom exact de l'event Tauri + shape du payload. Si la shape côté Rust ne match pas un `OrderbookSnapshot` (`{ exchangeMs, bids: [{price, size}], asks: [{price, size}] }`), tu adaptes le parsing dans l'adapter (l'adapter convertit, pas le Rust).

### 5.2 Contrat

```ts
import type { OrderbookSnapshot } from "../core";

export class OrderbookAdapter {
  // start() écoute l'event Tauri et appelle le callback à chaque snapshot
  // valide. Retourne quand le listener est armé.
  async start(callback: (snap: OrderbookSnapshot) => void): Promise<void>;

  // dispose() détache le listener.
  dispose(): void;
}
```

### 5.3 Implémentation

- Utilise `import { listen, UnlistenFn } from "@tauri-apps/api/event"` (déjà dispo via `@tauri-apps/api`).
- Stocke l'`UnlistenFn` retourné par `listen` pour permettre le `dispose`.
- Parse le payload défensivement : si une clé manque (pas d'`exchangeMs`, ou `bids` non-array), `console.warn` et skip (pas de throw — un event malformé ne doit pas crasher la frame loop).
- L'adapter ne déclenche pas la connexion ni les subscriptions Tauri — c'est la responsabilité du composant React qui le mount (qui appelle `invoke("crypto_connect", …)` puis `invoke("crypto_orderbook_subscribe", …)` comme dans le legacy).
- L'adapter ne **filtre** pas par symbole : si tu veux filtrer, fais-le côté composant via le `callback`. L'adapter est un pur listener Tauri.

**Pas de test unitaire** (Tauri events nécessitent un runtime Tauri, hors scope CI). Le smoke test se fait via la route live.

### 5.4 Localisation ESLint

`src/adapters/` est dans le scope de la règle `no-restricted-syntax` (cf. eslint.config.js). Pas de `Date.now()` ni `performance.now()` dans ce fichier — l'adapter ne timestamp jamais lui-même, il transmet `exchangeMs` venu du venue.

---

## 6. `HeatmapEngine` — frame loop multi-couches

`desktop/src/render/HeatmapEngine.ts`.

### 6.1 Contrat

```ts
import type Regl from "regl";
import type { GridSystem, OrderbookSnapshot, Trade, Viewport } from "../core";
import type { Layer } from "./Layer";

export interface HeatmapEngineSpec {
  canvas: HTMLCanvasElement;
  viewport: Viewport;
  bucketDurationMs?: number; // défaut 100
  historyDurationMs?: number; // défaut 5*60_000
  tickSize?: number;          // défaut 0.10
}

export class HeatmapEngine {
  constructor(spec: HeatmapEngineSpec);

  // Ajoute une layer ordonnée par zIndex. getData() est appelé par le frame
  // loop UNIQUEMENT si layer.dirty est true ; il doit retourner la donnée
  // courante de la layer.
  addLayer<T>(layer: Layer<T>, zIndex: number, getData: () => T): void;

  setOrderbook(snap: OrderbookSnapshot): void;
  setTrades(trades: ReadonlyArray<Trade>): void; // no-op pour l'instant ; câblage REFONTE-4
  setViewport(viewport: Viewport): void;

  enableDevSanity(): void;  // active le red-quad sanity (dev seulement)
  disableDevSanity(): void;

  start(): void;   // démarre la rAF loop
  destroy(): void; // cascade : layers + sanity + regl + listener
}
```

### 6.2 Implémentation

État interne :
- `regl: Regl.Regl` (créé dans le constructeur depuis `spec.canvas`).
- `clock: ClockSource`.
- `currentGrid: GridSystem` (recréé chaque frame).
- `viewport: Viewport`, `bucketDurationMs`, `historyDurationMs`, `tickSize` (depuis spec).
- `orderbookHistory: OrderbookHistory` (créé depuis `historyLength` et `priceLevels` calculés à `start()`).
- `liquidityFrame: LiquidityFrame` (créé une fois en `start()` ; cells réutilisé).
- `layers: Array<{ layer, zIndex, getData }>` — trié par zIndex à chaque addLayer.
- `lastBucketProcessed: number = -Infinity` — pour le throttle bucket cadence.
- `pendingOrderbookUpdate: boolean = false`.
- `rafId: number | null = null`.
- `sanityLayer: SanityLayer | null = null`.

Constructeur :
- Crée `regl({ canvas: spec.canvas })`.
- Stocke spec.
- Init clock = new ClockSource().

`setOrderbook(snap)` :
- `clock.tick(snap.exchangeMs)`.
- Si la grid n'existe pas encore (premier event), crée-la maintenant (cf. start() ci-dessous, mais idéalement la grid se crée dans le frame loop à partir du clock).
- `orderbookHistory.ingest(snap, currentGrid)`.
- `pendingOrderbookUpdate = true`.

`setViewport(vp)` :
- `viewport = vp`.
- Reset le ring buffer (déjà géré au prochain ingest si historyLength change ; sinon reset explicite). Pour REFONTE-3, on suppose viewport stable au mount — appel unique au démarrage. Throw si appelé après `start()` (on ne supporte pas le viewport dynamique en REFONTE-3 ; ce sera REFONTE-4/5).

`start()` :
- Calcule `historyLength = floor(historyDurationMs / bucketDurationMs)` et `priceLevels = floor((viewport.priceMax - viewport.priceMin) / tickSize)`.
- Alloue `orderbookHistory = new OrderbookHistory(historyLength, priceLevels)`.
- Alloue `liquidityFrame = { grid: <stub>, cells: new Float32Array(historyLength * priceLevels) }` (le grid sera réécrit chaque frame ; on garde une ref mutable).
- Init chaque layer ajoutée : `layer.init(regl, currentGrid)` — mais le currentGrid n'existe pas encore. Solution : crée une grid initiale avec `nowExchangeMs = clock.now() || 0` pour init.
- Démarre `rafId = requestAnimationFrame(this.tick)`.

Frame loop `tick()` :
- Recrée `currentGrid` via `createGridSystem({ bucketDurationMs, historyDurationMs, nowExchangeMs: clock.now() || 0, tickSize, priceMin: viewport.priceMin, priceMax: viewport.priceMax })`.
- Throttle bucket cadence :
  - `currentBucket = floor(currentGrid.nowExchangeMs / bucketDurationMs)`
  - Si `pendingOrderbookUpdate && currentBucket > lastBucketProcessed` :
    - `liquidityFrame.cells` est rempli par `orderbookHistory.toFrame(currentGrid, liquidityFrame)`.
    - Cherche la layer LiquidityHeatmapLayer dans `layers` (ou plus génériquement : chaque layer registered via `addLayer` reçoit l'update à son tour si dirty — mais on a besoin de marquer la liquidité dirty ici).
    - **Simplification scope** : l'engine connaît un alias `_liquidityLayer` (la première Layer<LiquidityFrame>) et fait `_liquidityLayer.dirty = true`.
    - `lastBucketProcessed = currentBucket`.
    - `pendingOrderbookUpdate = false`.
- Pour chaque layer registered (ordre zIndex) :
  - Si `layer.dirty` : `layer.update(currentGrid, getData())` ; `layer.dirty = false`.
- `regl.clear({ color: [0, 0, 0, 1] })`.
- Pour chaque layer registered : `layer.draw()`.
- Si sanity activée : `sanityLayer.draw()`.
- `rafId = requestAnimationFrame(this.tick)`.

`destroy()` :
- `cancelAnimationFrame(rafId)`.
- Pour chaque layer registered : `layer.destroy()`.
- Si sanity : `sanityLayer.destroy()`.
- `regl.destroy()`.
- Reset tous les fields à null.

### 6.3 SanityLayer (dev red quad)

Fichier interne ou export depuis `HeatmapEngine.ts`. Dessine un quad rouge fixe en haut-gauche du canvas (50×50 pixels en clip space ≈ `[-1, -1+0.1, -1, -1+0.1]`). Vertex + frag shader trivial (couleur uniform constante).

Activée seulement via `enableDevSanity()`. Z-index +∞ (dessine après tout).

Pas de test (visuel uniquement).

### 6.4 Tests `desktop/src/render/HeatmapEngine.test.ts`

Tests **logiques** uniquement (pas de regl/canvas). Stratégie : factoriser la frame logic dans une fonction pure ou tester via mocks heavy. Si trop coûteux → skip et documenter dans REPORT (test purement intégration sur la route live).

Au minimum, **tester le throttle** dans une logique extraite :
```ts
// helper interne exporté pour test
export function shouldRecomputeFrame(
  pendingUpdate: boolean,
  currentBucket: number,
  lastBucketProcessed: number,
): boolean {
  return pendingUpdate && currentBucket > lastBucketProcessed;
}
```

3 tests : pas de pending → false ; pending mais même bucket → false ; pending + nouveau bucket → true.

> 80 % coverage sur le code testable.

---

## 7. Wire-up à la route `/heatmap`

### 7.1 Approche

Remplace `HeatmapDemo` par un nouveau composant `HeatmapLive` qui :

1. Mount `<canvas>`.
2. Crée `HeatmapEngine` avec viewport `{ priceMin: 100, priceMax: 120 }` (placeholder REFONTE-3 ; viewport dynamique = REFONTE-4/5).
3. Crée et init `LiquidityHeatmapLayer`.
4. Add la layer à l'engine (`engine.addLayer(layer, 1, () => liquidityFrameRef.current)`).
5. `engine.enableDevSanity()` (rappel : leçon CLAUDE.md §5.B).
6. `engine.start()`.
7. Crée `OrderbookAdapter` ; `await adapter.start(snap => engine.setOrderbook(snap))`.
8. Côté connect/subscribe : appelle `invoke("crypto_connect", { args: { exchange: "bybit" } })` puis `invoke("crypto_orderbook_subscribe", { args: { exchange: "bybit", symbol: "BTCUSDT" } })`. Ces invoke calls existent dans le legacy (`desktop/src/_legacy/heatmap/HeatmapRoute.tsx` lignes 35-45).
9. Affiche FPS + état (connecté / nb snapshots reçus / dernier bucket processé).
10. Cleanup : `adapter.dispose()` + `engine.destroy()`.

### 7.2 Mock fallback

Garde `HeatmapDemo.tsx` (mock data REFONTE-2) en place — déplace-le sous `desktop/src/dev/` (déjà là) et n'y touche pas. Si tu veux un toggle dans la route /heatmap pour basculer mock ↔ live, libre à toi (1 useState booléen + 2 composants conditionnels). Sinon, la route est live par défaut.

### 7.3 Sanity check au mount

Avant de te fier au rendu de la heatmap : avec `engine.enableDevSanity()`, tu dois voir un carré rouge en haut-gauche dès que regl init. **Si tu ne le vois pas, init regl a échoué silencieusement** (cf. CLAUDE.md §5.B). Note l'observation dans REPORT.

---

## 8. Tests + lint + grep — vérifications

1. `npm run test` → tous verts. Nouveaux tests : OrderbookHistory (~9), HeatmapEngine helper (~3). Total attendu : 45 + 12 = 57 tests.
2. `npm run coverage` → seuils respectés. OrderbookHistory > 80 %.
3. `npm run lint` → 0 erreur scope refonte. `src/adapters/OrderbookAdapter.ts` passe la règle `no-restricted-syntax` (pas de `Date.now`).
4. `npm run build` → vert.
5. `grep -rn "Date\.now\|performance\.now" desktop/src/core desktop/src/render desktop/src/adapters` → vide.
6. `grep -rn "from.*_legacy" desktop/src --include="*.ts" --include="*.tsx" | grep -v src/_legacy/` → vide (rappel : pas d'import depuis legacy).

---

## 9. Vérifications **runtime** (manuelles utilisateur)

Tu n'as pas la main sur la GUI — l'utilisateur valide. Documente clairement dans REPORT :

- [ ] Étape 0 (axes fix) : bandes horizontales visibles à `/heatmap` après commit dédié.
- [ ] Sanity red-quad visible au mount avec `enableDevSanity()`.
- [ ] Connexion Bybit OK (subscribe sans erreur).
- [ ] Snapshots reçus (compteur > 0 après 5 s).
- [ ] FPS médian ≥ 30 sur 60 s en live.
- [ ] Bandes horizontales avec un sillon plus dense autour du mid-price BTC actuel.

Si l'utilisateur observe l'un des items en échec → revert le commit concerné (et seulement celui-là), repars en partial.

---

## 10. Décisions de scope (à respecter)

- **Agrégation intra-bucket = "valeur la plus récente du bucket"** (sémantique replace). Pas d'intégrale temporelle. Si l'utilisateur juge le rendu trop "haché", on ouvre **REFONTE-3.5** qui upgrade la sémantique vers `Σ(size × overlap)` en stockant une chaîne de snapshots par bucket. Pas de pré-implémentation, pas de spéculation.
- **Viewport dynamique = pas dans REFONTE-3**. Le viewport est passé une fois au mount. Pan/zoom = REFONTE-4/5.
- **Trades = pas dans REFONTE-3**. `engine.setTrades()` existe au contrat mais est no-op. Câblage en REFONTE-4.
- **`HeatmapDemo` (mock REFONTE-2) reste en place** sous `src/dev/`. Pas supprimé. Sera nettoyé en REFONTE-5.

---

## 11. Commits attendus

Préfixe `refonte(M6b):`. Ordre :

1. `refonte(M6b): fix axes mismatch — texture dims swap + shader vUV.yx (REFONTE-3 step 0)`  ← **commit séparé, d'abord**
2. `refonte(M6b): Layer.dirty + OrderbookHistory ring buffer (REFONTE-3)`
3. `refonte(M6b): HeatmapEngine + SanityLayer (REFONTE-3)`
4. `refonte(M6b): OrderbookAdapter + HeatmapLive route + Bybit wire-up (REFONTE-3)`

Mise à jour de `docs/PHASES.md` avec entrée REFONTE-3 (sha + 2-3 lignes notes) dans le commit 4.

---

## 12. `REPORT.md` — template

```md
## REPORT TASK-REFONTE-3

**Status**: done | blocked | partial
**Commits**: 4 hashes + msgs (avec étape 0 séparée)

**Diffs résumé**: (5 lignes max par fichier touché)

**Vérifs contrats**:
- [ ] Étape 0 commit séparé créé et identifiable
- [ ] grep Date.now/performance.now → vide hors src/dev/
- [ ] tests vitest verts (X total)
- [ ] coverage OrderbookHistory > 80%
- [ ] npm run build vert
- [ ] npm run lint vert sur scope refonte
- [ ] Tauri event name + payload shape : <renseigner>
- [ ] Bytes adapter parse défensif (warn pas throw) — vérifié par lecture
- [ ] Engine throttle bucket cadence — couvert par test helper
- [ ] enableDevSanity() exposé et documenté

**Validation runtime utilisateur** (à cocher post-livraison) :
- [ ] Étape 0 : bandes horizontales sur harness mock
- [ ] Sanity red-quad visible au mount live
- [ ] Snapshots Bybit reçus (compteur > 0)
- [ ] FPS médian live ≥ 30
- [ ] Rendu cohérent (sillon mid-price visible)

**Décisions / écarts**: numérotés
**Blockers**: ou "aucun"
**Next**: pré-questions REFONTE-4 (trade bubbles / volume profile / key levels — à clarifier)
```

---

## 13. Anti-patterns à respecter

- ❌ `Date.now()` / `performance.now()` dans `src/render/`, `src/core/`, `src/adapters/`. `src/dev/` toléré (FPS counter).
- ❌ Allocation `Float32Array`/`Uint8Array` dans `tick()` (frame loop). Tout pré-alloué dans `start()`.
- ❌ `Map<string, ...>` pour la grille. Toujours `Float32Array[t * priceLevels + p]`.
- ❌ Modification du contrat `LiquidityFrame` au-delà de l'ajout du flag dirty sur `Layer`. Le buffer cells reste mutable in place via `toFrame`.
- ❌ Toucher au Rust (`desktop/src-tauri/`). Tu lis pour comprendre l'event shape, tu n'écris pas.
- ❌ Reconstruire l'orderbook côté JS depuis les deltas. Tu consommes UNIQUEMENT les snapshots émis par Rust.
- ❌ Implémenter un viewport pan/zoom. Hors scope REFONTE-3.
- ❌ Implémenter trade bubbles. Hors scope REFONTE-3.
- ❌ Supprimer `HeatmapDemo` (mock REFONTE-2). Reste en place jusqu'à REFONTE-5.
- ❌ `engine.setOrderbook` qui throw sur event malformé. Warn + skip.

---

## 14. Si tu bloques

- **Event Tauri non trouvé / shape inconnue** : grep côté Rust, et si incertain, écris l'adapter avec une shape **présumée** + commentaire `// TODO REFONTE-3.x: confirmer payload`. Note dans REPORT.
- **regl.destroy plante** au unmount : il y a souvent des courses entre Tauri lifecycle et React unmount. Ajoute un guard `if (!destroyed) regl.destroy()` et passe.
- **FPS chute en live < 30** : c'est probablement `toFrame` qui copie 600k floats par bucket avance. Optimisation possible : copier slot par slot (memcpy via `subarray + set`). Ne pas optimiser sans profiling. Documente l'observation.
- **Sanity red-quad ne s'affiche pas** : vérifier `regl.clear` est appelé AVANT le sanity draw, pas après ; vérifier le z-index en clip space (`gl_Position.z = -1.0` côté shader le force au front).
- **Test HeatmapEngine impossible sans regl** : ne crée pas un mock complet. Extrais `shouldRecomputeFrame` (et 1-2 autres helpers purs) et teste-les. L'engine entier sera validé par la route live.

# FIN TASK-REFONTE-3
