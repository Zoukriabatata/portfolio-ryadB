# In-App Modules Design Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift the 8 in-app modules (/live, /flow, /footprint, /gex, /volatility, /trading, /journal, /ai) from ~5/10 to ~7.5-8/10 (deepchart/TradingView grade) by applying the SENZOUKRIA brand skin the engine already deserves — without touching the orderflow engine.

**Architecture:** Build shared design-system primitives FIRST (canvas color helper, `.panel-glass` material, 4pt spacing scale, motion utilities, control components), then run 10 transverse passes that apply them across modules. Each pass is mostly search-replace + shared classes — one fix propagates to 8 modules. Every phase leaves the app buildable.

**Tech Stack:** Next.js 15, React 19, TypeScript strict, CSS custom-properties (design tokens) + Tailwind, Zustand (theme), Canvas 2D (charts), `lucide-react`, `next/font` (Fraunces/Geist/JetBrains Mono).

**Source of truth:** `docs/superpowers/specs/2026-06-07-inapp-modules-design-audit.md` (the audit + ratings + direction this plan executes).

---

## Décisions de cadrage (à confirmer avant Phase 2 — defaults retenus)

- **D1 — La teinte lime (BLOQUANT, à trancher).** Conflit réel : la **spec de marque** dit `--primary = #4ade80`, mais le **thème SENZOUKRIA** (`stores/useUIThemeStore.ts`) override `primary: '#7ed321'`. Live, le vert affiché est **#7ed321** (plus jaune/vif) ; les rares `#4ade80` littéraux (landing) jurent. **Default recommandé : aligner sur la spec #4ade80** → changer la valeur du thème senzoukria `primary` (+ `primaryLight`/`primaryDark`/preview) pour matcher #4ade80, OU l'inverse si tu préfères le #7ed321. UNE seule teinte. *(Cf. Task 1.5.)*
- **D2 — Densité par défaut.** Default : **Confort** (planchers ≥11-12px) avec un toggle global Confort/Compact persistant (les power-users gardent le compact). Cf. Phase 7.
- **D3 — Périmètre.** Site web uniquement (`app/` + `components/`). Pas l'app desktop Tauri.

---

## Invariants à ne pas casser
- **Moteur intouché** : zéro changement de logique de calcul orderflow (delta, GEX, IV, footprint…). Habillage seulement.
- **Zéro nouvelle couleur hardcodée.** Chrome → 100% tokens. Data → `var(--bull)`/`var(--bear)`/`themeColor()` (jamais d'hex crypto).
- **`prefers-reduced-motion` respecté** sur toute nouvelle animation.
- **Build vert** après chaque task : `npx tsc --noEmit` + `npm run lint`. *(Si un `npm run dev` tourne, NE PAS lancer `next build` — conflit `.next` ; s'appuyer sur tsc/lint + hot-reload, demander de couper le dev pour un build final.)*

## Commandes de vérif (réutilisées)
```bash
npx tsc --noEmit                 # typecheck
npm run lint                     # eslint
# Garde anti-hardcode (doit être vide sur le fichier traité) :
npx rg "#22c55e|#ef4444|#10b981|#34d399|#fbbf24|#3b82f6|#6366f1|#a78bfa|#26beaf" <fichier>
# Garde anti-emoji (chrome) :
npx rg "🔊|⚙|✓|🏆|🐍|⚡|🟢|📊|📈|📉|🗺|🔬|🎁" <fichier>
npm run build                    # build complet (dev coupé)
```

---

## File Structure

**Créés (fondations) :**
- `lib/ui/themeColors.ts` — lecteur de tokens CSS pour le code canvas/JS (theme-aware, pas d'hex).
- `lib/ui/lerp.ts` — interpolation pour les redraws canvas (motion).
- `components/ui/Segment.tsx` — contrôle segmenté / pills unifié (état actif teinté).

**Modifiés (fondations) :**
- `app/globals.css` — `.panel-glass`/`.panel-glass-hero`, échelle d'espace 4pt, utilitaires motion (`value-flash`, `flash-bull/bear`, micro-press), planchers densité.
- `stores/useUIThemeStore.ts` — `refreshThemeColors()` appelé dans `applyUITheme` ; (D1) alignement teinte lime.

**Modifiés (passes) :** les 8 modules + sous-composants — voir phases.

---

# PHASE 1 — Fondations (entièrement codées)

> Après cette phase : `themeColor()`, `.panel-glass`, l'échelle d'espace, les utilitaires motion et `<Segment>` existent. Les passes les réutilisent.

### Task 1.1 — Helper couleur theme-aware pour canvas
**Files:** Create `lib/ui/themeColors.ts`

- [ ] **Step 1 : créer le helper**
```ts
// Reads brand tokens from CSS custom properties so canvas/JS (which can't use
// CSS var() directly) stays theme-aware — no hardcoded hex. Refreshed on theme
// change via refreshThemeColors() (called from applyUITheme()).
const VARS = [
  '--primary', '--primary-light', '--accent', '--accent-light',
  '--bull', '--bear', '--warning',
  '--text-primary', '--text-secondary', '--text-muted', '--text-dimmed',
  '--surface', '--surface-elevated', '--border', '--background',
] as const;
export type ThemeToken = typeof VARS[number];

let cache: Partial<Record<ThemeToken, string>> = {};

export function refreshThemeColors(): void {
  if (typeof window === 'undefined') return;
  const cs = getComputedStyle(document.documentElement);
  const next: Partial<Record<ThemeToken, string>> = {};
  for (const v of VARS) next[v] = cs.getPropertyValue(v).trim();
  cache = next;
}

export function themeColor(token: ThemeToken): string {
  if (!cache[token]) refreshThemeColors();
  return cache[token] || '#000000';
}

/** Directional P&L / delta color via brand tokens (never crypto hex). */
export function pnlColor(n: number): string {
  return themeColor(n >= 0 ? '--bull' : '--bear');
}

/** rgba() from a token + alpha, for canvas fills. */
export function themeAlpha(token: ThemeToken, alpha: number): string {
  const hex = themeColor(token);
  // tokens are hex (#rrggbb); convert to rgba
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const [r, g, b] = [m[1], m[2], m[3]].map(h => parseInt(h, 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
```
- [ ] **Step 2 : vérifier** — `npx tsc --noEmit` → PASS.
- [ ] **Step 3 : commit** — `git commit -m "feat(ui): theme-aware color helper for canvas (themeColor/pnlColor/themeAlpha)"`

### Task 1.2 — Rafraîchir les couleurs au changement de thème
**Files:** Modify `stores/useUIThemeStore.ts` (fonction `applyUITheme`, fin)

- [ ] **Step 1 : appeler refreshThemeColors après avoir posé les vars**
Dans `applyUITheme`, juste avant le `setTimeout(... 'theme-transition' ...)` final, ajouter :
```ts
  // Let canvas/JS code (themeColors.ts) pick up the new palette.
  import('@/lib/ui/themeColors').then(m => m.refreshThemeColors());
```
- [ ] **Step 2 : vérifier** `npx tsc --noEmit`. **Commit.**

### Task 1.3 — Matière `.panel-glass` + espace 4pt + motion utils
**Files:** Modify `app/globals.css` (bloc utilities)

- [ ] **Step 1 : ajouter les classes**
```css
/* === ÉCHELLE D'ESPACE 4pt (fin des px-1/py-0 ad hoc) === */
:root {
  --space-1: 4px; --space-2: 8px; --space-3: 12px;
  --space-4: 16px; --space-5: 20px; --space-6: 24px;
}

/* === MATIÈRE PANNEAU — le verre de marque pour chrome/cartes/toolbars === */
.panel-glass {
  background: rgb(var(--surface-rgb) / 0.78);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  border: 1px solid var(--border-light);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 8px 30px rgba(0, 0, 0, 0.28);
}
/* Carte héro élevée : ajoute un under-glow lime "énergie". */
.panel-glass-hero {
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.07),
    0 12px 40px rgba(0, 0, 0, 0.35),
    0 0 44px rgb(var(--primary-rgb) / 0.07);
}

/* === MOTION (vivacité/addictif) === */
@keyframes value-flash { 0% { color: var(--primary); } 100% { color: inherit; } }
.value-flash { animation: value-flash 0.7s ease-out; }
@keyframes flash-bull-kf { 0% { background: rgb(var(--bull-rgb, 38 217 127) / 0.35); } 100% { background: transparent; } }
@keyframes flash-bear-kf { 0% { background: rgb(var(--bear-rgb) / 0.35); } 100% { background: transparent; } }
.flash-bull { animation: flash-bull-kf 0.5s ease-out; }
.flash-bear { animation: flash-bear-kf 0.5s ease-out; }
.press-fb { transition: transform 0.12s ease; }
.press-fb:active { transform: scale(0.95); }

@media (prefers-reduced-motion: reduce) {
  .value-flash, .flash-bull, .flash-bear { animation: none; }
  .press-fb:active { transform: none; }
}
```
> NB : `--bull-rgb` n'existe pas encore — l'ajouter dans `:root` + `applyUITheme` (même pattern que `--bear-rgb`/`--warning-rgb` déjà faits) dans cette task.
- [ ] **Step 2 : ajouter `--bull-rgb`** dans `:root` (`--bull-rgb: 38 217 127;`) et dans `applyUITheme` (`root.style.setProperty('--bull-rgb', hexToRgb(c.bull ?? '#26d97f'));` — vérifier le champ `bull` du thème).
- [ ] **Step 3 : vérifier** — `npm run dev`, appliquer `.panel-glass` temporairement sur une carte → verre flouté. Retirer le test.
- [ ] **Step 4 : commit** — `feat(ui): .panel-glass material + 4pt spacing scale + motion utilities`

### Task 1.4 — Composant `<Segment>` (contrôle segmenté/pills unifié)
**Files:** Create `components/ui/Segment.tsx`

- [ ] **Step 1 : créer le composant** (actif teinté lime, jamais blanc-sur-lime plein)
```tsx
'use client';
interface SegmentOption<T extends string> { id: T; label: React.ReactNode; }
export default function Segment<T extends string>({
  options, value, onChange, size = 'md', className = '',
}: {
  options: SegmentOption<T>[]; value: T; onChange: (v: T) => void;
  size?: 'sm' | 'md'; className?: string;
}) {
  const pad = size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs';
  return (
    <div
      className={`inline-flex items-center gap-1 p-0.5 rounded-lg ${className}`}
      style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)' }}
      role="tablist"
    >
      {options.map(o => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={`press-fb rounded-md font-medium transition-colors ${pad}`}
            style={active
              ? { background: 'rgb(var(--primary-rgb) / 0.12)', color: 'var(--primary-light)', boxShadow: 'inset 0 0 0 1px rgb(var(--primary-rgb) / 0.25)' }
              : { color: 'var(--text-muted)' }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
```
- [ ] **Step 2 : vérifier** `npx tsc --noEmit`. **Commit** — `feat(ui): shared Segment control (tinted active, no white-on-lime)`

### Task 1.5 — (D1) Unifier la teinte lime
**Files:** Modify `stores/useUIThemeStore.ts` (thème `senzoukria`) **OU** `app/globals.css` (`:root`) selon la décision.

- [ ] **Step 1 : appliquer la décision D1.** Recommandé (#4ade80 canonique) : dans `useUIThemeStore.ts`, thème `senzoukria`, remplacer `primary: '#7ed321'` → `'#4ade80'`, et ajuster `primaryLight`/`primaryDark`/`preview.primary` cohérents (#86efac / #22c55e). Vérifier qu'aucun `#7ed321` littéral ne subsiste (`rg "#7ed321"`).
- [ ] **Step 2 : vérifier** — `npm run dev`, thème SENZOUKRIA : UN seul vert partout, plus de flash deux-verts. **Commit.**

**✅ Checkpoint Phase 1.**

---

# PHASE 2 — P1 · Purge des couleurs hardcodées (les 8 modules)

> Le défaut n°1 (présent 8/8). Chrome → tokens ; data canvas → `themeColor()`/`pnlColor()` ; bannir les 4 accents parasites.

**Règle de transformation (mapping) :**
| Hardcode | → |
|---|---|
| `#22c55e` `#10b981` `#34d399` (verts) | `var(--bull)` (JSX) / `themeColor('--bull')` (canvas) |
| `#ef4444` `#f87171` (rouges) | `var(--bear)` / `themeColor('--bear')` |
| `#fbbf24` `#eab308` (ambre) | `var(--warning')` |
| `#3b82f6` `#6366f1` `#a78bfa` `#26beaf` (parasites) | `var(--accent)` (teal) si neutre/spot, `var(--primary)` si actif |
| `var(--font-mono, monospace)` / `SF Mono`/`Menlo`/`Consolas` | `var(--font-jetbrains-mono)` |

### Task 2.1 — /live (le pire offender : 141 hardcodes)
**Files:** `components/live/DOMladder.tsx`, `components/live/LiveTape.tsx`, `components/live/ConnectionStatus.tsx`, `components/trading/QuickTradeBar.tsx`, `components/pages/LivePageContent.tsx`, `components/charts/LiveChartPro/index.tsx`
- [ ] Appliquer le mapping. Le bid du DOM/Tape → `var(--bull)` (option : `var(--primary)` pour imposer le lime énergie côté bid — choix d'AD, défaut `--bull`). Boutons actifs `var(--primary)`+`#fff` → texte via contraste (`#06140b` sur lime). `<canvas>` : router les couleurs via `themeColor()`.
- [ ] **Acceptance :** `rg "#22c55e|#ef4444|#10b981|#34d399|var\(--font-mono" components/live components/charts/LiveChartPro components/trading/QuickTradeBar.tsx` → vide. tsc+lint. **Commit.**

### Task 2.2 → 2.8 — /flow, /footprint, /gex, /volatility, /trading, /journal, /ai
- [ ] Même mapping, un commit par module. Fichiers : les `components/pages/*PageContent.tsx` + sous-composants de chaque module (glob `components/{flow,footprint,gex,volatility,trading,journal,ai}/**` ou les composants importés). Pour /trading : `components/trading/dashboard/*` (déjà partiellement tokenisé — purger les `#`). Pour /ai : inclure le bannissement indigo de `UserTesterPage` (voir aussi P2).
- [ ] **Acceptance par module :** `rg "<les hex du mapping>" <fichiers du module>` → vide. tsc+lint. **Commit par module.**

**✅ Checkpoint Phase 2 :** `rg "#3b82f6|#6366f1|#a78bfa|#26beaf"` sur `components/` (hors landing/desktop) ≈ vide.

---

# PHASE 3 — P2 · Re-thémer les 3 pièces 100% hors-marque

### Task 3.1 — UserTesterPage (indigo → marque)
**Files:** `components/ai/UserTesterPage.tsx` (+ ses sous-composants)
- [ ] `#6366f1`/indigo + fonds `#0a0a0f`/`text-white` → tokens (lime actif, teal neutre, `--background`/`--text-*`). **Acceptance :** `rg "#6366f1|indigo|#0a0a0f|text-white\b" components/ai/UserTesterPage.tsx` → vide. **Commit.**

### Task 3.2 — IVTermStructure + IVSurface3D (palette codée en dur → theme-aware)
**Files:** `components/volatility/IVTermStructure.tsx`, `components/volatility/IVSurface3D.tsx` (chemins à confirmer par glob)
- [ ] Créer un hook/objet `useSmileColors()` (lit `themeColor()`), router le canvas dessus ; fond `#0a0a0a`→`var(--background)`, bleu Tailwind→`var(--accent)`. Badge `SIMULATED` si données générées. **Acceptance :** `rg "#0a0a0a|#3b82f6|rgba\(.*Tailwind" <fichiers>` → vide. **Commit.**

### Task 3.3 — OptionsFlowPanel (#3b82f6 → teal/lime)
**Files:** `components/gex/OptionsFlowPanel.tsx` (ou /flow)
- [ ] `#3b82f6` → `var(--accent)` (neutre) / `var(--primary)` (actif). **Commit.**

---

# PHASE 4 — P3 · Iconographie lucide + éradication emojis

### Task 4.1 → 4.7 — par module
**Files:** chrome de chaque module (toolbars, headers, tabs, status bars).
- [ ] Remplacer **tous** les emojis (🔊⚙✓🏆🐍⚡🟢📊📈📉🗺🔬) par des icônes `lucide-react` (`Volume2/Settings/Check/Award/...`), **tous** les glyphes Unicode (`▼`→`<ChevronDown>`, `↑↓`→`<ArrowUp/Down>`). strokeWidth **1.5** constant, tailles **14/16/20px**, `currentColor`. Réutiliser/étendre `components/ui/nav-icons.tsx`.
- [ ] **Acceptance par module :** garde anti-emoji `rg` (cf. commandes) → vide. **Commit par module.**

---

# PHASE 5 — P4 · `.panel-glass` généralisée

### Task 5.1 → 5.8 — par module
- [ ] Appliquer `.panel-glass` aux **headers / footers / cartes / toolbars** (remplacer les `background: var(--surface)` plats). Carte héro de chaque module (equity, BIAS, walls, Net GEX) → `.panel-glass-hero` (under-glow lime). **Acceptance :** visuel — les panneaux ont de la profondeur/verre. tsc+lint. **Commit par module.**

---

# PHASE 6 — P5 · Voix typographique (Fraunces + mono explicite)

### Task 6.1 → 6.8 — par module
- [ ] Titres de section + **hero-numbers** (BIAS, Net GEX, P&L total, walls, symbole) → `font-display` (Fraunces ~15-18px). Toute la **data** `tabular-nums` + eyebrows UPPERCASE → `var(--font-jetbrains-mono)` **explicite** (DOM + canvas ; bannir `SF Mono/Menlo/Consolas/system-ui`). **Acceptance :** `rg "SF Mono|Menlo|Consolas|var\(--font-mono" <module>` → vide ; au moins 1 `font-display` ancré. **Commit.**

---

# PHASE 7 — P6 · Aération (l'objectif n°1)

### Task 7.1 — Plancher de tailles + hauteurs (transverse)
- [ ] Remonter : data ≥11-12px, labels ≥12px, 8-10px réservé aux eyebrows mono seuls. Hauteurs : rangées DOM 26-28px, Tape 24px, headers 40-44px (`gap-2`). Utiliser l'échelle `--space-*`. **Acceptance :** plus de `text-[8px]`/`text-[9px]` sauf eyebrows. **Commit par module.**
### Task 7.2 — Groupement + dégraissage des sélecteurs
- [ ] Métriques en cartes glass collapsibles (section `Advanced` repliée). Rangées de 14 pills → dropdown/search compact. Charts en `flex-1` + `ResizeObserver` (fin des `height=420` figés). **Commit.**
### Task 7.3 — Toggle densité Confort/Compact (D2)
- [ ] Store `useDensityStore` (persisté) + classe racine `.density-compact` qui réduit les `--space-*`/tailles. Toggle dans le topbar app. **Commit.**

---

# PHASE 8 — P7 · Design-system de contrôles

### Task 8.1 — Généraliser `<Segment>` + un `<Button>` de chrome
- [ ] Remplacer les tabs/pills/segmented ad hoc des modules par `<Segment>` (Task 1.4). Les 3 `+ New` divergents de /journal → un seul pattern. **Commit.**
### Task 8.2 — Boutons BUY/SELL sculptés
- [ ] BUY = gradient lime + inset highlight + état `armed/hover` ; SELL = `var(--error)`. Contraste via `useAutoContrast`. **Commit.**

---

# PHASE 9 — P8 · Couche motion (le facteur addictif)

### Task 9.1 — Interpolation des redraws canvas
**Files:** Create `lib/ui/lerp.ts`
```ts
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Anime une valeur vers `target` sur ~durMs via rAF ; renvoie un cancel. */
export function animateValue(from: number, to: number, durMs: number, onTick: (v: number) => void): () => void {
  let raf = 0; const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / durMs);
    const eased = 1 - Math.pow(1 - t, 3);
    onTick(lerp(from, to, eased));
    if (t < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
```
- [ ] Appliquer aux redraws de barres (GEX walls, DOM, IV) : lerp ~200ms au lieu du flash sec. Respecter reduced-motion. **Commit.**
### Task 9.2 — Flux vivant DOM/Tape + valeurs
- [ ] `.value-flash` sur les chiffres qui changent ; `.flash-bull/bear` sur update bid/ask DOM/Tape ; pulse lime sur lignes whale / walls < 0.3% du spot. Cross-fade 150ms sur switch vue/greek/onglet. **Commit.**
### Task 9.3 — Charts journal : crosshair + tooltip + skeletons fidèles
- [ ] Crosshair + tooltip + animation d'entrée sur les charts journal. Remplacer le `ChartSkeleton` chandeliers de /gex par un skeleton barres horizontales. **Commit.**

---

# PHASE 10 — P9 · Dégraisser le chrome redondant

### Task 10.1 — Fusionner les doubles toolbars
- [ ] /footprint : fusionner `ChartPageShell` + header interne en UNE barre. /gex : fusionner header global + toolbar chart. Spot/greek affiché 1× (pas 2-3). **Commit.**
### Task 10.2 — Aide en tooltips + hiérarchie de plans
- [ ] Retirer l'aide permanente des footers (`Drag: Pan | Scroll: Zoom…`) → tooltips/onboarding. Hiérarchie 3 plans (héro élevé > secondaire > tables). Cacher 80% des options derrière kebab/overflow. **Commit.**

---

# PHASE 11 — P10 · Unifier la qualité de viz

### Task 11.1 — /flow vue Chart en vrai canvas
- [ ] Remplacer les divs HTML de la vue Chart par un canvas (réutiliser `NetFlowChart`/`OptionsFlowPanel`). **Commit.**
### Task 11.2 — Lisibilité heatmap + badges données simulées
- [ ] Heatmap : texte `var(--text-primary)` sur cellule colorée (contraste). Badge `SIMULATED` explicite (IVSurface3D, données générées). **Commit.**

---

## Self-review (couverture vs audit)
- ✅ P1 hardcodes → Phase 2 (+ helper Task 1.1). ✅ P2 pièces hors-marque → Phase 3. ✅ P3 icônes/emojis → Phase 4. ✅ P4 verre → Phase 5 (+ Task 1.3). ✅ P5 typo → Phase 6. ✅ P6 aération → Phase 7. ✅ P7 contrôles → Phase 8 (+ Task 1.4). ✅ P8 motion → Phase 9 (+ Task 1.3, 9.1). ✅ P9 chrome → Phase 10. ✅ P10 viz → Phase 11.
- ✅ Thème/couleur bicolore → Phase 2 + Task 1.5. ✅ Cohérence canvas → themeColors.ts.
- Décisions ouvertes : D1 (teinte lime — BLOQUANT), D2 (densité), D3 (périmètre).

## Ordre d'exécution recommandé
**Phase 1 (fondations) → P1 → P2 → P3 → P4 → P5** (les 5 passes high/M = le plus gros saut de qualité pour effort mécanique) → checkpoint/livraison → **P6 → P7 → P8 → P9 → P10** (aération + motion + finition = le différenciateur premium).

Chaque fin de phase = état cohérent et buildable, livrable.
