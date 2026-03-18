# Indicateurs & Overlays — Base de connaissances

## VWAP (Volume Weighted Average Price)

### Définition
Prix moyen pondéré par le volume depuis le début de la session (reset quotidien).
VWAP = Σ(Prix × Volume) / Σ(Volume)

### Interprétation
- **Prix > VWAP** : acheteurs en contrôle, tendance haussière intraday
- **Prix < VWAP** : vendeurs en contrôle, tendance baissière intraday
- **Prix au VWAP** : zone d'équilibre, souvent mean-reversion

### Utilisation
- Les institutions utilisent le VWAP comme benchmark d'exécution
- Retour au VWAP après déviation = high probability trade
- Cassure du VWAP avec volume = changement de régime intraday
- VWAP bands (±1 SD, ±2 SD) = zones de sur/sous-extension

### VWAP vs Prix
- Prix monte en s'éloignant du VWAP = momentum fort
- Prix revient au VWAP répétitivement = range / compression

## TWAP (Time Weighted Average Price)

### Définition
Prix moyen pondéré par le temps (pas le volume). Moins utilisé en analyse, mais utilisé par les algos d'exécution.

### Différence avec VWAP
- TWAP ignore le volume — chaque période a le même poids
- Plus "lisse" que le VWAP
- Utile pour détecter si les gros ordres sont exécutés via algo TWAP

## EMA (Exponential Moving Average)

### Définition
Moyenne mobile donnant plus de poids aux prix récents.
Paramètre : période (ex: EMA 20 = 20 dernières bougies)

### Interprétations courantes
- **EMA 9** : trend très court terme, scalping
- **EMA 20** : trend court terme, swing intraday
- **EMA 50** : trend moyen terme
- **EMA 200** : trend long terme (très important institutionnellement)

### Utilisation
- Prix > EMA 20 = uptrend
- EMA 20 croise EMA 50 à la hausse = golden cross (signal haussier)
- EMA 20 croise EMA 50 à la baisse = death cross (signal baissier)
- EMA = niveau de support/résistance dynamique

## SMA (Simple Moving Average)

### Définition
Moyenne simple des N derniers prix de clôture.

### Différence avec EMA
- SMA réagit plus lentement (même poids sur toutes les périodes)
- Moins de faux signaux mais plus de lag
- SMA 200 est le niveau le plus regardé institutionnellement

## Volume Profile

### Définition
Distribution du volume par niveau de prix sur une période donnée.

### Composants
- **POC** (Point of Control) : niveau avec le plus gros volume échangé
- **Value Area** (VA) : zone où 70% du volume a été échangé
- **VAH** (Value Area High) : borne haute de la value area
- **VAL** (Value Area Low) : borne basse de la value area
- **High Volume Node (HVN)** : zone d'attraction des prix
- **Low Volume Node (LVN)** : zone de faible résistance — prix traverse rapidement

### Stratégies
- Retour au POC = high probability reversal zone
- Cassure de VAH avec volume = extension haussière
- Cassure de VAL = extension baissière
- LVN = objectif rapide si cassure d'un HVN

## Volume Bubbles
Bulles sur chaque bougie représentant le volume total ou le delta.
- Taille = volume relatif (grosse bulle = volume important)
- Couleur = direction (vert = delta positif, rouge = négatif)
