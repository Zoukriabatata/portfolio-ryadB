# Brand Rollout — Propager l'identité SENZOUKRIA hors de la landing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Étendre le langage de design de la landing (Fraunces + glassmorphism + boutons de marque + chrome cohérent + micro-interactions fluides) à tout le reste du site, en commençant par les fondations partagées pour ne corriger qu'une fois ce qui se répète.

**Architecture :** On ne refait pas 40 pages à la main. On construit d'abord 3 leviers partagés (bouton tokenisé, classe typo display, chrome marketing partagé), on brande le shell in-app (vu sur 100 % des écrans), puis on applique ces primitives page par page en partant des plus cassées. Approche **cohérence d'abord, fluidité ensuite**.

**Tech Stack :** Next.js 15 (App Router), React 19, TypeScript strict, CSS custom-properties (design tokens) + Tailwind, Zustand (thème), `next/font` (Fraunces/Geist/JetBrains Mono).

**Référence de marque (source de vérité) :** `components/landing/HeroSection.tsx` + `docs/superpowers/specs/2026-06-06-senzoukria-brand-identity-design.md`. Audit complet à l'origine de ce plan : conversation du 2026-06-07.

---

## Décisions de cadrage (defaults retenus — corriger ici si besoin avant de démarrer)

- **D1 — Périmètre :** site web uniquement (`app/` + `components/`). L'app desktop Tauri (`desktop/`) = lot séparé, hors de ce plan.
- **D2 — Langue :** **anglais produit partout** (comme la landing). Toute copie FR résiduelle (auth, contact, download, academy, legal) repasse en EN. *(Exception possible : pages légales bilingues via le toggle FR/EN existant — voir Task 4.6.)*
- **D3 — Typo titres :** **Fraunces sur tous les H1/H2 de page** (marketing, auth, account, legal, admin, backtest) via `.font-display`. **Mono terminal conservé** pour les données denses in-app (dashboard, modules) + tous les eyebrows/labels. Un seul accent Fraunces injecté in-app : le *greeting* du dashboard.
- **D4 — Ambition :** Phase 1→4 = cohérence (tokens + verre + boutons + chrome). Phase 5 = passe fluidité/« addictif ». On ne mélange pas les deux pour garder des commits propres.

---

## Invariants à ne pas casser

- **Aucune régression de thème :** tout doit suivre le thème actif. Zéro nouvelle couleur hardcodée. Les `rgba()` translucides passent par `rgb(var(--…-rgb) / α)`.
- **`prefers-reduced-motion` respecté** sur toute nouvelle animation (couper, ne pas juste ralentir).
- **Pas de layout shift** à l'introduction de Fraunces (fonts déjà chargées via `next/font`, `display: swap`).
- **Build vert** après chaque task : `npx tsc --noEmit` + `npm run lint` passent.

## Commandes de vérification (réutilisées dans tout le plan)

```bash
# Typecheck (rapide, à lancer après chaque task touchant du .ts/.tsx)
npx tsc --noEmit

# Lint
npm run lint

# Build complet (avant fin de phase)
npm run build

# Dev visuel (vérif à l'œil — c'est un projet UI, la vérif finale est visuelle)
npm run dev   # puis ouvrir http://localhost:3000/<route>

# Garde anti-hardcode (doit ne RIEN remonter sur le fichier traité)
# Exemple : npx rg "#0a0a0f|rgba\(255, 255, 255|text-zinc-|Inter," app/<page>
```

---

## File Structure (ce que ce plan crée / modifie)

**Créés :**
- `components/marketing/MarketingShell.tsx` — wrapper chrome public (LandingNav + LandingFooter) pour les pages marketing non-landing.
- `components/ui/Heading.tsx` — *(optionnel, Task 1.2b)* composant titre Fraunces réutilisable.

**Modifiés (fondations) :**
- `app/globals.css` — classes `.font-display`, `.font-display-accent`, `.btn-brand`, `.btn-brand-ghost` ; fix `.glass-intense` + bordures drawer ; `--surface-rgb`/`--background-rgb` (déjà ajoutés 2026-06-07).
- `stores/useUIThemeStore.ts` — `--surface-elevated-rgb` décomposé (déjà : `--glass-bg`/`--surface-rgb`/`--background-rgb`).
- `components/ui/Button.tsx` — variantes `brand` + `brandGhost` ; corriger `primary` (texte sombre sur lime, pas `text-white`).
- `components/layouts/DashboardClientLayout.tsx` — set `MARKETING_ROUTES` (supprime le topbar app sur les pages publiques) ; topbar/theme-picker/tab-bar en verre.
- `components/ui/LegalFooter.tsx` — tokenisé/marque (ou remplacé par LandingFooter).

**Modifiés (pages, Phases 3-4) :** voir tâches dédiées.

---

# PHASE 1 — Fondations (les 3 leviers + dette verre)

> Objectif : après cette phase, on dispose de `<Button variant="brand">`, `.font-display`, `<MarketingShell>` et d'un verre 100 % thémé. Tout le reste réutilise ces primitives.

### Task 1.0 : Finir la tokenisation du verre (dette de l'audit)

**Files:**
- Modify: `app/globals.css` (`.glass-intense` ~ligne 513 ; `.nav-drawer-header` ~1099 ; `.nav-drawer-footer` ~1231)
- Modify: `stores/useUIThemeStore.ts` (fonction `applyUITheme`)

- [ ] **Step 1 : décomposer `--surface-elevated` en RGB (JS)**

Dans `stores/useUIThemeStore.ts`, dans `applyUITheme`, à côté des autres `*-rgb` :

```ts
root.style.setProperty('--surface-elevated-rgb', hexToRgb(c.surfaceElevated));
```

- [ ] **Step 2 : fallback `:root` correspondant**

Dans `app/globals.css`, sous `--surface-rgb: 13 15 27;` :

```css
  --surface-elevated-rgb: 18 21 42;
```

- [ ] **Step 3 : tokeniser `.glass-intense`**

```css
.glass-intense {
  background: rgb(var(--surface-elevated-rgb) / 0.85);
  border: 1px solid var(--border-light);
  backdrop-filter: blur(32px) saturate(200%);
  -webkit-backdrop-filter: blur(32px) saturate(200%);
}
```

- [ ] **Step 4 : tokeniser les bordures du drawer**

`.nav-drawer-header` : `border-bottom: 1px solid var(--border);`
`.nav-drawer-footer` : `border-top: 1px solid var(--border);`

- [ ] **Step 5 : vérifier**

Run: `npx tsc --noEmit` → PASS. Puis `npm run dev`, ouvrir une vue avec `.glass`/`.glass-intense` (ex. tooltips, modales) sous le thème SENZOUKRIA : le verre doit être vert sombre, pas navy. Changer de thème → le verre suit.

- [ ] **Step 6 : commit**

```bash
git add app/globals.css stores/useUIThemeStore.ts
git commit -m "fix(brand): theme-tokenize residual glass (.glass-intense, drawer borders)"
```

---

### Task 1.1 : Classe typo display `.font-display` (Fraunces)

**Files:**
- Modify: `app/globals.css` (bloc utilities, après `.text-gradient`)

- [ ] **Step 1 : ajouter les classes**

```css
/* === DISPLAY (Fraunces) — titres éditoriaux hors data === */
.font-display {
  font-family: var(--font-fraunces);
  font-weight: 400;
  letter-spacing: -0.03em;
  line-height: 1.0;
}
/* Mot-accent : 2e ligne d'un titre "editorial contraste" (cf. hero) */
.font-display-accent {
  font-family: var(--font-fraunces);
  font-weight: 600;
  font-style: italic;
  color: var(--primary);
  text-shadow: 0 0 30px rgb(var(--primary-rgb) / 0.26);
}
```

- [ ] **Step 2 : vérifier le rendu**

`npm run dev`, appliquer temporairement `className="font-display"` sur un `<h1>` d'une page (ex. `/admin`) → le titre doit passer en serif Fraunces sans layout shift. Retirer le test.

- [ ] **Step 3 : commit**

```bash
git add app/globals.css
git commit -m "feat(brand): add .font-display / .font-display-accent (Fraunces display utilities)"
```

---

### Task 1.2 : Boutons de marque tokenisés + correction du Button existant

**Files:**
- Modify: `app/globals.css` (nouvelles classes `.btn-brand`, `.btn-brand-ghost`)
- Modify: `components/ui/Button.tsx` (variantes `brand` / `brandGhost` ; fix `primary`)

- [ ] **Step 1 : classes verre tokenisées (version thémée de `landing-btn-*`)**

Dans `app/globals.css` (utilities) :

```css
/* === BOUTONS DE MARQUE (verre, suivent le thème actif) === */
.btn-brand, .btn-brand-ghost {
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: all 0.2s ease;
}
.btn-brand {
  font-weight: 600;
  color: var(--primary-light);
  background: rgb(var(--primary-rgb) / 0.09);
  border: 1px solid rgb(var(--primary-rgb) / 0.30);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.10), 0 8px 26px rgb(var(--primary-rgb) / 0.16);
}
.btn-brand:hover {
  background: rgb(var(--primary-rgb) / 0.14);
  border-color: rgb(var(--primary-rgb) / 0.45);
  transform: translateY(-1px);
}
.btn-brand-ghost {
  font-weight: 500;
  color: var(--text-primary);
  background: rgb(var(--text-primary-rgb, 232 234 246) / 0.05);
  border: 1px solid var(--border-light);
}
.btn-brand-ghost:hover {
  background: rgb(var(--text-primary-rgb, 232 234 246) / 0.09);
  border-color: var(--border-strong);
  transform: translateY(-1px);
}
```

- [ ] **Step 2 : brancher les variantes dans `Button.tsx`**

Étendre le type et `variantStyles` :

```ts
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'soft' | 'brand' | 'brandGhost';
```

```ts
  // dans variantStyles :
  brand: 'btn-brand',
  brandGhost: 'btn-brand-ghost',
  // et corriger primary : texte sombre sur lime (plus de text-white sur aplat) :
  primary:
    'bg-[var(--primary)] hover:bg-[var(--primary-light)] hover:-translate-y-0.5 text-[#06140b] shadow-sm hover:shadow-md hover:shadow-[var(--primary-glow)]',
```

> Note : les classes `.btn-brand*` portent déjà padding/blur ; `sizeStyles` ajoute le padding Tailwind par-dessus — acceptable (les valeurs cohabitent), mais pour `brand` on privilégie `size="md"` sans surcharge de radius. Si conflit visuel, retirer `rounded-*` de `sizeStyles` pour ces variantes via `className`.

- [ ] **Step 3 : vérifier**

Run `npx tsc --noEmit` → PASS. Dans une page de test, rendre `<Button variant="brand">Get started</Button>` → verre teinté lime + glow, hover qui lève. Changer de thème → suit la couleur primaire.

- [ ] **Step 4 : commit**

```bash
git add app/globals.css components/ui/Button.tsx
git commit -m "feat(brand): tokenized brand button variants + fix primary contrast"
```

---

### Task 1.3 : Chrome marketing partagé `<MarketingShell>`

**Contexte :** aujourd'hui `DashboardClientLayout` (`:224`) ne désactive son topbar applicatif que sur `/`. Toutes les pages publiques (`/pricing`, `/contact`, `/download`, `/legal/*`) héritent donc du topbar de trading. On introduit un set de routes marketing + un shell partagé (LandingNav + LandingFooter).

**Files:**
- Create: `components/marketing/MarketingShell.tsx`
- Modify: `components/layouts/DashboardClientLayout.tsx`

- [ ] **Step 1 : créer le shell**

```tsx
// components/marketing/MarketingShell.tsx
import LandingNav from '@/components/landing/LandingNav';
import LandingFooter from '@/components/landing/LandingFooter';

export default function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col bg-[var(--background)] text-[var(--text-primary)]">
      <LandingNav />
      <main className="flex-1">{children}</main>
      <LandingFooter />
    </div>
  );
}
```

> Vérifier que `LandingNav` se comporte correctement hors landing (pas de dépendance à un scroll-root spécifique au hero). Si `LandingNav` lit `[data-scroll-root]`, fournir un fallback ou rendre les ancres absolues (`/#features`).

- [ ] **Step 2 : déclarer les routes marketing dans `DashboardClientLayout.tsx`**

Près de `const isLandingPage = pathname === '/';` :

```ts
const MARKETING_ROUTES = ['/pricing', '/download', '/contact', '/upgrade', '/legal'];
const isMarketingRoute = MARKETING_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'));
const hideAppChrome = isLandingPage || isMarketingRoute;
```

Puis remplacer les gardes `!isLandingPage` qui entourent le topbar app, le drawer, la tab-bar mobile et le FeatureTour par `!hideAppChrome`. **Ne pas** toucher la garde du `<main>` (le contenu reste rendu).

- [ ] **Step 3 : envelopper les pages marketing**

Pour chaque page marketing (traitées en Phase 4), envelopper le JSX retourné par `<MarketingShell>…</MarketingShell>` et supprimer leurs nav/footer/`← Back to home` maison. *(Fait page par page en Phase 4 ; ici on ne câble que `/pricing` comme pilote.)*

- [ ] **Step 4 : vérifier le pilote**

`npm run dev`, ouvrir `/pricing` **déconnecté** → on doit voir la LandingNav verre flottante + LandingFooter, plus le topbar de trading. Ouvrir `/footprint` → topbar app inchangé.

- [ ] **Step 5 : commit**

```bash
git add components/marketing/MarketingShell.tsx components/layouts/DashboardClientLayout.tsx app/pricing/page.tsx
git commit -m "feat(brand): shared marketing chrome (LandingNav/Footer) + suppress app topbar on public routes"
```

---

### Task 1.4 : Refaire `LegalFooter` (tokenisé / marque)

**Files:**
- Modify: `components/ui/LegalFooter.tsx`

- [ ] **Step 1 : remplacer la palette zinc par des tokens + voix mono**

Mapping : `bg-zinc-900/30`→`bg-[var(--surface)]`, `border-zinc-800`→`border-[var(--border)]`, `text-zinc-600/500`→`text-[var(--text-dimmed)]`/`text-[var(--text-muted)]`. Ajouter un kicker mono (`font-mono uppercase tracking-[0.18em] text-[10px]`) cohérent avec `LandingFooter`. Liens en `hover:text-[var(--primary)]`.

- [ ] **Step 2 : vérifier**

`npm run dev`, pages qui montent `LegalFooter` (academy, pricing, trading, news) → footer cohérent avec la marque, suit le thème.

- [ ] **Step 3 : commit**

```bash
git add components/ui/LegalFooter.tsx
git commit -m "feat(brand): tokenize LegalFooter to brand tokens + mono kicker"
```

**✅ Fin Phase 1 — checkpoint :** `npm run build` vert. Les primitives existent. Reste à les appliquer.

---

# PHASE 2 — Shell in-app (le plus gros gain de perception)

> Le topbar de `DashboardClientLayout` est vu sur 100 % des écrans app et il est opaque + muet. On lui donne le verre et une signature.

### Task 2.1 : Topbar applicatif en verre + bandeau offline tokenisé

**Files:**
- Modify: `components/layouts/DashboardClientLayout.tsx` (`<nav>` ~`:420-422` ; bandeau offline `:405-409`)

- [ ] **Step 1 : passer le topbar en verre**

Remplacer `style={{ height: 'var(--nav-height)', background: 'var(--background)', … }}` par un fond verre :

```tsx
style={{ height: 'var(--nav-height)', background: 'rgb(var(--surface-rgb) / 0.72)', backdropFilter: 'blur(18px) saturate(150%)', WebkitBackdropFilter: 'blur(18px) saturate(150%)', contain: 'layout style' }}
```

Bordure : `border-b border-[var(--border)]` → conserver, ou `rgb(var(--primary-rgb) / 0.12)` pour le liseré lime fin de la landing.

- [ ] **Step 2 : tokeniser le bandeau offline**

`background: 'rgba(239,68,68,0.1)'` → `var(--bear-bg)` ; `color: '#f87171'` → `var(--bear)` ; `borderBottom: '1px solid rgba(239,68,68,0.2)'` → `1px solid rgb(var(--bear-rgb, 240 79 79) / 0.2)`. *(Ajouter `--bear-rgb` dans `:root` + `applyUITheme` si absent, même pattern que Task 1.0.)*

- [ ] **Step 3 : vérifier** — `npm run dev`, le topbar est translucide (le contenu défile en filigrane dessous), le liseré suit le thème. Forcer offline (DevTools) → bandeau aux tokens bear.

- [ ] **Step 4 : commit** — `git commit -m "feat(brand): glass app topbar + tokenized offline banner"`

---

### Task 2.2 : Theme picker + tab-bar mobile en verre, item actif avec glow

**Files:**
- Modify: `components/layouts/DashboardClientLayout.tsx` (theme picker `:496-498` ; tab-bar `:705-709`)

- [ ] **Step 1 : panneau theme picker en verre** — `background: 'var(--surface)'` → `rgb(var(--surface-rgb) / 0.85)` + `backdropFilter: 'blur(20px) saturate(180%)'`. Bordure `var(--border)`.
- [ ] **Step 2 : tab-bar mobile en verre** — même traitement ; ajouter sur l'onglet actif un `boxShadow: '0 -2px 12px rgb(var(--primary-rgb) / 0.18)'` ou un fin glow lime au-dessus de l'icône active.
- [ ] **Step 3 : logo animé dans le chrome** — passer `animated={false}` → `animated` (hover pulse léger) sur le `<Logo>` du topbar (`:444`) et du drawer header (`:571`). Vérifier `prefers-reduced-motion`.
- [ ] **Step 4 : vérifier** — menus/tab-bar translucides, onglet actif qui « respire ».
- [ ] **Step 5 : commit** — `git commit -m "feat(brand): glass theme-picker + mobile tab-bar active glow + animated chrome logo"`

**✅ Fin Phase 2 — checkpoint :** toute l'app a un chrome de marque cohérent.

---

# PHASE 3 — Pages 🔴 (les plus cassées, d'abord)

> Chaque task ci-dessous est un chantier autonome. Règle générale appliquée partout : **(a)** supprimer tout hardcode couleur (`#0a0a0f`, `rgba(255,255,255,…)`, `zinc-*`, `#34ec78`, `Inter`) → tokens ; **(b)** H1/H2 → `.font-display` + eyebrow mono ; **(c)** CTA → `<Button variant="brand">` ou `.btn-brand` ; **(d)** cartes → verre (`rgb(var(--primary-rgb)/0.07)` + bord `/0.25` + blur) ; **(e)** copie → EN ; **(f)** emojis → icônes lucide. Critère d'acceptation commun : `rg "#0a0a0f|rgba\(255, 255, 255|zinc-|Inter,|#34ec78" <fichiers>` ne remonte rien.

### Task 3.1 : `/flow` — bug thème + 59 hardcodes (PRIORITÉ #1)

**Files:** `components/pages/FlowPageContent.tsx` (bloc constantes `:9-13` ; textes `rgba(255,255,255,…)` ; onglets `:431,459` ; empty state `:557-562`)

- [ ] Remplacer les constantes `TEAL/BULL/BEAR/WARN/PURPLE` hex par `var(--accent)`, `var(--bull)`, `var(--bear)`, `var(--warning)`, `var(--primary-light)`.
- [ ] Remplacer **tous** les `rgba(255,255,255,α)` de texte par `--text-primary/secondary/muted/dimmed` selon l'opacité d'origine (1.0→primary, ~0.7→secondary, ~0.5→muted, ≤0.3→dimmed). **C'est le fix du bug** : sur thème clair le texte blanc translucide disparaissait.
- [ ] Onglets : retirer les emojis → icônes lucide ; empty state via `<EmptyState>` partagé (`components/ui/Skeleton.tsx:251`).
- [ ] H1 du module → `.font-display` + eyebrow mono.
- [ ] **Vérifier :** `rg "rgba\(255, 255, 255|#26|TEAL|📊" components/pages/FlowPageContent.tsx` → vide. `npm run dev`, basculer thème Obsidian/clair → texte lisible partout.
- [ ] **Commit :** `fix(brand): /flow theme-token all colors (fixes invisible text on light themes) + brand header`

### Task 3.2 : `/upgrade` — hardcodes + incohérence produit

**Files:** `app/upgrade/page.tsx`

- [ ] `backgroundColor: '#0a0a0f'` (`:47`) → `var(--background)` ; tous `text-white/xx` → tokens ; retirer les fallbacks inline `rgb(var(--primary-rgb, 74 222 128)…)`.
- [ ] CTA aplat → `<Button variant="brand">` ; bouton secondaire `border-white/[0.1]` → `var(--border)`.
- [ ] **Aligner feature-list + prix sur `/pricing`** ($29, preview gratuit jusqu'au 17/06) — supprimer les features retirées (heatmap/GEX/etc. si absentes du produit) et le « $39/mo ». Source de vérité = `app/pricing/page.tsx`.
- [ ] H1 → `.font-display` + eyebrow mono ; price card en verre.
- [ ] **Vérifier :** `/upgrade` cohérent avec `/pricing`, suit le thème. **Commit :** `fix(brand): /upgrade tokens + align pricing/features with /pricing`

### Task 3.3 : `/contact` — zéro marque, 100 % FR

**Files:** `app/contact/page.tsx`

- [ ] Remplacer le carré-« S » dégradé (`:67-71`) par `<Logotype>` (`components/ui/brand/`). H1 → `.font-display` + eyebrow mono `· Contact`.
- [ ] CTA dégradé lime + `text-#fff` → `<Button variant="brand">` (texte sombre sur lime). Glows hardcodés → `rgb(var(--primary-rgb)/α)`.
- [ ] Carte form → surface verre. Copie FR → EN.
- [ ] Envelopper dans `<MarketingShell>` (page publique) ; retirer le `← Back` maison.
- [ ] **Commit :** `feat(brand): rebrand /contact (Fraunces, glass form, brand CTA, EN copy, marketing chrome)`

### Task 3.4 : Auth — factoriser `<AuthShell>` puis migrer register/forgot/reset/error

**Contexte :** register, forgot-password, reset-password, error partagent le même template legacy (logo dégradé → wordmark dégradé → card sur void → CTA aplat). `login` fournit déjà 80 % du modèle (atmosphere, stagger, mono-kicker). On factorise.

**Files:** Create `components/auth/AuthShell.tsx` ; Modify `app/auth/{register,forgot-password,reset-password,error}/page.tsx`

- [ ] **3.4a** Extraire de `login/page.tsx` un `<AuthShell>` : fond tokenisé + `DashboardAtmosphere` + bloc marque (mark tokenisé + headline). Props : `title`, `subtitle`, `children` (le formulaire).
- [ ] **3.4b** Migrer `register` : remplacer logo/wordmark dégradés par le mark de marque ; CTA → `<Button variant="brand">` ; retirer émojis ; entrée stagger `fadeInUp` ; copie EN. Verdict cible 🟢.
- [ ] **3.4c** Migrer `forgot-password` + `reset-password` (jumeaux) : même traitement, copie FR→EN, CTA glass, `✓` glyphe → icône lucide.
- [ ] **3.4d** Migrer `error` : `bg-[#0a0a0f]` + `white/*` → tokens ; copie uniformisée **EN** ; boutons `bg-white/10` → `<Button variant="brandGhost">` ; eyebrow mono `· Error`.
- [ ] **Décision typo à trancher (D3) :** H1 auth en Fraunces (aligné landing) **ou** mono assumé. Appliquer le même choix aux 5 pages auth.
- [ ] **Vérifier :** les 5 pages auth visuellement sœurs ; `rg "#0a0a0f|gradient.*primary|🎁|#fff" app/auth` → vide (hors cas justifiés). **Commits :** un par sous-task (3.4a…3.4d).

### Task 3.5 : Compte — `BillingError` + `devices.css` + `delete.css` + `2fa`

**Files:** `app/account/billing/_portal-redirect.tsx` ; `app/account/devices/devices.css` ; `app/account/danger/delete/delete.css` ; `app/account/security/2fa/page.tsx`

- [ ] **3.5a** Réécrire `BillingError` (composant partagé par les 5 routes billing) en carte glass de marque : `Inter`→Geist/token, fond `#0e1116`→`var(--surface)`, CTA dégradé vert → `.btn-brand`, titre `.font-display` + eyebrow mono, `⚠`→icône lucide, « OrderflowV2 »→« Senzoukria ». **2 fichiers → 6 routes brandées** (le template sert aussi à 2fa).
- [ ] **3.5b** `devices.css` : `font-family:"Inter"`→`var(--font-fraunces)`/Geist ; `"Consolas"`→`var(--font-jetbrains-mono)` ; `#34ec78`→`var(--primary)` ; tous les `#e5e7eb/#9ca3af/#0e1116`→tokens ; carte → verre. Emojis OS (🪟🍎🐧) → icônes lucide (`Monitor`/`Apple`/`Terminal`).
- [ ] **3.5c** `delete.css` : `rgba(239,68,68,…)`→`var(--error)` + `color-mix` ; `Inter`/`Consolas`→tokens ; réutiliser `.acc-danger-btn` (déjà tokenisée dans le hub `account/page.tsx:530`).
- [ ] **3.5d** `2fa/page.tsx` : tokeniser les ~12 valeurs inline ; carte glass ; eyebrow mono « SECURITY » ; emoji 🔐 → icône.
- [ ] **Vérifier :** changer de thème sur le hub `/account` → devices/delete/billing/2fa **suivent** désormais (ils ne suivaient pas avant). **Commits :** un par sous-task.

**✅ Fin Phase 3 — checkpoint :** plus aucune page 🔴. `npm run build` vert.

---

# PHASE 4 — Pages 🟡 + nettoyage transverse

### Task 4.1 : `/pricing` — Fraunces + carte verre + brand CTA

**Files:** `app/pricing/page.tsx`
- [ ] H1/H2 mono → `.font-display` (editorial contraste) ; tokeniser les `rgba(74,222,128,…)` → `rgb(var(--primary-rgb)/α)` ; CTA aplat → `.btn-brand` ; carte pricing opaque → surface verre + blur ; count-up sur `$29` ; déjà enveloppée `<MarketingShell>` (Task 1.3). **Commit.**

### Task 4.2 : `/download` — Fraunces H1 + langue + cartes verre
**Files:** `app/download/page.tsx` — H1 `AnimatedChars` mono → option Fraunces ; copie des steps FR→EN ; boutons aplats → `.btn-brand` ; `#0a0a0a`/`#fbbf24` → tokens ; cartes OS/steps → verre ; `<MarketingShell>`. **Commit.**

### Task 4.3 : `/boutique` (Data Feeds) — statuer public/interne, tokeniser bridge
**Files:** `app/boutique/page.tsx` — tokeniser `rgba(74,222,128,…)` + `#06140b` ; CTA bridge → `.btn-brand` ; H1 → Fraunces ; carte bridge → verre. Décider si page publique (→ `<MarketingShell>`) ou interne (→ chrome app). **Commit.**

### Task 4.4 : `/academy` — Fraunces « science » + accent + nom de plan
**Files:** `app/academy/page.tsx` + `components/.../ResearchPaywall.tsx` — titres → `.font-display` (fort potentiel éditorial) ; harmoniser « SENPRO »→« Pro » ; CTA paywall → `.btn-brand` ; réconcilier accent teal vs lime ; cartes → verre ; décider EN vs FR du corps. **Commit.**

### Task 4.5 : `/admin` + `/backtest` — tokenisés mais pas marqués
**Files:** `app/admin/page.tsx`, `app/backtest/page.tsx` — H1 → `.font-display` + eyebrow mono ; cartes → `Card variant="glass"` ; boutons inline → `<Button variant="brand">` ; backtest : emojis 🔬📊📈 → icônes lucide, modales `rgba(0,0,0,0.7)` → `.glass-intense` ; corriger « SENultra »→ SENZOUKRIA/PRO. **Commit (un par page).**

### Task 4.6 : Pages légales (3) — sortir du zinc
**Files:** `app/legal/{mentions-legales,privacy,terms}/page.tsx` — `bg-[#0a0a0f]`/`bg-zinc-950` → `var(--background)` ; les 272 occurrences `zinc-*` → tokens (`--surface`/`--border`/`--text-*`) ; liens `green-400` → `var(--primary)` ; H1 → `.font-display` + eyebrow mono « LEGAL » ; factoriser le toggle FR/EN dupliqué en composant partagé ; `<MarketingShell>` ou `LegalFooter` refait (Task 1.4). **Commit (un par page ou groupé).**

### Task 4.7 : Nettoyage transverse final
- [ ] **Naming :** `rg "OrderflowV2|SENultra|SENPRO"` sur `app/` + `components/` → remplacer par SENZOUKRIA / PRO. Aligner les `metadata`/`<title>`.
- [ ] **Navy résiduel :** `rg "#0a0a0f"` sur `app/` → ne doit rester que dans `error.tsx`, `not-found.tsx`, `global-error.tsx` ; les traiter aussi → `var(--background)` (+ `text-white`→tokens dans `global-error.tsx`).
- [ ] **Badge premium :** `components/ui/Badge.tsx:22` variant `premium` hardcodé `amber-500` → tokens `--warning`.
- [ ] **Modal :** `components/ui/Modal.tsx` surface plate → `.glass-intense`.
- [ ] **Commit :** `chore(brand): final transverse cleanup (naming, residual navy, Badge, Modal glass)`

**✅ Fin Phase 4 — checkpoint :** `rg "#0a0a0f|text-zinc-|Inter,|SENultra|OrderflowV2"` sur `app/`+`components/` (hors landing/desktop) ≈ vide. Tout suit le thème.

---

# PHASE 5 — Passe fluidité (« effet addictif »)

> Cohérence acquise ; on ajoute le mouvement signature partout. `prefers-reduced-motion` obligatoire sur chaque ajout.

### Task 5.1 : `<ModuleHeader>` unifié (eyebrow mono + titre Fraunces + actions + status)
**Files:** Create `components/layouts/ModuleHeader.tsx` ; Modify `ChartPageShell.tsx` + les 7 headers de modules inline (gex/volatility/flow/trading/journal/news/ai). Un seul header → cohérence + injecte Fraunces in-app sur les titres-ancres. **Commit.**

### Task 5.2 : `fadeInUp` staggered hors landing
**Files:** appliquer le pattern d'entrée staggered (delays 0.3/0.45/0.6s) aux pages account/admin/backtest/pricing et aux panneaux de modules (remplacer le `fadeIn` opacity plat par `fadeInUp`). **Commit.**

### Task 5.3 : Micro-interactions partagées
**Files:** envisager `MagneticButton`/`CursorGlow` sur les CTA marketing hors landing ; count-up sur les chiffres clés (pricing, dashboard stats) ; hover scale + glow sur les cartes. Garder sobre (la marque dit « jamais gadget »). **Commit.**

### Task 5.4 : États vides/chargement/erreur unifiés
**Files:** forcer l'usage de `<EmptyState>` / `<ChartSkeleton>` partagés partout (Flow réimplémente le sien) ; unifier `ChartLoadingFallback` vs `ChartSkeleton` vs spinners inline. **Commit.**

**✅ Fin Phase 5 :** l'app « respire » comme la landing.

---

## Self-review (couverture vs audit)

- ✅ Levier #1 (bouton unifié) → Task 1.2 + applications Phase 3-4.
- ✅ Levier #2 (chrome public + LegalFooter) → Task 1.3 + 1.4.
- ✅ Levier #3 (Fraunces) → Task 1.1 + applications.
- ✅ Dette verre (`--glass-bg`/`.glass-intense`) → Task 1.0.
- ✅ Pages 🔴 (flow/upgrade/contact/auth/account) → Phase 3.
- ✅ Pages 🟡 (pricing/download/boutique/academy/admin/backtest/legal) → Phase 4.
- ✅ Dettes transverses (#0a0a0f, FR/EN, naming, emojis) → Task 4.7 + intégrées par page.
- ✅ Fluidité in-app → Phase 5.

## Ordre d'exécution recommandé

**1.0 → 1.1 → 1.2 → 1.3 → 1.4** (fondations) → **2.1 → 2.2** (shell) → **3.1 → 3.2 → 3.3 → 3.4 → 3.5** (rouge) → **4.x** (jaune + nettoyage) → **5.x** (fluidité).

On peut s'arrêter et livrer après chaque phase : chaque checkpoint laisse le site dans un état cohérent et buildable.
