# SENZOUKRIA Brand Identity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter l'identité visuelle SENZOUKRIA validée (logo atome `Sz` + logotype « senz⊛ukria » néon, typo Fraunces, navbar verre, hero à fond orbital) sur le site web Next.js.

**Architecture :** Des primitives de marque réutilisables dans `components/ui/brand/` (defs SVG partagées, mark, logotype, lockup), pilotées par des tokens CSS dans `app/globals.css` et des animations dans `styles/brand.css` (toutes désactivables via `prefers-reduced-motion`). La landing (`LandingNav`, `HeroSection` + `HeroBackground`) consomme ces primitives. Les assets statiques (favicon/OG/manifest) sont régénérés.

**Tech Stack :** Next.js 15 (App Router), React 19, TypeScript strict, `next/font/google` (Fraunces), CSS variables, SVG inline + CSS `offset-path`. Tests : Vitest (node env, `__tests__/**/*.test.ts`).

**Source de vérité visuelle :** `docs/brand/senzoukria-logo-final.html` (maquette validée à 100% — porter fidèlement). **Différence assumée vs maquette :** les animations SMIL (`animateMotion`) de la maquette sont réimplémentées en **CSS** (`offset-path`, `@keyframes`) pour respecter `prefers-reduced-motion`.

**Spec :** `docs/superpowers/specs/2026-06-06-senzoukria-brand-identity-design.md`

---

## File Structure

| Fichier | Rôle |
|---|---|
| `app/layout.tsx` (modif) | charge Fraunces via `next/font/google`, ajoute `--font-fraunces` au `<body>` |
| `app/globals.css` (modif) | tokens : `--font-fraunces`, `--stone`, vars motion de marque ; `@import "../styles/brand.css"` |
| `styles/brand.css` (créer) | keyframes de marque (electron offset-path, charge, twinkle, aurora, atom-spin, blink) + `prefers-reduced-motion` |
| `components/ui/brand/BrandDefs.tsx` (créer) | `<svg>` caché avec `<defs>` partagés (gradients + filtre `#neon` + `#szGlow`) — monté 1× |
| `components/ui/brand/LogoMark.tsx` (créer) | jeton atome `Sz` (variants default/mono/stone/light, tailles) |
| `components/ui/brand/Logotype.tsx` (créer) | logotype « senz⊛ukria » (o = atome néon) |
| `components/ui/brand/Lockup.tsx` (créer) | mark + wordmark `SENZOUKRIA` + descripteur (display) |
| `components/ui/brand/logoVariants.ts` (créer) | helper pur : variant → couleurs (testable node) |
| `components/ui/brand/index.ts` (créer) | ré-exports |
| `components/ui/Logo.tsx` (modif) | ré-export rétro-compat (default = Lockup) |
| `__tests__/brand/logoVariants.test.ts` (créer) | test unitaire du helper |
| `styles/landing-animations.css` (modif `:31-76`) | `.landing-btn-primary`/`.landing-btn-ghost` → glassmorphism |
| `components/landing/LandingNav.tsx` (modif) | pill flottante verre + Logotype + liens centrés |
| `components/landing/HeroBackground.tsx` (créer) | aurora + atome orbital + particules + grille + grain + vignette + fondu |
| `components/landing/HeroSection.tsx` (modif) | H1 piste A + scène produit + HeroBackground |
| `app/icon.svg` (créer) | favicon statique (mark `Sz`, paths vectorisés) |
| `app/manifest.ts` (modif) | `theme_color` lime + nom |
| `app/opengraph-image.tsx` / `app/twitter-image.tsx` (modif) | OG aux couleurs de marque |

---

## Phase 0 — Branche

### Task 0: Créer la branche de travail

**Files:** —

- [ ] **Step 1: Brancher depuis l'état courant**

Run:
```bash
git checkout -b feat/senzoukria-brand-identity
```
Expected: `Switched to a new branch 'feat/senzoukria-brand-identity'`

> Note : le working tree a déjà des modifs non commitées (heatmap). Ne pas les committer dans ce lot — ne `git add` que les fichiers listés dans chaque task.

---

## Phase 1 — Fondation de marque

### Task 1: Fonts + tokens

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`
- Create: `styles/brand.css`

- [ ] **Step 1: Charger Fraunces dans `layout.tsx`**

Ajouter l'import après la ligne `import { JetBrains_Mono } from 'next/font/google';` :
```tsx
import { Fraunces } from 'next/font/google';
```
Ajouter l'instanciation après le bloc `jetbrainsMono = JetBrains_Mono({...})` :
```tsx
// Display serif — wordmark + H1/H2 marketing (Editorial premium).
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-fraunces',
  display: 'swap',
});
```
Modifier la `className` du `<body>` pour ajouter `${fraunces.variable}` :
```tsx
className={`${GeistSans.variable} ${GeistMono.variable} ${jetbrainsMono.variable} ${fraunces.variable} font-sans`}
```

- [ ] **Step 2: Ajouter tokens dans `app/globals.css`**

Dans le bloc `:root { ... }`, après la ligne `--text-dimmed: #333650;` ajouter :
```css
  /* === STONE (neutre pétrifié — clin d'œil Dr.Stone) === */
  --stone: #cfd2df;
  --stone-dim: #9aa0b5;

  /* === FONTS === */
  --font-fraunces: 'Fraunces', serif;

  /* === MOTION DE MARQUE === */
  --brand-spin: 70s;      /* rotation atome de fond */
  --brand-charge: 3.6s;   /* anneau de charge */
  --brand-orbit: 6s;      /* électron du logotype */
```
> `--font-jetbrains-mono` et les vars Geist existent déjà via `next/font`. `--font-fraunces` est fourni par `next/font` ci-dessus ; ce fallback CSS sert au cas où.

- [ ] **Step 3: Importer brand.css**

En haut de `app/globals.css`, après `@import "../styles/landing-animations.css";` ajouter :
```css
@import "../styles/brand.css";
```

- [ ] **Step 4: Créer `styles/brand.css`**

```css
/* ============================================================
   SENZOUKRIA — animations de marque
   Toutes désactivées sous prefers-reduced-motion.
   ============================================================ */

/* électron du logotype (o-atome) : suit l'ellipse via offset-path */
@keyframes brand-electron { to { offset-distance: 100%; } }

/* anneau de charge d'énergie (stroke-dashoffset) */
@keyframes brand-charge {
  0%   { stroke-dashoffset: 283; opacity: .08; }
  50%  { stroke-dashoffset: 0;   opacity: .85; }
  100% { stroke-dashoffset: -283; opacity: .08; }
}

/* atome de fond du hero : rotation lente */
@keyframes brand-atom-spin { to { transform: rotate(360deg); } }

/* aurora : dérive lente */
@keyframes brand-aurora {
  0%   { transform: translate(-14px, 0)   scale(1); }
  100% { transform: translate(18px, 14px) scale(1.07); }
}

/* particules (électrons de fond) : scintillement */
@keyframes brand-twinkle { from { opacity: .06; } to { opacity: .45; } }

/* curseur terminal (réservé si besoin) */
@keyframes brand-blink { 0%,55% { opacity: 1; } 56%,100% { opacity: 0; } }

@media (prefers-reduced-motion: reduce) {
  .brand-anim,
  .brand-anim * { animation: none !important; }
}
```

- [ ] **Step 5: Vérifier le build**

Run: `npm run build`
Expected: build OK, aucune erreur de type/CSS.

- [ ] **Step 6: Commit**

```bash
git add app/layout.tsx app/globals.css styles/brand.css
git commit -m "feat(brand): add Fraunces font + brand tokens + brand.css animations"
```

---

### Task 2: BrandDefs (defs SVG partagées)

**Files:**
- Create: `components/ui/brand/BrandDefs.tsx`
- Modify: `app/layout.tsx` (monter `<BrandDefs/>` 1×)

- [ ] **Step 1: Créer le composant**

```tsx
// components/ui/brand/BrandDefs.tsx
/**
 * Defs SVG partagées par tous les composants de marque.
 * Monté UNE seule fois (layout). Les ids (#szFill, #szEdge, #szCharge,
 * #szGlow, #neon) sont référencés par url(#id) depuis les autres SVG.
 */
export default function BrandDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
      <defs>
        <radialGradient id="szFill" cx="30%" cy="16%" r="85%">
          <stop offset="0%" stopColor="#4ade80" stopOpacity=".12" />
          <stop offset="42%" stopColor="#fff" stopOpacity=".018" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="szEdge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity=".22" />
          <stop offset="100%" stopColor="#fff" stopOpacity=".05" />
        </linearGradient>
        <linearGradient id="szCharge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#86efac" />
          <stop offset="100%" stopColor="#22c55e" />
        </linearGradient>
        <filter id="szGlow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="neon" x="-150%" y="-150%" width="400%" height="400%">
          <feGaussianBlur stdDeviation="1.2" result="n1" />
          <feGaussianBlur stdDeviation="2.8" result="n2" />
          <feMerge><feMergeNode in="n2" /><feMergeNode in="n1" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
    </svg>
  );
}
```

- [ ] **Step 2: Monter dans `layout.tsx`**

Dans `app/layout.tsx`, importer en haut :
```tsx
import BrandDefs from '@/components/ui/brand/BrandDefs';
```
Et juste après l'ouverture de `<body ...>` (avant `<SessionProviderWrapper>`), ajouter :
```tsx
<BrandDefs />
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: OK.

- [ ] **Step 4: Commit**

```bash
git add components/ui/brand/BrandDefs.tsx app/layout.tsx
git commit -m "feat(brand): shared SVG defs (gradients + neon/glow filters)"
```

---

### Task 3: LogoMark (jeton atome Sz) + helper testé

**Files:**
- Create: `components/ui/brand/logoVariants.ts`
- Create: `__tests__/brand/logoVariants.test.ts`
- Create: `components/ui/brand/LogoMark.tsx`

- [ ] **Step 1: Écrire le test du helper (échoue)**

```ts
// __tests__/brand/logoVariants.test.ts
import { describe, it, expect } from 'vitest';
import { resolveMarkColors } from '@/components/ui/brand/logoVariants';

describe('resolveMarkColors', () => {
  it('default = jeton sombre, accent lime', () => {
    const c = resolveMarkColors('default');
    expect(c.symbol).toBe('#e8eaf6');
    expect(c.electron).toBe('#4ade80');
  });
  it('mono = tout blanc cassé, pas de lime', () => {
    const c = resolveMarkColors('mono');
    expect(c.symbol).toBe('#e8eaf6');
    expect(c.electron).toBe('#e8eaf6');
  });
  it('light = symbole sombre sur fond clair', () => {
    expect(resolveMarkColors('light').symbol).toBe('#0a0c16');
  });
  it('stone = gris pierre', () => {
    expect(resolveMarkColors('stone').symbol).toBe('#cfd2df');
  });
});
```

- [ ] **Step 2: Lancer — échoue**

Run: `npm test -- logoVariants`
Expected: FAIL (`resolveMarkColors` introuvable).

- [ ] **Step 3: Implémenter le helper**

```ts
// components/ui/brand/logoVariants.ts
export type MarkVariant = 'default' | 'mono' | 'stone' | 'light';

export interface MarkColors {
  fill: string;   // remplissage jeton
  edge: string;   // bord jeton
  symbol: string; // "Sz" + "79"
  electron: string;
}

export function resolveMarkColors(v: MarkVariant): MarkColors {
  switch (v) {
    case 'mono':
      return { fill: 'rgba(255,255,255,.02)', edge: 'rgba(255,255,255,.14)', symbol: '#e8eaf6', electron: '#e8eaf6' };
    case 'stone':
      return { fill: 'rgba(255,255,255,.02)', edge: 'rgba(255,255,255,.16)', symbol: '#cfd2df', electron: '#cfd2df' };
    case 'light':
      return { fill: 'rgba(7,8,15,.04)', edge: 'rgba(7,8,15,.18)', symbol: '#0a0c16', electron: '#22c55e' };
    case 'default':
    default:
      return { fill: 'url(#szFill)', edge: 'url(#szEdge)', symbol: '#e8eaf6', electron: '#4ade80' };
  }
}
```

- [ ] **Step 4: Lancer — passe**

Run: `npm test -- logoVariants`
Expected: PASS (4 tests).

- [ ] **Step 5: Implémenter `LogoMark.tsx`**

Porter le mark « full » et « min » depuis `docs/brand/senzoukria-logo-final.html` (fonction `markSVG`). Animations en CSS (pas SMIL) : l'électron suit l'ellipse via `offset-path`, l'anneau de charge via `brand-charge`.

```tsx
// components/ui/brand/LogoMark.tsx
'use client';
import { resolveMarkColors, type MarkVariant } from './logoVariants';

interface LogoMarkProps {
  size?: number;          // px
  variant?: MarkVariant;
  reduced?: boolean;      // forme réduite (≤32px) : Sz seul
  animated?: boolean;     // orbite + charge
  className?: string;
}

// ellipse de Bohr (rx44 ry17, centre 50,50) — MÊME tracé pour la ligne visible ET l'offset-path de l'électron
const ORBIT_PATH = 'M6,50 a44,17 0 1,0 88,0 a44,17 0 1,0 -88,0';

export default function LogoMark({
  size = 48, variant = 'default', reduced = false, animated = true, className,
}: LogoMarkProps) {
  const c = resolveMarkColors(variant);
  const showAtom = !reduced;
  return (
    <svg
      width={size} height={size} viewBox="0 0 100 100"
      className={`${animated ? 'brand-anim ' : ''}${className ?? ''}`}
      role="img" aria-label="Senzoukria"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="50" cy="50" r="45" fill={c.fill} stroke={c.edge} strokeWidth="1.3" />

      {showAtom && (
        <>
          {/* orbite (tracé visible, incliné -26°) — MÊME path que l'offset-path de l'électron */}
          <g transform="rotate(-26 50 50)">
            <path d={ORBIT_PATH}
                  fill="none" stroke={c.electron} strokeOpacity=".16" strokeWidth="1" />
          </g>
          {/* électron : positionné en (50,50), translaté le long de l'ellipse via offset-path */}
          <circle
            r={reduced ? 2 : 2.6} cx="50" cy="50" fill={c.electron}
            filter="url(#szGlow)"
            style={animated ? {
              offsetPath: `path('${ORBIT_PATH}')`,
              offsetRotate: '0deg',
              transform: 'rotate(-26deg)',
              transformOrigin: '50px 50px',
              animation: `brand-electron var(--brand-orbit) linear infinite`,
            } : undefined}
          />
          {/* anneau de charge */}
          {animated && (
            <circle cx="50" cy="50" r="45" fill="none" stroke="url(#szCharge)"
                    strokeWidth="1.4" strokeLinecap="round" strokeDasharray="283"
                    strokeDashoffset="283" transform="rotate(-90 50 50)" opacity="0"
                    style={{ animation: `brand-charge var(--brand-charge) ease-in-out infinite` }} />
          )}
          {/* numéro atomique */}
          <text x="50" y="33" textAnchor="middle" fontFamily="var(--font-jetbrains-mono)"
                fontSize="9.5" fontWeight={500} letterSpacing=".5" fill={c.electron} fillOpacity=".9">79</text>
        </>
      )}

      {/* symbole Sz */}
      <text x="50.5" y={showAtom ? 62 : 64.5} textAnchor="middle" fontFamily="var(--font-fraunces)"
            fontSize={showAtom ? 34 : 47} fontWeight={showAtom ? 600 : 700}
            letterSpacing={showAtom ? -1.2 : -1.6} fill={c.symbol}>Sz</text>
    </svg>
  );
}
```
> **Note offset-path :** le `transform: rotate(-26deg)` incline le plan de l'électron pour matcher l'orbite. Vérifier visuellement à l'étape 7 ; si l'électron ne suit pas l'ellipse, fournir le tracé déjà incliné dans `offsetPath` et retirer le `transform`.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: OK.

- [ ] **Step 7: Vérif visuelle**

Run: `npm run dev` puis ouvrir une page de test ou la landing après Task 7. Comparer le mark à `docs/brand/senzoukria-logo-final.html` §02 (jeton 64/112, variantes mono/stone/light, réduit 32/16). L'électron orbite, le `Sz` est centré.

- [ ] **Step 8: Commit**

```bash
git add components/ui/brand/logoVariants.ts __tests__/brand/logoVariants.test.ts components/ui/brand/LogoMark.tsx
git commit -m "feat(brand): LogoMark atom token (variants + CSS orbit/charge) + tested variant helper"
```

---

### Task 4: Logotype (« senz⊛ukria », o = atome néon)

**Files:**
- Create: `components/ui/brand/Logotype.tsx`

- [ ] **Step 1: Implémenter**

Porter le « o »-atome néon validé (maquette §05 / navbar live) : anneau « o » blanc monoline + orbite/électron en néon lime (filtre `#neon`), électron animé via `offset-path`.

```tsx
// components/ui/brand/Logotype.tsx
'use client';

interface LogotypeProps {
  /** hauteur de police en px */
  fontSize?: number;
  animated?: boolean;
  className?: string;
}

// ellipse de l'orbite intérieure du o-atome (viewBox 40)
const O_ORBIT = 'M3,20 a17,6 0 1,0 34,0 a17,6 0 1,0 -34,0';

export default function Logotype({ fontSize = 19, animated = true, className }: LogotypeProps) {
  return (
    <span
      className={className}
      style={{
        fontFamily: 'var(--font-fraunces)', fontWeight: 600, fontSize,
        letterSpacing: '-.01em', color: 'var(--text-primary)',
        display: 'inline-flex', alignItems: 'baseline', lineHeight: 1,
      }}
      aria-label="senzoukria"
    >
      senz
      <span
        className={animated ? 'brand-anim' : undefined}
        style={{ display: 'inline-block', width: '.62em', height: '.62em', transform: 'translateY(.06em)', margin: '0 .02em' }}
        aria-hidden="true"
      >
        <svg viewBox="0 0 40 40" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          {/* "o" lettre, blanc/monoline */}
          <circle cx="20" cy="20" r="15.5" fill="none" stroke="currentColor" strokeWidth="3" />
          {/* atome néon : orbite + électron, glow via #neon */}
          <g filter="url(#neon)">
            <g transform="rotate(-26 20 20)">
              <ellipse cx="20" cy="20" rx="17" ry="6" fill="none" stroke="#4ade80" strokeOpacity=".9" strokeWidth="1.5" />
            </g>
            <circle
              r="2.4" cx="20" cy="20" fill="#86efac"
              style={animated ? {
                offsetPath: `path('${O_ORBIT}')`,
                transform: 'rotate(-26deg)', transformOrigin: '20px 20px',
                animation: 'brand-electron var(--brand-orbit) linear infinite',
              } : undefined}
            />
          </g>
        </svg>
      </span>
      ukria
    </span>
  );
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: OK.

- [ ] **Step 3: Commit**

```bash
git add components/ui/brand/Logotype.tsx
git commit -m "feat(brand): Logotype senzoukria with neon atom 'o'"
```

---

### Task 5: Lockup + ré-export rétro-compat

**Files:**
- Create: `components/ui/brand/Lockup.tsx`
- Create: `components/ui/brand/index.ts`
- Modify: `components/ui/Logo.tsx`

- [ ] **Step 1: Lockup**

```tsx
// components/ui/brand/Lockup.tsx
'use client';
import LogoMark from './LogoMark';

interface LockupProps { markSize?: number; animated?: boolean; showDescriptor?: boolean; }

export default function Lockup({ markSize = 44, animated = true, showDescriptor = true }: LockupProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: markSize * 0.6 + 'px' }}>
      <LogoMark size={markSize} animated={animated} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontFamily: 'var(--font-fraunces)', fontWeight: 600, fontSize: markSize * 0.8, lineHeight: .94, letterSpacing: '-.015em', color: 'var(--text-primary)' }}>
          SENZOUKRIA
        </span>
        {showDescriptor && (
          <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '.28em', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: 6 }}>
            The Science of Orderflow
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: index.ts**

```ts
// components/ui/brand/index.ts
export { default as LogoMark } from './LogoMark';
export { default as Logotype } from './Logotype';
export { default as Lockup } from './Lockup';
export { default as BrandDefs } from './BrandDefs';
export * from './logoVariants';
```

- [ ] **Step 3: Rétro-compat `Logo.tsx`**

Remplacer tout le contenu de `components/ui/Logo.tsx` par :
```tsx
'use client';
import Lockup from '@/components/ui/brand/Lockup';
import LogoMark from '@/components/ui/brand/LogoMark';

interface LogoProps { size?: 'sm' | 'md' | 'lg'; showText?: boolean; animated?: boolean; }
const MARK = { sm: 28, md: 36, lg: 48 } as const;

/** Rétro-compat : `Logo` = lockup mark+wordmark ; `showText={false}` = mark seul. */
export default function Logo({ size = 'md', showText = true, animated = true }: LogoProps) {
  if (!showText) return <LogoMark size={MARK[size]} animated={animated} />;
  return <Lockup markSize={MARK[size]} animated={animated} showDescriptor={size !== 'sm'} />;
}

export { LogoMark as LogoIcon };
```
> Vérifie que `LandingFooter.tsx` et `DashboardClientLayout.tsx` (qui importent `Logo`) rendent toujours correctement (props inchangées).

- [ ] **Step 4: Build + test**

Run: `npm run build && npm test`
Expected: build OK, tests verts.

- [ ] **Step 5: Commit**

```bash
git add components/ui/brand/Lockup.tsx components/ui/brand/index.ts components/ui/Logo.tsx
git commit -m "feat(brand): Lockup + backward-compatible Logo re-export"
```

---

## Phase 2 — Application landing

### Task 6: Boutons glassmorphism (DRY)

**Files:**
- Modify: `styles/landing-animations.css:31-76`

- [ ] **Step 1: Remplacer les 4 règles boutons**

Remplacer le bloc `.landing-btn-primary { ... } ... .landing-btn-ghost:hover { ... }` (lignes 31-76) par :
```css
.landing-btn-primary, .landing-btn-ghost {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 12px 22px; font-size: 13px; font-weight: 600;
  letter-spacing: 0.01em; border-radius: 11px; text-decoration: none;
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  transition: all 0.2s ease;
}
.landing-btn-primary {
  color: var(--primary-light, #86efac);
  background: rgba(74, 222, 128, 0.09);
  border: 1px solid rgba(74, 222, 128, 0.30);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.10), 0 8px 26px rgba(74,222,128,0.16);
}
.landing-btn-primary:hover {
  background: rgba(74, 222, 128, 0.14);
  border-color: rgba(74, 222, 128, 0.45);
  transform: translateY(-1px);
}
.landing-btn-ghost {
  color: var(--text-primary, #e8eaf6); font-weight: 500;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.13);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.07);
}
.landing-btn-ghost:hover {
  background: rgba(255,255,255,0.09);
  border-color: rgba(255,255,255,0.22);
  transform: translateY(-1px);
}
```

- [ ] **Step 2: Build + vérif visuelle**

Run: `npm run build`
Expected: OK. Vérifier hero/nav : boutons en verre (primaire teinté lime).

- [ ] **Step 3: Commit**

```bash
git add styles/landing-animations.css
git commit -m "style(brand): glassmorphism landing buttons (primary lime-tinted, ghost neutral)"
```

---

### Task 7: LandingNav — pill flottante verre

**Files:**
- Modify: `components/landing/LandingNav.tsx`

- [ ] **Step 1: Remplacer le logo + structure de la barre**

Conserver toute la logique scroll/active/mobile existante. Changements :
1. Import : remplacer `import Logo from '@/components/ui/Logo';` par `import Logotype from '@/components/ui/brand/Logotype';`.
2. Le `<Link href="/" ...>` du logo rend maintenant `<Logotype fontSize={20} />` au lieu de `<Logo ... />`.
3. La `<nav>` devient une **pill flottante** : remplacer le conteneur `fixed top-0 left-0 right-0 ...` + le `div max-w-7xl` par une pill centrée.

Remplacer le `return (...)` de la barre principale (hors dropdown mobile) par :
```tsx
<nav className="fixed top-0 left-0 right-0 z-[100] flex justify-center px-4 pt-4 pointer-events-none">
  <div
    className="pointer-events-auto w-full max-w-3xl flex items-center h-[54px] pl-[18px] pr-[10px] rounded-[15px] transition-all duration-300"
    style={{
      border: '1px solid rgba(255,255,255,.10)',
      background: scrolled ? 'rgba(13,15,27,.62)' : 'rgba(13,15,27,.42)',
      backdropFilter: 'blur(18px) saturate(150%)',
      WebkitBackdropFilter: 'blur(18px) saturate(150%)',
      boxShadow: '0 12px 36px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.07)',
    }}
  >
    {/* Brand */}
    <Link href="/" className="flex-shrink-0">
      <Logotype fontSize={20} />
    </Link>

    {/* Liens centrés */}
    <div className="hidden md:flex items-center gap-7 absolute left-1/2 -translate-x-1/2">
      {NAV_LINKS.map((link) => (
        <a
          key={link.label}
          href={link.href}
          onClick={(e) => handleLinkClick(e, link.href)}
          className="text-[13px] font-medium transition-colors"
          style={{ color: isActive(link.href) ? 'var(--text-primary)' : 'var(--text-secondary)' }}
        >
          {link.label}
        </a>
      ))}
    </div>

    {/* Actions */}
    <div className="flex items-center gap-3.5 ml-auto">
      {session ? (
        <Link href="/live" className="landing-btn-primary text-sm">Dashboard</Link>
      ) : (
        <>
          <Link href="/auth/login" className="hidden sm:block text-[13px] font-medium" style={{ color: 'var(--text-secondary)' }}>Sign in</Link>
          <Link href="/auth/register" className="landing-btn-primary text-sm">Get free preview</Link>
        </>
      )}
      {/* Hamburger mobile : conserver le <button> existant tel quel */}
    </div>
  </div>
</nav>
```
> Garder le `<button>` hamburger et le dropdown mobile existants (les déplacer dans la pill / sous la pill). Le dropdown mobile garde sa logique ; ajuster son positionnement sous la pill (`top-[72px]`).

- [ ] **Step 2: Build + vérif**

Run: `npm run build`
Expected: OK. Comparer à `docs/brand/senzoukria-logo-final.html` §03 (navbar). Liens centrés, logotype o-atome néon, CTA verre.

- [ ] **Step 3: Commit**

```bash
git add components/landing/LandingNav.tsx
git commit -m "feat(brand): floating glass navbar with atom-o logotype"
```

---

### Task 8: HeroBackground

**Files:**
- Create: `components/landing/HeroBackground.tsx`

- [ ] **Step 1: Implémenter** (porter le fond validé — maquette §03 `.bg-layers`)

```tsx
// components/landing/HeroBackground.tsx
'use client';
import { useMemo } from 'react';

/** électrons scintillants — positions déterministes (pas de Math.random au render SSR) */
const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  left: (i * 53) % 100, top: (i * 37) % 78,
  size: 1 + (i % 3) * 0.6, dur: 3 + (i % 5), delay: (i % 4),
}));

export default function HeroBackground() {
  const particles = useMemo(() => PARTICLES, []);
  return (
    <div className="brand-anim" aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
      {/* aurora */}
      <div style={{
        position: 'absolute', left: '50%', top: -260, width: 1300, height: 700, marginLeft: -650,
        background: 'radial-gradient(440px 300px at 32% 42%, rgba(74,222,128,.18), transparent 70%),radial-gradient(400px 280px at 66% 38%, rgba(45,212,191,.15), transparent 70%),radial-gradient(320px 240px at 50% 66%, rgba(34,197,94,.10), transparent 70%)',
        filter: 'blur(36px)', opacity: .85, animation: 'brand-aurora 24s ease-in-out infinite alternate',
      }} />
      {/* grille périodique atténuée */}
      <div style={{
        position: 'absolute', inset: 0, opacity: .22,
        backgroundImage: 'linear-gradient(rgba(255,255,255,.02) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.02) 1px,transparent 1px)',
        backgroundSize: '52px 52px',
        WebkitMaskImage: 'radial-gradient(680px 400px at 50% 24%, #000 22%, transparent 78%)',
        maskImage: 'radial-gradient(680px 400px at 50% 24%, #000 22%, transparent 78%)',
      }} />
      {/* atome orbital (3 ellipses + électrons qui orbitent) */}
      <div style={{ position: 'absolute', left: '50%', top: 46, transform: 'translateX(-50%)', width: 540, height: 540, opacity: .16 }}>
        <svg viewBox="0 0 200 200" width="100%" height="100%"
             style={{ transformOrigin: 'center', animation: 'brand-atom-spin var(--brand-spin) linear infinite' }}>
          {[0, 60, 120].map((rot, i) => (
            <g key={i} transform={`rotate(${rot} 100 100)`}>
              <ellipse cx="100" cy="100" rx="92" ry="33" fill="none"
                       stroke={i === 1 ? '#2dd4bf' : '#4ade80'} strokeOpacity={i === 0 ? .55 : .45} strokeWidth="1" />
              <circle r={i === 0 ? 2.6 : 2.4} cx="100" cy="100" fill={i === 1 ? '#2dd4bf' : '#4ade80'}
                      style={{ offsetPath: `path('M8,100 a92,33 0 1,0 184,0 a92,33 0 1,0 -184,0')`,
                               animation: `brand-electron ${[11, 15, 9][i]}s linear infinite` }} />
            </g>
          ))}
          <circle cx="100" cy="100" r="4" fill="#4ade80" opacity=".7" />
        </svg>
      </div>
      {/* halo de noyau */}
      <div style={{ position: 'absolute', left: '50%', top: 316, transform: 'translate(-50%,-50%)', width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, rgba(74,222,128,.10), transparent 62%)', filter: 'blur(16px)' }} />
      {/* particules */}
      {particles.map((p, i) => (
        <i key={i} style={{
          position: 'absolute', left: `${p.left}%`, top: `${p.top}%`, width: p.size, height: p.size,
          borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 4px rgba(74,222,128,.6)', opacity: .2,
          animation: `brand-twinkle ${p.dur}s ease-in-out ${p.delay}s infinite alternate`,
        } as React.CSSProperties} />
      ))}
      {/* grain */}
      <div style={{ position: 'absolute', inset: 0, opacity: .04, backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }} />
      {/* vignette + fondu bas + ligne d'énergie */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 92% at 50% 0%, transparent 50%, rgba(0,0,0,.55))' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 220, background: 'linear-gradient(to bottom, transparent, var(--background))' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg,transparent,rgba(74,222,128,.55),transparent)' }} />
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: OK.

- [ ] **Step 3: Commit**

```bash
git add components/landing/HeroBackground.tsx
git commit -m "feat(brand): hero orbital-atom background (aurora + electrons + nucleus glow)"
```

---

### Task 9: HeroSection — H1 piste A + scène produit

**Files:**
- Modify: `components/landing/HeroSection.tsx`

- [ ] **Step 1: Monter le fond + le titre piste A**

1. Importer en haut : `import HeroBackground from './HeroBackground';`.
2. Dans la `<section id="hero" ...>`, comme premier enfant, monter `<HeroBackground />` (z-index 0 déjà géré), et s'assurer que le contenu existant est au-dessus (`position: relative; z-index: 1`).
3. Remplacer le `<h1>` actuel (« Order / Flow » en JetBrains Mono) par le titre **piste A** Fraunces :
```tsx
<h1 style={{ fontFamily: 'var(--font-fraunces)', lineHeight: .93, letterSpacing: '-.042em', margin: 0 }}>
  <span className="block text-5xl md:text-7xl lg:text-[80px]" style={{ fontWeight: 400, color: 'var(--text-primary)' }}>
    The science of
  </span>
  <span className="block text-5xl md:text-7xl lg:text-[80px]" style={{ fontWeight: 600, fontStyle: 'italic', color: 'var(--primary)', textShadow: '0 0 42px rgba(74,222,128,.42)' }}>
    orderflow.
  </span>
</h1>
```
> Garder `AnimatedChars` si souhaité, mais piste A validée = pas d'effet par-caractère obligatoire ; conserver le `fadeInUp` du sous-titre/CTA existant.

- [ ] **Step 2: Scène produit (cartes flottantes)**

Le mock footprint existant (HEATMAP) peut rester, mais pour matcher la maquette validée, porter la **scène à 3 cartes flottantes** (Absorption / CVD sparkline / Σ Delta) + la fenêtre footprint pro depuis `docs/brand/senzoukria-logo-final.html` (`.scene`, `.float`, `.fpwin`). Réutiliser les classes/animations ; ajouter au besoin `.float`, `.fpwin` dans `styles/landing-animations.css`.

> Cette étape est un **port fidèle** de la maquette §03. Copier la structure `.scene > (.float.a/.b/.c + .fpwin + .underglow)` et les styles associés. Données footprint déterministes (pas de `Math.random` au SSR ; jitter live optionnel côté client via `useEffect`).

- [ ] **Step 3: Build + vérif visuelle**

Run: `npm run build`
Expected: OK. Comparer le hero rendu à la maquette §03 (titre, double CTA verre, ligne brokers, scène, fond orbital).

- [ ] **Step 4: Commit**

```bash
git add components/landing/HeroSection.tsx styles/landing-animations.css
git commit -m "feat(brand): hero piste A headline + layered product scene + orbital background"
```

---

## Phase 3 — Assets statiques

### Task 10: Favicon + manifest

**Files:**
- Create: `app/icon.svg`
- Modify: `app/manifest.ts`

- [ ] **Step 1: `app/icon.svg`** (statique, paths vectorisés — pas d'animation, `Sz` en path pour rendu sans font)

> Next.js sert `app/icon.svg` comme favicon automatiquement. Le `Sz` doit être **vectorisé** (le SVG ne charge pas Fraunces). Générer les paths du `Sz` (Fraunces 600) via un outil de vectorisation ou un sous-agent, puis :
```xml
<svg width="48" height="48" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <rect width="100" height="100" rx="22" fill="#07080f"/>
  <circle cx="50" cy="50" r="40" fill="none" stroke="#4ade80" stroke-opacity=".25" stroke-width="2"/>
  <!-- TODO(generate): paths vectorisés du "Sz" Fraunces 600, fill #e8eaf6, centrés -->
</svg>
```
> ⚠️ Le `Sz` vectorisé est requis (placeholder interdit en livraison). Étape dédiée : générer les glyph paths avant commit.

- [ ] **Step 2: `app/manifest.ts`** — aligner couleurs

Modifier :
```ts
background_color: '#07080f',
theme_color: '#4ade80',
```

- [ ] **Step 3: Build + vérif favicon**

Run: `npm run build` puis vérifier l'onglet (favicon net à 16/32px).

- [ ] **Step 4: Commit**

```bash
git add app/icon.svg app/manifest.ts
git commit -m "feat(brand): brand favicon + manifest colors"
```

---

### Task 11: OG / Twitter images

**Files:**
- Modify: `app/opengraph-image.tsx`
- Modify: `app/twitter-image.tsx`

- [ ] **Step 1: Mettre aux couleurs de marque**

Mettre à jour la composition `ImageResponse` (Satori) : fond `#07080f`, accent lime, wordmark `SENZOUKRIA`, tagline « The Science of Orderflow ».
> **Caveat Satori :** les polices custom (Fraunces) nécessitent de fetch le WOFF dans la route (`fetch` + `fonts:[{name,data}]`). Si trop coûteux, utiliser une police système/déjà bundlée pour l'OG et garder Fraunces uniquement à l'écran. Choix à acter à l'implémentation.

- [ ] **Step 2: Build + vérif**

Run: `npm run build` ; ouvrir `/opengraph-image` et `/twitter-image`.

- [ ] **Step 3: Commit**

```bash
git add app/opengraph-image.tsx app/twitter-image.tsx
git commit -m "feat(brand): brand OG + Twitter images"
```

---

## Phase 4 — Vérification finale

### Task 12: Build, lint, diff visuel

- [ ] **Step 1: Lint + build + tests**

Run: `npm run lint && npm run build && npm test`
Expected: 0 erreur, build OK, tests verts.

- [ ] **Step 2: Diff visuel page par page**

`npm run dev`, comparer la landing rendue à `docs/brand/senzoukria-logo-final.html` : §01 lockup, §02 icônes/favicon, §03 hero (navbar verre, titre piste A, scène, fond orbital). Vérifier `prefers-reduced-motion` (DevTools → Rendering → emulate) : orbites/aurora/particules coupées.

- [ ] **Step 3: Smoke perf**

Lighthouse sur la landing : pas de régression majeure (LCP, CLS — attention au `font-display: swap` de Fraunces).

- [ ] **Step 4: Commit final (si ajustements)**

```bash
git add -A
git commit -m "chore(brand): final polish + reduced-motion + perf verification"
```

---

## Notes d'implémentation

- **prefers-reduced-motion** : toute animation de marque vit sous `.brand-anim` → coupée par le bloc média de `brand.css`. Vérifier que chaque composant animé porte la classe.
- **offset-path** : si le rendu de l'électron dévie de l'ellipse, fournir le tracé pré-incliné dans `offsetPath` et retirer le `transform: rotate`.
- **YAGNI** : pas d'ajout de jsdom/RTL ; le seul test unitaire porte sur `logoVariants` (logique pure). Le reste = build + lint + diff visuel vs maquette.
- **Iconographie (spec §5)** : NON couverte par ce plan. La discipline `lucide` (stroke/taille tokenisés) + les ~6-10 icônes custom science forment un **lot de suivi** (cycle design dédié). Ce plan livre la marque (logo/typo/landing/assets) ; les icônes suivront.
- **Hors-périmètre** (spec §9) : pas de refonte palette, pas de set d'icônes complet, pas de répercussion desktop (lot ultérieur), pas de renommage domaine.
