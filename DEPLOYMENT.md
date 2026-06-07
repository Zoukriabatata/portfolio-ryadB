# Guide de déploiement — Senzoukria (Production)

> Dernière mise à jour : 2026-06-06.
> Ce fichier est la source de vérité pour les déploiements en production.
> En cas de divergence avec un autre document, ce fichier prime.

---

## 1. Prérequis

| Outil | Commande de vérif |
|-------|-------------------|
| Node 20+ | `node -v` |
| npm 10+ | `npm -v` |
| Prisma CLI | `npx prisma --version` |
| Compte Vercel | https://vercel.com |
| Base PostgreSQL (Neon / Vercel Postgres) | — |
| Upstash Redis | https://console.upstash.com |

---

## 2. Variables d'environnement (Vercel → Settings → Environment Variables)

### Obligatoires — la prod refuse de démarrer sans elles

```env
# Base Postgres (PAS file:./dev.db — Prisma est configuré postgresql)
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"

# NextAuth
NEXTAUTH_SECRET="openssl rand -base64 32"
NEXTAUTH_URL="https://ton-domaine.com"

# Stripe (plan Pro uniquement — les IDs ULTRA sont obsolètes)
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_PUBLISHABLE_KEY="pk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PRO_MONTHLY_PRICE_ID="price_..."   # seul plan exposé aux nouveaux users

# Upstash Redis — OBLIGATOIRE en prod (sans ça, tout le rate-limiting est inopérant)
UPSTASH_REDIS_REST_URL="https://your-db.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-token"

# Email SMTP (vérification, reset de mot de passe, alertes)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="ton-email@gmail.com"
SMTP_PASS="app-password-16-chars"
SMTP_FROM="Senzoukria <noreply@ton-domaine.com>"

# Admin (liste d'emails séparés par des virgules — doit matcher exactement les emails en DB)
ADMIN_EMAILS="ton-email@gmail.com"
SUPPORT_EMAIL="ton-email@gmail.com"

# LLM (Groq recommandé en prod — gratuit jusqu'à 14 400 req/jour)
GROQ_API_KEY="gsk_..."
# ANTHROPIC_API_KEY → NE PAS mettre en prod (coût par visiteur)
```

### Recommandées

```env
# GitHub PAT read-only (évite la limite 60 req/h sur la route /api/updater)
GITHUB_TOKEN="ghp_..."

# URLs publiques
NEXT_PUBLIC_APP_URL="https://ton-domaine.com"
NEXT_PUBLIC_APP_NAME="SENZOUKRIA"

# Google OAuth
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# Prix optionnels (si tu vends des packs research)
STRIPE_RESEARCH_PACK_PRICE_ID="price_..."
```

### Desktop (Tauri) — variables de build

```env
# Dans desktop/.env.production (committé non-secret)
VITE_API_BASE=https://ton-domaine.com   # À mettre à jour avec le domaine final

# Secrets CI (GitHub Secrets) — ne jamais committer
TAURI_SIGNING_PRIVATE_KEY=...           # Clé minisign pour l'updater
TAURI_SIGNING_PRIVATE_KEY_PASSWORD=...
# WINDOWS_CERTIFICATE=...              # Cert Authenticode (voir roadmap 3.2)
```

---

## 3. Premier déploiement

### 3.1 Base de données

```bash
# 1. Pousser les migrations sur la DB prod (AVANT de promouvoir le déploiement)
DATABASE_URL="postgresql://..." npx prisma migrate deploy

# 2. Vérifier l'état
DATABASE_URL="postgresql://..." npx prisma migrate status
```

> ⚠️ **Ne jamais utiliser `prisma db push` en prod** — il peut entraîner des pertes de données.

### 3.2 Créer le compte admin

```bash
# Remplacer les valeurs par les vraies
DATABASE_URL="postgresql://..." npx ts-node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.user.update({
  where: { email: 'ton-email@gmail.com' },
  data: {
    subscriptionTier: 'PRO',        // pas 'ULTRA' (obsolète)
    emailVerified: new Date(),
    subscriptionEnd: new Date('2099-12-31'),
  }
}).then(console.log).finally(() => prisma.\$disconnect());
"
```

### 3.3 Déploiement Vercel

```bash
# Option A — push sur main (GitHub Actions → Vercel auto-deploy)
git push origin main

# Option B — deploy CLI
vercel --prod
```

---

## 4. Mises à jour (déploiements suivants)

```bash
# 1. Vérifier si une migration est requise
npx prisma migrate status

# 2. Si oui — appliquer AVANT de promouvoir
DATABASE_URL="postgresql://..." npx prisma migrate deploy

# 3. Promouvoir le déploiement (Vercel dashboard ou CLI)
vercel --prod
```

---

## 5. Desktop — release d'une nouvelle version

```bash
# Bumper la version de façon synchronisée (3 fichiers doivent matcher)
# desktop/package.json   → "version": "X.Y.Z"
# desktop/src-tauri/tauri.conf.json → "version": "X.Y.Z"
# desktop/src-tauri/Cargo.toml      → version = "X.Y.Z"

# Puis pousser le tag pour déclencher release.yml
git tag vX.Y.Z
git push origin vX.Y.Z
```

> ⚠️ **Avant de pousser le tag**, s'assurer que les items suivants sont mergés sur la ref de release :
> - Domaine custom dans `VITE_API_BASE`, CSP et `plugins.updater.endpoints` (tauri.conf.json)
> - Config Authenticode dans `tauri.conf.json` bundle.windows + secret CI (si cert disponible)
>
> `tauri build` = build + sign atomique → on ne peut pas signer après coup.

---

## 6. Rollback

```bash
# Site — revenir au déploiement précédent via Vercel dashboard
# Deployments → sélectionner le bon → Promote to Production

# Si une migration a été appliquée et qu'il faut reculer :
# → Écrire une migration de rollback manuelle (prisma ne supporte pas down())
# → DATABASE_URL="..." npx prisma migrate deploy (après avoir ajouté la migration)
```

> Activer le **PITR** (Point-In-Time Recovery) sur ton provider Postgres avant le premier déploiement.

---

## 7. Vérifications post-déploiement

```bash
# Healthcheck
curl https://ton-domaine.com/api/health   # doit retourner {"status":"ok"}

# Audit sécurité (à lancer avant chaque release)
npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org
cd desktop && npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org
cd ../desktop/src-tauri && cargo audit
```

---

## 8. Variables obsolètes (ne plus utiliser)

| Variable | Raison |
|----------|--------|
| `STRIPE_ULTRA_MONTHLY_PRICE_ID` | Plan ULTRA supprimé — utiliser `STRIPE_PRO_MONTHLY_PRICE_ID` |
| `STRIPE_ULTRA_YEARLY_PRICE_ID` | idem |
| `JWT_SECRET` | Code supprimé (lib/auth/security.ts) |
| `ENCRYPTION_KEY` | Code supprimé (lib/auth/security.ts) |
