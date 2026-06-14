# Module Account — Dashboard read-only Apex/Rithmic

**Date** : 2026-05-18
**Auteur** : Ryad / Claude
**Statut** : design validé, prêt pour plan d'implémentation

## Contexte

Le module Account est l'un des modules prévus du logiciel desktop OrderFlow (`CLAUDE.md` §2, module #7). À ce jour, seul un placeholder existe : `desktop/src/routes/AccountRoute.tsx` rend un `<WebFrame>` vide. Côté backend Rust, `connectors/rithmic/order_plant.rs` existe mais sert uniquement au journal sync (pull one-shot des order history pour reconstruire les trades du journal). Aucune intégration PnL/positions live, aucune intégration `RequestAccountRmsInfo`.

Le but : donner au trader prop firm Apex un dashboard read-only qui montre en temps réel :
- l'état de son compte (balance, daily PnL, trailing drawdown remaining) — KPIs critiques pour ne pas blow-up,
- ses positions ouvertes avec unrealized PnL live,
- ses ordres en attente (working orders),
- une mini equity curve du jour + statistiques agrégées (nb trades, win rate).

Public principal : un trader Apex sur futures CME qui veut voir d'un coup d'œil où il en est par rapport aux règles prop firm sans quitter l'app.

## Scope MVP

**In scope**
- Lecture en temps réel des comptes Rithmic via les plants `PnlPlant` et `OrderPlant`.
- Affichage : 3 KPIs Apex (balance / daily PnL / trailing DD remaining) avec barre de progression vers daily loss limit.
- Liste live des positions ouvertes.
- Liste read-only des working orders.
- Mini equity curve intra-day collectée côté client à partir des updates PnL.
- Stats du jour : nb trades, win rate, best/worst trade.

**Out of scope (YAGNI)**
- Placement / modification / cancel d'ordres (full trading panel).
- Historique multi-jour de l'equity curve (perdu au reboot, repart de zéro à chaque session live).
- Multi-compte simultané (un seul compte actif à la fois ; picker si plusieurs comptes existent sur le login).
- Notifications push quand proche du loss limit (alerte visuelle rouge dans l'UI suffit).
- Risk analytics avancées (Sharpe, max drawdown théorique) — c'est le rôle du Journal.
- Persistance SQLite des stats account — tout en mémoire.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  Frontend React — AccountRoute                       │
│   ┌────────────────────────────────────────────────┐ │
│   │ Header : Account picker (si >1 compte)         │ │
│   ├────────────────────────────────────────────────┤ │
│   │ 3 KPI cards : Balance / Daily PnL / Trailing DD│ │
│   ├──────────────────────┬─────────────────────────┤ │
│   │ Positions table      │ Working orders table    │ │
│   ├──────────────────────┴─────────────────────────┤ │
│   │ Equity curve + Day stats                       │ │
│   └────────────────────────────────────────────────┘ │
│   useAccountStore (Zustand)                          │
└────────────────────┬─────────────────────────────────┘
                     │ invoke + listen events
┌────────────────────┴─────────────────────────────────┐
│  Backend Rust                                        │
│   • commands/account.rs   (Tauri commands)           │
│   • connectors/rithmic/                              │
│       ├─ pnl_plant.rs          (long-lived)          │
│       └─ order_subscribe.rs    (long-lived)          │
└────────────────────┬─────────────────────────────────┘
                     │ WebSocket (Rithmic R|Protocol)
            ┌────────┴─────────┐
            │ Apex/Rithmic     │
            │ gateway          │
            └──────────────────┘
```

Deux **sockets long-lived supplémentaires** s'ouvrent quand l'utilisateur active le feed live (mount de `AccountRoute`). Le Ticker Plant existant (market data) reste inchangé.

## Backend Rust

### Module `connectors/rithmic/pnl_plant.rs`

Long-lived adapter, pattern miroir de `RithmicAdapter` (Ticker Plant) :

```
flow:
  1. open WebSocket
  2. RequestLogin (infra_type = PnlPlant)
  3. RequestAccountList                         → liste des comptes
  4. pour chaque compte :
       RequestAccountRmsInfo                    → règles risk (daily limit, max loss, trailing)
       RequestPnLPositionSnapshot               → état initial
  5. RequestPnLPositionUpdates (subscribe)      → stream live
  6. heartbeat + drain frames :
       ResponseAccountList / ResponseRmsInfo (one-shot)
       AccountPnLPositionUpdate (compte-level)  → broadcast `account-stats-update`
       InstrumentPnLPositionUpdate (par symbole) → mise à jour positions
  7. reconnect avec backoff exponentiel
  8. cleanup : logout + close socket
```

Templates Rithmic (à confirmer au runtime — non testés dans le projet à ce jour) :
- `REQUEST_ACCOUNT_LIST = 302`, `RESPONSE_ACCOUNT_LIST = 303`
- `REQUEST_ACCOUNT_RMS_INFO = 304`, `RESPONSE_ACCOUNT_RMS_INFO = 305`
- `REQUEST_PNL_POSITION_SNAPSHOT = 402`, `RESPONSE_PNL_POSITION_SNAPSHOT = 403`
- `REQUEST_PNL_POSITION_UPDATES = 400`, `RESPONSE_PNL_POSITION_UPDATES = 401`
- `ACCOUNT_PNL_POSITION_UPDATE = 451`
- `INSTRUMENT_PNL_POSITION_UPDATE = 450`

### Module `connectors/rithmic/order_subscribe.rs`

Long-lived adapter sur `OrderPlant` (distinct de l'existant `order_plant.rs` qui reste réservé au journal sync one-shot) :

```
flow:
  1. open WebSocket
  2. RequestLogin (infra_type = OrderPlant)
  3. RequestSubscribeForOrderUpdates (template 308)
  4. drain frames :
       RithmicOrderNotification (352)          → ordres au statut working
       ExchangeOrderNotification (351)         → confirmations exchange
     filtrer pour ne garder que `working` / `pending` / `partially_filled`
     broadcast snapshot complet via `account-orders-update`
  5. heartbeat
  6. reconnect avec backoff exponentiel
  7. cleanup : logout + close
```

### État partagé

```rust
pub struct AccountState {
    pub pnl_adapter: Mutex<Option<PnlPlantAdapter>>,
    pub order_adapter: Mutex<Option<OrderSubscribeAdapter>>,
    pub pnl_handle: Mutex<Option<JoinHandle<()>>>,
    pub order_handle: Mutex<Option<JoinHandle<()>>>,
}
```

Géré par Tauri via `.manage(AccountState::default())` dans `lib.rs`.

### Commandes Tauri

```rust
#[tauri::command]
pub async fn account_list() -> Result<Vec<Account>, String>;
// One-shot : ouvre PnL plant, login, RequestAccountList, logout, close.
// Retourne la liste découverte. Utilisé par le frontend au mount pour
// peupler le picker.

#[tauri::command]
pub async fn account_start_live(state: State<'_, AccountState>, args: StartLiveArgs)
    -> Result<(), String>;
// Lance les 2 adapters long-lived en background, abonne aux updates,
// commence à émettre `account-stats-update`, `account-positions-update`,
// `account-orders-update` via tauri AppHandle::emit.

#[tauri::command]
pub async fn account_stop_live(state: State<'_, AccountState>) -> Result<(), String>;
// Logout + close des 2 sockets, join des tasks, clear l'état.
```

`StartLiveArgs { accountId: String }` (camelCase via serde).

### Types Rust (serialized camelCase)

```rust
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,           // "AP000123"
    pub fcm: String,          // "Apex"
    pub ib_id: String,
    pub system_name: String,  // "Apex Eval $50K"
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AccountStats {
    pub account_id: String,
    pub balance: f64,
    pub start_of_day_balance: f64,
    pub daily_pnl: f64,
    pub daily_loss_limit: Option<f64>,        // négatif, ex -2500
    pub trailing_drawdown: Option<f64>,       // current min before blow-up
    pub trailing_drawdown_limit: Option<f64>,
    pub margin_used: Option<f64>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Position {
    pub account_id: String,
    pub symbol: String,
    pub exchange: String,
    pub side: PositionSide,    // Long | Short | Flat (lowercase)
    pub qty: f64,
    pub avg_price: f64,
    pub market_price: f64,
    pub unrealized_pnl: f64,
    pub realized_pnl_today: f64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkingOrder {
    pub account_id: String,
    pub order_id: String,
    pub symbol: String,
    pub exchange: String,
    pub side: OrderSide,        // Buy | Sell (lowercase)
    pub order_type: OrderType,  // Limit | Stop | Market | StopLimit (snake_case)
    pub qty: f64,
    pub filled_qty: f64,
    pub limit_price: Option<f64>,
    pub stop_price: Option<f64>,
    pub status: String,
    pub placed_at: String,      // ISO 8601
}
```

## Frontend

### Layout `routes/AccountRoute.tsx`

Remplace le `<WebFrame>` placeholder par un layout vertical :

```tsx
<div className="account-route">
  <AccountHeader />          {/* compte picker + status live */}
  <AccountKpis />            {/* 3 KPI cards en grille */}
  <div className="account-split">
    <PositionsTable />       {/* 50% */}
    <WorkingOrdersTable />   {/* 50% */}
  </div>
  <div className="account-bottom">
    <EquityCurve />          {/* canvas mini */}
    <DayStats />             {/* chips agrégés */}
  </div>
</div>
```

Au mount : `account_list()` puis si la liste est non vide, auto-select le premier compte et lance `account_start_live(accountId)`. Au unmount : `account_stop_live()`.

Reactivité : 3 `useEffect` qui s'abonnent aux events Tauri (`account-stats-update`, `account-positions-update`, `account-orders-update`) et update le store. Cleanup unlisten à l'unmount.

### Composants

```
src/components/account/
├── AccountHeader.tsx        compte picker (dropdown si >1) + indicator live (vert si feed actif)
├── AccountKpis.tsx          3 cards : Balance / Daily PnL / Trailing DD remaining
│                            chaque card : valeur grosse, label gris uppercase,
│                            barre de progression si limite existe,
│                            couleur rouge si proche limite (<20% remaining)
├── PositionsTable.tsx       table : Symbol | Side | Qty | Avg | Last | uPnL
│                            ligne colorée pos/neg sur uPnL
├── WorkingOrdersTable.tsx   table : Symbol | Side | Type | Qty | Limit | Stop | Status
├── EquityCurve.tsx          canvas 2D ~300px de haut, trace la liste equityCurve du store
└── DayStats.tsx             chips inline : "12 trades · WR 58% · Best +$420 · Worst -$180"

src/lib/account/
├── api.ts                   wrappers invoke + types TS miroirs
└── useAccountStore.ts       Zustand
```

### Store Zustand

```ts
type AccountStoreState = {
  accounts: Account[];
  activeAccountId: string | null;
  stats: AccountStats | null;
  positions: Position[];
  workingOrders: WorkingOrder[];
  equityCurve: EquityPoint[];      // collecté client-side
  dayStats: DayStats;
  loading: boolean;
  error: string | null;
  feedActive: boolean;

  setActiveAccount: (id: string) => Promise<void>;  // stop current, start new
  startLive: (id: string) => Promise<void>;
  stopLive: () => Promise<void>;
  setStats: (s: AccountStats) => void;              // appelée par listener
  setPositions: (p: Position[]) => void;
  setOrders: (o: WorkingOrder[]) => void;
};
```

**Equity curve sampling** : à chaque `account-stats-update`, on push un `{ ts: Date.now(), balance }` dans `equityCurve` si > 30s depuis le dernier point. Hard cap à 1500 points (= ~12h de session à un point/30s) — eviction FIFO si dépassé.

**Day stats** : recalculé côté frontend depuis l'historique de positions changes (fermeture position = trade clos). MVP : compteur naïf à partir des transitions `qty != 0 → qty == 0` détectées dans le flux positions. Pour le win rate / best / worst, on garde la liste des PnL réalisés depuis le start du feed (cleared au stop).

## Flux de données

### Mount de `/account`
1. `AccountRoute` mount → `account_list()` invoke.
2. Si liste vide → message "No accounts configured. Set up your broker first."
3. Si liste non vide → auto-select premier compte → `startLive(id)`.
4. Backend lance les 2 adapters, login, subscribe.
5. Les 3 events commencent à fluer → store update → composants re-rendent.

### Changement de compte actif
1. User pick un autre compte dans le picker.
2. Store `setActiveAccount(newId)` → `stopLive()` puis `startLive(newId)`.
3. Reset des collections en mémoire (`equityCurve`, dayStats, positions, orders).

### Erreur de connexion / disconnect
1. Adapter détecte close → tente reconnect avec backoff.
2. Frontend reçoit un event `account-feed-status` (à ajouter) avec `connecting | connected | disconnected | error`.
3. AccountHeader affiche un indicateur visuel correspondant.

### Unmount de `/account`
1. `AccountRoute` cleanup → `stopLive()`.
2. Adapters logout + close.
3. Store reset (sauf `accounts` qui peut rester cached).

## Calcul Apex-spécifique

Le **trailing drawdown** Apex suit la règle "trailing balance + lock once paid out" :
- Trailing distance fixe par taille de compte (ex $50K Eval = $2500).
- Trailing balance courante = `max(balance historique du compte, balance_initiale) - trailing_distance`, tant que `balance < starting_balance + trailing_distance`.
- Une fois `balance >= starting_balance + trailing_distance`, la trailing balance se lock à `starting_balance` (pour Eval) ou `starting_balance + N` (pour PA).

Rithmic renvoie `account_balance` et possiblement `min_account_balance` (= trailing balance) dans `AccountRmsUpdate`. Notre code lit ces deux champs et calcule :
```
trailingDrawdownRemaining = balance - minAccountBalance
```

Si `minAccountBalance` n'est pas fourni, on affiche `null` et l'UI montre "—" pour ce KPI (gracefully degraded).

## Erreurs et états dégradés

| Cas | Comportement |
|-----|--------------|
| Pas de credentials broker configurés | Message "Configure your broker in Settings to use Account." + bouton qui ouvre BrokerSettings. |
| `account_list()` retourne `[]` | "No accounts found on this login." |
| `account_start_live()` échoue (login refusé, rp_code≠0) | Toast erreur + état `error` dans store, UI montre dernier snapshot ou empty state. |
| Disconnect en cours de session | Indicateur visuel (point rouge dans header) ; reconnect auto en arrière-plan. |
| Un seul des 2 plants se déconnecte | Les autres données restent fraîches ; le panneau affecté affiche un overlay "stale data". |

## Tests

### Rust
- `connectors/rithmic/pnl_plant.rs` : test unitaire de parsing d'un payload `AccountPnLPositionUpdate` figé (fixture proto-encoded ou JSON façonné) → vérifie le mapping vers `AccountStats`.
- `connectors/rithmic/order_subscribe.rs` : test de filtrage — un payload `RithmicOrderNotification` avec status `filled` n'apparaît PAS dans la liste working ; un avec `working` ou `partially_filled` y apparaît.
- Pas de test d'intégration réseau (consommerait du quota et flake-prone).

### Frontend
- Pas de tests unitaires en MVP (cohérent avec le reste de la codebase). Validation visuelle + manual smoke test (placer un ordre paper, voir qu'il apparaît ; rentrer en position, voir le PnL bouger).

## Risques

| Risque | Atténuation |
|--------|-------------|
| Templates Rithmic PnL/Order non testés dans ce projet | Ajouter un module `account_probe.rs` (équivalent du `history_probe.rs` pour Tick) qui ouvre le PnL plant, fait une seule série de requêtes, logue les rp_codes. À utiliser en validation runtime avant de croire que le adapter long-lived fonctionne. |
| Trailing drawdown Apex mal calculé | Vérifier la valeur `minAccountBalance` reçue vs le UI Apex officiel sur 2-3 sessions avant de la considérer fiable. Si discrepance, switcher en mode "computed client-side" depuis l'historique de balance. |
| Une session Rithmic limite N sockets concurrents | On a déjà Ticker Plant + History Plant (one-shot). On ajoute PnL Plant + Order Plant en long-lived. Total = 4 sockets simultanés. À tester ; si Apex refuse, on séquence (login PnL → snapshot → close → garder à jour via polling). |
| Le PnL plant déconnecte fréquemment | Backoff exponentiel + retry indefiniment ; UI reste avec dernier snapshot tagué "stale". |

## Ouvert pour discussion future (post-MVP)

- Placement / cancel d'ordres (Phase 2 du module Account).
- Multi-compte simultané affiché (split vertical par compte).
- Persistance des stats journalières dans le SQLite cache (continuité equity curve cross-session).
- Alertes push (Tauri notification) quand DD remaining < 10%.
- Integration avec le Journal : un trade fermé alimente le PnL graph et compte dans dayStats.
