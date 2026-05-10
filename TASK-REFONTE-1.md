# TASK-REFONTE-1 — Setup branche, déplacer legacy, scaffold core

> Pré-requis : avoir lu `CLAUDE.md` (racine repo).
> Cette TASK est **auto-suffisante**. Tu n'as pas besoin du brief de mission.
> Tu produis `REPORT.md` à la racine du repo à la fin (template en §10).
> Une seule sous-phase. Pas de raccourcis.

---

## 0. Contexte minimal

On refait la heatmap `desktop/` à zéro (Bookmap-grade). REFONTE-1 = fondations seules, **aucun rendu visuel**. Les couches WebGL et l'engine viendront en REFONTE-2..5. Ta mission ici : créer la branche, isoler le code legacy (sans le supprimer), scaffolder les primitives temps + grille + types, câbler Vitest + une règle ESLint, et garantir que le build du desktop passe toujours (avec une route Heatmap stubbée).

Le projet `app/` (Next.js landing page) n'est **pas** concerné. `desktop/src-tauri/` (Rust) n'est **pas** concerné. Tu ne touches qu'à `desktop/src/` et `desktop/package.json` / configs.

---

## 1. Pré-requis git (à exécuter en premier)

État de départ attendu : branche `feat/v1-senzoukria` avec working tree potentiellement sale sur 5 fichiers heatmap (modifs M6b-1 abandonnées). Avant tout :

1. `git status` — vérifier la branche courante.
2. Si working tree sale sur fichiers heatmap : commit WIP `chore(heatmap): wip M6b-1 abandoned (pre-refonte freeze)` sur `feat/v1-senzoukria` (commit nécessaire pour préserver la trace, ces fichiers vont être déplacés à l'étape 2 de toute façon).
3. `git checkout -b feat/heatmap-refonte` depuis `feat/v1-senzoukria`.
4. Vérifier : `git rev-parse --abbrev-ref HEAD` → `feat/heatmap-refonte`.

À partir d'ici, tu travailles **uniquement** sur `feat/heatmap-refonte`.

---

## 2. Déplacer le legacy (move, ne pas supprimer)

Crée `desktop/src/_legacy/heatmap/`. Déplace dedans, en **préservant les sous-chemins relatifs** (sans la racine `lib/` ou `components/`) :

```
desktop/src/lib/heatmap/HeatmapRenderer.ts
desktop/src/lib/heatmap/TradeBubblesCommand.ts
desktop/src/lib/heatmap/TradeStateAdapter.ts
desktop/src/lib/heatmap/MarketStateAdapter.ts
desktop/src/lib/heatmap/KeyLevelsEngine.ts
desktop/src/lib/heatmap/theme.ts
desktop/src/lib/heatmap/types.ts
desktop/src/lib/heatmap/useHeatmap.ts
desktop/src/components/heatmap/HeatmapCanvas.tsx
desktop/src/components/heatmap/HeatmapCanvas.css
desktop/src/components/heatmap/HeatmapToolbar.tsx
desktop/src/components/heatmap/HeatmapToolbar.css
desktop/src/routes/HeatmapRoute.tsx
desktop/src/routes/HeatmapRoute.css
```

→ destination plate (un dossier) :
```
desktop/src/_legacy/heatmap/HeatmapRenderer.ts
desktop/src/_legacy/heatmap/TradeBubblesCommand.ts
desktop/src/_legacy/heatmap/TradeStateAdapter.ts
desktop/src/_legacy/heatmap/MarketStateAdapter.ts
desktop/src/_legacy/heatmap/KeyLevelsEngine.ts
desktop/src/_legacy/heatmap/theme.ts
desktop/src/_legacy/heatmap/types.ts
desktop/src/_legacy/heatmap/useHeatmap.ts
desktop/src/_legacy/heatmap/HeatmapCanvas.tsx
desktop/src/_legacy/heatmap/HeatmapCanvas.css
desktop/src/_legacy/heatmap/HeatmapToolbar.tsx
desktop/src/_legacy/heatmap/HeatmapToolbar.css
desktop/src/_legacy/heatmap/HeatmapRoute.tsx
desktop/src/_legacy/heatmap/HeatmapRoute.css
```

Utilise `git mv` (pas `mv` brut) pour préserver l'historique git.

Crée `desktop/src/_legacy/README.md` :
```md
# Legacy heatmap (M6b-1, abandonné)

Code conservé pour référence pendant la refonte. **Ne pas importer.**
Suppression définitive prévue en REFONTE-5 avant merge sur `main`.
```

Si après les `git mv` les dossiers `desktop/src/lib/heatmap/`, `desktop/src/components/heatmap/` se retrouvent vides → `git rm -r` ces dossiers (les fichiers sont déjà ailleurs, on enlève la coquille).

---

## 3. Stub minimal pour que le build passe

`desktop/src/App.tsx` importe encore `HeatmapRoute` depuis `./routes/HeatmapRoute`. Recrée un stub propre :

`desktop/src/routes/HeatmapRoute.tsx` :
```tsx
// REFONTE-1 stub : la vraie route est reconstruite couche par couche
// (REFONTE-2..5). Ce stub existe uniquement pour que App.tsx compile.
export function HeatmapRoute() {
  return (
    <div style={{ padding: 24, color: "#888", fontFamily: "monospace" }}>
      Heatmap en cours de refonte (feat/heatmap-refonte). Reviens en REFONTE-2.
    </div>
  );
}
```

Aucun import depuis `_legacy/`. Aucun WebGL. C'est tout.

---

## 4. Scaffold `desktop/src/core/`

Crée le répertoire `desktop/src/core/` avec ces fichiers exactement :

### 4.1 `desktop/src/core/types.ts`

Types partagés du moteur. Inclure au minimum :

- `type ExchangeMs = number;` (alias documentaire — timestamp ms côté venue)
- `type Price = number;`
- `type BucketIndex = number;` (-1 = hors fenêtre)
- `type PriceIndex = number;` (-1 = hors viewport)
- `type Side = "bid" | "ask";`
- `interface OrderbookLevel { price: Price; size: number; }`
- `interface OrderbookSnapshot { exchangeMs: ExchangeMs; bids: OrderbookLevel[]; asks: OrderbookLevel[]; }`
- `interface Trade { exchangeMs: ExchangeMs; price: Price; size: number; side: Side; }`
- `interface Viewport { priceMin: number; priceMax: number; }`
- `type BucketDurationMs = 50 | 100 | 250 | 500 | 1000;` (presets autorisés)

### 4.2 `desktop/src/core/presets.ts`

```ts
import type { BucketDurationMs } from "./types";

export const BUCKET_DURATION_PRESETS: ReadonlyArray<BucketDurationMs> =
  [50, 100, 250, 500, 1000] as const;

export const DEFAULT_BUCKET_DURATION_MS: BucketDurationMs = 100;

// Fenêtre live affichée
export const DEFAULT_HISTORY_DURATION_MS = 5 * 60_000; // 5 min

// Cap mémoire raw (au-delà → downsample en REFONTE-5)
export const MAX_RAW_HISTORY_DURATION_MS = 30 * 60_000; // 30 min

// Bybit BTCUSDT linear perpetual (priceFilter.tickSize officiel)
export const DEFAULT_TICK_SIZE = 0.10;

// Viewport prix initial : current_price ± VIEWPORT_HALF_TICKS * tickSize
export const DEFAULT_VIEWPORT_HALF_TICKS = 200;
```

### 4.3 `desktop/src/core/ClockSource.ts`

Horloge exchange-only. Contrat :

- État interne : `nowExchangeMs: number` (init à 0 = "jamais reçu de message").
- `tick(exchangeMs: number): void` — met à jour, **monotone non-stricte** : ignore les timestamps strictement inférieurs au courant (out-of-order venue), accepte les égaux.
- `now(): number` — retourne `nowExchangeMs`.
- `hasReceived(): boolean` — `nowExchangeMs > 0`.
- **Aucune** lecture de `Date.now()` ni `performance.now()`. Si init avant tout message → `now()` retourne 0 et `GridSystem` saura le détecter.

Implémente la classe `ClockSource` avec ces 4 méthodes seulement. Pas de listeners, pas d'EventEmitter, pas de magie. Pure data.

### 4.4 `desktop/src/core/GridSystem.ts`

Single source of truth temps + prix. Frozen par frame. Spec exacte :

```ts
export interface GridSystemSpec {
  bucketDurationMs: BucketDurationMs;
  historyDurationMs: number;
  nowExchangeMs: number;       // depuis ClockSource
  tickSize: number;
  priceMin: number;            // viewport
  priceMax: number;
}

export interface GridSystem {
  readonly bucketDurationMs: number;
  readonly historyDurationMs: number;
  readonly historyLength: number;        // floor(historyDurationMs / bucketDurationMs)
  readonly nowExchangeMs: number;
  readonly oldestExchangeMs: number;     // nowExchangeMs - historyDurationMs
  readonly tickSize: number;
  readonly priceMin: number;
  readonly priceMax: number;
  readonly priceLevels: number;          // floor((priceMax - priceMin) / tickSize)

  bucketIndex(timeMs: number): BucketIndex;  // -1 si timeMs < oldest ou > now
  priceIndex(price: number): PriceIndex;     // -1 si hors [priceMin, priceMax)
  cellKey(t: BucketIndex, p: PriceIndex): string;  // "t:p", utilisable comme clé Map
}

export function createGridSystem(spec: GridSystemSpec): GridSystem;
```

Règles d'implémentation :

- **Bucket alignement** : `bucketIndex(t)` doit retourner un index croissant avec le temps, **borné dans [0, historyLength - 1]**, où index `0` = bucket le plus ancien et `historyLength - 1` = bucket courant. Formule : `floor((t - oldestExchangeMs) / bucketDurationMs)`. Si résultat hors `[0, historyLength-1]` → `-1`.
- **Price alignement** : `priceIndex(p)` = `floor((p - priceMin) / tickSize)`. `-1` si `p < priceMin` ou `p >= priceMax`.
- **Validation au create** : throw `Error` si `bucketDurationMs ≤ 0`, `historyDurationMs ≤ bucketDurationMs`, `tickSize ≤ 0`, `priceMin >= priceMax`, ou `nowExchangeMs < 0`. Si `nowExchangeMs === 0` (clock jamais tickée), c'est valide mais `bucketIndex` retournera toujours `-1` (oldestExchangeMs négatif, donc tout `t > 0` retombe au-delà du bucket courant — vérifie ce cas dans les tests).
- `cellKey(t, p)` = `` `${t}:${p}` ``. Trivial mais centralisé pour cohérence inter-couches.
- **Immutabilité** : `Object.freeze` sur l'objet retourné.

Pas de classe. `createGridSystem` factory pure, pas d'effets de bord.

### 4.5 `desktop/src/core/index.ts`

Re-export public :
```ts
export type * from "./types";
export * from "./presets";
export { ClockSource } from "./ClockSource";
export { createGridSystem, type GridSystem, type GridSystemSpec } from "./GridSystem";
```

---

## 5. Vitest — setup

`desktop/` utilise **npm**, pas pnpm. Pas de Vitest installé. Tu installes :

```
cd desktop
npm install --save-dev vitest@^2 @vitest/coverage-v8@^2
```

Ajoute à `desktop/package.json` :

```json
"scripts": {
  ...
  "test": "vitest run",
  "test:core": "vitest run src/core",
  "test:watch": "vitest",
  "coverage": "vitest run --coverage"
}
```

Crée `desktop/vitest.config.ts` :

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/core/**/*.ts"],
      exclude: ["src/core/**/*.test.ts", "src/core/index.ts", "src/core/types.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 75,
      },
    },
  },
});
```

---

## 6. Tests unitaires (obligatoires, > 80 % couverture sur les 2 fichiers critiques)

### 6.1 `desktop/src/core/ClockSource.test.ts`

Cas à couvrir :
- État initial : `now() === 0`, `hasReceived() === false`.
- Premier tick : `now()` retourne la valeur, `hasReceived() === true`.
- Tick monotone strict croissant : passe.
- Tick égal au courant : passe (no-op silencieux mais pas d'erreur).
- Tick inférieur (out-of-order) : ignoré, `now()` reste à l'ancien.
- Séquence longue (1 000 ticks aléatoires dont 10 % out-of-order) : `now()` égal au max reçu.

### 6.2 `desktop/src/core/GridSystem.test.ts`

Cas à couvrir :
- Création nominale (preset 100ms / 5min / tick 0.10 / viewport 100..120) : `historyLength === 3000`, `priceLevels === 200`.
- `bucketIndex(now)` = `historyLength - 1`, `bucketIndex(oldest)` = `0`, `bucketIndex(oldest - 1)` = `-1`, `bucketIndex(now + 1)` = `-1`.
- Bucket alignment : `bucketIndex(now - bucketDurationMs)` = `historyLength - 2`.
- `priceIndex(priceMin)` = `0`, `priceIndex(priceMax - tickSize)` = `priceLevels - 1`, `priceIndex(priceMax)` = `-1`, `priceIndex(priceMin - 0.01)` = `-1`.
- `cellKey(5, 12)` === `"5:12"`.
- Validation : throw sur `bucketDurationMs = 0`, `historyDurationMs <= bucketDurationMs`, `tickSize = 0`, `priceMin = priceMax`, `priceMin > priceMax`.
- Cas clock pas encore tickée (`nowExchangeMs = 0`) : pas de throw, mais tout `bucketIndex(t > 0)` retourne `-1`.
- Immuabilité : `(grid as any).priceMin = 999` ne doit pas modifier l'objet (`Object.isFrozen(grid) === true`).

Tu peux ajouter d'autres cas si tu juges utile — mais ces minimums sont **obligatoires**.

Lance `npm run test:core` → vert. Lance `npm run coverage` → seuils respectés sur `src/core/`.

---

## 7. ESLint — règle `no-Date.now-in-render-or-adapters`

Le projet n'a pas d'ESLint config visible. Tu installes le strict minimum :

```
cd desktop
npm install --save-dev eslint@^9 typescript-eslint@^8
```

Crée `desktop/eslint.config.js` (flat config, ESLint 9) :

```js
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "src/_legacy/**", "rithmic-sdk/**"],
  },
  ...tseslint.configs.recommended,
  {
    files: ["src/render/**/*.{ts,tsx}", "src/adapters/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message:
            "Date.now() interdit dans render/ et adapters/ (cf. ANTI-PATTERNS du brief refonte). Utilise ClockSource + GridSystem.",
        },
        {
          selector:
            "CallExpression[callee.object.name='performance'][callee.property.name='now']",
          message:
            "performance.now() interdit pour timestamper de la data dans render/ et adapters/.",
        },
      ],
    },
  }
);
```

Ajoute le script dans `desktop/package.json` :
```json
"lint": "eslint src"
```

Note : les répertoires `src/render/` et `src/adapters/` n'existent pas encore — la règle est inerte ici mais armée pour REFONTE-2+. Crée-les vides avec un `.gitkeep` :
- `desktop/src/render/.gitkeep`
- `desktop/src/adapters/.gitkeep`

Lance `npm run lint` → 0 erreur (le code existant compile, les répertoires armés sont vides).

---

## 8. Vérifications finales (toutes obligatoires)

Exécute en séquence et **arrête-toi** au premier échec :

1. `cd desktop && npm install` — propre, pas d'erreurs.
2. `npm run build` — typecheck + Vite build OK. Le stub `HeatmapRoute` compile, App.tsx import OK.
3. `npm run test:core` — vert, > 80 % couverture sur GridSystem + ClockSource.
4. `npm run lint` — 0 erreur.
5. Grep CI : `grep -rn "from.*_legacy" desktop/src --include="*.ts" --include="*.tsx"` → **aucun match** hors `_legacy/` lui-même. Le legacy est isolé.
6. Grep CI : `grep -rn "Date\.now\|performance\.now" desktop/src/render desktop/src/adapters` → aucun match (vide ou inexistant, c'est OK).
7. `git status` → seuls fichiers attendus modifiés/ajoutés.

---

## 9. Commits attendus

Au moins 3 commits sur `feat/heatmap-refonte`, dans cet ordre :

1. `chore(heatmap): move M6b-1 implementation to _legacy (refonte)` — étape 2 + stub étape 3.
2. `feat(core): GridSystem + ClockSource + presets + types (REFONTE-1)` — étape 4.
3. `chore(core): vitest + coverage + eslint no-Date.now rule (REFONTE-1)` — étapes 5 + 6 + 7.

Si tu fais plus de commits c'est OK. Pas moins.

---

## 10. `REPORT.md` — template à remplir et écrire à la racine du repo

```md
# REFONTE-1 — Report

## Branche
- HEAD : <sha court>
- branche : feat/heatmap-refonte
- base : feat/v1-senzoukria @ <sha court>

## Legacy déplacé
- N fichiers déplacés (liste)
- Coquilles supprimées : oui/non
- Importeurs externes restants vers `_legacy/` : 0 (vérifié par grep)

## Core scaffolded
- desktop/src/core/types.ts        — N lignes
- desktop/src/core/presets.ts      — N lignes
- desktop/src/core/ClockSource.ts  — N lignes
- desktop/src/core/GridSystem.ts   — N lignes
- desktop/src/core/index.ts        — N lignes

## Tests
- ClockSource.test.ts : N tests, tous verts
- GridSystem.test.ts  : N tests, tous verts
- Coverage src/core/ : lines XX %, branches XX %, functions XX % (seuil 80/75/80)

## Lint
- eslint.config.js installé (flat config v9)
- Règle no-restricted-syntax armée sur src/render/ + src/adapters/ (vides)
- npm run lint : 0 erreur

## Build
- npm run build : OK (stub HeatmapRoute compile)

## Décisions / écarts
- (toute déviation par rapport à cette TASK : justifier ici en 1-2 lignes par écart)

## Préparation REFONTE-2
- src/render/.gitkeep créé : oui
- src/adapters/.gitkeep créé : oui
- API publique de src/core exportée via index.ts : oui

## Capture
- pas de capture visuelle pour REFONTE-1 (pas de rendu)
```

---

## 11. Anti-patterns à respecter dès maintenant

- ❌ **Pas de `Date.now()`** dans `src/render/` ni `src/adapters/` (inertes ici, mais c'est la règle).
- ❌ **Pas d'import depuis `_legacy/`** dans le code vivant.
- ❌ **Pas de classe `GridSystem`** : factory pure, retour figé.
- ❌ **Pas de `performance.now()`** pour timestamper de la data.
- ❌ **Pas de logique de bucketing** ailleurs que dans `GridSystem`. Aucune.
- ❌ **Pas de WebGL / regl** dans cette TASK. Zéro. Si tu touches à regl, tu es hors-périmètre.
- ❌ **Pas d'optimisations prématurées** (pas de Float32Array, pas de pool, pas de WeakMap). Données pures, lisibles. La perf vient en REFONTE-2+.

---

## 12. Si tu bloques

- Si une dépendance npm refuse de s'installer (réseau, peer deps) : note dans `REPORT.md` et propose une version alternative compatible.
- Si un test échoue parce que la spec est ambiguë : tranche en faveur de la **simplicité**, documente le choix dans `REPORT.md` §"Décisions / écarts".
- Si le build de Vite casse : c'est probablement un import oublié vers le legacy. Grep et corrige.
- Tu ne lances **pas** Tauri (`npm run tauri dev`). REFONTE-1 est purement TS/build/tests, pas runtime.

# FIN TASK-REFONTE-1