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
- Plan unique : **PRO — $29 USD / mois**, facturé mensuellement, annulable à tout
  moment, sans frais de setup. Un seul plan, tout est débloqué.
- Essai : 14 jours gratuits, sans carte demandée au départ.
- Preview publique en cours : accès PRO complet **gratuit, sans carte ni paiement,
  jusqu'au 17 juin 2026**. Après cette date, un compte sans abonnement passe en
  lecture seule — pas de lock-in, pas de prélèvement surprise. S'abonner garde le
  PRO complet à $29/mois.
- Promo premier mois : code **SZK60** = -60% sur le 1er mois (soit ~$11.60),
  expire le 17/06/2026.
- Inclus : 2 machines (PC + laptop), support prioritaire sur Discord.
- Paiement via Stripe (carte jamais vue ni stockée par nous), annulation en 1 clic
  depuis la page compte.
- (Si on demande un prix annuel, un plan équipe, ou une remise non listée ici :
  "je vérifie avec l'équipe", ne pas inventer.)

## VS CONCURRENTS (différenciateurs honnêtes)
<!-- Ne JAMAIS dénigrer un concurrent. Citer uniquement des différences
     factuelles et vérifiables. -->
- ATAS / Bookmap / Sierra Chart : outils sérieux, généralement $50–150/mois, et la
  couche data est souvent à repayer en add-on (data layer verrouillée).
- Senzoukria à $29/mois se branche sur le **feed NinjaTrader / Rithmic que le
  trader possède déjà** (Apex inclus) — pas de surcouche data à racheter.
- Différenciateur produit : **GEX et profil gamma / smile IV intégrés** au même
  outil que le footprint, là où ils sont souvent absents ou séparés ailleurs.
- Application desktop **Windows native**.
- (Comparaison feature-à-feature précise non listée ici → "je vérifie avec
  l'équipe", ne pas affirmer un avantage non vérifié.)

## OBJECTIONS FRÉQUENTES → RÉPONSES
- "La data est réelle ?" → Oui, flux temps réel via le broker connecté (pas de
  données simulées). Profondeur historique selon entitlements.
- "Prix ?" → voir section PLANS & PRIX (jamais inventer).
- "Mac ou Windows ?" → **Windows** disponible (installeur MSI). À la première
  install, Windows affiche un écran SmartScreen ("Windows protected your PC") :
  c'est normal (certificat de signature en cours), il suffit de "More info" →
  "Run anyway". **macOS prévu Q3 2026**, **Linux** plus tard. Pas de version Mac
  utilisable aujourd'hui — le dire honnêtement, ne pas promettre de date Mac autre
  que Q3 2026.
- "Mes credentials sont en sécurité ?" → stockés via le keychain OS, jamais en
  clair, jamais transmis ailleurs que le broker.

## LIENS D'ACTION (valeurs canoniques)
- Download : /download
- Offres : /pricing
- Communauté : via le bouton "Parler à l'équipe" (Discord).
