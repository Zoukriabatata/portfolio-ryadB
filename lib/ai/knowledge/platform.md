# OrderFlow — Guide de la plateforme

## Pages principales

### /live — Live Chart Pro
Le chart principal de trading. Contient :
- **Outils de dessin** : Trend Line (T), Horizontal Line (H), Vertical Line (V), Rectangle (B), Fibonacci (F), Ray (R), Parallel Channel, Texte, Flèche, Highlighter, Measure, Long Position (L), Short Position (S)
- **Timeframes** : 15s, 30s, 1m, 3m, 5m, 15m, 30m, 1h, 4h, 1d
- **Chart types** : Candlestick classique ou Footprint (delta)
- **Indicateurs** : VWAP, TWAP, EMA, SMA
- **Overlays** : Volume Profile (POC/VAH/VAL), Volume Bubbles, Depth Heatmap
- **Quick Trade Bar** : BUY/SELL market, limit, stop avec TP/SL
- **Split view** : 1x1, 2x1, 2x2 charts synchronisés
- **Templates** : sauvegarde/chargement de configurations complètes
- **Settings** : icône engrenage → panel centré avec onglets Apparence/Volume/Footprint/VP/Indicateurs

### /footprint — Footprint Chart
Chart footprint style ATAS. Montre les transactions BID/ASK par prix. Delta = ASK - BID.

### /liquidity — Liquidity Heatmap
Heatmap de l'order book en temps réel. Visualise les ordres passifs (liquidité), les trades actifs, et les niveaux clés (POC, VAH, VAL, VWAP).

### /gex — GEX Dashboard
Gamma Exposure pour SPX, SPY, QQQ. Montre le Gamma Flip Level, Call Wall, Put Wall.

### /volatility — Volatility Skew
Surface de volatilité implicite depuis Deribit. Term structure, 25-delta Risk Reversal.

### /journal — Journal de trading
Enregistrement des trades, analytics (win rate, P&L, drawdown), playbooks, notes quotidiennes.

### /boutique — Data Feeds
Configuration des datafeed : Binance, Bybit, Deribit (crypto), Tradovate, DxFeed (futures CME/CBOT).

## Outils de dessin — mode d'emploi

### Trend Line (T)
1. Appuyer sur T ou cliquer l'icône
2. Cliquer sur le premier point (ex: un plus bas)
3. Cliquer sur le second point (ex: un plus haut suivant)
4. Double-clic pour modifier les propriétés (couleur, épaisseur, style)

### Horizontal Line (H)
1. Appuyer sur H
2. Cliquer sur le niveau de prix souhaité
3. La ligne s'étend sur toute la largeur du chart
4. Utile pour marquer les supports, résistances, niveaux de liquidité

### Fibonacci Retracement (F)
1. Appuyer sur F
2. Cliquer sur le bas du swing
3. Cliquer sur le haut du swing
4. Les niveaux 0.236, 0.382, 0.5, 0.618, 0.786, 1.0 s'affichent automatiquement

### Long/Short Position (L/S)
1. Appuyer sur L (long) ou S (short)
2. Cliquer sur le prix d'entrée
3. Le panneau affiche : entrée, TP, SL, ratio R/R, P&L estimé
4. Déplacer les lignes TP/SL pour ajuster le risk management

### Rectangle (B)
1. Appuyer sur B
2. Cliquer-glisser pour définir la zone
3. Utile pour marquer les zones de consolidation, FVG, blocs d'ordres

## Volume Profile
- **POC** (Point of Control) : niveau de prix avec le plus grand volume échangé
- **VAH** (Value Area High) : borne supérieure de la zone de valeur (70% du volume)
- **VAL** (Value Area Low) : borne inférieure
- La zone entre VAH et VAL = "Value Area" (70% du volume)
- **Single prints** : zones de faible volume = zones d'attraction/répulsion futures

## Quick Trade Bar
- Barre en bas du chart
- Modes : Market (exécution immédiate), Limit (au prix demandé), Stop (déclenché au prix)
- TP/SL en ticks ou en % du prix d'entrée
- P&L affiché en temps réel sur le chart
- Bouton rouge "Close" pour fermer la position immédiatement

## Magnet Mode
Active le snap sur les niveaux OHLC. Utile pour accrocher précisément les outils de dessin sur les high/low/open/close des bougies.

## Templates
- Sauvegardent : timeframe, type de chart, indicateurs actifs, settings footprint, volume profile, couleurs
- Accessibles via Settings → onglet Templates
- Peuvent être appliqués à un seul chart ou à tous (split view)
