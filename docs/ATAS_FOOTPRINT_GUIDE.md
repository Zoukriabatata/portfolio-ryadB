# GUIDE COMPLET FOOTPRINT ATAS-LIKE

## ARCHITECTURE DATA → CALCUL → RENDU

```
┌─────────────────────────────────────────────────────────────────────┐
│                     FLUX DE DONNÉES                                  │
└─────────────────────────────────────────────────────────────────────┘

   CME FEED                    CLASSIFICATION                AGGREGATION
┌──────────────┐            ┌───────────────────┐        ┌──────────────┐
│ Trade Tick   │            │                   │        │              │
│ ─────────────│            │  Aggressor Side   │        │  Footprint   │
│ timestamp    │──────────▶ │  Quote Rule       │──────▶ │  Candle      │
│ price        │            │  Tick Rule        │        │  (time-based)│
│ size         │            │                   │        │              │
│ aggressor    │            │  BUY → ASK        │        │  Map<price,  │
│ bid/ask      │            │  SELL → BID       │        │   level>     │
└──────────────┘            └───────────────────┘        └──────────────┘
                                                                │
                                                                ▼
                                                         ┌──────────────┐
                                                         │   RENDER     │
                                                         │              │
                                                         │ Canvas 2D    │
                                                         │ ATAS-style   │
                                                         └──────────────┘
```

---

## RÈGLES IMMUABLES DU FOOTPRINT ATAS

### 1. CLASSIFICATION BID / ASK

```
┌─────────────────────────────────────────────────────────────────────┐
│ RÈGLE FONDAMENTALE: L'AGGRESSOR DÉTERMINE LE CÔTÉ                   │
└─────────────────────────────────────────────────────────────────────┘

  BUY AGGRESSOR (acheteur initie)
  ══════════════════════════════════
  • Trade exécuté au prix ASK (ou au-dessus)
  • L'acheteur "lifted the offer"
  • Volume comptabilisé dans la colonne ASK (droite)
  • Contribue au DELTA POSITIF

  SELL AGGRESSOR (vendeur initie)
  ══════════════════════════════════
  • Trade exécuté au prix BID (ou en-dessous)
  • Le vendeur "hit the bid"
  • Volume comptabilisé dans la colonne BID (gauche)
  • Contribue au DELTA NÉGATIF
```

### 2. STRUCTURE DU FOOTPRINT

```
┌─────────────────────────────────────────────────────────────────────┐
│                     FOOTPRINT CANDLE (1 bougie)                     │
└─────────────────────────────────────────────────────────────────────┘

  ┌────────┬─────────┬─────────┬─────────────────────┐
  │  OHLC  │   BID   │   ASK   │      DELTA          │
  │ candle │ (rouge) │ (vert)  │   (axe central)     │
  ├────────┼─────────┼─────────┼─────────────────────┤
  │   │    │    152  │  89     │  ◀████│             │ 20145.25
  │   │    │     45  │  234    │       │████████▶    │ 20145.00 ← POC
  │   █    │    178  │  156    │    ◀██│             │ 20144.75
  │   █    │     67  │  45     │    ◀██│             │ 20144.50
  │   █    │     23  │  89     │       │████▶        │ 20144.25
  │   │    │     12  │  34     │       │██▶          │ 20144.00
  └────────┴─────────┴─────────┴─────────────────────┘
                              │
                     DELTA = 0 (AXE FIXE)
```

### 3. FORMULES DELTA

```javascript
// NIVEAU INDIVIDUEL
level.delta = level.askVolume - level.bidVolume

// Delta > 0 → Plus d'achats agressifs → Vert, vers la DROITE
// Delta < 0 → Plus de ventes agressives → Rouge, vers la GAUCHE
// Delta = 0 → Équilibre → Pas de barre

// CANDLE TOTALE
candle.totalDelta = candle.totalBuyVolume - candle.totalSellVolume
```

### 4. CALCUL DES IMBALANCES (ATAS)

```
┌─────────────────────────────────────────────────────────────────────┐
│ IMBALANCE = Ratio DIAGONAL ≥ 3:1 (configurable)                     │
└─────────────────────────────────────────────────────────────────────┘

  IMBALANCE BUY (au niveau N):
  ═══════════════════════════
  Ask[N] / Bid[N-1] ≥ 3.0

  Interprétation: Les acheteurs au niveau N
  dominent les vendeurs un tick EN-DESSOUS

  IMBALANCE SELL (au niveau N):
  ═══════════════════════════
  Bid[N] / Ask[N+1] ≥ 3.0

  Interprétation: Les vendeurs au niveau N
  dominent les acheteurs un tick AU-DESSUS
```

---

## SPÉCIFICATIONS PAR MARCHÉ

### E-MINI NASDAQ 100 (NQ)

| Paramètre | Valeur | Notes |
|-----------|--------|-------|
| **Tick Size** | 0.25 points | Minimum price movement |
| **Tick Value** | $5.00 | P&L per tick |
| **Point Value** | $20.00 | 4 ticks = 1 point |
| **Multiplier** | 20 | Contract multiplier |
| **Sessions** | 18:00-17:00 (CT) | Nearly 23h |
| **RTH** | 08:30-15:00 (CT) | Regular Trading Hours |

**Réglages Footprint Recommandés:**
| Scalping (1-5m) | Intraday (15-30m) | Swing |
|-----------------|-------------------|-------|
| Tick agg: 1 | Tick agg: 2-4 | Tick agg: 4-10 |
| Min vol: 10 | Min vol: 25 | Min vol: 50 |
| Imbalance: 3:1 | Imbalance: 3:1 | Imbalance: 4:1 |
| Delta sig: 50 | Delta sig: 100 | Delta sig: 200 |

### MICRO E-MINI NASDAQ 100 (MNQ)

| Paramètre | Valeur | Notes |
|-----------|--------|-------|
| **Tick Size** | 0.25 points | Same as NQ |
| **Tick Value** | $0.50 | 1/10 of NQ |
| **Point Value** | $2.00 | |
| **Multiplier** | 2 | |
| **Vol Equiv** | 10 MNQ = 1 NQ | Pour comparaison |

**Réglages Footprint Recommandés:**
| Scalping | Intraday | Notes |
|----------|----------|-------|
| Tick agg: 1 | Tick agg: 2 | |
| Min vol: 50 | Min vol: 100 | Plus de bruit |
| Imbalance: 3:1 | Imbalance: 3:1 | |
| Delta sig: 200 | Delta sig: 400 | Ajusté pour micro |

### E-MINI S&P 500 (ES)

| Paramètre | Valeur | Notes |
|-----------|--------|-------|
| **Tick Size** | 0.25 points | |
| **Tick Value** | $12.50 | |
| **Point Value** | $50.00 | |
| **Multiplier** | 50 | |
| **Liquidité** | Très haute | Le plus liquide |

**Réglages Footprint Recommandés:**
| Scalping | Intraday | Swing |
|----------|----------|-------|
| Tick agg: 1 | Tick agg: 2 | Tick agg: 4 |
| Min vol: 20 | Min vol: 50 | Min vol: 100 |
| Imbalance: 3:1 | Imbalance: 3:1 | Imbalance: 4:1 |
| Delta sig: 100 | Delta sig: 200 | Delta sig: 400 |

### MICRO E-MINI S&P 500 (MES)

| Paramètre | Valeur |
|-----------|--------|
| **Tick Size** | 0.25 points |
| **Tick Value** | $1.25 |
| **Point Value** | $5.00 |
| **Vol Equiv** | 10 MES = 1 ES |

### GOLD FUTURES (GC)

| Paramètre | Valeur | Notes |
|-----------|--------|-------|
| **Tick Size** | $0.10 | Attention: en dollars |
| **Tick Value** | $10.00 | 100 oz contract |
| **Point Value** | $100.00 | Per $1 move |
| **Multiplier** | 100 troy oz | |

**Réglages Footprint Recommandés:**
| Scalping | Intraday |
|----------|----------|
| Tick agg: 1 | Tick agg: 2 |
| Min vol: 5 | Min vol: 15 |
| Imbalance: 3:1 | Imbalance: 3.5:1 |
| Delta sig: 30 | Delta sig: 60 |

### MICRO GOLD (MGC)

| Paramètre | Valeur |
|-----------|--------|
| **Tick Size** | $0.10 |
| **Tick Value** | $1.00 |
| **Point Value** | $10.00 |
| **Vol Equiv** | 10 MGC = 1 GC |

---

## ERREURS CRITIQUES À ÉVITER

### ❌ ERREUR 1: Inversion Bid/Ask

```
MAUVAIS:
  Buy order → comptabilisé dans BID ❌

CORRECT:
  Buy order (aggressor) → lifted the offer → ASK ✓
  Sell order (aggressor) → hit the bid → BID ✓
```

**Symptôme:** Delta inversé, absorption illisible
**Solution:** Vérifier la logique de classification

### ❌ ERREUR 2: Axe Delta non-fixe

```
MAUVAIS:
  Recalculer l'axe zéro par candle ❌
  centerX = min + (max - min) / 2 ❌

CORRECT:
  centerX = deltaColumnX + deltaColumnWidth / 2 ✓
  (constant pour TOUTES les candles)
```

**Symptôme:** Barres delta qui "sautent", lecture impossible
**Solution:** Axe central FIXE à 50% de la colonne delta

### ❌ ERREUR 3: Prix non-aligné au tick

```
MAUVAIS:
  price = 20145.17 (non-aligné) ❌

CORRECT:
  price = alignToTick(20145.17) = 20145.25 ✓
```

**Symptôme:** Niveaux fantômes, volumes dispersés
**Solution:** TOUJOURS arrondir au tick avant aggregation

### ❌ ERREUR 4: Confusion Micro/Mini volumes

```
MAUVAIS:
  Comparer 100 MNQ vs 100 NQ directement ❌

CORRECT:
  100 MNQ = 10 NQ équivalent ✓
  Normaliser avant comparaison
```

**Symptôme:** Mauvaise lecture de la taille des positions
**Solution:** Utiliser volumeMultiplier pour normaliser

### ❌ ERREUR 5: Imbalance horizontale

```
MAUVAIS:
  imbalance = Ask[N] / Bid[N] ❌ (même ligne)

CORRECT:
  imbalanceBuy = Ask[N] / Bid[N-1] ✓ (diagonal)
  imbalanceSell = Bid[N] / Ask[N+1] ✓ (diagonal)
```

**Symptôme:** Faux signaux d'absorption
**Solution:** Comparer DIAGONALEMENT

### ❌ ERREUR 6: Timestamp mal géré

```
MAUVAIS:
  Utiliser secondes quand feed envoie millisecondes ❌

CORRECT:
  timestamp > 1e12 ? Math.floor(ts / 1000) : ts ✓
```

**Symptôme:** Candles de mauvaise durée
**Solution:** Normaliser en secondes Unix

### ❌ ERREUR 7: Scale delta non-normalisé

```
MAUVAIS:
  barWidth = delta * pixelsPerContract ❌

CORRECT:
  normalizedDelta = |delta| / maxDelta
  barWidth = normalizedDelta * halfWidth ✓
```

**Symptôme:** Barres qui dépassent la colonne
**Solution:** Normaliser par le delta max de la candle

---

## QUAND LE FOOTPRINT DEVIENT NON-FIABLE

### 1. Volume insuffisant
- **Seuil:** < 100 contracts/candle sur NQ
- **Seuil:** < 50 contracts/candle sur GC
- **Solution:** Augmenter le timeframe

### 2. Spread élevé
- **Seuil:** Spread > 2-3 ticks
- **Cause:** Horaires illiquides
- **Solution:** Éviter pre/post market pour footprint

### 3. News/Events
- **Problème:** Ordres STOP massifs = faux delta
- **Solution:** Ignorer 30s avant/après news

### 4. Agrégation trop large
- **Problème:** 10+ ticks par niveau = perte de granularité
- **Solution:** Max 4 ticks d'agrégation

### 5. Micro seuls
- **Problème:** MNQ/MES seuls = trop de bruit retail
- **Solution:** Combiner avec flux institutionnel NQ/ES

---

## PATTERNS DE LECTURE FOOTPRINT

### 1. ABSORPTION (STOP HUNT)
```
Prix monte, mais:
- Gros Bid volume en haut (vendeurs absorbent)
- Delta devient négatif
- Prix reverse

Lecture: Les vendeurs absorbent les achats
```

### 2. INITIATIVE BUYING
```
Prix monte, et:
- Gros Ask volume (acheteurs agressifs)
- Delta fortement positif
- Imbalances buy en cascade
- POC qui monte

Lecture: Vraie pression acheteuse
```

### 3. EXHAUSTION
```
Après mouvement:
- Volume qui diminue
- Delta proche de 0
- Petites candles
- Pas d'imbalances

Lecture: Momentum épuisé
```

### 4. ICEBERG DETECTION
```
Sur un niveau:
- Petit affichage au bid (ex: 50)
- Mais gros volume exécuté (500+)
- Prix ne baisse pas

Lecture: Ordre iceberg caché
```

---

## CHECKLIST PRODUCTION

- [ ] Prix alignés au tick exact
- [ ] Classification aggressor correcte (BUY→ASK, SELL→BID)
- [ ] Axe delta = 0 FIXE au centre
- [ ] Imbalances calculées diagonalement
- [ ] Volume normalisé Micro/Mini
- [ ] Timestamps en millisecondes gérés
- [ ] POC mis à jour à chaque trade
- [ ] Value Area calculée (70%)
- [ ] Min volume filter appliqué
- [ ] Rendu Canvas sans memory leak
