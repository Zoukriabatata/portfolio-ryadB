# Gamma Exposure (GEX) — Base de connaissances

## Définition
Le GEX (Gamma Exposure) mesure la sensibilité des market makers (MM) aux mouvements de prix en raison de leur exposition aux options gamma.

## Calcul
GEX = Σ (Gamma × Open Interest × Contract Size × Spot Price²)

## Interprétation

### GEX Positif (Positive Gamma)
- Les market makers sont **long gamma**
- Comportement : ils **achètent les dips** et **vendent les rallies**
- Effet sur le marché : **compression de volatilité**, range-bound, mean-reversion
- Le prix reste "aimanté" vers les niveaux de strike à fort GEX

### GEX Négatif (Negative Gamma)
- Les market makers sont **short gamma**
- Comportement : ils **vendent les dips** et **achètent les rallies** (hedging dynamique)
- Effet : **amplification des mouvements**, trending market, volatilité élevée
- Les mouvements directionnels peuvent s'accélérer

## GEX Flip Level (Zero Gamma Level)
- Prix auquel le GEX change de signe (positif → négatif ou inverse)
- Zone pivot critique : au-dessus = régime positif (stable), en-dessous = régime négatif (volatile)
- Les cassures du flip level signalent souvent un changement de régime

## Niveaux de strikes importants
- **Highest Positive GEX Strike** : niveau de support/résistance le plus fort (gravitationnel)
- **Put Wall** : accumulation de puts → support naturel (les MM doivent acheter pour hedger)
- **Call Wall** : accumulation de calls → résistance naturelle (les MM doivent vendre pour hedger)

## Valeurs typiques (BTC/ETH)
- GEX > +500M$ : forte compression, mouvements inférieurs à 2% attendus
- GEX entre -100M$ et +100M$ : régime transitoire, direction incertaine
- GEX < -500M$ : régime trending, moves de 3-5%+ possibles

## Impact sur la stratégie
- En gamma positif : favoriser le mean-reversion, éviter les breakouts
- En gamma négatif : suivre le momentum, prudence sur les fades
- Autour du flip : zones de transition, volatilité accrue possible

## Exemple
Si BTC est à 65,000$ avec GEX flip à 63,000$ :
- Au-dessus de 63K : MM stabilisent → range probable 62K-68K
- En-dessous de 63K : MM amplifient → possible accélération vers 58K-60K
