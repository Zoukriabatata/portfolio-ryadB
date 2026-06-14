# Module GEX — Gamma Exposure dashboard (Tradier)

**Date** : 2026-05-18
**Auteur** : Ryad / Claude
**Statut** : design validé, prêt pour plan d'implémentation

## Contexte

Le module GEX (Gamma Exposure) est l'un des modules prévus du logiciel desktop OrderFlow (`CLAUDE.md` §2, module #2). À ce jour, seul un placeholder existe : `desktop/src/routes/GexRoute.tsx` rend un `<PlaceholderRoute />`. Le placeholder mentionnait des endpoints `/api/gex-*` côté web mais cette infrastructure n'existe pas réellement — il faut construire le module from scratch.

Le but : donner au trader d'indices futures (MNQ/NQ, MES/ES) un aperçu des **niveaux clés gamma des dealers** sur SPY/QQQ (proxys SPX/NDX). Ces niveaux (Zero Gamma, Call Wall, Put Wall) sont utilisés pour anticiper les zones de support/résistance "mécaniques" induites par le hedging des market makers d'options.

## Scope MVP

**In scope**
- Source de données : **Tradier Sandbox API** (gratuit, REST, bearer auth, greeks fournis).
- Symboles : **SPY** (proxy SPX/ES) + **QQQ** (proxy NDX/NQ).
- Compute côté Rust : Net GEX par strike (calls − puts), Zero Gamma, Call Wall, Put Wall, Total GEX.
- Display GEX : **bar chart strike-by-strike** (style SpotGamma) — barres vertes calls / rouges puts, ligne verticale spot, markers Walls + Zero γ.
- Display IV Smile : **line chart par strike** pour une expiration sélectionnable (OTM-only convention : puts < spot, calls > spot). Reuse les chains déjà fetched — pas de requête Tradier additionnelle.
- Refresh : manuel + auto toutes les 15 min (visibility-paused).
- API key stockée via keyring (pattern Finnhub existant).

**Out of scope (YAGNI)**
- 3D surface par expiration (le placeholder l'évoquait — joli mais peu utile pour trader).
- Historique multi-jour du GEX (snapshot courant uniquement).
- Alertes quand spot croise un Wall ou Zero γ.
- Options sur futures NQ/ES directes (Tradier sandbox = options sur ETF only).
- Symboles supplémentaires (IWM, VIX, individual stocks).
- Back-test / replay.

## Source de données : Tradier

**Endpoints** (sandbox URL : `https://sandbox.tradier.com/v1/`) :
- `GET /markets/options/expirations?symbol={sym}&includeAllRoots=true` → liste des expirations ISO.
- `GET /markets/options/chains?symbol={sym}&expiration={iso}&greeks=true` → chain pour 1 expiration (calls + puts avec OI + gamma + delta + IV).
- `GET /markets/quotes?symbols={sym}` → spot price.

**Auth** : Bearer token via header `Authorization: Bearer <token>`. Token créé gratuitement via le dev portal Tradier ; stocké via keyring.

**Limites sandbox** :
- 60 requêtes/minute.
- Quotes delayed 15 min.
- Options chains à jour à la minute, suffisant pour GEX (les OI bougent peu intraday).

**Stratégie de fetch** :
- Filtre expirations à **next 30 days** (couvre 0DTE / weeklies / front-month).
- Fetch séquentiel des chains (1 call/expiration). ~5-10 expirations dans la fenêtre → ~10 calls par symbole. SPY + QQQ = ~20 calls. Bien sous le quota.
- Cache mémoire 15 min côté Rust pour ne pas spam Tradier sur des refresh accidentels.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  Frontend React — GexRoute                           │
│   ┌────────────────────────────────────────────────┐ │
│   │ Header : Symbol picker SPY/QQQ + spot + refresh│ │
│   ├────────────────────────────────────────────────┤ │
│   │ Key levels : 3 cards (Zero γ / Call W / Put W) │ │
│   ├────────────────────────────────────────────────┤ │
│   │ Bar chart canvas (strikes × GEX, walls overlay)│ │
│   └────────────────────────────────────────────────┘ │
│   useGexStore (Zustand)                              │
└────────────────────┬─────────────────────────────────┘
                     │ invoke
┌────────────────────┴─────────────────────────────────┐
│  Backend Rust                                        │
│   • commands/gex.rs       (Tauri commands)           │
│   • connectors/tradier/                              │
│       ├─ client.rs        (REST + bearer auth)       │
│       ├─ options.rs       (chains + greeks parser)   │
│       ├─ api_key.rs       (keyring vault)            │
│       └─ gex.rs           (compute Net GEX + levels) │
└────────────────────┬─────────────────────────────────┘
                     │ HTTPS
            ┌────────┴─────────┐
            │  sandbox.tradier │
            │  .com/v1/        │
            └──────────────────┘
```

## Backend Rust

### Module `connectors/tradier/`

**`client.rs`** : thin reqwest wrapper. Constructeur prend l'api_key. Method `get_json<T>(path, query) -> Result<T>` qui injecte `Authorization: Bearer <key>` header, parse 200 JSON, map 401 → `Unauthorized`, 429 → `RateLimited`, 5xx → `Upstream`.

**`options.rs`** : trois async functions séparées :
```rust
pub async fn fetch_expirations(client: &TradierClient, symbol: &str) -> Result<Vec<String>>;
pub async fn fetch_chain(client: &TradierClient, symbol: &str, expiration: &str) -> Result<OptionChain>;
pub async fn fetch_quote(client: &TradierClient, symbol: &str) -> Result<f64>;  // spot
```

`OptionChain { calls: Vec<OptionLeg>, puts: Vec<OptionLeg> }`. `OptionLeg { strike: f64, open_interest: u64, gamma: Option<f64>, delta: Option<f64>, iv: Option<f64> }`.

Tradier renvoie l'API JSON dans une enveloppe `{ options: { option: [...] } }` — le parser le déballe et discrimine calls/puts via le champ `option_type`.

**`api_key.rs`** : vault keyring (service `OrderflowV2`, account `tradier_api_key_v1`). Mirror exact de `connectors/finnhub/api_key.rs`.

**`gex.rs`** : pure compute. Fonction principale :
```rust
pub fn compute_gex(
    symbol: &str,
    spot: f64,
    expirations: &[(String, OptionChain)],
) -> GexSnapshot;
```

Algorithme :
```
multiplier = 100  // SPY/QQQ
spot_sq = spot * spot

For each (expiration, chain) :
  For each call_leg in chain.calls :
    if let Some(gamma) = call_leg.gamma :
      gex_strike[call_leg.strike].call_gex += OI × gamma × multiplier × spot_sq × 0.01
  For each put_leg in chain.puts :
    if let Some(gamma) = put_leg.gamma :
      gex_strike[put_leg.strike].put_gex -= OI × gamma × multiplier × spot_sq × 0.01  // dealer short put = negative

net_gex_per_strike = call_gex + put_gex                                                // signed

Sort strikes ascending.

zero_gamma : cumulative net_gex from -∞ to current strike. Find strike where cumul changes sign.
call_wall  : strike > spot with max(|net_gex|) and net_gex > 0.
put_wall   : strike < spot with max(|net_gex|) and net_gex < 0.
total_gex  : Σ net_gex.
```

**Skip rule** : strikes où `gamma is None` ou `OI == 0` sont ignorés (Tradier laisse parfois greeks à null sur deep OTM/ITM).

### Commande Tauri

```rust
#[tauri::command]
pub async fn gex_fetch_snapshot(
    state: State<'_, GexState>,
    args: FetchGexArgs,
) -> Result<GexSnapshot, String>;

pub struct FetchGexArgs { pub symbol: String }
```

`GexState { cache: TtlCache<GexSnapshot> }` (TTL 15 min, réutilise `TtlCache` du module Finnhub).

Plus les 3 commandes API key (mirror Finnhub) :
- `gex_save_api_key(key: String)`
- `gex_has_api_key() -> bool`
- `gex_delete_api_key()`

### Types serializés

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GexSnapshot {
    pub symbol: String,
    pub spot: f64,
    pub computed_at: String,                  // ISO 8601 UTC
    pub expiration_count: u32,
    pub strikes: Vec<GexStrike>,              // sorted ascending
    pub zero_gamma: Option<f64>,
    pub call_wall: Option<f64>,
    pub put_wall: Option<f64>,
    pub total_gex: f64,
    pub stale: bool,                          // true si servi du cache TTL
    pub iv_smiles: Vec<IvSmile>,              // une entrée par expiration
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GexStrike {
    pub strike: f64,
    pub call_gex: f64,    // ≥ 0
    pub put_gex: f64,     // ≤ 0 (convention dealer)
    pub net_gex: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IvSmile {
    pub expiration: String,    // ISO date, e.g. "2026-05-30"
    pub days_to_expiry: u32,
    pub points: Vec<IvPoint>,  // sorted by strike
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IvPoint {
    pub strike: f64,
    pub iv: f64,           // implied vol fraction, e.g. 0.18 = 18%
    pub side: IvSide,      // Put | Call (which leg's IV we kept)
}

#[derive(Serialize)]
#[serde(rename_all = "lowercase")]
pub enum IvSide { Put, Call }
```

**Compute IV smile** (réutilise les chains déjà fetched, zéro requête supplémentaire) :
```
For each expiration :
  For each strike present in the chain :
    if strike < spot && put_leg.iv is Some :
      points.push({ strike, iv: put_leg.iv, side: Put })
    else if strike >= spot && call_leg.iv is Some :
      points.push({ strike, iv: call_leg.iv, side: Call })
    // OTM-only convention — l'IV ITM est dégénéré par parité put-call
```

## Frontend

### Layout `routes/GexRoute.tsx`

```tsx
<div className="gex-route">
  <GexHeader />          {/* picker symbol + spot + last-refresh + manual refresh */}
  <GexKeyLevels />       {/* 3 cards : Zero γ / Call Wall / Put Wall + Total GEX */}
  <GexBarChart />        {/* canvas 2D — pleine largeur, ~500px haut */}
  <GexIvSmile />         {/* canvas 2D — pleine largeur, ~300px haut, picker d'expiration */}
</div>
```

Au mount : `fetchSnapshot("SPY")` (default). Polling auto 15 min, visibility-paused. Persistance localStorage : symbol sélectionné + auto-refresh state.

### Composants

```
src/components/gex/
├── GexHeader.tsx          symbol picker (SPY/QQQ toggle) + spot value en gros +
│                          last-refresh time-ago + manual refresh button + auto toggle
├── GexKeyLevels.tsx       3 KPI cards : Zero Gamma, Call Wall, Put Wall.
│                          Affiche le strike + distance du spot (Δ % et Δ pts).
│                          + chip "Total GEX : $X.YBn" en haut.
├── GexBarChart.tsx        Canvas 2D ~500px de haut.
│                          - Axe Y : GEX en $M ou $B (tick auto)
│                          - Axe X : strikes (filtré ±5% spot par défaut, toggle full chain)
│                          - Barres vert (calls) au-dessus de 0, rouge (puts) en-dessous
│                          - Ligne horizontale 0 (gris)
│                          - Ligne verticale blanche : spot (label "SPOT $XXX")
│                          - Lignes verticales : Zero γ (jaune), Call Wall (vert vif), Put Wall (rouge vif) + labels
│                          - Hover tooltip basique : strike + Net GEX en $
├── GexIvSmile.tsx         Canvas 2D ~300px de haut.
│                          - Expiration picker (dropdown des expirations disponibles + DTE)
│                          - Axe Y : IV en % (auto-fit aux valeurs)
│                          - Axe X : strikes (range ±5% spot par défaut)
│                          - Line plot continu : segment vert pour Call IV (strikes > spot),
│                            segment rouge pour Put IV (strikes < spot). Markers ronds aux points.
│                          - Ligne verticale spot blanche
│                          - Annotation ATM IV (valeur du strike le plus proche du spot)
└── gex.css                palette logo green scoped à .gex-route

src/lib/gex/
├── api.ts                 invoke wrappers + types TS miroirs
└── useGexStore.ts         Zustand : { snapshot, symbol, loading, error, lastFetchedAt,
│                          autoRefresh, fetchSnapshot(), setSymbol(), toggleAutoRefresh() }
```

### Store

```ts
type GexStoreState = {
  snapshot: GexSnapshot | null;
  symbol: "SPY" | "QQQ";
  loading: boolean;
  error: string | null;
  lastFetchedAt: number | null;
  autoRefresh: boolean;
  selectedExpiration: string | null;     // for the IV smile picker

  setSymbol: (s: "SPY" | "QQQ") => Promise<void>;
  fetchSnapshot: () => Promise<void>;
  toggleAutoRefresh: () => void;
  setSelectedExpiration: (iso: string) => void;
};
```

Au reception d'un nouveau snapshot, `selectedExpiration` est auto-set au front-month (premier de `iv_smiles`) si non défini ou si l'ancien n'existe plus dans le nouveau snapshot.

Persisté en localStorage : `symbol` + `autoRefresh`. Le reste rechargé au mount.

### Hook polling

`useGexPolling()` : setInterval 15 min, visibility-paused. Mount dans `GexRoute` seulement.

### API key UI

Section ajoutée dans `BrokerSettings.tsx` sous "Finnhub API key (News module)" :
- Titre "Tradier API key (GEX module)"
- Description + lien dev.tradier.com (info text)
- Password input + Save + Remove
- Status pill "Configured ✓" si présent

## Flux de données

### Mount de `/gex`
1. `GexRoute` mount → `useGexPolling()` démarre.
2. Store détecte qu'il n'y a pas de snapshot → `fetchSnapshot(symbol)`.
3. Backend Rust : check cache 15 min → si miss, fetch Tradier (expirations → chains parallèles → quote → compute) → cache fill → return.
4. Frontend reçoit `GexSnapshot` → store → composants re-rendent.
5. Auto-refresh tick toutes les 15 min.

### Switch symbol
1. User clique SPY → QQQ.
2. Store `setSymbol("QQQ")` → trigger `fetchSnapshot("QQQ")`.
3. Backend cache distinct par symbole → première fetch ~3-5s, suivantes < 100ms.

### Erreur API key manquante
- `tradier_api_key_v1` keyring entry vide → backend retourne `"Tradier API key not configured — set it in Settings"`.
- UI affiche bannière rouge + bouton "Open Settings".

## Calcul concret pour validation

Sur SPY à $500 avec 1 strike example :
- Call OI = 50000, gamma = 0.012
- Put OI = 30000, gamma = 0.011
- Strike GEX call = 50000 × 0.012 × 100 × 500² × 0.01 = $1.5B
- Strike GEX put = -30000 × 0.011 × 100 × 500² × 0.01 = -$825M
- Net GEX strike = $675M (call-dominant → résistance)

Total chain summing across ~50 strikes × 5-10 expirations donne typiquement $5-20B net pour SPY full chain. C'est dans les bornes de SpotGamma public data — sanity check passé.

## Erreurs et états dégradés

| Cas | Comportement |
|-----|--------------|
| Pas de clé Tradier configurée | Bannière rouge + bouton "Open Settings". Empty state pour le reste. |
| Tradier 401 (clé invalide) | Toast erreur + bannière "Invalid API key — re-enter in Settings". |
| Tradier 429 (rate limited) | Sert le cache stale + label "Rate limited — using last snapshot". |
| Tradier 5xx / timeout | Idem cache stale. Bouton refresh manuel reste actif. |
| Greeks tous null pour un strike | Strike skipped + log debug. Pas d'erreur visible. |
| Zero strike a OI | `total_gex = 0`, levels = `None`. UI affiche "Insufficient data". |

## Tests

### Rust
- `connectors/tradier/options.rs` : test parsing d'une réponse Tradier figée (fixture JSON) → vérifie OI + gamma extraits, signs calls/puts.
- `connectors/tradier/gex.rs` : test compute sur une chain synthétique de 3 strikes :
  - Vérifie call_gex ≥ 0, put_gex ≤ 0
  - Vérifie zero_gamma calculé correctement avec une chain monotone
  - Vérifie call_wall = strike avec max call_gex au-dessus spot
  - Vérifie IV smile : convention OTM-only (put IV pour strikes < spot, call IV pour strikes ≥ spot)
- `connectors/tradier/api_key.rs` : test roundtrip `#[ignore]` (touche le real keyring).

### Frontend
- Pas de tests unitaires en MVP (cohérent avec le reste du codebase). Validation visuelle + manual smoke test sur SPY à différents moments de la journée.

## Risques

| Risque | Atténuation |
|--------|-------------|
| Tradier sandbox change le shape JSON | Parsing strict avec serde → message d'erreur explicite "Tradier returned unexpected payload" + log la 1ère erreur de field. |
| Quota 60 req/min dépassé (cas double-fetch SPY+QQQ rapide) | Cache 15 min côté Rust + log warn si on s'approche du seuil. |
| Greeks Tradier inconsistants entre weeklies et monthlies | Skip strikes sans gamma, compute partiel acceptable. UI label "Computed from N strikes". |
| Tradier sandbox ne renvoie pas SPX/NDX index options | Décision déjà prise : SPY/QQQ ETF proxies suffisent pour un trader index futures (corrélation 0.99+). |
| Calcul GEX donne des chiffres en désaccord avec SpotGamma public | Convention publique varie (multiplier 100 vs 1, scaling spot² vs spot). Documenter exactement notre convention dans un comment + permettre toggle "Convention" si besoin V2. |

## Ouvert pour discussion future (post-MVP)

- Historique GEX par jour (sauvegarder snapshots quotidiens dans SQLite → tracer l'évolution).
- Alertes : ping desktop quand spot croise Zero γ.
- 3D surface : strikes × expirations × GEX.
- Symboles supplémentaires (IWM, VIX, individual stocks).
- Charm/Vanna par strike (déjà disponible dans Tradier greeks).
