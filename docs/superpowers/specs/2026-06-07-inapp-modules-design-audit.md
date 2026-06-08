# Audit design UI/UX — modules in-app (2026-06-07)

> Workflow multi-agents (8 auditeurs + synthèse). Objectif : espace plus grand/aéré, viz clean, qualité deepchart/TradingView, thème marque, addictif/fluide.

## Diagnostic-titre
**L'os est pro (~7-8/10), la peau ne l'est pas (~3-4/10 thème).** Moteur + UX rivalisent déjà avec TradingView/SpotGamma/Topstep/ATAS. L'écart est **100% dette de direction artistique** — et le socle de tokens (lime/teal, `--bull/--bear`, `.glass`, Fraunces, nav-icons) **existe déjà**. C'est de l'**application/discipline**, pas une refonte moteur. 4-5 passes transverses (surtout search-replace + classes partagées) → moyenne ~5/10 ⇒ ~7.5-8/10.

## Scores /10 (tri pire → meilleur)
```
module       des ux ico typ wid btn chr esp thm del  OVR
/flow          5  6  4   3   5  4   5   3   3  4   4.2
/volatility  5.5 6.5 3.5 4   5 5.5  6  4.5  3 4.5   4.8
/live        5.5 6.5 6   4   6 5.5  5  3.5  3  5    4.9
/gex           6  7  4   4   6  5   6   3   3  5    5.0
/journal     5.5  7  6   4   5 5.5  5   6  3.5 4.5  5.1
/trading       6  7  3   5   6  6   6   7   4  5    5.4
/footprint     6 6.5 6  4.5  6 5.5  5   5   5 5.5   5.5
/ai          6.5  6 6.5 5    6 6.5  6  4.5 5.5 6    5.8
```
(des=design ux=UX ico=icônes typ=typo wid=widgets btn=boutons chr=chrome esp=espace thm=thème del=delight)

## Verdicts (classés)
1. **/ai 5.8** — cœur (FloatingChat/AIAgents) = meilleure matière verre de l'app, mais UserTesterPage indigo hors-marque collé dedans, 0 Fraunces, AnalysisPanel étouffé (14 pills, 9-11px).
2. **/footprint 5.5** — VerticalToolbar/InlineToolSettings niveau TradingView, mais greffés sur header/footer legacy hardcodé (bleu/orange/vert), sans Fraunces ni verre.
3. **/trading 5.4** — bento UX moderne, mais peau générique : couleurs hardcodées + violet parasite, zéro verre malgré `.glass`, emojis en icônes.
4. **/journal 5.1** — tabs a11y/lazy/skeletons pro, mais template Tailwind : Fraunces 1×, data viz hardcodée green, charts statiques sans crosshair.
5. **/gex 5.0** — moteur ~7-8 niveau SpotGamma, enveloppe ~3-4 : bleu orphelin `#3b82f6` partout, sidebar mur 9-11px, refresh 30s en flash sec.
6. **/live 4.9** — couverture Topstep/TV complète, mais 141 hardcodes vert/rouge, densité Sierra 8-11px sur barres 36px, seul ZoomControls porte le verre.
7. **/volatility 4.8** — smile canvas pro, mais teal Tradytics `#26beaf` + IVTermStructure/IVSurface3D codés 100% en dur (fond #0a0a0a, bleu Tailwind) = changer d'onglet = changer d'app.
8. **/flow 4.2** — scanner dense ATAS, le plus hors-marque : identité **inversée** (tout teal, zéro lime), vue Chart en divs HTML, zéro verre, header 10px.

## L'écart vs deepchart/TradingView — 5 axes constants
1. **Discipline de palette** — TV ne laisserait jamais cohabiter bleu+indigo+violet+teal-emprunté ; ici 141 hardcodes (/live) + 4 accents parasites.
2. **Matière** — les benchmarks ont UNE matière (verre/profondeur) du 1er au dernier pixel ; ici tout aplat opaque, le module phare a souvent moins de matière que son bouton flottant.
3. **Respiration** — deepchart dose à 12-13px, cartes espacées ; ici 8-11px Excel-dense partout (l'inverse de l'objectif).
4. **Voix** — Fraunces quasi absent, chrome mono générique + emojis, identité interchangeable.
5. **Vivacité** — TV/Bookmap interpolent, le flux est hypnotique ; ici refresh = flash sec, DOM/Tape statiques.

## Direction de refonte (vers l'objectif)
- **Espace** : échelle 4pt tokenisée, planchers (data ≥11-12px, eyebrows seuls 8-10px), hauteurs relevées (DOM 26-28px, header 40-44px), métriques en cartes collapsibles, charts en flex-1 (ResizeObserver), toggle densité Confort/Compact, UNE barre supérieure par module.
- **Chrome/panneaux** : UNE classe `.panel-glass` (surface/0.78 + blur 16px + border-light + inset highlight) partout ; hiérarchie 3 plans (héro élevé under-glow lime > secondaire verre > tables plates).
- **Icônes** : 100% lucide (strokeWidth 1.5, 14/16/20px, currentColor), **0 emoji/glyphe** ; réutiliser `nav-icons.tsx`.
- **Typo** : Fraunces sur titres + hero-numbers (BIAS, Net GEX, P&L, symbole) ; JetBrains Mono EXPLICITE sur toute data/eyebrows (DOM + canvas) ; bannir SF Mono/Menlo/Consolas.
- **Motion (addictif)** : lerp ~200ms des redraws, cross-fade 150ms sur switch vue/greek, flash bid/ask + pulse prix DOM/Tape, crosshair+tooltip charts journal, pulse lime sur whales/walls proches spot, micro-press active:scale-95, skeletons fidèles.
- **Couleur** : discipline bicolore stricte — **lime = énergie** (actif/CTA/sélection/live, rare), **teal = neutre/spot/structure**, data via `--bull/--bear`, alerte `--warning`. **Aucun accent tiers.** Unifier la teinte lime (`#4ade80` globals vs `#7ed321` store → UNE seule). Le lime reste un petit % de surface — le contraste pierre(mat)/énergie(lime) EST l'ADN.

## Roadmap priorisée
- **P1 (high/M)** Purge hardcodes : helper `themeColor()/pnlColor()` via getComputedStyle + bannir accents parasites. Les 8 modules. *Condition n°1.*
- **P2 (high/M)** Re-thémer les 3 pièces hors-marque : UserTesterPage (indigo), IVTermStructure+IVSurface3D, OptionsFlowPanel (#3b82f6). /ai /volatility /gex.
- **P3 (high/M)** Icônes lucide + **éradiquer emojis**. /live /flow /footprint /gex /volatility /trading /ai.
- **P4 (high/M)** `.panel-glass` généralisée (+ under-glow lime actif). Tous.
- **P5 (high/M)** Voix Fraunces + JBM explicite. Tous.
- **P6 (high/L)** Aération (espace/tailles/hauteurs/groupement). /live /flow /gex /volatility /footprint /ai.
- **P7 (med/M)** Design-system contrôles unifié (Segment/Pill/Button, BUY/SELL sculptés).
- **P8 (med/M)** Couche motion (lerp/flash/crosshair). *Facteur addictif.*
- **P9 (med/M)** Dégraisser chrome redondant (fusionner doubles toolbars, aide→tooltips, hiérarchie de plans).
- **P10 (med/L)** Unifier viz (/flow chart en canvas, heatmap lisible, badge SIMULATED).

## Top quick wins
1. Helper themeColor + search-replace hex → `--bull/--bear` (débloque les 8 d'un coup).
2. Bannir 4 accents parasites + unifier la teinte lime.
3. Éradiquer 100% emojis → lucide.
4. JetBrains Mono explicite sur data/eyebrows.
5. `.panel-glass` sur headers/footers.
6. Fraunces sur 1-2 ancrages/module.
7. Retirer l'aide permanente du footer footprint → tooltips.
8. Plancher police 11px + hauteurs DOM/Tape.
9. Re-thémer UserTesterPage (1 fichier indigo→tokens).
10. Skeleton GEX fidèle (barres, pas chandeliers).
