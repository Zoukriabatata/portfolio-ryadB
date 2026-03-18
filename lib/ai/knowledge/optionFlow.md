# Option Flow — Base de connaissances

## Définition
L'option flow est l'analyse du flux d'achats/ventes d'options en temps réel, permettant de détecter le positionnement des gros acteurs (institutions, hedge funds).

## Concepts clés

### Premium Flow (flux de prime)
- Total des primes payées pour acheter des options
- **Call premium dominant** : gros acheteurs positionnés haussiers
- **Put premium dominant** : gros acheteurs se protègent ou spéculent à la baisse

### Volume vs Open Interest
- **Volume** : activité du jour (nouvelle spéculation ou hedging)
- **Open Interest (OI)** : positions ouvertes cumulées
- Volume > OI habituel = activité inhabituelle = signal fort

### Large Blocks / Sweeps
- **Block trade** : transaction unique de grande taille (signal institutionnel)
- **Sweep** : ordre agressif qui traverse plusieurs exchanges (urgence directionnelle)
- Sweeps calls bullish = acheteurs urgents de couverture haussière

## Indicateurs de sentiment

### Put/Call Ratio (PCR)
- PCR = Volume Puts / Volume Calls
- PCR > 1.5 : sentiment très bearish (ou contrarian buy si extrême)
- PCR entre 0.7 et 1.0 : neutre à légèrement bearish
- PCR < 0.7 : sentiment bullish
- PCR < 0.5 : sentiment très bullish (attention aux retournements)

### Call/Put Premium Ratio
- Plus précis que le volume seul — mesure l'argent réel dépensé
- Premium calls > 60% du total → positionnement haussier institutionnel

## Types d'activité

### Bullish signals
- Achat de calls OTM (Out-of-the-Money) à fort volume
- Vente de puts (income strategy = biais haussier)
- Sweeps calls agressifs
- Call/Put premium ratio > 1.5

### Bearish signals
- Achat de puts OTM à fort volume
- Vente de calls (cap strategy = biais baissier/neutre)
- Put sweeps agressifs
- Ouverture de put spreads larges (downside protection institutionnelle)

### Neutre / Ambigu
- Straddles/strangles achetés = attente de volatilité (direction inconnue)
- Activité équilibrée calls/puts

## Option Flow vs GEX

### Relation
- GEX = exposition des MM à la gamma (effet sur le prix)
- Option Flow = flux directionnel des gros acteurs (intention)
- Combinés : GEX donne le "terrain", le flow donne la "direction"

### Confluence
- GEX positif + flow bullish → probabilité très élevée de hausse stable
- GEX positif + flow bearish → test du flip level probable
- GEX négatif + flow bullish → explosive move possible à la hausse
- GEX négatif + flow bearish → cascade baissière risquée

## Niveaux d'expiration (Expiry)
- Le vendredi de chaque semaine (options hebdo) → rebalancing des MM
- "Max Pain" : niveau où les options expirent avec la valeur minimale
- Prix tend vers le max pain à l'approche de l'expiration

## Signaux d'alerte
- Dark pool prints combinés à gros put buying → distribution imminente
- OI calls massif à un strike précis → objectif de cours des acteurs
- Changement brutal du PCR intraday → repositionnement rapide
