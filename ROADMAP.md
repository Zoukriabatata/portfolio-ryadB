# Roadmap OrderFlow-v2 - Application de Trading Crypto

## Vue d'ensemble

Application de trading combinant Order Flow (style ATAS), Volatility Skew (style OptionCharts.io), Liquidity Heatmap et GEX Dashboard (style GEXStream) pour crypto (Deribit options + Binance/Bybit futures).

---

## Phase 1: Fondations (MVP) ✅

### 1.1 Installation des dépendances
```bash
npm install zustand lightweight-charts
```

### 1.2 Structure de fichiers
```
app/
├── (dashboard)/
│   ├── layout.tsx              # Layout avec sidebar
│   ├── page.tsx                # Dashboard principal
│   ├── volatility/page.tsx     # Volatility Skew
│   ├── liquidity/page.tsx      # Liquidity Heatmap
│   ├── gex/page.tsx            # GEX Dashboard
│   └── orderflow/page.tsx      # Footprint Chart
│
components/
├── charts/
│   ├── CandlestickChart.tsx
│   ├── VolatilitySkewChart.tsx
│   ├── LiquidityHeatmap.tsx
│   ├── GEXChart.tsx
│   └── FootprintChart.tsx
├── widgets/
│   └── SymbolSelector.tsx
└── ui/
    └── Sidebar.tsx

lib/
├── websocket/
│   ├── WebSocketManager.ts
│   ├── DeribitWS.ts
│   └── BinanceWS.ts
├── calculations/
│   ├── gex.ts
│   └── volatility.ts
└── api/
    └── deribit.ts

stores/
├── useMarketStore.ts
├── useOptionsStore.ts
├── useOrderbookStore.ts
└── useGEXStore.ts

types/
├── market.ts
├── options.ts
└── orderbook.ts
```

### 1.3 WebSocket Manager
**Fichier:** `lib/websocket/WebSocketManager.ts`
- Singleton pour gérer toutes les connexions
- Reconnexion automatique avec backoff exponentiel
- Message queue pendant les déconnexions

### 1.4 Candlestick Chart basique
**Fichier:** `components/charts/CandlestickChart.tsx`
- Utilise `lightweight-charts`
- Connecté à Binance WebSocket pour BTC/USDT

---

## Phase 2: Volatility Skew (OptionCharts.io style) ✅

### Fonctionnalités
- Graphique ligne: X = Strikes, Y = Implied Volatility
- Deux lignes: Calls (vert) et Puts (rouge)
- Sélecteur d'expiration
- Marqueur du prix actuel

### Fichiers
- `lib/websocket/DeribitWS.ts` - Connexion WebSocket Deribit
- `lib/api/deribit.ts` - API REST pour instruments
- `stores/useOptionsStore.ts` - State des options avec Greeks
- `lib/calculations/volatility.ts` - Calcul IV skew
- `components/charts/VolatilitySkewChart.tsx` - Visualisation
- `app/(dashboard)/volatility/page.tsx` - Page

### Data Flow
```
Deribit WS (ticker.{option}.raw)
  → Parse mark_iv, greeks
  → useOptionsStore
  → calculateIVSkew()
  → VolatilitySkewChart
```

---

## Phase 3: Liquidity Heatmap ✅

### Fonctionnalités (basé sur screenshots ATAS)
- Heatmap 2D: X = temps, Y = prix, Couleur = profondeur
- Gradient purple/magenta pour la liquidité
- Mise à jour temps réel via WebSocket
- Montre les ordres passifs (limit orders)

### Fichiers
- `lib/websocket/BinanceWS.ts` - Depth stream
- `stores/useOrderbookStore.ts` - Bids/asks + historique
- `lib/calculations/orderbook.ts` - Agrégation
- `components/charts/LiquidityHeatmap.tsx` - Canvas rendering
- `app/(dashboard)/liquidity/page.tsx` - Page

### Data Flow
```
Binance WS (btcusdt@depth@100ms)
  → Update bids/asks maps
  → Push snapshot to heatmapHistory (ring buffer)
  → buildHeatmapData()
  → Canvas render (WebGL si performance)
```

---

## Phase 4: GEX Dashboard (GEXStream style) ✅

### Fonctionnalités (basé sur screenshots)
1. **Gamma Exposure Chart**
   - Bar chart horizontal par strike
   - Vert = GEX positif (calls), Rouge = GEX négatif (puts)
   - Ligne jaune pointillée = Zero Gamma level

2. **Options Inventory**
   - Bar chart calls vs puts OI par strike

3. **Metrics Panel**
   - GEX Ratio, Net GEX, Flow Ratio
   - Zero Gamma level
   - Call/Put IV
   - Pos GEX @ strike, Neg GEX @ strike

### Calcul GEX
```typescript
// Pour chaque option:
GEX = gamma × openInterest × spotPrice² × 0.01 × contractMultiplier

// Calls = positif (dealers short gamma = buy dips, sell rallies)
// Puts = négatif (dealers long gamma = amplify moves)
netGEX = callGEX + putGEX
```

### Fichiers
- `lib/calculations/gex.ts` - Formules GEX
- `stores/useGEXStore.ts` - GEX par strike, aggregates
- `components/charts/GEXChart.tsx` - Bar chart
- `app/(dashboard)/gex/page.tsx` - Page

---

## Phase 5: Footprint / Order Flow (ATAS style) ✅

### Fonctionnalités (basé sur screenshots)
1. **Footprint Chart**
   - Chaque bougie affiche bid × ask par niveau de prix
   - Gauche = volume vendu, Droite = volume acheté
   - Vert = acheteurs dominants, Rouge = vendeurs dominants

2. **Volume Profile**
   - Barres horizontales bleues (volume par prix)
   - POC (Point of Control) marqué

3. **Delta Bars**
   - Barre en bas: delta = asks - bids
   - Vert = delta positif, Rouge = delta négatif

### Fichiers
- `components/charts/FootprintChart.tsx` - Canvas custom
- `stores/useFootprintStore.ts` - Footprint data par candle
- `app/(dashboard)/orderflow/page.tsx` - Page Order Flow

---

## Phase 6: Polish ✅

- ~~Thème dark/light~~ (dark par défaut)
- Error boundaries (`components/ui/ErrorBoundary.tsx`)
- Loading states (`components/ui/LoadingSpinner.tsx`)
- Connection status (`components/ui/ConnectionStatus.tsx`)

---

## Sources de données

| Feature | Source | Endpoint | Auth |
|---------|--------|----------|------|
| Options + Greeks | Deribit | `wss://www.deribit.com/ws/api/v2` | Non (public) |
| Klines / OHLC | Bybit | `wss://stream.bybit.com/v5/public/linear` | Non |
| Orderbook | Bybit | `wss://stream.bybit.com/v5/public/linear` | Non |
| Trades (Footprint) | Bybit | `wss://stream.bybit.com/v5/public/linear` | Non |

> Note: Binance WebSocket est bloqué en France/EU. Bybit est utilisé comme alternative.

---

## Progression

- [x] Phase 1 - Fondations
- [x] Phase 2 - Volatility Skew
- [x] Phase 3 - Liquidity Heatmap
- [x] Phase 4 - GEX Dashboard
- [x] Phase 5 - Footprint Chart
- [x] Phase 6 - Polish

**Progression globale: 100% (6/6 phases) ✅**
