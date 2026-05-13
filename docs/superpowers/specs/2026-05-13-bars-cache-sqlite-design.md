# Bars Cache SQLite — Design

**Date** : 2026-05-13
**Statut** : Validé (sections §1-§4)
**Auteur** : Brainstorming session avec Senzoukria

---

## Contexte & problème

OrderflowV2 (desktop Tauri) reçoit du live MNQ.CME via Rithmic / Apex Trader Funding. Le **chart footprint démarre nécessairement vide** au lancement de l'app : pas de lookback de session.

La voie Rithmic native pour le lookback (`HISTORY_PLANT` → `RequestTickBarReplay` / `RequestTimeBarReplay`) est **bloquée par permissioning Apex** : tous les fetches retournent `rp_codes=["13","permission denied"]` sur tous les TFs (1m → 1d), confirmé 2026-05-13. L'utilisateur a déclaré l'add-on activé côté broker mais le re-test prouve le contraire.

Databento, source alternative pay-per-use, est explicitement rejetée par l'utilisateur (refus du coût récurrent).

**Décision** : on construit notre propre cache local, alimenté **en continu par le flux live** déjà reçu via `TICKER_PLANT`. Au bout de quelques sessions ouvertes, le lookback se remplit naturellement. Cold-start vide accepté à la première installation.

## Décisions actées

| Décision | Choix | Justification |
| --- | --- | --- |
| Granularité de stockage | Bars agrégés par TF | Lecture immédiate au cold-start, volume modéré, simplicité. Sacrifie le retroactif sur nouveaux TFs (acceptable, TFs figés). |
| Backend storage | SQLite via `rusqlite` côté Rust | Robuste, requêtable, scale à plusieurs Go. Chemin clair vers backend centralisé si l'utilisateur passe en mode multi-clients. |
| Stratégie write | Batch + throttle 2s (pas de "bar close" explicite) | Le bar en cours est aussi persisté → crash-safe. Évite de modifier `FootprintEngine`. |
| Rétention | 7 jours glissants | ~10-25 MB par symbole pour les 7 TFs préloadés. Bord visible au lundi matin. |
| Multi-symbole | Tout symbole vu en live est gardé | Pas de purge sur change de symbol — c'est tout l'intérêt du cache. |

## §1 — Architecture stockage

**Dépendance** : `rusqlite = { version = "0.31", features = ["bundled"] }` dans `desktop/src-tauri/Cargo.toml`. Le feature `bundled` compile SQLite avec le binaire pour ne pas dépendre du SQLite système (Windows en a un mais Tauri ships standalone).

**Localisation** : `{app_data_dir}/orderflow-v2/bars.db`. `app_data_dir` est résolu via `tauri::Manager::path().app_data_dir()`. Sur Windows c'est typiquement `C:\Users\<user>\AppData\Roaming\com.senzoukria.orderflow-v2\`.

**Schéma** :
```sql
CREATE TABLE IF NOT EXISTS bars (
  symbol       TEXT    NOT NULL,
  exchange     TEXT    NOT NULL,
  timeframe    TEXT    NOT NULL,
  bucket_ts_ns INTEGER NOT NULL,
  open         REAL    NOT NULL,
  high         REAL    NOT NULL,
  low          REAL    NOT NULL,
  close        REAL    NOT NULL,
  total_volume REAL    NOT NULL,
  total_delta  REAL    NOT NULL,
  trade_count  INTEGER NOT NULL,
  levels       TEXT    NOT NULL,  -- JSON serialized Vec<PriceLevel>
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (symbol, exchange, timeframe, bucket_ts_ns)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_bars_lookup
  ON bars(symbol, exchange, timeframe, bucket_ts_ns DESC);
```

**Justifications** :
- `WITHOUT ROWID` : la PK est composite et couvre toutes les colonnes de lookup → SQLite stocke directement dans la B-tree de la PK, query ultra-rapide, pas d'indirection rowid.
- `bucket_ts_ns INTEGER` : SQLite stocke les int64 nativement. Nanosecondes pour matcher `FootprintBar::bucket_ts_ns` côté Rust et `bucketTsNs` côté TS.
- `levels TEXT` (JSON) plutôt qu'une table normalisée `bar_levels(bar_pk, price, ...)` : un footprint bar a 10-100 niveaux, toujours lus ensemble. Le JOIN coûterait plus que la désérialisation JSON, et SQLite n'a pas de quota strict sur la taille d'un TEXT.
- `updated_at_ms` : horloge wall-clock du dernier flush. Utilisé pour la purge TTL au boot.

**Pragmas au boot** :
```sql
PRAGMA journal_mode = WAL;     -- writes concurrents avec reads
PRAGMA synchronous = NORMAL;   -- pas FULL (overkill pour un cache)
PRAGMA foreign_keys = ON;      -- défensif
PRAGMA cache_size = -16384;    -- 16 MB cache en RAM
```

## §2 — Lifecycle write (batch + throttle)

**Composant** : un consumer Rust dédié `CacheWriter` qui subscribe au broadcast `FootprintEngine::updates()` existant.

```rust
pub struct CacheWriter {
    exchange: String,                                              // figé par instance d'engine
    pending: HashMap<(String, &'static str, u64), FootprintBar>,   // (symbol, tf, bucket_ts_ns) → bar
    db: Arc<Mutex<Connection>>,
    flush_interval: Duration,                                       // 2s
}
```

**Boucle principale** :
```rust
async fn run(&mut self, mut rx: broadcast::Receiver<FootprintBar>) {
    let mut tick = tokio::time::interval(self.flush_interval);
    loop {
        tokio::select! {
            Ok(bar) = rx.recv() => {
                let key = (bar.symbol.clone(), bar.timeframe, bar.bucket_ts_ns);
                self.pending.insert(key, bar);  // last write wins per bucket
            }
            _ = tick.tick() => {
                if !self.pending.is_empty() {
                    self.flush_pending().await;
                }
            }
        }
    }
}
```

**Flush** : un seul `BEGIN TRANSACTION` + N × `INSERT OR REPLACE` + `COMMIT`, dans `tokio::task::spawn_blocking` pour ne pas bloquer le runtime async.

**Shutdown propre** : on attache un handler `tauri::RunEvent::ExitRequested` qui :
1. Cancel le task de writer
2. Force un dernier flush synchrone
3. Ferme la connection SQLite proprement

**Budget I/O mesuré** (estimation) :
- 7 TFs × 1 symbole × 1 bar en cours = 7 pending entries en pic
- Flush toutes les 2 sec → ~3.5 writes/sec → ~17 MB/heure WAL maxi
- Aucune contention sur le hot-path (TICKER_PLANT → engine), le writer est consumer pur.

## §3 — Lifecycle read + intégration front

**Nouvelle commande Tauri** dans `desktop/src-tauri/src/commands/cache.rs` :

```rust
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheQueryArgs {
    pub symbol: String,
    pub exchange: String,
    pub timeframe: String,    // "1m" | "3m" | ... — same string used by FootprintBar.timeframe
    pub hours_back: i64,      // borne inférieure (now_ns - hours_back * 3600 * 1e9)
}

#[tauri::command]
pub async fn cache_query(
    state: State<'_, CacheState>,
    args: CacheQueryArgs,
) -> Result<Vec<HistoryFootprintBar>, String>
```

Retourne les bars cachés dans la fenêtre, **oldest → newest** (sort ASC sur `bucket_ts_ns`), désérialisés en `HistoryFootprintBar` (même shape que celui produit par `rithmic_fetch_tick_history`). Le front les consomme de manière interchangeable.

**Intégration côté front, dans `desktop/src/components/RithmicFootprint.tsx`** :

Dans `runHistoryFetch` (ligne ~1234), nouvelle stratégie en cascade :

1. **Premier** : `cacheGetFresh` (localStorage existant) — comportement actuel inchangé.
2. **Si miss localStorage** : `invoke("cache_query", { symbol, exchange, timeframe, hoursBack })`.
3. **Si miss SQLite** : tenter `rithmic_fetch_tick_history` (HISTORY_PLANT), comme aujourd'hui.
4. **Si HISTORY_PLANT denied** (rp_code=13) : afficher un banner "Lookback en cours d'accumulation — revenez après quelques sessions" et continuer en live-only.

Le store `useFootprintBarsCacheStore` n'est PAS supprimé : il reste comme cache de session in-memory + localStorage pour les TFs légers. SQLite est la source-of-truth durable ; localStorage est juste un raccourci de session.

## §4 — Rétention + hooks

**Purge au boot du backend Tauri**, dans `lib.rs` après init du cache :

```rust
const RETENTION_MS: i64 = 7 * 24 * 3600 * 1000;
let now_ms = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|d| d.as_millis() as i64)
    .unwrap_or(0);
db.execute(
    "DELETE FROM bars WHERE updated_at_ms < ?1",
    params![now_ms - RETENTION_MS],
)?;
db.execute("VACUUM", [])?;
```

`VACUUM` rebuild le fichier pour libérer l'espace disque réellement (sinon SQLite garde les pages libres en place). Coût acceptable au boot.

**Hook engine côté Rust** : câblé une seule fois dans `lib.rs` au moment où le `FootprintEngine` est instancié. Pseudo-code :

```rust
let db = init_cache_db(&app_data_dir)?;
purge_old_bars(&db, RETENTION_MS)?;
let cache_state = CacheState::new(db.clone());

let mut writer = CacheWriter::new(db.clone(), Duration::from_secs(2));
let rx = engine.updates();
tokio::spawn(async move { writer.run(rx).await });

app.manage(cache_state);
```

## Surface de modifications

| Fichier | Nature | Lignes estimées |
| --- | --- | --- |
| `desktop/src-tauri/Cargo.toml` | Ajout dep `rusqlite` | +1 |
| `desktop/src-tauri/src/engine/footprint.rs` | Ajout champ `exchange: String` au `FootprintBar` (cf. note ci-dessous) | +5 |
| `desktop/src-tauri/src/cache/mod.rs` | Module + init db + purge | ~40 |
| `desktop/src-tauri/src/cache/writer.rs` | `CacheWriter` (batch+flush) | ~120 |
| `desktop/src-tauri/src/cache/reader.rs` | Query helpers | ~60 |
| `desktop/src-tauri/src/commands/cache.rs` | Commande IPC `cache_query` | ~50 |
| `desktop/src-tauri/src/lib.rs` | Init + spawn writer + handler exit + register command | ~25 |
| `desktop/src/components/RithmicFootprint.tsx` | Fallback `cache_query` dans `runHistoryFetch` | ~20 |

**Total estimé** : ~320 lignes Rust + ~20 lignes TS.

### Note sur `FootprintBar.exchange`

Le `FootprintBar` Rust actuel (`desktop/src-tauri/src/engine/footprint.rs:111-126`) n'expose que `symbol`, pas `exchange`. Or notre PK SQLite est `(symbol, exchange, timeframe, bucket_ts_ns)` — on a besoin de l'exchange pour différencier un éventuel futur `BTCUSDT.Binance` d'un `BTCUSDT.Bybit`.

**Décision** : ajouter un champ `pub exchange: String` à `FootprintBar` et le propager depuis le `Tick` (qui le connaît déjà via le subscribe Rithmic / Crypto). Les consumers existants (broadcast IPC `footprint-update`, `get_bars`) le verront comme un champ supplémentaire ignorable — pas de breaking change côté front qui ne consomme pas ce champ.

Alternative rejetée : maintenir un mapping `symbol → exchange` dans le writer. Fragile (un symbole peut théoriquement exister sur 2 exchanges) et casse l'invariant "le bar décrit complètement son origine".

## Non-objectifs (YAGNI)

- **Pas de schema migration framework** : v1 du schéma est figée. Si on doit faire évoluer, on crée une `bars_v2` et un script de migration ad-hoc. Pas de `refinery` / `sqlx-migrate` pour 1 table.
- **Pas de compression** : SQLite + JSON suffit. Si la taille devient un problème (>500 MB), on revisitera (zstd-encoded BLOB).
- **Pas de cache distribué / sync entre devices** : le cache est local au poste. Le passage multi-clients (decision future) viendra avec un backend HTTP qui exposera le même schéma SQLite/Postgres — pas dans le scope.
- **Pas de UI de gestion du cache** (settings panel "purge cache by symbol"). Une commande de purge debug peut être ajoutée plus tard si besoin.
- **Pas de quota par symbole** : la TTL 7j suffit pour borner la croissance ; si un user trade 20 symboles en 7j, c'est ~500 MB max, encore largement gérable.

## Tests

- **Unit Rust** :
  - `CacheWriter::flush_pending` avec 0, 1, N entrées
  - Purge correcte au boot (entrées > 7j supprimées, entrées récentes gardées)
  - INSERT OR REPLACE : 2 versions du même bar → la 2e gagne
  - Query oldest→newest dans la fenêtre demandée
- **Smoke Tauri** : commande `cache_query` retourne un array vide quand la DB n'a rien, des bars valides quand on en a écrit.
- **Manuel** : ouvrir l'app, laisser tourner 5 min, fermer, rouvrir, vérifier que les 5 min de bars sont là.

## Risques & atténuations

| Risque | Probabilité | Atténuation |
| --- | --- | --- |
| Race au shutdown : flush en cours quand l'app ferme | Moyenne | Handler `ExitRequested` qui force le flush synchrone avant exit |
| DB corruption sur kill -9 | Faible | `journal_mode=WAL` + `synchronous=NORMAL` couvrent les cas non-catastrophiques. Pire cas : on perd les 2 dernières secondes. |
| Croissance non bornée si l'utilisateur trade beaucoup de symboles | Faible | TTL 7j + VACUUM au boot. Si vraiment problème, ajouter un quota global. |
| Désync schema entre `FootprintBar` (Rust) et `HistoryFootprintBar` (TS) | Faible | La sérialisation passe par le même `#[serde(rename_all = "camelCase")]` que les fetches Rithmic existants. Tests E2E vérifient. |

## Suite

→ Une fois ce design validé par Senzoukria, on passe en `writing-plans` pour décomposer en steps implémentables avec checkpoints.
