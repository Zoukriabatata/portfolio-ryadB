# Module News — Calendrier économique + flux d'articles

**Date** : 2026-05-18
**Auteur** : Ryad / Claude
**Statut** : design validé, prêt pour plan d'implémentation

## Contexte

Le module News est l'un des modules prévus du logiciel desktop OrderFlow (voir `CLAUDE.md` §2, module #5). À ce jour, seul un placeholder existe : `desktop/src/routes/NewsRoute.tsx` rend `<WebFrame title="News" emptyHint="Live macro + market news feed." />`. Aucun composant, aucun connecteur, aucune source de données.

Le but est de donner au trader, sans quitter l'app :
- une vue rapide des **events macro à venir** (CPI, NFP, FOMC, jobless claims, PMI, BCE…),
- un **flux d'articles** du jour sur les marchés (général, focalisé futures CME/index/macro US-EU).

Public principal : un trader scalper/intraday qui consulte la News quelques fois par jour avant et pendant la session, pas un newsfeed exhaustif type Bloomberg.

## Source de données

**Finnhub API** (https://finnhub.io)

- Gratuit jusqu'à 60 req/min, suffisant pour cet usage (calendrier rafraîchi toutes les 5 min, news toutes les 60 s).
- Couvre les deux besoins avec une seule clé :
  - `GET /calendar/economic?from=YYYY-MM-DD&to=YYYY-MM-DD` → events économiques.
  - `GET /news?category=general` → flux d'actualités marchés (catégories disponibles : `general`, `forex`, `crypto`, `merger`).
- Format JSON propre, types stables, doc à jour.

Alternatives écartées : ForexFactory (scraping fragile, ToS gris), TradingEconomics (surdimensionné/payant pour ce scope), Investing.com iframe (pas d'intégration native possible).

## Architecture

Cohérente avec le pattern existant du projet : **tout passe par le backend Rust**, le frontend ne consomme que des commandes Tauri. Aucun appel HTTP direct depuis React.

```
┌──────────────────────────────────────┐
│  Frontend React (NewsRoute)          │
│    ┌──────────────┐  ┌────────────┐  │
│    │  NewsFeed    │  │ EconomicC. │  │
│    │  (60%)       │  │ alendar    │  │
│    │              │  │ (40%)      │  │
│    └──────┬───────┘  └─────┬──────┘  │
│           │ useNewsStore   │         │
│           └────────┬───────┘         │
│                    │ invoke()        │
└────────────────────┼─────────────────┘
                     │
┌────────────────────┼─────────────────┐
│  Backend Rust (Tauri commands)       │
│   news_fetch_calendar()              │
│   news_fetch_articles()              │
│                    │                 │
│              ┌─────▼──────┐          │
│              │ finnhub/   │          │
│              │   client   │          │
│              │   cache    │          │
│              └─────┬──────┘          │
└────────────────────┼─────────────────┘
                     │ HTTPS
              ┌──────▼───────┐
              │  finnhub.io  │
              └──────────────┘
```

## Backend Rust

### Module `desktop/src-tauri/src/connectors/finnhub/`

```
finnhub/
├── mod.rs          re-exports + client struct
├── client.rs       HTTP client (reqwest), construction de l'URL signée par API key
├── calendar.rs     fetch + parse /calendar/economic
├── news.rs         fetch + parse /news?category=general
└── cache.rs        cache mémoire TTL (DashMap ou tokio::sync::RwLock<HashMap>)
```

### Types Rust

```rust
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EconomicEvent {
    pub id: String,         // hash stable (country|event|timeUtc) — Finnhub ne fournit pas d'id
    pub country: String,    // ISO-2 : "US", "EU", "GB"…
    pub impact: Impact,     // Low | Medium | High
    pub event: String,      // "CPI YoY"
    pub time_utc: String,   // ISO 8601
    pub actual: Option<f64>,
    pub forecast: Option<f64>,
    pub previous: Option<f64>,
    pub unit: String,       // "%", "K", "B"…
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Impact { Low, Medium, High }

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsArticle {
    pub id: String,         // Finnhub fournit un `id` numérique → String
    pub headline: String,
    pub summary: String,
    pub url: String,
    pub source: String,
    pub image_url: String,
    pub published_at: String,  // ISO 8601
    pub category: String,
}
```

### Commandes Tauri

```rust
#[tauri::command]
pub async fn news_fetch_calendar(
    state: State<'_, FinnhubState>,
    args: FetchCalendarArgs,
) -> Result<Vec<EconomicEvent>, String>;

#[tauri::command]
pub async fn news_fetch_articles(
    state: State<'_, FinnhubState>,
    args: FetchArticlesArgs,
) -> Result<Vec<NewsArticle>, String>;
```

Avec :

```rust
pub struct FetchCalendarArgs { pub from_date: String, pub to_date: String }
pub struct FetchArticlesArgs { pub category: String, pub since_ts: Option<i64> }
```

### Cache

Cache mémoire simple, clé = `(endpoint, params)`, TTL :
- Calendrier : 5 min
- News : 60 s

`Arc<RwLock<HashMap<String, (Instant, Vec<T>)>>>` sur `FinnhubState`. Pas de persistance — au boot, cache vide, on refetch.

### Erreurs

- `reqwest::Error` → `FinnhubError::Network`
- HTTP 401 → `FinnhubError::Unauthorized` (clé manquante ou invalide)
- HTTP 429 → `FinnhubError::RateLimited` (sert le cache stale si dispo, sinon erreur explicite)
- HTTP 5xx → `FinnhubError::Upstream`
- Parsing JSON → `FinnhubError::Decode`

Toutes converties en `String` à la frontière Tauri command via `thiserror`.

### Clé API

Stockée via le crate `keyring` (déjà utilisé pour les credentials Rithmic). Service name `"orderflow:finnhub"`, account fixe `"api_key"`.

UI de saisie : un champ "Finnhub API key" ajouté au panneau de settings broker existant (`EditBrokerSettings` ou équivalent — à confirmer en exploration au début de l'implémentation). Si la clé n'est pas configurée, les commandes retournent une erreur claire `"Finnhub API key not configured — set it in Settings"` que le frontend affiche en lieu et place du contenu.

## Frontend

### Layout `routes/NewsRoute.tsx`

Remplace le `<WebFrame>` placeholder par un split 60/40 :

```tsx
<div className="news-route">
  <NewsFeed />              {/* 60% gauche */}
  <EconomicCalendar />      {/* 40% droite */}
</div>
```

Responsive : sous 1100 px de large, empile verticalement (calendrier en haut, feed dessous) — usage trader desktop principalement, mobile non visé.

### `components/news/NewsFeed.tsx`

- Cards verticales (image à gauche 80×80, headline + source/time à droite).
- Polling 60 s en arrière-plan via `useFinnhubPolling`.
- Bouton "Refresh now" en header du panneau.
- Click card → ouvre l'URL externe dans le navigateur OS via `tauri-plugin-shell` (`open()` scopé).
- Pas de scroll infini : on affiche les 50 derniers articles, c'est largement assez pour 24-48 h de news.

### `components/news/EconomicCalendar.tsx`

- En-tête : toggle pills `Today | 7d` + filtres pills `Impact: H/M/L` (high allumé par défaut) + filtres pays (`US, EU, GB, JP, CN` — toggleables, US + EU allumés par défaut).
- Liste des events groupés par jour (header "Today", "Tomorrow", "Mon 19", "Tue 20"…).
- Chaque ligne (`EconomicEventRow`) : heure locale du user (timezone Footprint réutilisée si pertinente, sinon TZ OS) · flag pays · impact dot · nom event · forecast / previous compactés.
- Click ligne → modal `EconomicEventDetail` avec : actual / forecast / previous bien lisibles, unité, surprise (actual − forecast) colorée.

### State (Zustand)

```ts
// src/lib/news/useNewsStore.ts
type NewsStore = {
  articles: NewsArticle[];
  articlesFetchedAt: number | null;
  articlesLoading: boolean;
  articlesError: string | null;
  events: EconomicEvent[];
  eventsFetchedAt: number | null;
  eventsLoading: boolean;
  eventsError: string | null;
  filters: {
    impact: Record<"low"|"medium"|"high", boolean>;  // {high:true, med:false, low:false}
    countries: Record<string, boolean>;              // {US:true, EU:true, ...}
    range: "today" | "7d";
  };
  setFilter: <K extends keyof NewsStore["filters"]>(k: K, v: NewsStore["filters"][K]) => void;
  // actions:
  fetchArticles: () => Promise<void>;
  fetchEvents: () => Promise<void>;
};
```

Persist `filters` dans localStorage (clé `orderflow:news:filters`) pour conserver les préférences entre sessions. Le reste (data) n'est pas persisté — re-fetch au mount.

### Hook `useFinnhubPolling`

Une seule instance au mount de `NewsRoute`. `setInterval(60_000)` pour articles, `setInterval(300_000)` pour calendar. Cleanup à l'unmount. Pause polling quand `document.hidden` (onglet desktop pas focused), reprend au focus.

## Flux de données

### Premier mount sur `/news`
1. `NewsRoute` mount → `useFinnhubPolling` démarre, déclenche `fetchArticles()` + `fetchEvents()`.
2. Store passe en `loading: true`, UI montre des skeletons.
3. Commandes Tauri appellent backend Rust → cache miss → HTTPS Finnhub → parse → cache fill → retour.
4. Store reçoit data, UI rend les cards + lignes calendrier.
5. Intervalles s'enchaînent.

### Changement de filtre
- Toggle filter (ex: désactive "low impact") → `setFilter` met à jour le store → re-render avec les events filtrés côté client. **Pas de re-fetch** : le filtrage est client-side, les données fetchées couvrent tous les impacts/pays.

### Erreur clé API non configurée
- Premier fetch retourne `"Finnhub API key not configured"`.
- Store stocke `articlesError` et `eventsError`.
- UI affiche un bandeau central : "Configure ta clé Finnhub dans les Settings broker pour activer la News." + bouton "Open Settings".

## Tests

### Rust
- `finnhub/client.rs` : test parsing d'une réponse `/calendar/economic` figée (fixture JSON) → 3-5 events, vérifie impact mapping, unit, optional fields.
- `finnhub/cache.rs` : TTL respect (insert → wait → expire), eviction non bloquante.
- Pas de test d'intégration réseau dans le CI — trop fragile et consomme du quota.

### Frontend
- Pas de tests unitaires pour cette feature en MVP (cohérent avec le reste de la codebase). On valide visuellement.

## Non-objectifs (YAGNI)

À NE PAS implémenter :
- Notifications desktop avant un event.
- Recherche full-text dans les articles.
- Historique > 48h pour les articles.
- Alertes par mot-clé.
- Sentiment analysis IA.
- Sources multiples (Bloomberg, Benzinga, RSS additionnels) — Finnhub seul couvre largement.
- Affichage du calendrier > 7 jours (pas utile pour un scalper).
- Onglet par catégorie news (forex, crypto, merger) — uniquement `general` pour commencer.

## Risques et atténuations

| Risque | Atténuation |
|--------|-------------|
| Finnhub quota dépassé (rare avec cache, mais possible si plusieurs instances) | Cache 60s/5min côté Rust + back-off exponentiel sur 429 + UI message "rate limited, retry in Ns" |
| Clé API exposée dans le bundle Tauri | Stockage via `keyring` côté Rust, jamais en clair côté frontend |
| Finnhub change le shape JSON | Parsing avec `serde` strict → erreur explicite "Finnhub returned unexpected payload" en log + bandeau UI |
| Imapct mapping incohérent (Finnhub utilise "low"/"medium"/"high" en chaîne libre) | Match exhaustif + fallback `Low` sur valeur inconnue, log warn |

## Ouvert pour discussion future (post-MVP)

- Ajouter un onglet "Daily wrap" matinal résumant les events de la veille + ceux du jour.
- Permettre de surligner un event eco dans le footprint au moment de sa release (cross-module).
- Intégrer le journal de trading : taguer un trade comme "post-CPI", "FOMC day", etc.
