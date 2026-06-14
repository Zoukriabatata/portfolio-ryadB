# BASE DE CONNAISSANCE — VENTE (Sales Copilot)

> Source de vérité unique de l'agent de vente. L'agent ne répond QUE depuis ce
> document. Tout fait absent ici = "je vérifie avec l'équipe", jamais inventé.

## PITCH & POSITIONNEMENT
OrderFlow ("The Science of Orderflow") est un logiciel desktop d'analyse
orderflow professionnel pour le trading de futures : footprint/heatmap, GEX,
profil gamma / smile IV, journal, account, news. Pour traders futures sérieux
(prop-firm Apex, retail avancé) qui veulent une lecture microstructure de
niveau ATAS/Bookmap.

## FEATURES (par module)
- Footprint / Heatmap : volume bid/ask par niveau, delta, imbalances, absorption.
- GEX : exposition gamma dealers, zero-gamma, call/put walls.
- Gamma profile / Smile IV : profil par strike, skew.
- Journal : trades, annotations, stats, export PDF.
- Account : positions, ordres, PnL temps réel.
- News : calendrier économique, headlines.

## COMPATIBILITÉ BROKERS (faits exacts uniquement)
- Apex (via Rithmic) : supporté. Données live OK ; profondeur historique
  dépend des entitlements du compte.
- Rithmic : connexion directe (Protocol Buffers).
- Ponts : NinjaTrader, ATAS, Quantower (indicateurs fournis).
- Crypto : Binance, Bybit, Deribit (footprint).
- (Si un broker n'est pas listé ici : "je vérifie avec l'équipe", ne pas affirmer.)

## PLANS & PRIX
<!-- SOURCE CANONIQUE DES PRIX. Doit rester aligné avec /pricing.
     L'agent cite UNIQUEMENT ces valeurs. -->
- Période preview en cours : accès PRO automatique sans paiement.
- (Renseigner ici les plans/prix exacts post-preview avant la mise en prod.)

## VS CONCURRENTS (différenciateurs honnêtes)
- vs ATAS / Sierra Chart / Bookmap / Quantower : positionnement, prix, options
  GEX intégrées. (Renseigner les différenciateurs réels et vérifiables.)

## OBJECTIONS FRÉQUENTES → RÉPONSES
- "La data est réelle ?" → Oui, flux temps réel via le broker connecté (pas de
  données simulées). Profondeur historique selon entitlements.
- "Prix ?" → voir section PLANS & PRIX (jamais inventer).
- "Mac ou Windows ?" → (renseigner l'état réel du support OS.)
- "Mes credentials sont en sécurité ?" → stockés via le keychain OS, jamais en
  clair, jamais transmis ailleurs que le broker.

## LIENS D'ACTION (valeurs canoniques)
- Download : /download
- Offres : /pricing
- Communauté : via le bouton "Parler à l'équipe" (Discord).
