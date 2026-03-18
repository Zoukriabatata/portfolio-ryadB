# Volatility Skew — Base de connaissances

## Définition
Le skew mesure l'asymétrie de la volatilité implicite (IV) entre les puts et les calls sur différents strikes.

## Types de skew

### Put Skew (négatif / "fear skew")
- IV des puts OTM > IV des calls OTM
- Signification : les acheteurs paient une prime pour se protéger contre une baisse
- Sentiment : **bearish bias** dans la protection institutionnelle
- Interprétation : le marché craint plus une baisse qu'il n'espère une hausse

### Call Skew (positif / "greed skew")
- IV des calls OTM > IV des puts OTM
- Signification : demande de calls OTM (upside protection/speculation)
- Sentiment : **bullish bias** — attentes de hausse agressive
- Moins fréquent, signal souvent de stress haussier ou short squeeze

### Flat Skew
- IV symétrique — pas de biais directionnel fort
- Marché équilibré ou en attente de catalyseur

## Mesures du skew

### 25-Delta Skew (RR - Risk Reversal)
- RR = IV(25δ Call) - IV(25δ Put)
- RR négatif → put skew dominant → biais baissier
- RR positif → call skew dominant → biais haussier
- RR entre -2% et +2% → neutre

### Term Structure du skew
- Court terme (< 7j) : sentiment instantané, événements proches
- Moyen terme (30j) : biais de positionnement des gérants
- Long terme (90j+) : structure macro du marché

## Skew en crypto (spécificités)
- BTC a historiquement un put skew moins prononcé que les marchés equity
- Un call skew en crypto peut indiquer FOMO / bull run imminent
- Skew négatif extrême (< -10%) : capitulation potentielle ou protection massive

## Valeurs de référence (25δ RR)
- > +5% : call skew élevé, momentum haussier fort
- +2% à +5% : légère préférence calls, biais haussier modéré
- -2% à +2% : neutre
- -5% à -2% : put skew modéré, prudence baissière
- < -5% : put skew élevé, forte protection / peur du marché

## Skew vs Prix
- Skew s'inverse souvent avant un retournement de tendance
- "Skew divergence" : prix monte mais skew vire bearish = signal d'alerte
- "Skew confirmation" : prix et skew alignés = tendance solide

## Application pratique
- Put skew élevé + prix fort → institutionnels se protègent (distribution possible)
- Call skew élevé + prix faible → positionnement haussier à contresens → potential squeeze
- Flat skew au support → aucune conviction → attendre confirmation
