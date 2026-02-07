# Rithmic Bridge pour Topstep

Bridge Python pour recevoir les trades CME (NQ, MNQ, ES, MES) depuis Rithmic via Topstep et les streamer vers l'application Next.js.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    FLUX DE DONNÉES                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   CME (Bourse)                                              │
│        │                                                    │
│        ▼                                                    │
│   Rithmic (Data Feed)                                       │
│        │                                                    │
│        ▼                                                    │
│   Topstep (Broker) ─── rithmic.topstep.com:443             │
│        │                                                    │
│        ▼ Protocol Buffers (SSL)                            │
│   ┌─────────────────────────────────────────┐              │
│   │   rithmic_bridge.py (Python)            │              │
│   │   • Connexion Rithmic API               │              │
│   │   • Subscription NQ/MNQ/ES/MES          │              │
│   │   • Classification bid/ask              │              │
│   │   • WebSocket Server :8765              │              │
│   └─────────────────────────────────────────┘              │
│        │                                                    │
│        ▼ WebSocket JSON                                    │
│   ┌─────────────────────────────────────────┐              │
│   │   Next.js (RithmicClient.ts)            │              │
│   │   • RithmicFootprintEngine              │              │
│   │   • Footprint Aggregation               │              │
│   │   • Canvas Render                       │              │
│   └─────────────────────────────────────────┘              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Prérequis

- Python 3.8+
- Compte Topstep (Combine ou Funded)
- Plateforme Rithmic activée sur votre compte Topstep

## Installation

### 1. Installer les dépendances Python

```bash
cd rithmic
pip install -r requirements.txt
```

### 2. Configurer les credentials

```bash
cp .env.example .env
```

Éditer `.env` avec vos identifiants Topstep:

```env
RITHMIC_USER=votre_username_topstep
RITHMIC_PASSWORD=votre_password_topstep
RITHMIC_SYSTEM=TopstepTrader
RITHMIC_GATEWAY=rithmic.topstep.com
```

### 3. Lancer le bridge

```bash
python rithmic_bridge.py
```

Vous devriez voir:
```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                       RITHMIC BRIDGE FOR TOPSTEP                              ║
╚═══════════════════════════════════════════════════════════════════════════════╝

2024-01-15 10:30:00 [INFO] Gateway: rithmic.topstep.com
2024-01-15 10:30:00 [INFO] System: TopstepTrader
2024-01-15 10:30:00 [INFO] Symbols: ['NQ', 'MNQ', 'ES', 'MES']
2024-01-15 10:30:00 [INFO] ✓ WebSocket server started on ws://localhost:8765
2024-01-15 10:30:01 [INFO] ✓ Connected to Rithmic
2024-01-15 10:30:01 [INFO] ✓ Subscribed to NQ
2024-01-15 10:30:01 [INFO] ✓ Subscribed to MNQ
2024-01-15 10:30:01 [INFO] ✓ Subscribed to ES
2024-01-15 10:30:01 [INFO] ✓ Subscribed to MES
```

## Utilisation dans Next.js

### 1. Importer le client Rithmic

```typescript
import { rithmicClient, getRithmicFootprintEngine } from '@/lib/rithmic';
```

### 2. Connecter et recevoir les trades

```typescript
// Connexion
rithmicClient.connect('ws://localhost:8765');

// Subscription aux trades
const unsubscribe = rithmicClient.subscribeTrades('NQ', (trade) => {
  console.log('Trade:', trade);
  // { symbol: 'NQ', price: 21500.25, size: 3, side: 'ASK', timestamp: 1700000000000 }
});

// Status
rithmicClient.onStatus((status, message) => {
  console.log('Status:', status, message);
});
```

### 3. Avec le Footprint Engine

```typescript
const engine = getRithmicFootprintEngine({
  symbol: 'NQ',
  timeframe: 60,  // 1 minute
  imbalanceRatio: 3.0,
});

engine.onCandles((candles) => {
  // Candles footprint prêtes pour le rendu
  console.log('Candles:', candles.length);
});

engine.onStatus((status) => {
  console.log('Engine status:', status);
});

await engine.connect();
```

## Format des données

### Trade (WebSocket → Next.js)

```json
{
  "type": "trade",
  "data": {
    "symbol": "NQ",
    "price": 21500.25,
    "size": 3,
    "side": "ask",
    "timestamp": 1700000000000,
    "exchange": "CME"
  }
}
```

### Candle Footprint (Engine → UI)

```typescript
interface FootprintCandle {
  symbol: string;           // "NQ"
  timeframe: number;        // 60 (seconds)
  openTime: number;         // Unix timestamp (seconds)
  open: number;
  high: number;
  low: number;
  close: number;
  levels: Map<number, FootprintLevel>;
  totalVolume: number;
  totalBuyVolume: number;   // ASK volume
  totalSellVolume: number;  // BID volume
  totalDelta: number;       // Buy - Sell
  poc: number;              // Point of Control
  vah: number;              // Value Area High
  val: number;              // Value Area Low
}

interface FootprintLevel {
  price: number;
  bidVolume: number;
  askVolume: number;
  delta: number;
  imbalanceBuy: boolean;
  imbalanceSell: boolean;
  isPOC: boolean;
}
```

## Où trouver vos credentials Topstep

### Topstep Combine / Funded

1. Connectez-vous à https://www.topstep.com
2. Allez dans Dashboard → Trading Platform
3. Sélectionnez "Rithmic" comme plateforme
4. Vos credentials sont les mêmes que Rithmic Trader Pro

### TopstepX

1. Connectez-vous à https://www.topstepx.com
2. Utilisez les mêmes identifiants que la plateforme de trading

## Dépannage

### "Connection refused"

Le bridge Python n'est pas lancé:
```bash
python rithmic_bridge.py
```

### "Authentication failed"

Vérifiez vos credentials dans `.env`:
- Username correct?
- Password correct?
- Compte Rithmic activé sur Topstep?

### Pas de trades

- Le marché CME est-il ouvert? (Dim 18h - Ven 17h ET)
- Votre compte a-t-il accès aux données?
- Vérifiez les logs du bridge pour les erreurs

## Mode Simulation

Si aucun credential n'est fourni, le bridge tourne en mode simulation pour tester l'architecture:

```
[INFO] No credentials provided - running in SIMULATION mode
```

Les trades simulés sont générés pour tester le flux complet.

## Symboles supportés

| Symbole | Description              | Tick Size | Tick Value |
|---------|--------------------------|-----------|------------|
| NQ      | E-mini Nasdaq 100        | 0.25      | $5.00      |
| MNQ     | Micro E-mini Nasdaq 100  | 0.25      | $0.50      |
| ES      | E-mini S&P 500           | 0.25      | $12.50     |
| MES     | Micro E-mini S&P 500     | 0.25      | $1.25      |

## Limitations

- **Latence**: ~50-100ms réseau + processing
- **Rate limit**: Dépend de votre abonnement Rithmic
- **Heures de marché**: CME Globex (Dim 18h - Ven 17h ET)
- **Pas de historical**: Données live uniquement

## Production

Pour la production avec l'API Rithmic complète:

1. Installez `pyrithmic`:
```bash
pip install pyrithmic
```

2. Décommentez le code Rithmic dans `rithmic_bridge.py`

3. Remplacez la simulation par les callbacks réels
