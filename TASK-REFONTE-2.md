# TASK-REFONTE-2 — `LiquidityHeatmapLayer` standalone

> Pré-requis : avoir lu `CLAUDE.md` (racine) et `REPORT.md` (racine, REFONTE-1).
> Branche courante : `feat/heatmap-refonte` (HEAD `3a2e8c7` après REFONTE-1).
> Cette TASK est **auto-suffisante**. Tu produis `REPORT.md` à la fin (template en §11).
> Pas de raccourcis. Une seule sous-phase.

---

## 0. Contexte minimal

REFONTE-1 a posé `GridSystem`, `ClockSource`, types et tests. **Aucun rendu n'existe encore**. REFONTE-2 livre la **première couche WebGL** : le fond liquidité (`LiquidityHeatmapLayer`), standalone, alimenté par une **frame data immutable** (`LiquidityFrame`) générée par une **fonction d'agrégation pure** (`aggregateOrderbookHistoryToFrame`).

Pas d'`OrderbookAdapter`. Pas d'`HeatmapEngine`. Tu mountes la Layer dans une **harness de démo dev-only** (route `/heatmap` actuelle, qui devient harness pendant la refonte) avec **mock data synthétique** + compteur FPS. L'engine et l'adapter Tauri arriveront en REFONTE-3.

Cible perf : **60 FPS** sur grille 3000 buckets × 200 prix (= 600 000 cellules).

---

## 1. Pré-requis git

1. `git status` — working tree clean attendu.
2. `git rev-parse --abbrev-ref HEAD` → `feat/heatmap-refonte`.
3. `git log --oneline -5` doit montrer `3a2e8c7 ... vitest + eslint ...` au sommet.

Si l'un de ces points est faux : STOP, REPORT en `blocked`.

---

## 2. Contrat `Layer` (interface formelle)

`desktop/src/render/Layer.ts` :

```ts
import type Regl from "regl";
import type { GridSystem } from "../core";

export interface Layer<TData = unknown> {
  init(regl: Regl.Regl, grid: GridSystem): void;
  update(grid: GridSystem, data: TData): void;
  draw(): void;
  destroy(): void;
}
```

- Générique sur `TData` : chaque couche a son type de données.
- Cycle de vie : `init` une fois, `update` à chaque nouvelle data, `draw` à chaque frame, `destroy` au unmount.
- **Aucune** méthode supplémentaire dans cette PR.

---

## 3. `LiquidityFrame` + fonction d'agrégation

### 3.1 `desktop/src/render/LiquidityFrame.ts` — types + algo

```ts
import type { GridSystem, OrderbookSnapshot } from "../core";

export interface LiquidityFrame {
  readonly grid: GridSystem;
  // cells[t * grid.priceLevels + p] ∈ [0, 1] (intensité normalisée log-scale)
  readonly cells: Float32Array;
}

export function aggregateOrderbookHistoryToFrame(
  snapshots: ReadonlyArray<OrderbookSnapshot>,
  grid: GridSystem,
): LiquidityFrame;
```

### 3.2 Algorithme `aggregateOrderbookHistoryToFrame`

**Étapes** :

1. Allouer `cells = new Float32Array(grid.historyLength * grid.priceLevels)` (initialisé à 0).
2. Si `snapshots.length === 0` → retourner `{ grid, cells }` tel quel.
3. Trier les snapshots par `exchangeMs` croissant (copie, ne mute pas l'input). Si déjà triés : la copie est triviale, OK.
4. Pour chaque paire consécutive `(snap_i, snap_{i+1})` :
   - `startMs = snap_i.exchangeMs`
   - `endMs = (i+1 < N) ? snap_{i+1}.exchangeMs : grid.nowExchangeMs`
   - Si `endMs <= startMs` → skip (snapshot dégénéré).
   - Pour chaque level `(price, size)` dans `snap_i.bids ∪ snap_i.asks` :
     - `pIdx = grid.priceIndex(price)` ; si `-1` → skip ce level (hors viewport).
     - Pour chaque bucket `t` que la durée `[startMs, endMs)` chevauche dans la fenêtre `grid` :
       - `bucketStart = grid.oldestExchangeMs + t * grid.bucketDurationMs`
       - `bucketEnd = bucketStart + grid.bucketDurationMs`
       - `overlap = min(endMs, bucketEnd) - max(startMs, bucketStart)`
       - Si `overlap > 0` : `cells[t * priceLevels + pIdx] += size * overlap`
5. Diviser chaque cellule par `grid.bucketDurationMs` → on obtient "taille moyenne présente sur le bucket" (somme size·duration / duration).
6. Trouver `max = max(cells)`. Si `max === 0` → retourner tel quel (tout zéro).
7. Log-scale + normalisation `[0, 1]` :
   - `logMax = log(1 + max)`
   - `cells[i] = log(1 + cells[i]) / logMax` pour chaque `i`.
8. Retourner `Object.freeze({ grid, cells })` (cells reste un Float32Array — `Object.freeze` sur le wrapper, pas sur le buffer typed).

**Implémentation** : pure, pas d'effets de bord, accepte ReadonlyArray. Pas d'allocation de Map ou d'objets intermédiaires dans la boucle interne (les indices et `overlap` sont des nombres). Une seule allocation `Float32Array` au début.

### 3.3 Tests `desktop/src/render/LiquidityFrame.test.ts`

Cas obligatoires (au moins un test par cas) :

1. **Empty input** : `snapshots = []` → cells toutes à 0, longueur correcte (`historyLength * priceLevels`).
2. **Snapshot unique sans suivant** : `[snap_at_oldest]` avec `nowExchangeMs` connu → durée = `historyDuration`, niveau présent partout dans le row → cellule price max ratio (= 1 après normalisation log si c'est le seul).
3. **Niveau constant sur toute la fenêtre** : 2 snapshots aux bornes, même level (price=p, size=s) → row `priceIndex(p)` doit être uniformément à 1.0 ; les autres rows à 0.0.
4. **Deux niveaux qui s'écrasent** : deux levels distincts au même price sur deux snapshots successifs → la cellule cumule. Plus un autre level seulement sur la première moitié → cellule plus faible (∼ 0.5 de l'autre avant log).
5. **Niveau apparaît mid-window** : 3 snapshots, level absent puis présent dans les 2 derniers → buckets antérieurs à 0, postérieurs à intensité positive.
6. **Snapshot hors fenêtre** : un snapshot avec `exchangeMs < grid.oldestExchangeMs` → contribution **filtrée** (overlap pour bucketStart < oldest sera négatif via `priceIndex` valide mais bucket out-of-range ; ou via overlap nul). Vérifie qu'aucune cellule n'a de NaN/Infinity.
7. **Prix hors viewport** : level avec `price < grid.priceMin` → ignoré, n'affecte rien.
8. **Determinisme** : même input → mêmes cells (deep equal). Pas de Math.random.
9. **Frozen** : `Object.isFrozen(frame) === true`.

Tu peux ajouter d'autres cas. Coverage cible **> 80 %** sur `LiquidityFrame.ts`.

---

## 4. Conversion intensité → Uint8 (helper isolé pour testabilité)

### 4.1 `desktop/src/render/intensityToUint8.ts`

```ts
// Convertit cells Float32 ∈ [0,1] vers Uint8 ∈ [0,255], in place dans `out`.
// Pas d'allocation. Clamping strict.
export function intensityToUint8(cells: Float32Array, out: Uint8Array): void {
  const n = cells.length;
  if (out.length !== n) {
    throw new Error(
      `intensityToUint8: out.length (${out.length}) must match cells.length (${n})`,
    );
  }
  for (let i = 0; i < n; i++) {
    let v = cells[i] * 255;
    if (v < 0) v = 0;
    else if (v > 255) v = 255;
    out[i] = v | 0; // truncation
  }
}
```

### 4.2 Tests `desktop/src/render/intensityToUint8.test.ts`

- 0 → 0, 1 → 255, 0.5 → 127 (truncation), 0.999 → 254.
- Clamping : -0.1 → 0, 1.5 → 255.
- Throw si tailles divergentes.
- Buffer pré-existant réutilisé : appel deux fois sans réallouer, valeurs écrasées correctement.

---

## 5. Gradient — CSS vars → texture 256×1

### 5.1 `desktop/src/styles/tokens.css`

Crée ce fichier (si inexistant) avec la palette froid→chaud :

```css
:root {
  --heat-0: #0a0d12;
  --heat-1: #102845;
  --heat-2: #1f4e8c;
  --heat-3: #2a8c9e;
  --heat-4: #d9aa3f;
  --heat-5: #e07a3a;
  --heat-6: #e74c3c;
}
```

Importe-le **une fois** dans `desktop/src/main.tsx` (ou `App.tsx`) — choisis le moins invasif. Si un import CSS global existe déjà à cet endroit, ajoute la ligne ; sinon, importe-le là où les autres CSS racine sont importés.

### 5.2 `desktop/src/render/gradient.ts`

```ts
// Construit une texture 256x1 RGBA8 par interpolation linéaire entre les
// 7 stops --heat-0..--heat-6 lus depuis :root via getComputedStyle.
// Allocation unique. À appeler une seule fois au mount de la Layer.
export function buildGradientTexture256(): Uint8Array;
```

**Implémentation** :
1. Lire les 7 stops depuis `getComputedStyle(document.documentElement).getPropertyValue('--heat-N')`.
2. Parser hex `#rrggbb` → `[r, g, b]` (Uint8).
3. Pour chaque pixel `p ∈ [0, 255]` :
   - `t = p / 255`
   - `scaled = t * 6` (6 segments entre 7 stops)
   - `idx = floor(scaled)` (clampé à 5 max pour l'index gauche)
   - `frac = scaled - idx`
   - `[r, g, b]` = lerp(stops[idx], stops[idx + 1], frac)
   - Écrire `(r, g, b, 255)` en `data[p*4..p*4+3]`.
4. Retourner `Uint8Array(256 * 4)`.

Si un stop n'est pas trouvé (CSS var manquante) : throw avec message clair.

**Pas de test unitaire** : fonction DOM-touching, exclue de la coverage. Validation visuelle dans la harness.

---

## 6. `LiquidityHeatmapLayer` — implémentation regl

### 6.1 `desktop/src/render/LiquidityHeatmapLayer.ts`

Classe implémentant `Layer<LiquidityFrame>`. Spec exhaustive :

**État privé** :
- `regl: Regl.Regl | null`
- `intensityTex: regl.Texture2D | null` — taille `historyLength × priceLevels`, format `luminance`, type `uint8`
- `gradientTex: regl.Texture2D | null` — 256×1, RGBA8, filtrage linéaire
- `positionBuf: regl.Buffer | null` — 4 vertices, `usage: 'static'`
- `uint8Cells: Uint8Array | null` — companion buffer, alloué une fois en `init`, **réutilisé en place** dans `update` (anti-alloc en frame loop)
- `drawCmd: regl.DrawCommand | null`

**`init(regl, grid)`** :
1. Stocker `regl`.
2. Allouer `uint8Cells = new Uint8Array(grid.historyLength * grid.priceLevels)`.
3. Créer `intensityTex` :
   ```ts
   regl.texture({
     width: grid.historyLength,
     height: grid.priceLevels,
     format: 'luminance',
     type: 'uint8',
     data: uint8Cells,
     min: 'nearest',
     mag: 'nearest',
     wrapS: 'clamp',
     wrapT: 'clamp',
   })
   ```
4. Créer `gradientTex` (256×1 RGBA8, `min/mag: 'linear'`, data = `buildGradientTexture256()`).
5. Créer `positionBuf` (full-canvas quad, triangle strip 4 vertices : `[-1,-1, 1,-1, -1,1, 1,1]`, `usage: 'static'`).
6. Créer `drawCmd` (voir shaders ci-dessous).

**`update(grid, frame)`** :
1. Si `frame.cells.length !== uint8Cells.length` → throw (resize non géré en REFONTE-2 ; ce sera l'affaire de l'engine plus tard).
2. `intensityToUint8(frame.cells, uint8Cells)`.
3. `intensityTex.subimage({ data: uint8Cells, width: grid.historyLength, height: grid.priceLevels })`.

**`draw()`** : `drawCmd()`. Une seule fonction, pas de paramètre runtime (les uniforms sont en closure sur les textures stockées).

**`destroy()`** : `intensityTex?.destroy()`, `gradientTex?.destroy()`, `positionBuf?.destroy()`. Tout reset à `null`. Idempotent (appel double = no-op).

### 6.2 Shaders

**Vertex** (full-canvas, simple) :

```glsl
precision mediump float;
attribute vec2 aPosition;
varying vec2 vUV;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
  vUV = aPosition * 0.5 + 0.5;
}
```

**Fragment** (sample intensité, sample gradient, sortie color) :

```glsl
precision mediump float;
varying vec2 vUV;
uniform sampler2D uIntensity;
uniform sampler2D uGradient;
void main() {
  float i = texture2D(uIntensity, vUV).r;
  vec3 color = texture2D(uGradient, vec2(i, 0.5)).rgb;
  gl_FragColor = vec4(color, 1.0);
}
```

- **Pas de `if`/`switch`**. Le gradient est échantillonné via filtrage linéaire de `uGradient` (256 pixels, déjà interpolé entre stops à la création).
- **Pas de `regl.prop`** sur les uniforms vec — closure directe sur `intensityTex` et `gradientTex` :

```ts
this.drawCmd = regl({
  vert: VERT_SRC,
  frag: FRAG_SRC,
  attributes: { aPosition: this.positionBuf },
  uniforms: {
    uIntensity: this.intensityTex,
    uGradient: this.gradientTex,
  },
  primitive: 'triangle strip',
  count: 4,
  depth: { enable: false },
  blend: { enable: false },
});
```

### 6.3 Test smoke `desktop/src/render/LiquidityHeatmapLayer.test.ts`

Pas de WebGL en environnement Vitest/Node. Tu **mockes** `regl` au niveau du test :

```ts
import { describe, it, expect, vi } from "vitest";
import { LiquidityHeatmapLayer } from "./LiquidityHeatmapLayer";
import { createGridSystem } from "../core";

function mockRegl() {
  const tex = {
    subimage: vi.fn(),
    destroy: vi.fn(),
  };
  const buf = { destroy: vi.fn() };
  const drawCmd = vi.fn();
  const regl = vi.fn(() => drawCmd) as unknown as { /* ... */ };
  Object.assign(regl, {
    texture: vi.fn(() => tex),
    buffer: vi.fn(() => buf),
  });
  return { regl: regl as never, tex, buf, drawCmd };
}
```

Cas obligatoires :
1. `init` ne throw pas, appelle `regl.texture` 2× et `regl.buffer` 1×.
2. `update` ne throw pas et appelle `intensityTex.subimage` 1×.
3. `draw` appelle le drawCmd 1×.
4. `destroy` appelle `destroy()` sur les textures et buffer, idempotent au 2e appel.
5. `update` avec `frame.cells.length` divergent → throw.

Pour contourner `buildGradientTexture256` (DOM-touching) dans le test : **isole** l'appel à `getComputedStyle` derrière un paramètre injectable, OU mock `document.documentElement` via `happy-dom` setup. Choix simple : ajoute un paramètre optionnel `gradientData?: Uint8Array` à `init()` du Layer **uniquement pour les tests** ? Non, ça pollue l'API.

→ **Solution propre** : extrais l'appel CSS dans un helper interne `readHeatStops()` que la Layer appelle, et **mock le module gradient** via `vi.mock("./gradient", () => ({ buildGradientTexture256: () => new Uint8Array(256 * 4) }))` en tête du test.

Tu peux exclure ce fichier de la couverture si la mesure devient bruitée.

---

## 7. Harness de démo

### 7.1 `desktop/src/dev/HeatmapDemo.tsx`

Composant React qui :
1. Monte un `<canvas>` plein écran (style `width: 100%; height: 100%`).
2. Crée une `regl` instance sur ce canvas (`createREGL(canvas)`).
3. Crée un `GridSystem` avec :
   - `bucketDurationMs: 100`
   - `historyDurationMs: 5 * 60_000`
   - `nowExchangeMs: 1_700_000_000_000` (constante, mock — pas `Date.now()`)
   - `tickSize: 0.10`
   - `priceMin: 100`, `priceMax: 120` (= 200 levels, viewport ±10 USD autour de 110)
4. Génère un mock orderbook history via `mockOrderbookHistory(grid, 200)` (cf. §7.3).
5. Aggrège : `frame = aggregateOrderbookHistoryToFrame(snapshots, grid)`.
6. Instancie `LiquidityHeatmapLayer`, `init(regl, grid)`, `update(grid, frame)`.
7. Frame loop via `requestAnimationFrame` qui appelle `layer.draw()` + maintient un compteur FPS (moyenne glissante sur 60 frames).
8. Affiche un overlay top-right monospace avec : FPS, cellules totales, max intensity. Style minimal (background semi-transparent).
9. Cleanup au unmount : `cancelAnimationFrame`, `layer.destroy()`, `regl.destroy()`.

**Contrainte anti-alloc** : pas de `new Float32Array` dans la frame loop. Le compteur FPS utilise des compteurs nombre, pas des tableaux. Si tu veux la moyenne glissante : un ring buffer `Uint16Array` alloué une fois.

**Permission `Date.now()`** : autorisée **uniquement pour le compteur FPS** (animation UI). Tu peux utiliser `performance.now()` ici (pas `Date.now()`). Ce fichier n'est **pas** dans `src/render/` ni `src/adapters/`, il est dans `src/dev/` → la règle ESLint `no-restricted-syntax` ne s'applique pas. **Mais évite quand même `Date.now()` pour timestamper de la data**, c'est un principe global.

### 7.2 `desktop/src/routes/HeatmapRoute.tsx`

Remplace le stub par :

```tsx
import { HeatmapDemo } from "../dev/HeatmapDemo";

export function HeatmapRoute() {
  return <HeatmapDemo />;
}
```

Pas d'autre changement à `App.tsx`. La route `/heatmap` devient temporairement la harness pendant les phases REFONTE-2..4. En REFONTE-5, elle reprendra son rôle de route applicative.

### 7.3 `desktop/src/dev/mockOrderbookHistory.ts`

```ts
import type { GridSystem, OrderbookSnapshot } from "../core";

// Génère N snapshots couvrant la fenêtre [oldestExchangeMs, nowExchangeMs].
// Determinisme : seed PRNG xorshift, pas de Math.random.
export function mockOrderbookHistory(
  grid: GridSystem,
  snapshotCount: number,
  seed?: number,
): OrderbookSnapshot[];
```

**Implémentation** :
- Mid-price wandering : marche aléatoire deterministe (xorshift32 seedé) autour du centre du viewport, drift max ±5 ticks par snapshot, clampé à `[priceMin + 10*tick, priceMax - 10*tick]`.
- 20 niveaux de chaque côté (bid/ask), chacun à `midPrice ± k*tickSize` (k=1..20), `size = 10 + xorshift_normalized * 50`.
- Timestamps espacés régulièrement sur la fenêtre.

But : remplir visuellement la heatmap avec un motif réaliste, deterministe, ré-exécutable.

---

## 8. Vitest config — élargir coverage

`desktop/vitest.config.ts` : étends `coverage.include` pour inclure `src/render/**/*.ts` aussi. Ajoute aux exclusions :

```ts
exclude: [
  "src/core/**/*.test.ts",
  "src/render/**/*.test.ts",
  "src/core/index.ts",
  "src/core/types.ts",
  "src/render/Layer.ts",                  // interface seule
  "src/render/LiquidityHeatmapLayer.ts",  // smoke-tested via mock regl, pas couvert proprement
  "src/render/gradient.ts",               // DOM-touching
],
```

Cible coverage **> 80 %** sur ce qui reste : `GridSystem.ts`, `ClockSource.ts`, `LiquidityFrame.ts`, `intensityToUint8.ts`.

---

## 9. Vérifications finales (toutes obligatoires)

Exécute en séquence, stop au premier échec :

1. `cd desktop && npm install` (rien de neuf attendu, sanity check).
2. `npm run test` → tous les tests verts (core + render).
3. `npm run coverage` → seuils respectés sur les fichiers ciblés.
4. `npm run lint` → 0 erreur sur scope refonte (rappel : `src/dev/` n'est pas dans le scope ESLint actuel — c'est volontaire).
5. `npm run build` → vert.
6. `grep -rn "Date\.now\|performance\.now" desktop/src/core desktop/src/adapters desktop/src/render` → vide. **`src/dev/` peut contenir `performance.now()` pour le FPS counter, c'est autorisé.**
7. `grep -rn "Math\.random" desktop/src/core desktop/src/render` → vide (mock data utilise xorshift32 deterministe).
8. **Validation visuelle** (manuelle, à l'utilisateur) : `npm run tauri dev` (ou `npm run dev` si tu préfères Vite seul), naviguer à `/heatmap`, observer le rendu. Capture d'écran à inclure dans `docs/PHASES.md` (cf. §10 commits).

Si la validation visuelle échoue (canvas noir, perf < 30 FPS) → REPORT en `partial`, décrire ce que tu as vu, ne pas commit.

---

## 10. Commits attendus

3 commits préfixés `refonte(M6b):` :

1. `refonte(M6b): Layer contract + LiquidityFrame + aggregate fn (REFONTE-2)`
2. `refonte(M6b): LiquidityHeatmapLayer + gradient + intensityToUint8 (REFONTE-2)`
3. `refonte(M6b): heatmap demo harness + mock data + tokens.css (REFONTE-2)`

Mise à jour de `docs/PHASES.md` (créer si absent) : 1 entrée pour REFONTE-2 avec : sha de chaque commit, capture d'écran (chemin), 2-3 lignes de notes. Inclus dans le commit 3.

---

## 11. `REPORT.md` — template

```md
## REPORT TASK-REFONTE-2

**Status**: done | blocked | partial
**Commits**: 3 hashes + msgs
**Diffs résumé**: 5 lignes max par fichier
**Vérifs contrats**:
- [ ] `npm run test` → vert (X tests)
- [ ] `npm run coverage` → > 80 % sur LiquidityFrame.ts, intensityToUint8.ts, GridSystem.ts, ClockSource.ts
- [ ] `npm run lint` → 0 erreur scope refonte
- [ ] `npm run build` → vert
- [ ] grep `Date.now|performance.now` core/adapters/render → vide
- [ ] grep `Math.random` core/render → vide
- [ ] Capture visuelle harness à `/heatmap` : chemin du fichier
- [ ] FPS mesuré dans la harness : XX FPS sur grille 3000×200
**Décisions / écarts**: liste
**Blockers**: aucun ou liste
**Next**: pré-questions REFONTE-3
```

---

## 12. Anti-patterns à respecter

- ❌ **Pas de `Date.now()`** dans `src/render/` (lint le refusera de toute façon).
- ❌ **Pas de `Math.random()`** dans `src/render/` ni dans `mockOrderbookHistory` (xorshift32 deterministe).
- ❌ **Pas de `regl.prop`** pour les uniforms (closure directe).
- ❌ **Pas d'allocation `Float32Array` ou `Uint8Array` dans la frame loop** (`update`, `draw`, le rAF callback, le compteur FPS).
- ❌ **Pas de `Map<string, ...>` pour la grille de volume** (`Float32Array[t * priceLevels + p]` est le seul stockage).
- ❌ **Pas de WebGL extensions exotiques** (`OES_texture_float`, etc.) en REFONTE-2. Reste en luminance/uint8.
- ❌ **Pas de logique d'agrégation hors `aggregateOrderbookHistoryToFrame`**.
- ❌ **Pas de touch à `OrderbookAdapter`, `HeatmapEngine`** — n'existent pas, n'apparaissent pas dans cette PR.
- ❌ **Pas de modification d'`App.tsx`** au-delà d'un éventuel `import "./styles/tokens.css"` (et encore, tu peux mettre l'import dans `main.tsx` si plus propre).
- ❌ **Pas de `useState` dans `HeatmapDemo` à 60 Hz** (le compteur FPS s'écrit dans un `<div ref>` via DOM direct, pas via React state).

---

## 13. Si tu bloques

- Si `regl` se plaint d'une format/type texture non supporté en luminance/uint8 : passe en `format: 'rgba'` + pack l'intensité sur le canal R, ignore G/B/A. Documente l'écart dans REPORT.
- Si la coverage chute parce que `LiquidityFrame.ts` a des branches non couvertes : ajoute des tests, ne baisse **pas** le seuil.
- Si la harness affiche un canvas noir : vérifie l'ordre `init → update → draw`, vérifie que `gradientTex` est bien construite après le mount du DOM (les CSS vars doivent être résolues), vérifie qu'`intensityTex` est bien `subimage`-ée avec des valeurs > 0 (log un échantillon en console).
- Si FPS < 30 dans la harness : profile avec Chrome DevTools, identifie si le bottleneck est CPU (intensityToUint8) ou GPU. CPU : la boucle Float32→Uint8 sur 600k éléments doit prendre < 5 ms. GPU : si > 11 ms, c'est probablement le `subimage` qui re-upload tout le buffer. Possible amélioration partielle (REFONTE-3) : `subimage` partiel sur les buckets modifiés.

# FIN TASK-REFONTE-2
