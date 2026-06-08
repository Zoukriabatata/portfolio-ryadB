# Navigation Chart — Design Spec

**Date :** 2026-06-08  
**Statut :** Approuvé  
**Scope :** Navigation footprint canvas — auto-scroll, contrôles live/historique, Smart Scaling Y, centrage vertical

---

## Contexte

L'analyse de l'industrie (ATAS, Bookmap, Sierra Chart, TradingView Lightweight Charts) a révélé un ensemble de conventions UX stables que notre implémentation actuelle respecte partiellement. Ce spec couvre les gaps restants.

**Déjà implémenté (hors scope) :**
- Pan XY omnidirectionnel (drag canvas)
- Zoom X/Y avec ancrage au curseur (wheel)
- Drag sur axes pour zoom indépendant
- Clamping des bornes scroll
- 60 FPS cap
- Auto-fit au premier chargement

**À implémenter :**
1. Floating banner contextuel « Go Live » / « Reset Scale »
2. Auto-scroll conditionnel (comportement correct au niveau UX)
3. Smart Scaling : agrégation de ticks adaptative au zoom Y
4. Modes de centrage vertical : `last-price` et `none`

---

## Architecture

4 fichiers touchés, zéro nouveau module :

| Fichier | Changements |
|---|---|
| `interactions.ts` | +3 fonctions pures, +1 champ d'état `verticalMode` |
| `FootprintCanvas.tsx` | Wiring des nouvelles actions, boucle centrage vertical, injection du banner |
| `FootprintProAdapter.ts` | `getEffectiveAggregation()` pour Smart Scaling |
| `FootprintProRenderer.ts` | Rendu des rows agrégées (label range, volumes sommés) |

Nouveau composant : `ChartLiveBanner.tsx` (dans `desktop/src/components/footprint/`)

---

## 1. État & Fonctions pures (`interactions.ts`)

### Ajout à `InteractionState`

```typescript
verticalMode: 'last-price' | 'none';  // default: 'last-price'
// isLive reste dérivé : !userOverrodeX
```

### Nouvelles fonctions

```typescript
// Snap temporal au dernier bar — NE reset PAS le zoom
export function goLive(state: InteractionState): InteractionState {
  return { ...state, scrollX: 0, userOverrodeX: false };
}

// Reset zoom horizontal + vertical aux valeurs par défaut
// Remet aussi verticalMode à 'last-price' et userOverrodeY à false
export function resetScale(
  state: InteractionState,
  defaultCellWidth: number,
  defaultRowHeight: number
): InteractionState {
  return {
    ...state,
    cellWidth: defaultCellWidth,
    rowHeight: defaultRowHeight,
    userOverrodeY: false,
    verticalMode: 'last-price',
  };
}

// Dérivé : l'utilisateur est-il sur la dernière barre ?
export function isLiveMode(state: InteractionState): boolean {
  return !state.userOverrodeX;
}
```

### Comportement `goLive` vs `resetScale`

- **Indépendants** : l'utilisateur peut revenir au live sans réinitialiser le zoom, et vice-versa.
- `goLive` ne touche pas `cellWidth`, `rowHeight`, ni `verticalMode`.
- `resetScale` ne touche pas `scrollX` ni `userOverrodeX`.

---

## 2. Floating Banner (`ChartLiveBanner.tsx`)

### Positionnement

Injecté dans le container du canvas (position: `relative`).  
Position absolue : `bottom: 30px` (timeAxisHeight ≈ 22px + 8px marge), `left: 50%`, `transform: translateX(-50%)`.

### Visibilité

Visible seulement quand `!isLiveMode(state)` (i.e., `userOverrodeX = true`).  
Animation CSS : `opacity` + `translateY(4px)` transition 150ms ease.

### Contenu

```
[ ● Historique ]  [ → Live ]  [ ↺ Scale ]
```

- Dot orange + label « Historique » : indicateur d'état
- Bouton « → Live » : appelle `goLive()`
- Bouton « ↺ Scale » : appelle `resetScale()`

### Couleurs (tokens existants)

- En mode historique : dot `--color-warning` (orange ambre)
- Fond du banner : `--color-surface-overlay` avec blur léger
- Bouton Live : accent vert `--color-success` au hover

---

## 3. Auto-scroll conditionnel

**Le comportement est déjà correct** grâce à l'ancrage droit du rendu :

```
mostRecentRightX = chartRight + scrollX
```

Quand `scrollX = 0`, les nouvelles barres apparaissent automatiquement à droite sans logique supplémentaire.

**Seul manque :** il n'y a pas de bouton explicite pour revenir à `scrollX = 0` après avoir scrollé dans l'historique. Le banner couvre ce besoin.

**Note :** la logique `DRAG_THRESHOLD_PX = 3` est conservée — un micro-jitter ne flip pas `userOverrodeX`.

---

## 4. Smart Scaling (`FootprintProAdapter.ts` + `FootprintProRenderer.ts`)

### Principe

Quand `rowHeight` devient inférieur à `MIN_ROW_PX`, on fusionne N niveaux de prix adjacents en une seule row visuelle. Les volumes bid/ask sont **sommés** sur les N niveaux.

### Séquence d'agrégation

`[1, 2, 5, 10, 25, 50]` — on choisit le plus petit N tel que `rowHeight * N >= MIN_ROW_PX`.

```typescript
const AGG_SEQUENCE = [1, 2, 5, 10, 25, 50] as const;
const MIN_ROW_PX = 8; // configurable dans settings (4–16px)

export function getEffectiveAggregation(
  rowHeight: number,
  minRowPx: number = MIN_ROW_PX
): number {
  for (const n of AGG_SEQUENCE) {
    if (rowHeight * n >= minRowPx) return n;
  }
  return AGG_SEQUENCE[AGG_SEQUENCE.length - 1];
}
```

### Override manuel

Ajout dans `AdvancedSettingsModal` :
- **Tick grouping** : `Auto` | `1` | `2` | `5` | `10` (dropdown)
- **Min row px** : slider 4–16px (default 8)

Quand `tickGrouping !== 'Auto'`, on bypass `getEffectiveAggregation` et on utilise la valeur fixe.

### Rendu des rows agrégées

Dans `FootprintProRenderer.ts` :
- Label prix : si N > 1, afficher `"5265.50–5265.00"` (range), sinon le prix normal
- Volumes : `bidVol = sum(levels[i..i+N].bidVol)`, idem ask
- Delta : `delta = sum(levels[i..i+N].delta)`
- Barres de volume : proportionnelles aux volumes sommés
- POC : calculé sur les rows agrégées (max volume parmi les rows fusionnées)

---

## 5. Centrage vertical (`FootprintCanvas.tsx`)

### Modes

| Mode | Comportement |
|---|---|
| `last-price` | Re-centre sur le dernier prix quand il sort de la zone centrale (40% middle de l'axe Y). Désactivé si `userOverrodeY`. |
| `none` | Pas de re-centrage. `userOverrodeY` traité comme `true`. |

### Bascule automatique

- Drag axe Y → `userOverrodeY = true` → re-centrage suspendu (même en `last-price`)
- Appel `resetScale()` → `userOverrodeY = false`, `verticalMode = 'last-price'`

### Algorithme re-centrage `last-price`

**Source de `lastPrice` :** close price du dernier bar dans `barsRef.current` (déjà disponible dans `FootprintCanvas.tsx`).

Trois utilitaires à créer dans `FootprintCanvas.tsx` (scope canvas uniquement, pas dans `interactions.ts`) :

```typescript
// Convertit un prix en coordonnée Y pixel (depuis le haut du chart)
function priceToPixel(price: number, scrollY: number, rowHeight: number, basePrice: number): number {
  return (basePrice - price) / tickSize * rowHeight - scrollY;
}

// Calcule le scrollY pour centrer un prix donné
function computeScrollYForPrice(price: number, rowHeight: number, chartHeight: number, basePrice: number): number {
  return (basePrice - price) / tickSize * rowHeight - chartHeight / 2;
}

// Interpolation linéaire du scrollY sur `durationMs` via performance.now()
// Stocke l'animation dans un ref (scrollYAnimRef) et l'applique dans le rAF loop
function smoothScrollToY(targetScrollY: number, durationMs: number): void { ... }
```

Dans la boucle rAF :

```typescript
if (verticalMode === 'last-price' && !userOverrodeY && lastPrice != null) {
  const priceY = priceToPixel(lastPrice, scrollY, rowHeight, basePrice);
  const centerY = chartHeight / 2;
  const deadzone = chartHeight * 0.20; // 20% de chaque côté du centre

  if (Math.abs(priceY - centerY) > deadzone) {
    smoothScrollToY(computeScrollYForPrice(lastPrice, rowHeight, chartHeight, basePrice), 200);
  }
}
```

### BBO (hors scope)

Réservé pour quand le DOM live sera unifié sur tous les connecteurs.

---

## 6. Wiring `FootprintCanvas.tsx`

```tsx
// Passer au banner
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
      DEFAULT_ROW_HEIGHT
    );
    tickRender();
  }}
/>
```

Les valeurs par défaut proviennent de `DEFAULT_INTERACTION` dans `interactions.ts` : `cellWidth: 140` et `rowHeight: 20`. À extraire en constantes nommées `DEFAULT_CELL_WIDTH = 140` et `DEFAULT_ROW_HEIGHT = 20` si ce n'est pas déjà fait.

---

## 7. Non-scope

- **BBO mode** : reporté (dépend de l'unification du DOM live)
- **Keyboard shortcuts** (Esc = go live, R = reset scale) : peuvent être ajoutés en post sans toucher à ce spec
- **Touch / pinch** : comportement actuel conservé
- **Animation snap go-live** : le snap est instantané (pas de scroll animé pour le retour au live — différent du re-centrage Y qui est smooth)

---

## Fichiers touchés

```
desktop/src/lib/footprint/interactions.ts          — goLive, resetScale, isLiveMode, verticalMode
desktop/src/components/footprint/ChartLiveBanner.tsx  — NOUVEAU composant
desktop/src/lib/footprint/FootprintProAdapter.ts   — getEffectiveAggregation
desktop/src/lib/footprint/FootprintProRenderer.ts  — rendu rows agrégées
desktop/src/components/footprint/AdvancedSettingsModal.tsx — settings Smart Scaling
desktop/src/components/FootprintCanvas.tsx          — wiring + centrage vertical
```
