# Footprint Chart — Base de connaissances

## Définition
Le footprint chart (aussi appelé "order flow chart") affiche, pour chaque bougie, le détail des transactions BID et ASK à chaque niveau de prix. Il permet de voir QUI achète et QUI vend à chaque tick.

## Structure d'une cellule footprint
Chaque cellule affiche : `Volume BID x Volume ASK`
- **BID** (gauche) : transactions initiées par des vendeurs agressifs (market sell)
- **ASK** (droite) : transactions initiées par des acheteurs agressifs (market buy)
- **Delta** = ASK - BID (positif = pression achat, négatif = pression vente)

## Delta
- **Delta positif** : plus d'achats agressifs que de ventes — pression haussière
- **Delta négatif** : plus de ventes agressives que d'achats — pression baissière
- **Divergence delta** : bougie haussière + delta négatif = faiblesse cachée (absorption)
- **Delta cumulé** : somme des deltas sur la session

## Concepts clés

### Absorption
- Gros volume à un niveau de prix sans mouvement = les gros acteurs absorbent les ordres
- Un niveau avec forte absorption = support/résistance significatif
- Ex: 5000 lots vendus à 65,000$ sans que le prix baisse = acheteur institutionnel

### Imbalance (déséquilibre)
- Cellule où ASK >> BID ou BID >> ASK (ratio typique > 3:1)
- Les imbalances marquent les zones d'agressivité directionnelle
- Zones d'imbalance non comblées = zones d'attraction futures

### POC du footprint
- Niveau avec le plus grand volume dans la bougie
- Souvent revisité lors de la prochaine bougie

### Stacked Imbalances
- Plusieurs imbalances empilées dans la même direction
- Signal fort : momentum directionnel institutionnel

### Stopping Volume
- Gros volume à l'extrémité d'un move
- Signal potentiel de retournement : les vendeurs/acheteurs sont épuisés

## Mode d'affichage

### Bid/Ask (défaut)
Affiche les volumes BID et ASK bruts.

### Delta
Affiche le delta (ASK - BID) coloré : vert si positif, rouge si négatif.

### Volume
Affiche le volume total par niveau de prix (sans distinction BID/ASK).

## Comment lire le footprint

### Bougie haussière saine
- Delta progressivement positif
- Plus gros volumes au milieu/bas de la bougie (initiation)
- Petit volume en haut (résistance faible)

### Bougie haussière faible (piège)
- Delta négatif malgré clôture en hausse
- Gros volumes BID en haut = absorption par les vendeurs
- Signal de retournement potentiel

### Confirmation d'un support
- Gros volume BID + delta positif au niveau de support = acheteurs défendent le niveau
- Suivi d'une bougie haussière = confirmation

## Paramètres de configuration (OrderFlow)
- **Cell size** : taille en ticks de chaque cellule (plus petit = plus de détail)
- **Color scheme** : ATAS-style, Bookmap-style, Sierra Chart-style, High Contrast
- **Min volume filter** : masque les cellules sous un seuil (réduit le bruit)
- **Show delta** : afficher le delta par bougie
- **Show cumulative delta** : delta cumulé depuis le début de la session
