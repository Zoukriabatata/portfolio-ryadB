# Quantower Bridge — Design Spec

**Date:** 2026-06-09  
**Status:** Approved  
**Author:** Ryad Bouderga

---

## 1. Objectif

Créer un bridge TCP entre **Quantower** (indicator C# côté plateforme de trading) et l'application desktop Orderflow-v2 (Tauri), permettant de streamer les ticks et le DOM depuis Quantower (feed Rithmic) vers le moteur footprint — exactement comme le bridge NinjaTrader existant, sur le port **7273**.

---

## 2. Architecture générale

```
┌─────────────────────┐     TCP 127.0.0.1:7272     ┌──────────────────────┐
│   NinjaTrader 8     │──── CSV M/H/E/L/V/D/P ────►│  BridgeAdapter (NT)  │
│  OrderflowBridge    │                             │  port 7272           │
└─────────────────────┘                             └──────────┬───────────┘
                                                               │
┌─────────────────────┐     TCP 127.0.0.1:7273                │  FootprintEngine (partagé)
│   Quantower         │──── CSV M/H/E/L/V/D/P ────►│  BridgeAdapter (QT)  │
│  QuantowerBridge    │     (protocole identique)   │  port 7273           │
└─────────────────────┘                             └──────────┬───────────┘
                                                               │
                                                    ┌──────────▼───────────┐
                                                    │   Tauri IPC          │
                                                    │  footprint-update    │
                                                    │  quantower-state     │
                                                    │  quantower-depth-update│
                                                    └──────────┬───────────┘
                                                               │
                                             ┌─────────────────▼──────────────┐
                                             │  MultiSourceFootprint.tsx       │
                                             │  source: rithmic | bridge | qt  │
                                             └────────────────────────────────┘
```

**Principe de réutilisation maximal :** le `BridgeAdapter`, `parser.rs`, `reader.rs` et l'ensemble du protocole wire sont réutilisés tels quels. Le Quantower bridge est un second écouteur TCP sur un port différent — rien d'autre.

---

## 3. Protocole wire (identique NT bridge)

Chaque ligne est un message UTF-8 terminé par `\n`. Le champ `seq` est un entier incrémental émis par le client C#.

| Type | Format | Description |
|---|---|---|
| Tick | `M,{seq},{symbol},{price},{qty},{side}\n` | Trade print (side = B ou S) |
| Heartbeat | `H,{seq}\n` | Keep-alive toutes les secondes |
| End-of-history | `E,{seq}\n` | Fin du replay historique |
| Bar fermée | `L,{seq},{symbol},{tf},{o},{h},{l},{c},{vol}\n` | Bar fermée (optionnel) |
| Volume | `V,{seq},{symbol},{price},{bidVol},{askVol}\n` | Volume par niveau |
| DOM | `D,{seq},{symbol},{side},{price},{qty}\n` | Mise à jour DOM (side = B ou S) |
| Ping | `P,{seq}\n` | Ping (réponse attendue côté app : ignoré pour l'instant) |

---

## 4. Rust — Côté backend Tauri

### 4.1 Nouveaux fichiers

| Fichier | Description |
|---|---|
| `src-tauri/src/commands/quantower_bridge.rs` | Commandes connect/disconnect/status |
| `src-tauri/src/commands/quantower_bridge_depth.rs` | Pump + emitter DOM, commande get_depth |
| `src-tauri/src/commands/quantower_bridge_events.rs` | Emitter état connexion |

### 4.2 Modifications de fichiers existants

**`src-tauri/src/state.rs`** — ajouter `QuantowerState` :

```rust
pub struct QuantowerState {
    pub adapter:      Mutex<Option<BridgeAdapter>>,  // même type, protocole identique
    pub engine:       Arc<FootprintEngine>,           // partagé avec RithmicState
    pub engine_pump:  Mutex<Option<JoinHandle<()>>>,
    pub state_emit:   Mutex<Option<JoinHandle<()>>>,
    pub depth_pump:   Mutex<Option<JoinHandle<()>>>,
}

impl QuantowerState {
    pub fn new(engine: Arc<FootprintEngine>) -> Self { ... }
}
```

**`src-tauri/src/commands/mod.rs`** — ajouter :
```rust
pub mod quantower_bridge;
pub mod quantower_bridge_depth;
pub mod quantower_bridge_events;
```

**`src-tauri/src/lib.rs`** — enregistrer l'état et les commandes :
```rust
// manage()
app.manage(QuantowerState::new(rithmic_state.engine.clone()));
app.manage(Arc::new(QuantowerDepthState::new()));

// invoke_handler
quantower_bridge::quantower_connect,
quantower_bridge::quantower_disconnect,
quantower_bridge::quantower_status,
quantower_bridge_depth::quantower_get_depth,

// setup : lancer l'emitter DOM (long-lived, comme bridge_depth)
commands::quantower_bridge_depth::spawn_emitter(app.handle().clone(), quantower_depth_arc);
```

### 4.3 Différences vs NT bridge

| Paramètre | NT bridge | Quantower bridge |
|---|---|---|
| Port défaut | 7272 | **7273** |
| Event état | `bridge-state` | `quantower-state` |
| Event DOM | `bridge-depth-update` | `quantower-depth-update` |
| Command prefix | `bridge_*` | `quantower_*` |
| Struct état | `BridgeState` | `QuantowerState` |
| Depth state | `BridgeDepthState` | `QuantowerDepthState` |

---

## 5. Frontend — React/TypeScript

### 5.1 Nouveau fichier

**`desktop/src/components/QuantowerFootprint.tsx`**  
Copie de `BridgeFootprint.tsx` avec :
- Events Tauri : `quantower-state`, `quantower-depth-update`
- Commandes invoke : `quantower_connect`, `quantower_disconnect`, `quantower_status`, `quantower_get_depth`
- Port par défaut : `7273`
- Labels UI : "Quantower" (au lieu de "NinjaTrader")

### 5.2 Modification

**`desktop/src/components/MultiSourceFootprint.tsx`**  
Ajouter `"quantower"` comme 3e source dans le switcher :

```tsx
type FootprintSource = "rithmic" | "bridge" | "quantower";

// Bouton switcher
<button onClick={() => setSource("quantower")}>Quantower</button>

// Rendu conditionnel
{source === "quantower" && <QuantowerFootprint symbol={symbol} />}
```

**`desktop/src/App.tsx`** — aucun changement (le routing pointe déjà sur `MultiSourceFootprint`).

---

## 6. C# — Indicator Quantower

### 6.1 Fichier

```
Quantower/Scripts/Indicators/QuantowerOrderflowBridge.cs
```

Placé dans le dossier Scripts/Indicators de l'installation Quantower (détecté automatiquement par le script engine).

### 6.2 Structure

```csharp
using System;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using TradingPlatform.BusinessLayer;

[Indicator("QuantowerOrderflowBridge", "Senzoukria Orderflow Bridge for Quantower", Version = "1.0")]
public class QuantowerOrderflowBridge : Indicator
{
    [InputParameter("Port", 0, 1024, 65535)]
    public int Port = 7273;

    private TcpListener _listener;
    private TcpClient   _client;
    private NetworkStream _stream;
    private Thread      _serverThread;
    private int         _seq;
    private bool        _running;

    protected override void OnInit()   => StartServer();
    protected override void OnUpdate(UpdateArgs args) { /* non utilisé */ }
    protected override void OnTrade(Trade trade)      => SendTick(trade);
    protected override void OnLevel2(Level2Quote q)   => SendDepth(q);
    protected override void OnStop()                  => StopServer();
    // + heartbeat Thread envoyant H,{seq}\n toutes les secondes
}
```

### 6.3 Mapping Quantower → protocole wire

| Événement Quantower | Message envoyé |
|---|---|
| `OnTrade(trade)` | `M,{seq},{symbol},{price},{qty},{B\|S}\n` |
| `OnLevel2(quote)` | `D,{seq},{symbol},{B\|S},{price},{qty}\n` |
| Timer 1s | `H,{seq}\n` |
| OnInit() | Émet `E,{seq}\n` une fois que l'historique initial est rejouée (à définir selon l'API Quantower) |

### 6.4 Installation

1. Copier `QuantowerOrderflowBridge.cs` dans `%QUANTOWER_DIR%\Scripts\Indicators\`
2. Dans Quantower : **Tools → Scripts** → compiler
3. Ajouter l'indicateur sur un chart avec le symbole souhaité (Rithmic feed)
4. Dans l'app Orderflow-v2 : source = Quantower → Connect

---

## 7. Gestion d'erreurs et reconnexion

- La reconnexion est gérée côté `BridgeAdapter` existant (backoff exponentiel, re-subscribe automatique) — aucun changement nécessaire.
- Le frontend `QuantowerFootprint.tsx` affiche les états `Connecting → ReceivingHistory → Live → Reconnecting` via l'event `quantower-state` (même logique que `BridgeFootprint`).
- Si le port 7273 est déjà occupé, `quantower_connect` retourne une erreur Rust explicite : `"port 7273 already in use"`.

---

## 8. Contraintes et invariants

- **Isolation des ports** : NT (7272) et Quantower (7273) peuvent tourner simultanément sans conflit.
- **Engine partagé** : `QuantowerState` partage le même `Arc<FootprintEngine>` que `RithmicState` et `BridgeState`. Les bars générées par Quantower apparaissent sur le même event `footprint-update` — le frontend filtre par source via `QuantowerFootprint`.
- **Credentials** : aucun secret n'est stocké ni transmis — le bridge est purement local (loopback).
- **Pas de dépendance Rithmic directe** : Quantower se connecte lui-même à Rithmic, l'app reçoit des ticks déjà classifiés via CSV.

---

## 9. Fichiers créés / modifiés — récap

| Fichier | Action |
|---|---|
| `src-tauri/src/state.rs` | +`QuantowerState` |
| `src-tauri/src/commands/quantower_bridge.rs` | Nouveau |
| `src-tauri/src/commands/quantower_bridge_depth.rs` | Nouveau |
| `src-tauri/src/commands/quantower_bridge_events.rs` | Nouveau |
| `src-tauri/src/commands/mod.rs` | +3 pub mod |
| `src-tauri/src/lib.rs` | +manage + commandes + emitter |
| `src/components/QuantowerFootprint.tsx` | Nouveau |
| `src/components/MultiSourceFootprint.tsx` | +source "quantower" |
| `Quantower/Scripts/Indicators/QuantowerOrderflowBridge.cs` | Nouveau |
