# SENZOUKRIA — Spec d'identité visuelle

> **Date** : 2026-06-06
> **Statut** : design validé (brainstorming) → à transformer en plan d'implémentation
> **Portée** : identité visuelle (logo, icônes, palette, typo, motion, application landing). **Pas** l'implémentation code (objet d'un plan séparé).
> **Objectif business** : se démarquer nettement de Deepchart et des outils orderflow génériques par une marque distinctive et premium.

---

## 1. Stratégie de marque

- **Nom de marque** : `SENZOUKRIA` (nom principal mis en avant partout).
- **Catégorie / descripteur** : `OrderFlow` (le produit est un terminal d'orderflow ; "OrderFlow" n'est plus le nom mais la catégorie).
- **Tagline retenu** : **« The Science of Orderflow »** (remplace "Trading Intelligence").
- **Plateforme de marque** : *« la science qui transforme le chaos en ordre »* — ADN Dr. Stone / Senku (Kingdom of Science) appliqué à la microstructure de marché. La lecture de l'orderflow = une démarche scientifique : observer, mesurer, comprendre.
- **Personnalité** (par priorité, validée) : **1. distinctive/science-driven** · 2. premium/minimal/editorial · 3. crédibilité terminal-pro · 4. énergie tech (lime).
- **Voix** : technique, confiante, précise. Anglais pour les chaînes produit (headline, CTA). Pas de jargon anime explicite dans l'UI — l'ADN Senku transparaît par le système visuel (élément, atome, énergie, pétrification), pas par des références littérales.

---

## 2. Le logo

### 2.1 Concept retenu — « l'élément Sz » (atome)
Un mark circulaire = **jeton d'élément du tableau périodique** rendu en **atome** :
- **symbole** `Sz` (monogramme Senzoukria),
- **numéro atomique** `79` (clin d'œil à l'or, Au — valeur/trading ; figé mais documenté comme swappable),
- **électron** sur **orbite de Bohr** (ellipse inclinée),
- **anneau de charge d'énergie** (lime).

Fusionne l'ADN "case du tableau périodique" (science) avec l'atome (vivant, animable). Aucun outil de trading n'a cette signature.

### 2.2 Géométrie canonique (source de vérité)
ViewBox `0 0 100 100`, centre `50,50`.

| Élément | Valeurs |
|---|---|
| Jeton (bord) | `circle cx=50 cy=50 r=45`, `stroke-width=1.3`, fill `url(#szFill)`, stroke `url(#szEdge)` |
| Orbite Bohr | groupe `rotate(-26 50 50)` ; path ellipse `rx=44 ry=17` centrée 50,50 ; stroke lime opacity .16 |
| Électron | `r=2.6` (≥48px) / `2.0` (réduit), fill lime, `filter szGlow`, `animateMotion` le long de l'orbite, `dur=7s` |
| Anneau charge | `circle r=45`, `rotate(-90 50 50)`, `stroke-dasharray=283`, anim dashoffset `283→0→-283`, `dur=3.6s` |
| Numéro `79` | `x=50 y=33`, JetBrains Mono 500, `font-size=9.5`, `letter-spacing=.5`, fill lime, opacity .9 |
| Symbole `Sz` | `x=50.5 y=62`, Fraunces 600, `font-size=34`, `letter-spacing=-1.2`, fill text |

> **SVG de référence** : `docs/brand/senzoukria-logo-final.html` (générateur `markSVG()`) — à extraire en composant et en assets statiques.

### 2.3 Système de réductions
- **Full** (≥ 48 px) : jeton + `79` + `Sz` + orbite + (charge/orbite animées en contexte interactif).
- **Réduit / min** (≤ 32 px, favicon, onglet, navbar) : jeton + `Sz` seul, plus gras (`font-weight=700`, `font-size=47`, `letter-spacing=-1.6`), recentré `y=64.5`. Pas de numéro ni d'électron (illisibles).

### 2.4 Variantes couleur
1. **Défaut** — jeton sombre, accent lime (contexte dark, par défaut).
2. **Monochrome** — `Sz`/électron blanc cassé `#e8eaf6`, pas de lime (impressions, watermarks, contextes mono).
3. **Pétrifié (stone)** — gris pierre `#cfd2df` (clin d'œil pétrification ; réservé états de chargement / easter-egg).
4. **Fond clair** — `Sz` `#0a0c16`, numéro/électron lime-dark `#22c55e` (logo sur blanc).

> **App-icon inversé lime plein : abandonné** (rejeté en revue).

### 2.5 Deux verrous de marque

**(a) Lockup display** (hero marketing, grands formats) : mark `Sz` (jeton) + wordmark **SENZOUKRIA** (Fraunces 600, capitales) + descripteur « The Science of Orderflow » (JetBrains Mono, uppercase, `letter-spacing .28em`, tiret dégradé lime). Clear-space = **rayon du jeton** ; centre optique du mark aligné à l'axe médian du wordmark.

**(b) Logotype inline** (navbar, contextes compacts) — **VALIDÉ** : le mot **« senzoukria »** (Fraunces, bas de casse) où le **« o » est remplacé par l'atome** — anneau « o » blanc/monoline (`stroke=currentColor`) + **orbite + électron en néon lime** (glow via filtre `#neon`). Mark et mot fusionnent en un seul logotype dessiné. Le split SENZOU/KRIA lime est **abandonné**. Variante « Senzoukria » (capitale S) = optionnelle, non retenue par défaut.

### 2.6 Production
- Le `Sz`/`79` sont du `<text>` web-font. Dans le **composant React** inline SVG → OK (fonts chargées dans l'app).
- Pour les **assets statiques** (`favicon.ico`, PNG manifest, OG image) → **vectoriser le texte en paths** (rendu identique sans fonts).

---

## 3. Couleur

Réutilise le design system existant (`app/globals.css`). **Aucune refonte de palette** — uniquement formalisation d'usage + ajout du neutre "stone".

| Rôle | Token | Hex |
|---|---|---|
| Fond | `--background` | `#07080f` |
| Surface | `--surface` | `#0d0f1b` |
| Primaire (énergie) | `--primary` / `--lime` | `#4ade80` |
| Primaire clair | `--primary-light` | `#86efac` |
| Primaire foncé | `--primary-dark` | `#22c55e` |
| Accent | `--accent` (teal) | `#2dd4bf` |
| Texte | `--text-primary` | `#e8eaf6` |
| **Stone (nouveau)** | `--stone` | `#cfd2df` / `#9aa0b5` |

**Règle d'or** : le lime reste **rare** — accent, énergie, état actif, CTA. Jamais en aplat dominant.

---

## 4. Typographie

Système à **3 voix**. **Une seule police ajoutée** (Fraunces) ; les deux autres existent déjà dans le projet.

| Voix | Police | Statut | Rôles |
|---|---|---|---|
| **Display** | **Fraunces** (serif éditorial) | **à ajouter** (`next/font/google`, var `--font-fraunces`) | H1/H2 marketing, wordmark, gros titres |
| **Data** | JetBrains Mono | existant (`--font-jetbrains-mono`) | chiffres, labels, kickers, badges, UI dense |
| **Body / UI** | **Geist** | existant (package `geist`) | texte courant, navigation, boutons, paragraphes |

> Note : les maquettes HTML utilisent **Space Grotesk** comme proxy de Geist (Geist n'est pas sur le CDN Google). En production → **Geist**, pas Space Grotesk (évite une 4ᵉ police).

**Titre H1 retenu — piste A « editorial contraste »** :
- ligne 1 « The science of » : Fraunces **400**, `--text-primary`.
- ligne 2 « orderflow. » : Fraunces **600 italic**, `--lime`, `text-shadow` glow lime subtil.
- `font-size` ~80px desktop, `line-height .93`, `letter-spacing -.042em`.

---

## 5. Iconographie

- **Base** : conserver **`lucide-react`** (déjà en place), mais **discipliné** : stroke-width, taille et couleur **tokenisés** (cohérence stricte).
- **Icônes "héro" custom** : un petit lot (~6–10) dans l'esprit science/orderflow pour les modules clés (Footprint, GEX, News, Journal, Account…), dessinées dans la même grille que le mark.
- **YAGNI explicite** : **pas** de redessin d'un set complet de 200 icônes à la main. *(À confirmer en revue.)*

---

## 6. Motion (signatures animées)

4 signatures, subtiles, premium, jamais gadget.

| Signature | Déclencheur | Détail |
|---|---|---|
| **Charge d'énergie** | load / hover du mark | anneau lime qui se charge (dashoffset), `dur 3.6s` ambiant / `1.1s` au hover |
| **Orbite électron** | ambiant | électron sur l'ellipse de Bohr, `dur 7s` (9s en navbar) |
| **Count-up `79`** | à l'apparition | le numéro atomique s'incrémente 0→79 (ease-out cubic, ~1.5s) |
| **Footprint pulse** | ambiant | la cellule bid/ask "respire" |
| **Néon o-atome** | permanent | orbite + électron du logotype glow en néon lime (filtre `#neon`) |
| **Atome de fond** | ambiant | structure orbitale du hero : électrons qui orbitent + spin lent ~70s |

**Tokens de timing** (à ajouter) : `--ease-out-cubic`, durées `fast 120ms / normal 180ms / slow 280ms` (existent) + `brand 3.6s`.
**Règle** : `prefers-reduced-motion` → couper orbite/charge/pulse, garder les états statiques.

---

## 7. Application — landing / hero

Composition validée (réf. `docs/brand/senzoukria-logo-final.html`) :

- **Navbar** : **pill flottante en verre** (translucide, `backdrop-filter: blur+saturate`, bord fin, ombre douce). Marque à gauche = **logotype atom-o** ; **liens centrés** en Geist ; droite `Sign in` (ghost) + CTA **glassmorphism** teinté lime.
- **Boutons** : **glassmorphism partout** (primaire = verre teinté lime + glow discret ; secondaire = verre neutre). Plus d'aplats lime pleins.
- **Hero** : badge mono (live dot) → **H1 piste A** (Fraunces 400 « The science of » / 600 italic lime « orderflow. ») → sous-titre Geist → double CTA verre → ligne brokers (Apex · Rithmic · NinjaTrader · Tradovate, mono).
- **Scène produit en couches** : fenêtre **footprint pro** (niveaux prix, split bid/ask, **POC** surligné, footer Σ Delta / POC / CVD, shimmer, valeurs qui tiquent) + **3 cartes flottantes** (Absorption / CVD sparkline / Σ Delta, flottement doux) + underglow.
- **Fond multi-couches** (validé « incroyable ») : **aurora animée** lime+teal (dérive lente) · **structure orbitale d'atome** (3 ellipses de Bohr croisées, électrons qui orbitent, rotation lente) · **halo de noyau** · **champ d'électrons** scintillants · grille atténuée · grain · vignette · **fondu bas** · ligne d'énergie en haut. *(Remplace le « filigrane Sz » initial.)*

---

## 8. Carte d'implémentation (fichiers réels touchés)

> Détaillé dans le plan séparé. Inventaire de portée :

- `components/ui/Logo.tsx` — réécrire mark + lockup (nouveau SVG, variantes, props `variant`/`size`/`animated`).
- `app/globals.css` — ajout `--stone`, var `--font-fraunces`, tokens motion de marque.
- `app/layout.tsx` — charger **Fraunces** via `next/font/google` ; confirmer Geist en body.
- `components/landing/HeroSection.tsx` — H1 piste A, scène produit (cartes flottantes), fond multi-couches.
- `components/landing/LandingNav.tsx` — navbar (liens centrés, CTA, marque).
- `styles/landing-animations.css` / `styles/animations.css` — signatures de marque + `prefers-reduced-motion`.
- Assets statiques : `app/favicon.ico`, `app/manifest.ts`, `app/opengraph-image.tsx`, `app/twitter-image.tsx` — régénérer avec le mark (paths vectorisés).
- (Optionnel) `desktop/` — répercuter mark/favicon sur l'app Tauri.
- (Optionnel) **Figma** : master éditable + exports PNG/SVG via le MCP Figma.

---

## 9. Hors-périmètre (YAGNI)

- Refonte de palette (on garde l'existante).
- Set d'icônes custom complet.
- Renommage de domaine / SEO / juridique autour de "SENZOUKRIA" (décision business séparée — la spec fournit `senzoukria.com` en hypothèse de maquette uniquement).
- Refonte des autres pages que la landing (académie, dashboard…) — héritent des tokens mais pas dans ce lot.

---

## 10. Décisions ouvertes (à confirmer en revue de spec)

0. **Wordmark / logotype** : ✅ RÉSOLU — logotype inline « senzoukria » avec o-atome néon (bas de casse).
1. **Numéro atomique** : on fige `79` (or) ? ou un autre nombre signifiant ?
2. **Icônes** : OK pour "lucide discipliné + ~6-10 custom" plutôt qu'un set complet ?
3. **Geist** confirmé comme body/UI (vs Space Grotesk) ?
4. **Périmètre desktop** : on répercute le mark sur l'app Tauri dans ce lot, ou plus tard ?
5. **Figma** : on produit le master + exports, ou on reste full-code ?

---

## 11. Critères d'acceptation

- [ ] `Logo.tsx` rend les 4 variantes × 2 tailles, identiques à la réf, `prefers-reduced-motion` respecté.
- [ ] Fraunces chargée, H1 piste A à l'écran, aucun layout shift (FOUT maîtrisé).
- [ ] Favicon / manifest / OG régénérés (paths vectorisés, nets à 16px).
- [ ] Hero landing = composition §7, 60fps, pas de régression Lighthouse.
- [ ] Aucun secret/dépendance injustifiée ; build Next.js OK.
