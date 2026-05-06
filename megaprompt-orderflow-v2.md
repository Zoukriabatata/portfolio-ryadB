# Mission — OrderflowV2 : transformation web → app desktop + license server

Tu es mon assistant de dev senior sur le projet **OrderflowV2** (repo actuel : site Next.js déployé sur `orderflow-v2.vercel.app`). Je veux que tu m'aides à exécuter un plan en 4 semaines pour transformer le projet en :

- **Site web Vercel** : landing + démo crypto live limitée + signup/login/billing/account/download/AI agent/community → c'est le funnel de conversion uniquement
- **App desktop Tauri** (Windows + Mac, Linux plus tard) : le vrai produit, avec connecteurs Rithmic R|Protocol, dxFeed Retail, et Binance Futures, plus moteur footprint en Rust

Chaque user paye **un abonnement unique à $29/mois** via Stripe sur le site, reçoit un compte, télécharge l'app, se logue dans l'app avec son email/password (modèle ATAS / Quantower / Deepchart), et l'app le débloque tant que l'abonnement Stripe est actif.

---

## Contraintes business absolues

1. **Budget infra mensuel cible : $0** jusqu'à ~1000 users payants. On utilise uniquement les free tiers (Vercel, Supabase, GitHub Releases, Resend free, Stripe pay-as-you-go).
2. **Aucun coût data côté serveur** : on ne redistribue **jamais** la data CME. Chaque user paye son propre data feed (Rithmic, dxFeed, ou crédits via prop firm funded comme Apex/MyFundedFutures/BluSky qui incluent Rithmic). L'app desktop se connecte directement aux data providers depuis la machine du user, avec ses propres credentials, qui sont stockés **uniquement en local et chiffrés** (Tauri Stronghold).
3. **Pas de WebSocket persistant côté serveur** : Vercel serverless suffit pour tout le license server. Aucune connexion data ne passe par mon backend.
4. **Anti-piratage standard** : limite à 2 machines par license (PC + laptop), heartbeat toutes les 4-6h, JWT court 24h signé Ed25519, hardware fingerprinting.
5. **Tier unique pricing** : pas de Free/Pro/Elite. Un seul plan $29/mois qui débloque tout. La version gratuite c'est uniquement la démo limitée du site web (BTC/USDT seul, depth 5 levels, pas de save/replay/alerts).

---

## Stack technique imposée

**Site web (existant à refactorer)**
- Framework : Next.js (version actuelle du repo, App Router de préférence)
- Hosting : Vercel (existant)
- DB : Supabase Postgres (free tier)
- Auth : Supabase Auth ou NextAuth (à choisir, recommander le plus simple à intégrer avec Stripe)
- Billing : Stripe Checkout + Stripe Customer Portal + webhooks
- Email transactionnel : Resend
- Démo crypto live : WebSocket public Binance Futures (déjà partiellement en place dans le repo)

**App desktop (à créer from scratch)**
- Framework : Tauri 2.x
- Frontend : réutilisation du code React/Next.js existant (pages /live et /footprint à porter en composants standalone)
- Backend : Rust avec `tokio`, `tokio-tungstenite`, `prost` (protobuf), `reqwest`, `serde`, `tauri-plugin-stronghold`, `tauri-plugin-updater`
- Stockage local sécurisé : Tauri Stronghold pour le JWT auth + les credentials broker du user
- Connecteurs data (à coder en Rust) : Binance Futures (WS public), Rithmic R|Protocol (WS + protobuf), dxFeed Retail (WS) — dans cet ordre de priorité
- Footprint engine : en Rust, agrégation par bucket (timeframe × prix × côté bid/ask)
- IPC frontend ↔ backend : Tauri commands + events

**Distribution**
- Installeurs : `tauri build` → `.msi` (Windows), `.dmg` (Mac), `.deb` (Linux plus tard)
- Hébergement releases : GitHub Releases (gratuit, illimité)
- Auto-update : `tauri-plugin-updater` avec manifests sur GitHub
- Code signing Mac : à prévoir mois 2 ($99/an Apple Developer)
- Code signing Windows : optionnel (évite SmartScreen warning)

---

## Architecture cible (vue globale)

```
┌──────────────────────────────────────────────────────┐
│  orderflow-v2.vercel.app (Next.js sur Vercel)        │
│                                                       │
│  Pages publiques :                                    │
│   /                  Landing + démo crypto live      │
│   /pricing           Plan $29/mois unique            │
│   /signup, /login    Auth                            │
│   /docs, /support    AI agent + FAQ                  │
│   /community         Discord embed + témoignages     │
│                                                       │
│  Pages authentifiées :                                │
│   /account           Profil + machines actives       │
│   /billing           Stripe Customer Portal          │
│   /download          Boutons Win/Mac/Linux           │
│                                                       │
│  API routes (license server) :                        │
│   /api/auth/register POST                            │
│   /api/auth/login    POST                            │
│   /api/license/login POST  (depuis l'app desktop)    │
│   /api/license/heartbeat POST  (depuis l'app)        │
│   /api/license/logout POST                           │
│   /api/stripe/webhook POST                           │
│                                                       │
│  Supabase (Postgres) :                                │
│   users, subscriptions, licenses, machines           │
└──────────────────────────────────────────────────────┘
                         │
                         │ HTTPS (auth + heartbeat seulement)
                         │
┌────────────────────────▼─────────────────────────────┐
│  App desktop OrderflowV2 (Tauri, ~10MB)              │
│                                                       │
│  Frontend React (réutilisé depuis le site) :         │
│   LoginScreen, FootprintView, LiveView,              │
│   SettingsPanel (creds brokers), AccountInfo         │
│                                                       │
│  Backend Rust :                                       │
│   - AuthManager (JWT, heartbeat scheduler)           │
│   - StrongholdVault (chiffrement creds + JWT)        │
│   - DataAdapters trait :                             │
│       ├ BinanceFutures                               │
│       ├ Rithmic (R|Protocol)                         │
│       └ dxFeed                                        │
│   - FootprintEngine (agrégation ticks)               │
│   - IPC commands → frontend                          │
└────────────────────────┬─────────────────────────────┘
                         │
                         │ Connexions DIRECTES depuis la machine du user
                         │ avec SES credentials (jamais via mon serveur)
                         │
            ┌────────────┼────────────┬─────────────┐
            ▼            ▼            ▼             ▼
        Binance      Rithmic       dxFeed      autres
        Futures     R|Protocol     Retail
```

**Règle d'or : la data de marché ne touche jamais mes serveurs.** Mon serveur ne sait que "user X est actif, machine Y autorisée".

---

## Schéma DB Supabase (à implémenter en semaine 1)

```sql
-- users : authentification de base
create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  created_at timestamptz default now(),
  email_verified_at timestamptz
);

-- subscriptions : état Stripe sync
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text unique,
  status text not null,  -- active, past_due, canceled, incomplete
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index on subscriptions(user_id);
create index on subscriptions(stripe_subscription_id);

-- licenses : 1 license par user actif
create table licenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade unique,
  license_key text unique not null,  -- généré côté serveur, format UUID v4
  status text not null default 'active',  -- active, suspended, revoked
  max_machines int not null default 2,
  created_at timestamptz default now()
);

-- machines : appareils actifs
create table machines (
  id uuid primary key default gen_random_uuid(),
  license_id uuid references licenses(id) on delete cascade,
  machine_id text not null,  -- fingerprint hardware
  os text,                    -- windows, macos, linux
  app_version text,
  first_seen_at timestamptz default now(),
  last_heartbeat_at timestamptz default now(),
  unique(license_id, machine_id)
);
create index on machines(license_id);
create index on machines(last_heartbeat_at);
```

---

## Flow d'authentification app desktop

1. User saisit email + password dans l'app
2. App appelle `POST /api/license/login` avec `{ email, password, machine_id, os, app_version }`
3. Serveur :
   - Vérifie password (bcrypt)
   - Vérifie `subscription.status === 'active'`
   - Vérifie `current_period_end > now()`
   - Compte les machines actives pour ce user (heartbeat < 7 jours)
     - Si nouvelle machine et count >= max_machines → 403 "Machine limit reached"
     - Sinon, insert/update dans `machines`
   - Génère JWT signé Ed25519, valide 24h, payload `{ sub: user_id, license_id, features: ['all'], exp }`
   - Retourne `{ jwt, expires_at, user_email, plan: 'pro' }`
4. App stocke JWT dans Stronghold
5. Frontend Tauri débloque l'UI
6. Heartbeat job (Rust) appelle `POST /api/license/heartbeat` toutes les 4-6h avec `{ machine_id }` et le JWT en header
   - Serveur vérifie JWT, met à jour `last_heartbeat_at`, renvoie un nouveau JWT si abonnement toujours actif
   - Si abonnement annulé → JWT non renouvelé → app se lock à expiration du JWT actuel

---

## Plan en 4 semaines

### Semaine 1 — License server complet
**Objectif** : un user peut s'inscrire sur le site, payer $29 sur Stripe, voir son abonnement actif dans `/account`.

Tâches :
1. Setup Supabase, créer les 4 tables ci-dessus, configurer RLS
2. Variables d'env : `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `JWT_PRIVATE_KEY` (Ed25519), `RESEND_API_KEY`
3. Auth pages : `/signup`, `/login`, `/forgot-password` (avec Supabase Auth ou NextAuth + bcrypt)
4. Stripe :
   - Créer le produit "OrderflowV2 Pro" à $29/mois
   - Page `/pricing` avec un seul CTA → Stripe Checkout
   - Page `/billing` qui redirige vers Stripe Customer Portal
   - Webhook `/api/stripe/webhook` qui gère `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
   - À la première souscription : créer une `licenses` row pour ce user
5. Page `/account` : affiche email, statut abonnement, machines actives, bouton "Manage billing" → portail Stripe
6. Page `/download` : 3 boutons (Windows / Mac / Linux), pour l'instant pointer vers placeholders
7. Email de bienvenue via Resend après checkout success

**Test de validation semaine 1** : je crée un compte, je paye en mode test Stripe, je vois mon abonnement actif sur `/account`, je reçois l'email de bienvenue, la DB Supabase montre les 4 tables peuplées correctement.

---

### Semaine 2 — Tauri init + login flow + heartbeat
**Objectif** : une app Tauri qui s'installe, où je me connecte avec mon compte du site, qui maintient sa session avec heartbeat, et qui se lock si l'abonnement est annulé.

Tâches :
1. `npm create tauri-app@latest` dans un nouveau répertoire `desktop/` (ou en monorepo pnpm avec le site)
2. Frontend Tauri : copier les composants UI shared depuis le site (les rendre framework-agnostic, retirer Next.js-specific)
3. Login screen dans l'app : form email + password → appelle `POST /api/license/login`
4. Backend Rust :
   - `auth.rs` : module qui gère login, stockage JWT dans Stronghold, validation locale du JWT (signature Ed25519 + exp)
   - `heartbeat.rs` : tokio task qui tourne en background, appelle l'API toutes les 5h, met à jour le JWT
   - `machine.rs` : génération du machine_id (fingerprint hardware via `machine-uid` crate ou équivalent)
   - `stronghold.rs` : wrapper sécurisé pour stocker JWT + futurs creds brokers
5. IPC commands exposées au frontend :
   - `auth_login(email, password) -> Result<UserInfo>`
   - `auth_logout()`
   - `auth_status() -> AuthState`  (Authenticated / Expired / NotLoggedIn)
6. Feature gating frontend : si `auth_status() != Authenticated`, afficher `LoginScreen`, sinon afficher l'app

**Test de validation semaine 2** : je build l'app, je l'installe sur ma machine, je me login avec un compte test du site, l'app se débloque. Je laisse tourner 6h et le heartbeat passe correctement (logs OK). Je révoque mon abonnement Stripe → après expiration JWT (24h max, ou je force expiration pour test), l'app affiche "Subscription expired".

---

### Semaine 3 — Connecteur Binance Futures + footprint engine en Rust
**Objectif** : l'app desktop affiche un footprint temps réel sur BTC/USDT, fluide, en exploitant le code crypto existant du site mais porté en natif Rust.

Tâches :
1. Crate `connectors/` dans le projet Tauri avec un trait Rust `MarketDataAdapter` :
   ```rust
   #[async_trait]
   pub trait MarketDataAdapter {
       async fn connect(&mut self) -> Result<()>;
       async fn subscribe(&mut self, symbol: &str) -> Result<()>;
       fn ticks(&self) -> impl Stream<Item = Tick>;
   }

   pub struct Tick {
       pub timestamp: u64,    // ns
       pub price: f64,
       pub qty: f64,
       pub side: Side,        // Buy or Sell (aggressor)
       pub symbol: String,
   }
   ```
2. Implémentation `BinanceFuturesAdapter` :
   - WebSocket vers `wss://fstream.binance.com/ws/<symbol>@aggTrade` et `<symbol>@depth20@100ms`
   - Parsing JSON via `serde_json`
   - Émission des `Tick` dans un `tokio::sync::broadcast` channel
3. `footprint_engine.rs` :
   - Bucket par `(time_window, price_level, side)` → volume aggregated
   - Configurable : timeframe (1s, 5s, 15s, 1m, 5m), tick_size (auto-detected ou param)
   - API : `engine.update(tick)` + `engine.snapshot() -> FootprintBar[]`
4. IPC commands :
   - `start_market_stream(provider, symbol, timeframe) -> Result<StreamId>`
   - `stop_market_stream(stream_id)`
   - Tauri events : `footprint_update` (broadcast aux fenêtres frontend)
5. Frontend : page `/live` et `/footprint` portées dans l'app, qui s'abonnent aux events Tauri et rendent en canvas / WebGL

**Test de validation semaine 3** : je lance l'app, je connecte BTC/USDT en démo, le footprint se construit en temps réel, fluide à 60fps, identique visuellement à ce que faisait le site mais en natif.

---

### Semaine 4 — Connecteur Rithmic OU dxFeed + packaging + release
**Objectif** : l'app supporte au moins un connecteur CME real-time, packagée et téléchargeable depuis le site.

**À démarrer dès semaine 1 en parallèle** : envoyer la demande dev access à Rithmic (`rapi@rithmic.com` ou via `rithmic.com/api-request`) ET contacter dxFeed Retail Partnership (`dxfeed.com/contact`). Choisir celui qui répond le premier avec les bons termes commerciaux.

Tâches semaine 4 :
1. Implémentation `RithmicAdapter` (ou `DxFeedAdapter` selon qui répond) :
   - **Rithmic R|Protocol** : WebSocket + Protocol Buffers (crate `prost`), schémas `.proto` fournis par Rithmic, login avec `system_name + user + password + gateway`, subscribe à market data via `RequestMarketDataUpdate`
   - **dxFeed Retail** : WebSocket avec leur protocole, login via API token retail
2. Settings panel dans l'app : ajout des credentials (chiffrés dans Stronghold), test de connexion, sélection du provider par défaut
3. Validation : footprint live sur ES ou NQ pendant la session RTH (15h30-22h Paris)
4. Packaging :
   - `tauri build` pour Windows et Mac
   - Configuration de `tauri.conf.json` : icons, identifier, updater endpoint
   - GitHub Actions workflow pour build automatique sur tag `v*.*.*`
   - Upload sur GitHub Releases
5. Page `/download` du site : remplace les placeholders par les URLs GitHub Releases (Win .msi, Mac .dmg)
6. Auto-updater configuré (manifest JSON sur GitHub Pages ou Vercel)

**Test de validation semaine 4** : je télécharge l'app depuis le site, je l'installe, je me login, j'ajoute mes creds Rithmic démo, je vois ES en footprint live. Je release un v0.1.1, l'app détecte la mise à jour et propose d'updater.

---

## Ce que je veux de toi sur cette session de dev

**Aujourd'hui je veux qu'on attaque la semaine 1.** Pas plus.

Concrètement, je te demande de :

1. Inspecter le repo actuel `orderflow-v2` (lis le `package.json`, la structure `app/` ou `pages/`, les composants existants, les routes API existantes s'il y en a)
2. Me proposer un **plan d'exécution séquentiel pour la semaine 1** sous forme de checklist Markdown, avec pour chaque étape :
   - Le but
   - Les fichiers à créer/modifier
   - Les commandes à lancer
   - Les variables d'env à ajouter
   - Le critère de validation
3. Une fois que je valide le plan, **on exécute étape par étape**. Tu écris le code, je review, je lance, on debug ensemble. Pas de mega-commit, pas de "voilà tout d'un coup". On commit après chaque étape validée.

**Important** :
- Le code doit être production-grade : typé strict, validations Zod côté API, error handling propre, secrets jamais commits
- Pas d'over-engineering : on vise simple et maintenable, pas une archi enterprise pour 0 users
- Tu commentes en français les parties business-logic (mes futurs moi devra relire)
- Tu utilises les conventions actuelles du repo (formatter, linter, structure de dossiers existante)
- Les migrations Supabase sont versionnées dans le repo (`supabase/migrations/`)
- Les routes API renvoient des codes HTTP propres (200/201/400/401/403/404/409/500) et un body JSON `{ ok: bool, data?, error? }`
- Le webhook Stripe est idempotent (vérifie `event.id` pour éviter les doubles traitements)
- Le JWT est signé en Ed25519, jamais HS256

**Ce que tu ne fais PAS aujourd'hui** :
- Ne touche pas l'app Tauri (semaine 2)
- Ne code pas de connecteur data (semaines 3-4)
- Ne refactore pas la démo crypto existante du site (elle reste telle quelle)
- Ne mets pas de feature flags compliqués, ni A/B testing, ni analytics ce soir

---

## Première action attendue

Lis le repo, dis-moi ce que tu vois (framework version, structure, ce qui existe déjà côté auth si quelque chose), et propose-moi le plan de checklist pour la semaine 1 selon le format demandé. **Ne code rien tant que je n'ai pas validé le plan.**

GO.
