# Roadmap Production v1 — OrderFlow / Senzoukria

> Source : audit go/no-go du 2026-06-06 (8 dimensions, vérification adversariale).
> Objectif : passer de l'état actuel à un **go prod défendable**, sécurisé, conforme et performant,
> sans manquement ni incohérence de séquencement.

## Comment lire cette roadmap

- **Phases ordonnées par dépendance**, pas par confort. On ne code pas la Phase 1 avant d'avoir tranché la Phase 0.
- Chaque item : `[ID]` · **finding source** · *quoi* · `fichiers` · *approche* · *validation* · *effort* (S < 2 h, M ½ j, L > 1 j).
- **🔴 bloquant launch** / **🟠 fortement recommandé avant go** / **🟡 hygiène/ops** / **🔵 perf** / **⚪ post-launch**.
- Sévérités déjà ajustées par la vérification adversariale (plusieurs « high » annoncés sont en réalité « medium » : omissions de texte légal corrigeables, pas des failles exploitables).

## Invariants à ne jamais casser pendant ces correctifs

1. **Latence orderflow** : aucun correctif perf ne doit augmenter le travail sur le chemin chaud (`process_tick`).
2. **Intégrité des credentials** : on ne sort jamais un secret du keyring vers le frontend/les logs.
3. **Dev local doit continuer à tourner** : rendre une var « obligatoire en prod » = gate sur `NODE_ENV==='production'`, pas un throw inconditionnel.
4. **Updater signé** : ne jamais committer la clé privée minisign ; ne pas casser la chaîne `.msi.sig`.
5. **Pas de régression de build/test** : `tsc --noEmit`, `vitest`, `cargo test` verts après chaque lot.

---

## PHASE 0 — Décisions & achats à lead-time (Jour 0, AVANT de coder)

Ces points conditionnent le contenu des phases suivantes. À trancher en premier.

| ID | Décision | Pourquoi c'est en Phase 0 | Reco |
|----|----------|---------------------------|------|
| **D1** | Garder ou couper le **paiement manuel** (PayPal/Revolut/Binance + webhook PayPal) pour la v1 | Détermine le texte de la Privacy/CGU (1.2, 1.3) et la liste des sous-traitants | **Couper** pour v1 (le plus simple, supprime AML/TVA/incohérence) |
| **D2** | **Sentry** : réactiver ou retirer | Réactiver ⇒ 3.1 (scrubbing PII) + 1.2 (déclaration sous-traitant US) + 5.6 (re-audit) deviennent **obligatoires en Phase 1**. Retirer ⇒ R11 reste positif, **zéro dette RGPD** mais prod aveugle | À arbitrer : monitoring vs dette conformité |
| **D3** | **Domaine custom** : acheter + pointer Vercel **maintenant** | `VITE_API_BASE` est *inliné au build desktop* → lancer sur `vercel.app` puis migrer impose un **rebuild + re-signature** du desktop. Le domaine doit être figé AVANT le build desktop final (3.10 → 3.2) | Acheter maintenant |
| **D4** | **Certificat code-signing Windows** (EV de préférence, ou Azure Trusted Signing) | Délai d'émission/vérification d'identité = jours à semaines. Intégration en 3.2 mais l'achat doit démarrer Jour 0 | Lancer l'achat |
| **D5** | **Provider Postgres avec PITR/backups** (Neon / Vercel Postgres) | Backup/rollback (3.5) doit exister avant tout déploiement de schéma | Confirmer + activer PITR |
| **D6** | **Adhésion médiateur de la consommation** (ex. CM2C) | Obligation B2C (L612-1 c. conso), nom + URL requis dans les CGU (1.1). Adhésion = lead-time | Démarrer l'adhésion |

---

## PHASE 1 — Conformité légale & RGPD 🔴 (bloque la publication)

> Dépend de **D1, D2, D6**. Aucune faille technique ici : ce sont des corrections de **contenu** + quelques endpoints (export RGPD, repositionnement IA).
> Mais publier sans = infraction LCEN/RGPD pour un opérateur FR.

### `[1.1]` Mentions légales complètes — *finding R1 / L1 / L6*
- **Fichiers** : `app/legal/mentions-legales/page.tsx` (blocs FR **et** EN).
- **Quoi** : remplir SIRET/SIREN, adresse, forme juridique, n° TVA (ou mention « franchise en base, TVA non applicable art. 293 B CGI »). Nommer le **médiateur conso** (D6) avec URL/adresse dans CGU §4 quater (`app/legal/terms/page.tsx:152`). Ajouter le lien **« Mentions légales »** dans le footer public (`components/landing/LandingFooter.tsx`).
- **Validation** : grep `à compléter|TODO` dans `app/legal/` → 0 résultat. Lien visible depuis la home.
- **Effort** : S (nécessite **tes vraies données** d'immatriculation).

### `[1.2]` Refonte de la Privacy Policy — *finding R3 / R4 / R5 / L4 / R6 / R8*
- **Fichier** : `app/legal/privacy/page.tsx` (FR + EN).
- **Quoi** (tout, pour être art. 13/RGPD-complet) :
  1. **Retirer** « ne collectons JAMAIS positions/données financières » → le module Journal stocke symbole, sens, prix entrée/sortie, PnL, screenshots côté serveur (`prisma JournalEntry`). Le déclarer en section « données collectées ».
  2. **Déclarer** : tokens OAuth (`Account.access_token/refresh_token`), Stripe `customerId/subscriptionId`, avatar/displayName, preuves de paiement si D1=garder.
  3. **Section sous-traitants + transferts hors-UE** avec base de garantie (DPF/SCC) : Vercel (hébergement + Analytics, US), Stripe (US), **Anthropic/Groq/Google** (LLM, US), Vercel Blob (stockage), fournisseur email (SMTP), **PayPal** si D1=garder, **Sentry** si D2=réactiver.
  4. **Traitement IA** : déclarer que texte + images du chat partent vers un LLM tiers ; usage/rétention ; idéalement disclaimer dans l'UI du chat.
  5. **Durées de conservation** par catégorie (compte, sessions, logs IP, factures = conservation comptable légale).
  6. **Base légale par finalité** (art. 6 : contrat, intérêt légitime, consentement).
  7. **Retirer/nuancer** « pas de données bancaires ».
- **Validation** : checklist art. 13 cochée ; cohérence avec `prisma/schema.prisma` (chaque catégorie de PII apparaît).
- **Effort** : M. **Dépend de D1 + D2.**

### `[1.3]` Cohérence du circuit de paiement — *finding L2 / R5 / W6*
- **Si D1 = couper** : retirer `app/api/payment/proof/route.ts`, le champ `paymentMethod` côté UI, désactiver/retirer `app/api/paypal/webhook/route.ts`. Vérifier qu'aucun chemin UI n'y mène.
- **Si D1 = garder** : documenter dans CGU + Privacy, process de facture conforme, vérification AML (validation juriste). *(Le durcissement du montant côté serveur — W6 — est traité en 2.5, propriétaire unique.)*
- **Validation** : grep `PAYPAL|REVOLUT|BINANCE` → cohérent avec les CGU.
- **Effort** : M.

### `[1.4]` Consentement cookies/traceurs — *finding R2 / R8*
- **Fichiers** : `app/layout.tsx:174-175` (`<Analytics/>` `<SpeedInsights/>`).
- **Quoi** : soit **(a)** retirer les deux et rester « cookies techniques uniquement » (cohérent, zéro effort de conformité), soit **(b)** bannière de consentement opt-in qui ne monte `<Analytics/>` **qu'après acceptation** + page `/legal/cookies` listant chaque traceur (nom, finalité, durée, tiers).
- **Reco** : (a) pour la v1 si l'analytics n'est pas critique → supprime tout le sujet consentement.
- **Validation** : DevTools réseau → aucun appel Vercel Analytics avant consentement (option b) ou jamais (option a).
- **Effort** : M (option b) / S (option a).

### `[1.5]` Consentement CGU sur inscription Google — *finding L5*
- **Fichier** : `app/auth/register/page.tsx:101`.
- **Quoi** : gater le bouton Google sur `acceptTerms && acceptPrivacy` (comme le form email), ou afficher les cases avant le clic. Horodater/journaliser le consentement (date + version des CGU).
- **Effort** : S.

### `[1.6]` Droit à la portabilité — *finding R7*
- **Fichier** : nouveau `app/api/account/export/route.ts`.
- **Quoi** : `GET` authentifié renvoyant un JSON de **toutes** les données de l'utilisateur (user, journal, daily notes, playbooks, payments, devices, sessions). Réutiliser le pattern d'ownership de `account/delete`.
- **Validation** : test : un user récupère ses données, pas celles d'un autre (ownership).
- **Effort** : M.

### `[1.7]` Repositionner la sortie de l'agent IA — *finding L3* ⚖️
- **Fichier** : `app/api/ai/analysis/route.ts:162-204`, `lib/ai/agents/analysisAgent.ts`, `components/ai/TradingBias.tsx`.
- **Quoi** : reformuler `setup` (entrée/cible/invalidation prescriptifs) en **langage descriptif/probabiliste** (« zone de bascule observée à X », pas « Entrée LONG sur pullback vers X ») + **disclaimer non-conseil systématique** attaché à chaque sortie IA. Atténuant existant : sortie déterministe et non personnalisée.
- **Validation** : **relecture juriste** (risque CIF/AMF/MiFID II).
- **Effort** : M.

### `[1.8]` EULA desktop + connecteurs broker — *finding L8*
- **Fichier** : `app/legal/terms/page.tsx` (section licence).
- **Quoi** : clauses (i) absence d'affiliation/endossement avec Apex/Rithmic/IBKR/exchanges + disclaimer marques (ATAS, Bookmap, NinjaTrader…), (ii) non-garantie d'exactitude/continuité des données de marché, (iii) limitation de responsabilité sur ordres/pertes/latence, (iv) périmètre de licence couvrant le **binaire desktop**.
- **Effort** : M (validation juriste).

### `[1.9]` Fichier LICENSES.md — *finding L7*
- **Quoi** : générer réellement (`license-checker` côté JS + `cargo-about` côté Rust) et le rendre accessible, OU retirer la mention dans `mentions-legales:102`.
- **Effort** : S.

### `[1.10]` 🔒 Gate Phase 1 : **relecture par un juriste** de 1.1–1.8
- Couvre CIF/AMF, AML (si D1=garder), CGV/rétractation, transferts hors-UE. **Bloquant avant publication.**

---

## PHASE 2 — Sécurité technique 🔴/🟠 (bloque la prod)

### `[2.1]` 🔴 Bump des dépendances (site + desktop + gateway) — *finding S1 / S4 / S5*
- **Quoi** :
  - **Site (racine)** : `npm audit fix` puis **Next.js au dernier patch 15.x (≥ 15.5.18)** — corrige SSRF WebSocket (CVSS 8.6), bypass middleware/proxy (8.1) qui touchent directement le gate auth/admin. Traiter undici, path-to-regexp, rollup, nodemailer (derrière next-auth), postcss, `@anthropic-ai/sdk`.
  - **Desktop** (`desktop/`) : `npm audit fix` (2 MODERATE).
  - **Gateway** (`gateway/`) : `npm audit fix` (1 MODERATE) — **après 3.8** (retrait de `node_modules` du git) pour ne pas re-committer l'arbre.
- **Validation** : `npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org` → **0 high** dans les **3 dossiers** ; puis `npm run lint && npx tsc --noEmit && npm test && npm run build` verts côté site (risque de breaking change intra-15.x faible mais à vérifier).
- **Effort** : M.

### `[2.2]` 🟠 Rate-limit du login web — *finding W1*
- **Fichiers** : `lib/auth/auth-options.ts` (`authorize()`), `lib/auth/rate-limiter.ts` (`checkRateLimit`), `lib/auth/security.ts`.
- **Quoi** : ajouter un rate-limit **par IP** dans `authorize()`, **avant** `verifyPassword`. ⚠️ **Ne PAS appeler `loginRateLimit(req)`** : le `req` d'`authorize()` est un `RequestInternal` NextAuth (headers = objet simple `Record<string,string>`), **pas** un `NextRequest` → `getClientIP(req)` ferait `req.headers.get()` = `TypeError` runtime. Extraire l'IP à la main puis appeler la fonction core :
  ```ts
  const ip = (req?.headers?.['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
    || (req?.headers?.['x-real-ip'] as string) || '127.0.0.1';
  const rl = await checkRateLimit(`ip:login:${ip}`, 5, 60_000);
  if (!rl.success) throw new Error('Trop de tentatives, réessayez plus tard');
  ```
  Remplacer aussi le `checkRateLimit(email)` en mémoire de `security.ts` (inopérant en serverless). Garder le lockout DB par-compte (déjà bon).
- **Note** : le rate-limit **doit** vivre dans `authorize()` — `middleware.ts:265` bypass tout `/api/auth/*`, donc le middleware ne peut pas le couvrir. À combiner avec **2.3** (sans Upstash, `checkRateLimit` retombe en mémoire et redevient inopérant).
- **Validation** : 6 tentatives rapides depuis une IP → rejet ; le lockout par-compte reste actif.
- **Effort** : M.

### `[2.3]` 🟠 Upstash obligatoire en prod + fail-closed auth — *finding W4*
- **Fichiers** : `lib/auth/rate-limiter.ts:144-160`, `middleware.ts:70`.
- **État actuel** : `checkRateLimit` est **fail-open** — sans Redis il retombe sur `memoryCheckRateLimit` (par-instance, inopérant en serverless multi-lambda), et sur **erreur** Redis il retombe aussi en mémoire (`catch → memoryCheckRateLimit`). `middleware.ts:70` fait `return false` (laisse passer) en cas d'erreur.
- **Quoi** : si `NODE_ENV==='production'` et `UPSTASH_REDIS_REST_URL/TOKEN` absents → **refuser de démarrer** (ou alerte critique). En prod, sur erreur/absence Redis → renvoyer `allowed:false` (**fail-closed**) pour `login/register/reset` au lieu du fallback mémoire. Dev local : fallback mémoire conservé.
- **Validation** : boot prod sans Upstash → échec explicite ; dev sans Upstash → OK.
- **Effort** : S. **À faire avec 2.2.**

### `[2.4]` 🟠 Plafonds coût API tierces/LLM — *finding W2 / W3*
- **Fichiers** : `app/api/databento/[...path]/route.ts`, `app/api/dxfeed/history/route.ts`, `app/api/ai/support/route.ts`.
- **Quoi** :
  - **databento** : passer par `requireAuth` (→ rate-limit par-user) + quota serré (10–20/min).
  - **dxfeed** (`dxfeed/history`) : a déjà `requireAuth`+`requireTier` mais **pas de quota** → ajouter le même rate-limit par-user (API payante au pass-through).
  - **ai/support** (public) : exiger session minimale OU captcha/honeypot.
  - Documenter que **sans Upstash le rate-limit AI est inopérant** (cf 2.3).
- **Hors-périmètre** : `ai/stream/live` est déjà `requireAuth` et son `StreamAgent` **n'appelle aucun LLM** (déterministe) → pas de coût LLM. *Optionnel* : cap de durée/connexions SSE concurrentes par user.
- **Effort** : M.

### `[2.5]` 🟠 Nettoyage secrets / authz — *finding W5 / W8 / W7 / W6*
- **W5** : **supprimer carrément les blocs morts** de `lib/auth/security.ts` — `JWT_SECRET` (l.29) + `generateAccessToken`/`generateRefreshToken`/`verifyToken`, et `ENCRYPTION_KEY` (l.257) + `encrypt`/`decrypt` (aucun import live, vérifié par grep). ⚠️ **Ne PAS ajouter de `throw` au scope module** : `security.ts` exporte aussi des fonctions **vivantes** (`hashPassword`, `verifyPassword`, `generateSecureToken`, `generateSessionId`) importées par register/reset/forgot/desktop-bridge/license — un throw top-level ferait planter l'import de toutes ces routes. ⚠️ **Ne PAS toucher** `CREDENTIAL_ENCRYPTION_KEY` (`server/utils/encrypt.js`, `app/api/tradovate/ws-ticket`) : secret **vivant** différent. Toute validation « fail-fast » va dans une fonction d'init, pas au scope module d'un utilitaire partagé.
- **W8** : `.toLowerCase()` sur `ADMIN_EMAILS` dans `app/api/admin/users` et `admin/payments` ; centraliser la liste dans un helper unique.
- **W7** : ajouter `verificationTokenExpiry` + filtre `gt: now` (aligné sur reset-password).
- **W6** (propriétaire unique de ce correctif) : si D1=garder, fixer `amount` côté serveur (ignorer la valeur client).
- **Effort** : S.

### `[2.6]` 🟠 Scope de l'opener Tauri — *finding T1*
- **Fichiers** : `desktop/src-tauri/capabilities/default.json`, `desktop/src/components/news/NewsArticleCard.tsx:25`, `AccountRoute.tsx:104`.
- **Quoi** : scope `opener` limité à `https:/http:/mailto:` **et/ou** valider `url.startsWith('https://')` avant `openUrl` (URL Finnhub = donnée externe non fiable).
- **Effort** : S.

### `[2.7]` 🟠 Durcir la CSP desktop — *finding T2*
- **Fichier** : `desktop/src-tauri/tauri.conf.json:24`.
- **Quoi** : retirer `'unsafe-inline'` de `script-src` (Vite/React build n'en a pas besoin ; vérifier qu'aucun `<script>` inline ne subsiste, sinon nonce/hash). Garder sur `style-src` si nécessaire.
- **Validation** : build desktop + smoke test incluant explicitement **IPC/invoke** (footprint live, `bridge_connect`, account) en plus du rendu — seule voie par laquelle un `<script>` inline pourrait réapparaître. Aucune erreur CSP console. Garder `'unsafe-inline'` sur `style-src` (déjà prévu).
- **Effort** : M.

### `[2.8]` 🟡 Transport des tokens desktop — *finding T3 / T4*
- **T4** : token bridge en header/POST plutôt que query-string, ou conserver le guard 60 s + CSP de la page bridge interdisant toute ressource tierce (pas de fuite Referer). Confirmer que `/api/auth/desktop-bridge` ne logge pas l'URL complète.
- **T3** : fallback plaintext du token session si keyring HS → acceptable v1 (révocable serveur) ; durcir en post-launch (5.4).
- **Effort** : M.

### `[2.9]` 🟡 Restreindre `bridge_connect` au loopback — *finding T6*
- **Fichier** : `desktop/src-tauri/src/commands/bridge.rs:58`. Whitelister `127.0.0.1/localhost`.
- **Effort** : S.

### `[2.10]` 🟡 Audit des deps Rust — *finding S3*
- **Quoi** : `cargo install cargo-audit` puis `cargo audit` dans `desktop/src-tauri` ; résoudre HIGH/critical via `cargo update`. (Intégré en CI en 3.12.)
- **Effort** : S.

---

## PHASE 3 — Build / Release / Ops 🔴/🟡 (bloque la prod)

### `[3.1]` 🟠 Monitoring Sentry — *finding B1* (selon **D2**)
- **Fichiers** : `instrumentation.ts`, `sentry.{client,server,edge}.config.ts`, `next.config.ts:2`, `docs/SENTRY_SETUP.md`.
- **Si réactiver** : restaurer `Sentry.init` (server+edge+client), re-wrapper `withSentryConfig`, `NEXT_PUBLIC_SENTRY_DSN`, `tracesSampleRate: 0.1`, `release = VERCEL_GIT_COMMIT_SHA`, **`beforeSend` qui rédige email/IP/tokens** (RGPD) + `sendDefaultPii: false`. Déclarer Sentry sous-traitant (1.2).
- **Si retirer** : enlever `@sentry/nextjs` des deps + les 8 `captureException` morts + corriger `SENTRY_SETUP.md` (qui ment sur l'état actuel).
- **Effort** : M.

### `[3.2]` 🟠 Signature Authenticode du MSI — *finding B3* (selon **D4**)
- **Fichiers** : `desktop/src-tauri/tauri.conf.json` (bundle.windows), `.github/workflows/release.yml`.
- **Quoi** : `bundle.windows.certificateThumbprint` + `timestampUrl` + `digestAlgorithm` ; injecter le cert via secret CI. ⚠️ Dans `release.yml`, `tauri build` **build ET signe atomiquement** au moment du tag — pas d'étape « signer après coup ». Donc **3.10 (domaine) ET 3.2 (config Authenticode) doivent être mergés sur la ref de release AVANT de pousser le tag `vN`**.
- **Validation** : `signtool verify /pa app.msi` OK ; pas de SmartScreen « éditeur inconnu » (immédiat en EV).
- **Effort** : M (+ coût cert).

### `[3.3]` 🟡 PAT pour la route updater — *finding B4*
- **Fichiers** : `lib/github/releases.ts:62`, `app/api/updater/[target]/[current_version]/route.ts`.
- **Quoi** : header `Authorization: Bearer GITHUB_TOKEN` (PAT read-only, 5000 req/h) sur `fetchLatestRelease`, **ou** cache edge `revalidate 30-60s`. Documenter le secret. Évite le blocage silencieux des MAJ à l'échelle (limite 60/h sur IP Vercel partagée).
- **Effort** : S.

### `[3.4]` 🟠 Migrations Prisma au déploiement — *finding B5*
- **Fichiers** : `package.json:11` (`vercel-build`), CI.
- **Quoi** : choisir **une** stratégie : `prisma migrate deploy` en step CI/post-deploy **avant** de promouvoir, OU runbook explicite « migrer avant de promouvoir ». Ne pas le coller naïvement dans `vercel-build` sans gérer la concurrence/`DATABASE_URL` au build.
- **Effort** : M.

### `[3.5]` 🟠 Backup + rollback DB — *finding B6* (selon **D5**)
- **Quoi** : activer PITR/backups du provider ; documenter la commande de restore + un runbook rollback (revenir au déploiement Vercel précédent + gestion d'une migration déjà appliquée). Rétention conforme RGPD.
- **Effort** : M.

### `[3.6]` 🟡 Healthcheck Next.js — *finding B9*
- **Fichier** : nouveau `app/api/health/route.ts`. Ping DB (`prisma.$queryRaw\`SELECT 1\``), retour 200/503, **hors rate-limit** et `noindex`. Brancher un uptime monitor (5.5).
- **Effort** : S.

### `[3.7]` 🟡 Docs de déploiement — *finding B2 / B7*
- **Fichiers** : `DEPLOYMENT.md`, `setup-production-db.md`.
- **Quoi** : `DATABASE_URL` **postgres** (pas `file:./dev.db`), pointer vers `prisma migrate deploy`, remplacer les price IDs `ULTRA` morts par `STRIPE_PRO_MONTHLY_PRICE_ID`, lister **tous** les secrets requis (`NEXTAUTH_SECRET`, `UPSTASH_*`, `SMTP_*`, `GROQ_API_KEY`, `GITHUB_TOKEN`, `TAURI_SIGNING_*`, `WINDOWS_CERTIFICATE`). Corriger le script admin (`subscriptionTier: 'PRO'`, `emailVerified: new Date()`) → idéalement `scripts/create-admin.ts` versionné.
- **Effort** : S.

### `[3.8]` 🟡 Retirer `gateway/node_modules` du git — *finding S2*
- **Quoi** : `git rm -r --cached gateway/node_modules` + ajouter `gateway/node_modules/` au `.gitignore`. **Sans risque** : le `Dockerfile` fait déjà `npm ci` aux 2 stages (vérifié).
- **Validation** : `docker build -f gateway/Dockerfile .` OK après retrait.
- **Effort** : S.

### `[3.9]` 🟡 Hygiène artefacts racine — *finding Q2 / Q3*
- **Quoi** : ajouter `.gitignore` → `/REPORT.md`, `/*.mp3` (les sons officiels sont dans `desktop/public/sounds/`). Supprimer le fichier `nul` (`rm ./nul`) et corriger le script qui redirige vers `nul` au lieu de `$null`.
- **Effort** : S.

### `[3.10]` 🟡 Bascule domaine custom — *finding B8* (selon **D3**)
- **Fichiers** : `app/sitemap.ts`, `robots.ts`, `middleware.ts`, `desktop/.env.production` (`VITE_API_BASE`), et **toutes** les occurrences `orderflow-v2.vercel.app` de `desktop/src-tauri/tauri.conf.json` : ⚠️ **`plugins.updater.endpoints` (l.41)** — sinon le desktop signé cherchera ses MAJ sur l'ancien domaine — **et la CSP (l.24)** : `connect-src` **+ `img-src` + `frame-src`** (4 occurrences).
- **Quoi** : pointer le domaine sur Vercel, set `NEXT_PUBLIC_APP_URL`/`NEXTAUTH_URL`, **purger les références mortes à `senzoukria.com`** (domaine non enregistré d'après `sitemap.ts:11`). Idéalement **externaliser le domaine en variable de build** injectée à la fois dans `VITE_API_BASE`, l'endpoint updater et la CSP (évite un grep manuel fragile). **Rebuild desktop** (VITE inline) → **précède 3.2**.
- **Effort** : M.

### `[3.11]` ⚪ Versioning gateway — *finding Q6*
- Gateway `1.0.0` → `0.x` cohérent avec son état, ou documenter le versioning indépendant par app dans le README.
- **Effort** : S.

### `[3.12]` 🟠 Durcir la CI — *finding S1 / S3 / S5 / B10 / Q8 + scan secrets*
- **Fichier** : `.github/workflows/ci.yml` (couvre aujourd'hui **site uniquement** : lint + tsc + vitest + build).
- **Quoi** ajouter :
  - `npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org` (bloquant) — **dans les 3 dossiers** : racine, `desktop/`, `gateway/`.
  - Job **desktop** : `cd desktop && npm ci && npx vitest run && npx tsc --noEmit` **+ `npm audit`**.
  - Job **Rust** : `cargo test` + `cargo audit` (`desktop/src-tauri`).
  - **gitleaks/trufflehog** (scan secrets).
  - `release.yml` : gate `cargo test` **avant** le `tauri build`.
- ⚠️ **N'activer un gate bloquant qu'après avoir mergé son correctif** (sinon CI rouge bloque tous les merges) : gate `npm audit` ← après **2.1** ; gate `cargo audit` ← après **2.10**.
- **Effort** : M.

---

## PHASE 4 — Performance & qualité 🔵 (avant go si temps, sinon v1.1 — **mesurer d'abord**)

### `[4.1]` `process_tick` : éliminer le clone de barre sous lock — *finding P1*
- **Fichier** : `desktop/src-tauri/src/engine/footprint.rs:344-365`.
- **Quoi** : **profiler un backfill MNQ 700k ticks d'abord** (ne pas optimiser à l'aveugle). Puis : émettre un **delta** (symbol, tf, bucket, close, total_volume, total_delta, trade_count, + le seul `PriceLevel` modifié) au lieu de `bar.clone()` complet ; **et/ou** sortir le `send` **hors du lock** (relâcher `state` avant l'émission). Aligné avec la règle hot-path CLAUDE.md (deltas, pas snapshot).
- **Validation** : mesure avant/après (temps de drain de la file, pic mémoire). Tests orderflow toujours verts.
- **Effort** : L.

### `[4.2]` `tick.symbol.clone()` ×9/tick — *finding P3*
- `footprint.rs:351` : cloner le symbol **une fois par tick** avant la boucle TF (9 → 1 alloc/tick).
- **Effort** : M.

### `[4.3]` `get_bars` reconcile — *finding P5*
- `footprint.rs:319-327` : pour le reconcile 60 s, snapshot léger (sans `levels`, ou barres modifiées depuis un compteur de version) au lieu des 5000 barres complètes sous lock. **Mesurer** la durée du lock d'abord.
- **Effort** : M.

### `[4.4]` Retirer le `console.log` TEMP — *finding P4*
- `desktop/src/components/footprint/FootprintCanvas.tsx:546` : supprimer le bloc TEMP (part en prod, `removeConsole` non configuré côté Vite) ou le gater derrière `import.meta.env.DEV`.
- **Effort** : S.

### `[4.5]` `Mutex::lock().unwrap()` du journal — *finding Q1*
- `desktop/src-tauri/src/journal/db.rs` (20 occurrences) : helper privé `lock().unwrap_or_else(|e| e.into_inner())` ou `map_err` → String. Évite la panic-loop par lock poisoning.
- **Effort** : S.

### `[4.6]` Typage `any` côté site — *finding Q4*
- Prioriser `lib/auth/*` (`session-validator.ts`, `api-middleware.ts`) : remplacer `any` par interfaces ou `unknown + narrowing`. Activer `@typescript-eslint/no-explicit-any` en `warn`. Les `any` WebGL peuvent rester mais commentés.
- **Effort** : M.

### `[4.7]` Logs webhooks paiement — *finding Q5*
- `app/api/{stripe,paypal}/webhook` : router via logger structuré (Sentry si 3.1) avec niveau/rétention, plutôt que `console.log` brut (32 occurrences).
- **Effort** : S.

### `[4.8]` Coalescing de l'émetteur de ticks crypto — *finding P2*
- `desktop/src-tauri/src/commands/crypto_tick_events.rs:42` : batcher sur 16 ms (pattern de `rithmic_events.rs`/`bridge_depth.rs`). **Impact réel nul aujourd'hui** (le seul consommateur `HeatmapLive` est du code mort dev-only) → **à faire avant de câbler la heatmap crypto en prod**, sinon footgun latent.
- **Effort** : M.

### `[4.9]` TODO/FIXME résiduels hors-légal — *finding Q7*
- **Quoi** : trancher les 2 TODO de prod restants : `lib/heatmap/core/LiquidityEngine.ts:321` (`volatility` renvoie `0` — implémenter ou documenter le `0` comme intentionnel) et `app/api/stripe/webhook/route.ts:172` (`trialEndEmail` non câblé). Sinon les requalifier explicitement « acceptable v1 ».
- **Effort** : S.

---

## PHASE 5 — Post-launch / durcissement continu ⚪

| ID | Quoi | Finding |
|----|------|---------|
| `[5.1]` | Cron de **purge** des `Session`/`Device`/`PromoCodeUsage` expirés + `ProcessedWebhookEvent` > 90j (déjà prévu schéma, non implémenté) | R6 |
| `[5.2]` | Suppression compte : `stripe.customers.del`, purge des blobs `proofUrl`/`screenshotUrls`, exception factures (conservation comptable légale) | R10 |
| `[5.3]` | Trancher **double opt-in** : gate login sur `emailVerified` OU assumer simple opt-in (ne pas le présenter comme double) | R9 |
| `[5.4]` | Chiffrer `session.json` en mode keyring dégradé (clé dérivée du machine-uid) ou forcer re-login | T3 |
| `[5.5]` | Brancher un **uptime monitor** externe sur `/api/health` | B9 |
| `[5.6]` | Re-auditer le scrubbing PII Sentry si réactivé | R11 |
| `[5.7]` | **Clarifier/retirer le legacy Electron** : `package.json` racine contient `electron-builder` + scripts `electron:*` + appId `com.senzoukria.desktop` alors que le desktop est **Tauri**. Si mort → retirer (réduit surface/bloat/confusion). *À confirmer avant suppression.* | (nouveau) |

---

## Graphe de dépendances (à respecter)

```
D1 (paiement) ──────────────► 1.2 / 1.3 (privacy / CGU)
D2 (Sentry) ────────────────► 1.2 (sous-traitant) + 3.1 + 5.6
D3+D4 ──► merger 3.10 (domaine : VITE_API_BASE + endpoint updater + CSP) ET 3.2 (Authenticode)
         sur la ref de release ──► PUIS pousser le tag vN  (tauri build = build+sign atomique)
D5 (postgres PITR) ─────────► 3.5 (backup) ──► toute migration (3.4)
D6 (médiateur) ─────────────► 1.1 (CGU)
2.3 (Upstash requis) ───────► 2.2 (rate-limit login)            [ensemble]
2.1 (bump deps) ────────────► gate npm audit en CI (3.12) + re-run CI complète
2.10 (cargo audit propre) ──► gate cargo audit en CI (3.12)
1.10 (juriste) = gate final Phase 1
4.1 (perf engine) : MESURER avant d'optimiser
```

## Definition of Done — Gate de lancement v1

**Ne pas lancer tant que ces cases ne sont pas cochées :**

- [ ] Mentions légales sans aucun `[à compléter]` + médiateur nommé + lien footer (1.1)
- [ ] Privacy art. 13-complète, cohérente avec le schéma + sous-traitants/transferts déclarés (1.2)
- [ ] Circuit paiement cohérent avec les CGU (1.3)
- [ ] Consentement traceurs réglé (1.4) + consentement Google (1.5)
- [ ] Export RGPD fonctionnel (1.6)
- [ ] Sortie IA repositionnée + disclaimer (1.7) — **validée juriste**
- [ ] Relecture juriste OK (1.10)
- [ ] `npm audit --audit-level=high` = **0 high** + `cargo audit` propre (2.1, 2.10)
- [ ] Rate-limit login distribué + Upstash requis en prod + fail-closed auth (2.2, 2.3)
- [ ] Opener scoped + CSP sans `unsafe-inline` (2.6, 2.7)
- [ ] Monitoring en place (Sentry actif OU décision assumée + doc corrigée) (3.1)
- [ ] MSI signé Authenticode (3.2)
- [ ] Migrations + backup/rollback documentés et testés (3.4, 3.5)
- [ ] Healthcheck + uptime monitor (3.6, 5.5)
- [ ] Domaine custom : `VITE_API_BASE` + **endpoint updater** + CSP basculés ; **3.10 et 3.2 mergés AVANT le tag de release** (build+sign atomique) (3.10, 3.2)
- [ ] CI durcie verte (audit racine+desktop+gateway + tests desktop + cargo + gitleaks) (3.12)
- [ ] `gateway/node_modules` retiré du git, artefacts racine gitignored (3.8, 3.9)

## Estimation d'effort (hors lead-time achats D3/D4/D6 et hors juriste)

| Phase | Items | Charge approx. |
|-------|-------|----------------|
| 1 — Légal/RGPD | 10 | 2–3 j (texte + 1 endpoint export + repositionnement IA) |
| 2 — Sécurité | 10 | 2–3 j |
| 3 — Build/Release/Ops | 12 | 2–3 j |
| 4 — Perf/Qualité | 8 | 1 j (hors 4.1 qui est L : +1–2 j) |
| 5 — Post-launch | 7 | continu |

**Chemin critique vers le go** : Phases 1 → 2 → 3 (≈ **6–9 j de dev** + lead-times achats en parallèle + relecture juriste). La Phase 4 (sauf 4.4/4.5 triviaux) peut glisser en v1.1 si elle est mesurée comme non bloquante.

## Ce qu'on NE fait PAS pour la v1 (anti scope-creep)

- Pas de macOS/Linux desktop (release CI Windows-only assumée).
- Pas de refonte de l'engine au-delà du delta hot-path (4.1) — et seulement si mesuré nécessaire.
- Pas de double opt-in si simple opt-in assumé et correctement décrit (5.3).
- Pas de nouvelles features : cette roadmap **stabilise**, elle n'étend pas.

---
*Dernière mise à jour : 2026-06-06 — généré depuis l'audit go/no-go, puis durci par une passe de critique adversariale (couverture / logique / justesse technique). Corrections appliquées : S5 (deps desktop+gateway), W2 (dxfeed), W3 (ai/stream/live), Q7 (TODO résiduels), endpoint updater dans la bascule domaine, build+sign atomique, ownership W6, libellé fail-open 2.3, et surtout 2.2 (l'appel `loginRateLimit(req)` aurait crashé — remplacé par extraction IP + `checkRateLimit`).*
