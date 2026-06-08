# Chart Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter la navigation chart standard industrie (floating banner live/historique, Smart Scaling Y, centrage vertical last-price) sur le footprint canvas partagé par tous les connecteurs.

**Architecture:** Les fonctions de navigation sont pures dans `interactions.ts` (testables isolément). `ChartLiveBanner.tsx` est un composant React overlay injecté dans `FootprintCanvas.tsx`. La Smart Scaling est une fonction pure dans `smartScaling.ts`, intégrée dans `FootprintProAdapter.ts` au moment du rendu. Le centrage vertical `last-price` tourne dans la boucle rAF existante.

**Tech Stack:** React 18, TypeScript strict, Vitest, Canvas 2D, Zustand (persist), CSS custom properties (`--color-*` tokens).

---

## File Map

| Statut | Fichier | Responsabilité |
|---|---|---|
| **Modifié** | `desktop/src/lib/footprint/interactions.ts` | +`verticalMode`, +`goLive`, +`resetScale`, +`isLiveMode` |
| **Créé** | `desktop/src/lib/footprint/interactions.test.ts` | Tests unitaires des nouvelles fonctions |
| **Créé** | `desktop/src/lib/footprint/smartScaling.ts` | `getEffectiveAggregation()` pure |
| **Créé** | `desktop/src/lib/footprint/smartScaling.test.ts` | Tests unitaires Smart Scaling |
| **Créé** | `desktop/src/components/footprint/ChartLiveBanner.tsx` | Floating banner overlay |
| **Créé** | `desktop/src/components/footprint/ChartLiveBanner.css` | Styles + animation banner |
| **Modifié** | `desktop/src/stores/useFootprintSettingsStore.ts` | +`tickGrouping`, +`smartScaleMinRowPx` |
| **Modifié** | `desktop/src/components/footprint/FootprintCanvas.tsx` | Wiring banner + centrage vertical |
| **Modifié** | `desktop/src/lib/footprint/FootprintProAdapter.ts` | Passe aggregation au renderer |
| **Modifié** | `desktop/src/components/footprint/AdvancedSettingsModal.tsx` | UI Smart Scaling |

---

## Task 1 — Étendre `InteractionState` + nouvelles fonctions pures

**Files:**
- Modify: `desktop/src/lib/footprint/interactions.ts`
- Create: `desktop/src/lib/footprint/interactions.test.ts`

- [ ] **Étape 1.1 : Écrire les tests (rouge)**

Créer `desktop/src/lib/footprint/interactions.test.ts` :

```typescript
import { describe, it, expect } from "vitest";
import {
  goLive,
  resetScale,
  isLiveMode,
  DEFAULT_INTERACTION,
} from "./interactions";

describe("goLive", () => {
  it("resets scrollX to 0 and clears userOverrodeX", () => {
    const state = { ...DEFAULT_INTERACTION, scrollX: 500, userOverrodeX: true };
    const next = goLive(state);
    expect(next.scrollX).toBe(0);
    expect(next.userOverrodeX).toBe(false);
  });

  it("does not touch zoom or vertical state", () => {
    const state = {
      ...DEFAULT_INTERACTION,
      scrollX: 100,
      cellWidth: 300,
      rowHeight: 40,
      userOverrodeY: true,
      verticalMode: "none" as const,
    };
    const next = goLive(state);
    expect(next.cellWidth).toBe(300);
    expect(next.rowHeight).toBe(40);
    expect(next.userOverrodeY).toBe(true);
    expect(next.verticalMode).toBe("none");
  });
});

describe("resetScale", () => {
  it("resets cellWidth and rowHeight to provided defaults", () => {
    const state = { ...DEFAULT_INTERACTION, cellWidth: 300, rowHeight: 40 };
    const next = resetScale(state, 140, 20);
    expect(next.cellWidth).toBe(140);
    expect(next.rowHeight).toBe(20);
  });

  it("clears userOverrodeY and resets verticalMode to last-price", () => {
    const state = {
      ...DEFAULT_INTERACTION,
      userOverrodeY: true,
      verticalMode: "none" as const,
    };
    const next = resetScale(state, 140, 20);
    expect(next.userOverrodeY).toBe(false);
    expect(next.verticalMode).toBe("last-price");
  });

  it("does not touch scrollX or userOverrodeX", () => {
    const state = {
      ...DEFAULT_INTERACTION,
      scrollX: 500,
      userOverrodeX: true,
    };
    const next = resetScale(state, 140, 20);
    expect(next.scrollX).toBe(500);
    expect(next.userOverrodeX).toBe(true);
  });
});

describe("isLiveMode", () => {
  it("returns true when userOverrodeX is false", () => {
    expect(isLiveMode({ ...DEFAULT_INTERACTION, userOverrodeX: false })).toBe(true);
  });

  it("returns false when userOverrodeX is true", () => {
    expect(isLiveMode({ ...DEFAULT_INTERACTION, userOverrodeX: true })).toBe(false);
  });
});
```

- [ ] **Étape 1.2 : Vérifier que les tests échouent**

```bash
cd desktop && npx vitest run src/lib/footprint/interactions.test.ts
```

Attendu : **FAIL** — `goLive`, `resetScale`, `isLiveMode` non définis.

- [ ] **Étape 1.3 : Ajouter `verticalMode` à `InteractionState` et `DEFAULT_INTERACTION`**

Dans `interactions.ts`, ajouter à la fin du type `InteractionState` (après `dragStartRowHeight`) :

```typescript
  /** Vertical auto-centering mode.
   *  'last-price' — re-centres on the current price when it drifts
   *  past 20 % of visible height from centre. Suspended when
   *  userOverrodeY is true. Reset by resetScale().
   *  'none' — axis Y fully manual; userOverrodeY is always treated
   *  as true. */
  verticalMode: "last-price" | "none";
```

Dans `DEFAULT_INTERACTION`, ajouter :

```typescript
  verticalMode: "last-price",
```

- [ ] **Étape 1.4 : Exporter les nouvelles fonctions**

À la fin de `interactions.ts`, ajouter :

```typescript
// ─── Navigation helpers ────────────────────────────────────────────────────

/** Snap to the latest bar without touching zoom. */
export function goLive(state: InteractionState): InteractionState {
  return { ...state, scrollX: 0, userOverrodeX: false };
}

/** Reset horizontal + vertical zoom to defaults.
 *  Also restores last-price auto-centering. */
export function resetScale(
  state: InteractionState,
  defaultCellWidth: number,
  defaultRowHeight: number,
): InteractionState {
  return {
    ...state,
    cellWidth: defaultCellWidth,
    rowHeight: defaultRowHeight,
    userOverrodeY: false,
    verticalMode: "last-price",
  };
}

/** True when the user has not manually panned X (auto-follow active). */
export function isLiveMode(state: InteractionState): boolean {
  return !state.userOverrodeX;
}
```

- [ ] **Étape 1.5 : Vérifier que les tests passent**

```bash
cd desktop && npx vitest run src/lib/footprint/interactions.test.ts
```

Attendu : **PASS** — 7 tests, 0 failures.

- [ ] **Étape 1.6 : Commit**

```bash
git add desktop/src/lib/footprint/interactions.ts desktop/src/lib/footprint/interactions.test.ts
git commit -m "feat(nav): add verticalMode, goLive, resetScale, isLiveMode to interactions"
```

---

## Task 2 — `getEffectiveAggregation` (Smart Scaling pure function)

**Files:**
- Create: `desktop/src/lib/footprint/smartScaling.ts`
- Create: `desktop/src/lib/footprint/smartScaling.test.ts`

- [ ] **Étape 2.1 : Écrire les tests (rouge)**

Créer `desktop/src/lib/footprint/smartScaling.test.ts` :

```typescript
import { describe, it, expect } from "vitest";
import { getEffectiveAggregation } from "./smartScaling";

// With minRowPx = 8, the sequence is [1, 2, 5, 10, 25, 50].
// Returns the smallest N such that rowHeight * N >= minRowPx.
// Falls back to 50 if none qualify.

describe("getEffectiveAggregation", () => {
  it("returns 1 when rowHeight already meets the minimum", () => {
    expect(getEffectiveAggregation(8, 8)).toBe(1);
    expect(getEffectiveAggregation(20, 8)).toBe(1);
  });

  it("returns 2 when rowHeight * 2 first meets minimum", () => {
    expect(getEffectiveAggregation(4, 8)).toBe(2);
    expect(getEffectiveAggregation(5, 8)).toBe(2);
  });

  it("returns 5 when rowHeight * 5 first meets minimum", () => {
    expect(getEffectiveAggregation(2, 8)).toBe(5);
    expect(getEffectiveAggregation(1.6, 8)).toBe(5);
  });

  it("returns 10 when rowHeight * 10 first meets minimum", () => {
    expect(getEffectiveAggregation(1, 8)).toBe(10);
    expect(getEffectiveAggregation(0.8, 8)).toBe(10);
  });

  it("returns 25 when rowHeight * 25 first meets minimum", () => {
    expect(getEffectiveAggregation(0.4, 8)).toBe(25);
  });

  it("falls back to 50 at extreme zoom-out", () => {
    expect(getEffectiveAggregation(0.1, 8)).toBe(50);
  });

  it("respects a custom minRowPx", () => {
    // With minRowPx=4: rowHeight=3 → 3*1=3 < 4, 3*2=6 >= 4 → returns 2
    expect(getEffectiveAggregation(3, 4)).toBe(2);
  });
});
```

- [ ] **Étape 2.2 : Vérifier que les tests échouent**

```bash
cd desktop && npx vitest run src/lib/footprint/smartScaling.test.ts
```

Attendu : **FAIL** — module non trouvé.

- [ ] **Étape 2.3 : Implémenter `smartScaling.ts`**

Créer `desktop/src/lib/footprint/smartScaling.ts` :

```typescript
const AGG_SEQUENCE = [1, 2, 5, 10, 25, 50] as const;
export type AggregationStep = (typeof AGG_SEQUENCE)[number];

export const DEFAULT_SMART_SCALE_MIN_ROW_PX = 8;

/**
 * Returns the smallest aggregation factor N from [1, 2, 5, 10, 25, 50]
 * such that `rowHeight * N >= minRowPx`. Falls back to 50 if none qualifies.
 *
 * Used by the renderer to merge N adjacent price levels into one visual row
 * when the user zooms out (keeping rows readable at MIN_ROW_PX height).
 */
export function getEffectiveAggregation(
  rowHeight: number,
  minRowPx: number = DEFAULT_SMART_SCALE_MIN_ROW_PX,
): AggregationStep {
  for (const n of AGG_SEQUENCE) {
    if (rowHeight * n >= minRowPx) return n;
  }
  return AGG_SEQUENCE[AGG_SEQUENCE.length - 1];
}
```

- [ ] **Étape 2.4 : Vérifier que les tests passent**

```bash
cd desktop && npx vitest run src/lib/footprint/smartScaling.test.ts
```

Attendu : **PASS** — 7 tests, 0 failures.

- [ ] **Étape 2.5 : Commit**

```bash
git add desktop/src/lib/footprint/smartScaling.ts desktop/src/lib/footprint/smartScaling.test.ts
git commit -m "feat(nav): add getEffectiveAggregation for Smart Scaling"
```

---

## Task 3 — Ajouter les settings Smart Scaling au store

**Files:**
- Modify: `desktop/src/stores/useFootprintSettingsStore.ts`

- [ ] **Étape 3.1 : Ajouter les types dans `FootprintSettings`**

Dans `useFootprintSettingsStore.ts`, ajouter après la ligne `crosshairWidth: number;` (fin du type `FootprintSettings`) :

```typescript
  // Smart Scaling — vertical tick aggregation.
  /** 'auto' uses getEffectiveAggregation(); a number fixes the grouping. */
  tickGrouping: "auto" | 1 | 2 | 5 | 10;
  /** Minimum row height in px before aggregation kicks in (auto mode). */
  smartScaleMinRowPx: number;
```

- [ ] **Étape 3.2 : Ajouter les valeurs par défaut dans `DEFAULTS`**

Dans `DEFAULTS`, ajouter à la fin (avant la fermeture `}`) :

```typescript
  tickGrouping: "auto",
  smartScaleMinRowPx: 8,
```

- [ ] **Étape 3.3 : Vérifier que TypeScript compile**

```bash
cd desktop && npx tsc --noEmit
```

Attendu : **0 erreurs**.

- [ ] **Étape 3.4 : Commit**

```bash
git add desktop/src/stores/useFootprintSettingsStore.ts
git commit -m "feat(nav): add tickGrouping + smartScaleMinRowPx settings"
```

---

## Task 4 — Composant `ChartLiveBanner`

**Files:**
- Create: `desktop/src/components/footprint/ChartLiveBanner.tsx`
- Create: `desktop/src/components/footprint/ChartLiveBanner.css`

- [ ] **Étape 4.1 : Créer le CSS**

Créer `desktop/src/components/footprint/ChartLiveBanner.css` :

```css
.chart-live-banner {
  position: absolute;
  bottom: 30px; /* time-axis height ≈ 22px + 8px margin */
  left: 50%;
  transform: translateX(-50%) translateY(0);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px 4px 10px;
  background: color-mix(in srgb, var(--color-surface) 92%, transparent);
  backdrop-filter: blur(6px);
  border: 1px solid color-mix(in srgb, var(--color-warning) 40%, transparent);
  border-radius: 20px;
  font-size: 11px;
  font-family: var(--font-mono, monospace);
  white-space: nowrap;
  z-index: 10;
  pointer-events: auto;

  /* show/hide animation */
  opacity: 1;
  transition: opacity 150ms ease, transform 150ms ease;
}

.chart-live-banner.hidden {
  opacity: 0;
  pointer-events: none;
  transform: translateX(-50%) translateY(4px);
}

.chart-live-banner__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-warning);
  flex-shrink: 0;
}

.chart-live-banner__label {
  color: var(--color-warning);
  font-weight: 600;
  margin-right: 2px;
}

.chart-live-banner__btn {
  background: var(--color-surface-elevated, #21262d);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 2px 8px;
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  transition: background 100ms ease, color 100ms ease;
  line-height: 1.4;
}

.chart-live-banner__btn:hover {
  background: var(--color-primary, #58a6ff);
  color: #fff;
  border-color: var(--color-primary, #58a6ff);
}

.chart-live-banner__btn--live:hover {
  background: var(--color-success);
  border-color: var(--color-success);
}
```

- [ ] **Étape 4.2 : Créer le composant**

Créer `desktop/src/components/footprint/ChartLiveBanner.tsx` :

```tsx
import "./ChartLiveBanner.css";

interface ChartLiveBannerProps {
  isLive: boolean;
  onGoLive: () => void;
  onResetScale: () => void;
}

export function ChartLiveBanner({ isLive, onGoLive, onResetScale }: ChartLiveBannerProps) {
  return (
    <div className={`chart-live-banner${isLive ? " hidden" : ""}`}>
      <div className="chart-live-banner__dot" />
      <span className="chart-live-banner__label">Historique</span>
      <button
        className="chart-live-banner__btn chart-live-banner__btn--live"
        onClick={onGoLive}
        title="Retour à la dernière barre"
      >
        → Live
      </button>
      <button
        className="chart-live-banner__btn"
        onClick={onResetScale}
        title="Réinitialiser le zoom"
      >
        ↺ Scale
      </button>
    </div>
  );
}
```

- [ ] **Étape 4.3 : Vérifier que TypeScript compile**

```bash
cd desktop && npx tsc --noEmit
```

Attendu : **0 erreurs**.

- [ ] **Étape 4.4 : Commit**

```bash
git add desktop/src/components/footprint/ChartLiveBanner.tsx desktop/src/components/footprint/ChartLiveBanner.css
git commit -m "feat(nav): add ChartLiveBanner component (floating live/historique indicator)"
```

---

## Task 5 — Wirer le banner dans `FootprintCanvas`

**Files:**
- Modify: `desktop/src/components/footprint/FootprintCanvas.tsx`

- [ ] **Étape 5.1 : Ajouter les imports**

En haut de `FootprintCanvas.tsx`, ajouter :

```tsx
import { ChartLiveBanner } from "./ChartLiveBanner";
import { goLive, resetScale, isLiveMode } from "../../lib/footprint/interactions";
```

(Vérifier que `goLive`, `resetScale`, `isLiveMode` ne sont pas déjà importés depuis interactions.)

- [ ] **Étape 5.2 : Localiser la constante `DEFAULT_CELL_WIDTH` / `DEFAULT_ROW_HEIGHT`**

Rechercher dans `FootprintCanvas.tsx` l'endroit où `DEFAULT_INTERACTION` est utilisé ou où `cellWidth: 140` / `rowHeight: 20` sont hardcodés. Le renderer est initialisé avec ces valeurs.

Ajouter en haut du composant (juste après les imports) si elles n'existent pas :

```typescript
const DEFAULT_CELL_WIDTH = 140;
const DEFAULT_ROW_HEIGHT = 20;
```

- [ ] **Étape 5.3 : Injecter le banner dans le JSX**

Le container principal du canvas est un `div` avec `position: relative` (ou équivalent). Localiser le `return (` du composant et ajouter `<ChartLiveBanner>` en tant que sibling direct du `<canvas>` :

```tsx
<div
  ref={containerRef}
  style={{ position: "relative", width: "100%", height: "100%" }}
  // ... autres props existantes
>
  <canvas ref={canvasRef} /* ... */ />
  <ChartLiveBanner
    isLive={isLiveMode(interactionRef.current)}
    onGoLive={() => {
      interactionRef.current = goLive(interactionRef.current);
      tickRender();
    }}
    onResetScale={() => {
      interactionRef.current = resetScale(
        interactionRef.current,
        DEFAULT_CELL_WIDTH,
        DEFAULT_ROW_HEIGHT,
      );
      tickRender();
    }}
  />
  {/* autres overlays existants */}
</div>
```

**Problème :** `isLiveMode(interactionRef.current)` est appelé au render React, mais `interactionRef` est un ref muté hors de React. Le banner ne se mettra pas à jour automatiquement.

**Solution :** ajouter un state React minimal pour forcer le re-render quand `userOverrodeX` change :

```tsx
const [isLive, setIsLive] = useState(true);
```

Dans `clampAndRender()` (ou la fonction équivalente qui déclenche le rendu), ajouter après la mise à jour de `interactionRef.current` :

```typescript
const nextIsLive = isLiveMode(interactionRef.current);
setIsLive((prev) => (prev !== nextIsLive ? nextIsLive : prev));
```

Puis utiliser `isLive` (le state) plutôt que `isLiveMode(interactionRef.current)` dans les props du banner.

- [ ] **Étape 5.4 : Vérifier que TypeScript compile**

```bash
cd desktop && npx tsc --noEmit
```

Attendu : **0 erreurs**.

- [ ] **Étape 5.5 : Vérifier visuellement**

Lancer l'app, scroller dans l'historique → le banner orange doit apparaître. Cliquer « → Live » → le banner doit disparaître et le chart doit sauter à la dernière barre. Cliquer « ↺ Scale » → le zoom doit revenir aux valeurs par défaut.

- [ ] **Étape 5.6 : Commit**

```bash
git add desktop/src/components/footprint/FootprintCanvas.tsx
git commit -m "feat(nav): wire ChartLiveBanner into FootprintCanvas"
```

---

## Task 6 — Smart Scaling dans `FootprintProAdapter`

**Files:**
- Modify: `desktop/src/lib/footprint/FootprintProAdapter.ts`

- [ ] **Étape 6.1 : Ajouter l'import**

En haut de `FootprintProAdapter.ts` :

```typescript
import { getEffectiveAggregation, DEFAULT_SMART_SCALE_MIN_ROW_PX } from "./smartScaling";
```

- [ ] **Étape 6.2 : Vérifier comment les settings arrivent dans l'adapter**

Dans `FootprintProAdapter.ts`, chercher `FootprintRendererSettings` ou un type similaire. L'adapter reçoit les settings soit :
- Via le constructeur : `new FootprintProAdapter(getInteraction, settings)`
- Via un setter appelé depuis `FootprintCanvas` quand le store change : `adapter.applySettings(settings)`

Dans `FootprintCanvas.tsx`, repérer comment les settings sont passés à l'adapter existant. Suivre le même pattern pour `tickGrouping` et `smartScaleMinRowPx`.

Si les settings sont passés via un type de settings dédié à l'adapter, ajouter `tickGrouping` et `smartScaleMinRowPx` à ce type (en suivant le pattern existant pour les autres champs comme `showGrid`, `imbalanceRatio`, etc.).

- [ ] **Étape 6.3 : Localiser la méthode `render()` dans l'adapter**

La méthode `render()` lit l'état d'interaction (`this.getInteraction()`) et calcule les métriques de layout. Y trouver le point où `rowHeight` est lu pour le layout.

- [ ] **Étape 6.4 : Calculer l'agrégation effective au moment du rendu**

Dans `render()`, après la lecture de `interaction` et avant l'appel au renderer interne, ajouter :

```typescript
const interaction = this.getInteraction();
const tickGrouping = this.settings?.tickGrouping ?? "auto";
const smartScaleMinRowPx = this.settings?.smartScaleMinRowPx ?? DEFAULT_SMART_SCALE_MIN_ROW_PX;

const aggregation: number =
  tickGrouping === "auto"
    ? getEffectiveAggregation(interaction.rowHeight, smartScaleMinRowPx)
    : (tickGrouping as number);
```

- [ ] **Étape 6.5 : Passer l'agrégation au renderer interne**

Localiser l'appel au renderer interne (`this.pro.render(...)` ou équivalent). Ajouter `aggregation` en paramètre ou le stocker dans une propriété lue par le renderer :

```typescript
this.pro.setAggregation(aggregation); // si le renderer a un setter
// OU
this.pro.render({ ...params, aggregation });
```

Si `FootprintProRenderer` n'a pas encore de concept d'agrégation, ajouter un setter :

Dans `FootprintProRenderer.ts` :

```typescript
private _aggregation: number = 1;

setAggregation(n: number): void {
  this._aggregation = n;
}
```

- [ ] **Étape 6.6 : Modifier le rendu des rows dans `FootprintProRenderer`**

Localiser la boucle qui itère sur les niveaux de prix d'une candle (les `levels` ou `rows` du footprint). Actuellement elle dessine une row par niveau. Modifier pour grouper `this._aggregation` niveaux consécutifs.

**Pattern de groupement (à adapter à la structure existante) :**

```typescript
const agg = this._aggregation;
// `levels` est trié du plus haut au plus bas prix
for (let i = 0; i < levels.length; i += agg) {
  const group = levels.slice(i, i + agg);
  const bidVol = group.reduce((s, l) => s + l.bidVolume, 0);
  const askVol = group.reduce((s, l) => s + l.askVolume, 0);
  const delta = group.reduce((s, l) => s + l.delta, 0);
  const highPrice = group[0].price; // groupe trié desc
  const lowPrice = group[group.length - 1].price;

  // Label prix
  const priceLabel = agg > 1
    ? `${fmtPrice(highPrice)}–${fmtPrice(lowPrice)}`
    : fmtPrice(highPrice);

  // Hauteur de la row visuelle = rowHeight * agg (ou rowHeight si agg = 1)
  const rowH = rowHeight * agg;

  drawRow(ctx, { bidVol, askVol, delta, priceLabel, rowH, y: currentY });
  currentY += rowH;
}
```

**Note :** adapter aux noms de variables réels dans le fichier. Le pattern est : itérer par pas de `agg`, sommer les volumes, afficher la range de prix si `agg > 1`.

- [ ] **Étape 6.7 : Vérifier visuellement**

Lancer l'app, zoomer Y vers l'extérieur (rowHeight diminue) → les rows doivent commencer à fusionner quand elles deviendraient trop petites. Le label doit afficher un range de prix (`5265.50–5265.00`) quand `aggregation > 1`.

- [ ] **Étape 6.8 : Vérifier que TypeScript compile**

```bash
cd desktop && npx tsc --noEmit
```

- [ ] **Étape 6.9 : Commit**

```bash
git add desktop/src/lib/footprint/FootprintProAdapter.ts desktop/src/lib/footprint/FootprintProRenderer.ts
git commit -m "feat(nav): Smart Scaling — aggregate rows at zoom-out in footprint renderer"
```

---

## Task 7 — UI Smart Scaling dans `AdvancedSettingsModal`

**Files:**
- Modify: `desktop/src/components/footprint/AdvancedSettingsModal.tsx`

- [ ] **Étape 7.1 : Lire la section existante la plus proche**

Dans `AdvancedSettingsModal.tsx`, trouver la section qui contient les sliders / dropdowns liés aux imbalances ou aux indicateurs. Le nouveau bloc s'insère dans la même section "Affichage" ou crée une section "Navigation".

- [ ] **Étape 7.2 : Ajouter le bloc Smart Scaling**

```tsx
{/* ── Smart Scaling ─────────────────────────── */}
<div className="settings-section">
  <h4 className="settings-section-title">Smart Scaling</h4>

  <label className="settings-row">
    <span className="settings-label">Tick grouping</span>
    <select
      className="settings-select"
      value={settings.tickGrouping}
      onChange={(e) =>
        updateSetting(
          "tickGrouping",
          e.target.value === "auto" ? "auto" : (Number(e.target.value) as 1 | 2 | 5 | 10),
        )
      }
    >
      <option value="auto">Auto</option>
      <option value="1">1 tick</option>
      <option value="2">2 ticks</option>
      <option value="5">5 ticks</option>
      <option value="10">10 ticks</option>
    </select>
  </label>

  <label className="settings-row">
    <span className="settings-label">Min row height (auto)</span>
    <div className="settings-slider-row">
      <input
        type="range"
        min={4}
        max={16}
        step={1}
        value={settings.smartScaleMinRowPx}
        onChange={(e) => updateSetting("smartScaleMinRowPx", Number(e.target.value))}
        disabled={settings.tickGrouping !== "auto"}
      />
      <span className="settings-value">{settings.smartScaleMinRowPx}px</span>
    </div>
  </label>
</div>
```

(`settings` et `updateSetting` suivent le pattern déjà utilisé dans le modal — adapter aux noms réels.)

- [ ] **Étape 7.3 : Vérifier que TypeScript compile**

```bash
cd desktop && npx tsc --noEmit
```

- [ ] **Étape 7.4 : Vérifier visuellement**

Ouvrir le modal settings → section Smart Scaling visible. Changer "Tick grouping" → effet immédiat sur le chart (via le store Zustand réactif).

- [ ] **Étape 7.5 : Commit**

```bash
git add desktop/src/components/footprint/AdvancedSettingsModal.tsx
git commit -m "feat(nav): Smart Scaling settings in AdvancedSettingsModal"
```

---

## Task 8 — Centrage vertical `last-price`

**Files:**
- Modify: `desktop/src/components/footprint/FootprintCanvas.tsx`

- [ ] **Étape 8.1 : Identifier la source du `lastPrice`**

Dans `FootprintCanvas.tsx`, trouver `barsRef.current` (ou l'équivalent). Le `lastPrice` est le `close` du dernier bar :

```typescript
const lastPrice: number | null =
  barsRef.current.length > 0
    ? barsRef.current[barsRef.current.length - 1].close
    : null;
```

- [ ] **Étape 8.2 : Ajouter les helpers de conversion prix ↔ pixel**

Ces fonctions doivent correspondre à la convention du renderer. Localiser comment `scrollY` et `rowHeight` sont utilisés pour positionner les rows Y dans le renderer, puis écrire les inverses :

```typescript
/**
 * Convertit un prix en coordonnée Y pixel depuis le haut du chart.
 * Convention renderer : gridTop = chartTop - scrollY ;
 *   priceRow = (basePrice - price) / tickSize
 *   y = gridTop + priceRow * rowHeight
 */
function priceToY(
  price: number,
  basePrice: number,
  tickSize: number,
  rowHeight: number,
  scrollY: number,
  chartTop: number,
): number {
  const gridTop = chartTop - scrollY;
  const priceRow = (basePrice - price) / tickSize;
  return gridTop + priceRow * rowHeight;
}

/**
 * Calcule le scrollY nécessaire pour centrer `price` verticalement
 * (i.e., la row du price atterrit à chartTop + chartHeight/2).
 */
function scrollYForCenteredPrice(
  price: number,
  basePrice: number,
  tickSize: number,
  rowHeight: number,
  chartTop: number,
  chartHeight: number,
): number {
  const priceRow = (basePrice - price) / tickSize;
  const targetY = chartTop + chartHeight / 2;
  return chartTop + priceRow * rowHeight - targetY;
}
```

**Note :** `basePrice` est le prix de référence du renderer (souvent le prix le plus haut visible ou le close du dernier bar selon l'implémentation). `tickSize` est `detectedTickSize` disponible via l'adapter. Adapter les paramètres aux noms réels dans le fichier.

- [ ] **Étape 8.3 : Ajouter le ref d'animation**

Au niveau du composant (avec les autres refs) :

```typescript
const vertScrollAnimRef = useRef<{
  startScrollY: number;
  targetScrollY: number;
  startTime: number;
  duration: number;
} | null>(null);
```

- [ ] **Étape 8.4 : Ajouter la fonction `smoothScrollToY`**

```typescript
function smoothScrollToY(targetScrollY: number, durationMs: number): void {
  vertScrollAnimRef.current = {
    startScrollY: interactionRef.current.scrollY,
    targetScrollY,
    startTime: performance.now(),
    duration: durationMs,
  };
}
```

- [ ] **Étape 8.5 : Intégrer dans la boucle rAF**

Dans la fonction de rendu principale (appelée par `requestAnimationFrame`), AVANT l'appel à `rendererRef.current?.render()`, ajouter :

```typescript
// Vertical centering animation (last-price mode)
const anim = vertScrollAnimRef.current;
if (anim !== null) {
  const now = performance.now();
  const progress = Math.min(1, (now - anim.startTime) / anim.duration);
  const nextScrollY = anim.startScrollY + (anim.targetScrollY - anim.startScrollY) * progress;
  interactionRef.current = { ...interactionRef.current, scrollY: nextScrollY };
  if (progress >= 1) vertScrollAnimRef.current = null;
}

// Last-price auto-center check
const state = interactionRef.current;
if (
  state.verticalMode === "last-price" &&
  !state.userOverrodeY &&
  lastPrice !== null &&
  vertScrollAnimRef.current === null // ne pas interrompre une animation en cours
) {
  const priceY = priceToY(lastPrice, basePrice, tickSize, state.rowHeight, state.scrollY, chartTop);
  const centerY = chartTop + chartHeight / 2;
  const deadzone = chartHeight * 0.20;

  if (Math.abs(priceY - centerY) > deadzone) {
    smoothScrollToY(
      scrollYForCenteredPrice(lastPrice, basePrice, tickSize, state.rowHeight, chartTop, chartHeight),
      200,
    );
  }
}
```

- [ ] **Étape 8.6 : Vérifier visuellement**

En mode live sur une session active : le chart doit maintenir le dernier prix dans la zone centrale verticale. Drag l'axe Y → `userOverrodeY = true` → plus de recentrage automatique. Cliquer "↺ Scale" → `userOverrodeY = false` → recentrage reprend.

- [ ] **Étape 8.7 : Vérifier que TypeScript compile**

```bash
cd desktop && npx tsc --noEmit
```

- [ ] **Étape 8.8 : Commit**

```bash
git add desktop/src/components/footprint/FootprintCanvas.tsx
git commit -m "feat(nav): last-price vertical auto-centering with smooth scroll"
```

---

## Vérification finale

- [ ] Lancer la suite de tests complète :

```bash
cd desktop && npm test
```

Attendu : tous les tests passent.

- [ ] Checklist comportementale :
  - [ ] Scroll dans l'historique → banner orange apparaît (fade in 150ms)
  - [ ] Cliquer "→ Live" → chart snaps à la dernière barre, banner disparaît
  - [ ] Cliquer "↺ Scale" → zoom revient à 140px/20px, banner reste si toujours en historique
  - [ ] Zoom Y out extrême → rows fusionnent, label affiche range de prix
  - [ ] Settings modal → "Tick grouping" = 5 → rows toujours groupées par 5 peu importe le zoom
  - [ ] Mode live + prix actif → last price reste dans la zone centrale
  - [ ] Drag axe Y → recentrage suspendu ; "↺ Scale" → recentrage reprend
