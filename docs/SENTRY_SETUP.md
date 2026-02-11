# 🚨 Sentry Setup Guide

Guide complet pour configurer le monitoring d'erreurs en production avec Sentry.

---

## ✅ Configuration (Déjà faite)

Tous les fichiers de configuration Sentry sont déjà en place:

```
✅ sentry.client.config.ts    # Client-side (navigateur)
✅ sentry.server.config.ts    # Server-side (API routes, SSR)
✅ sentry.edge.config.ts      # Edge runtime (Middleware)
✅ instrumentation.ts         # Hook Next.js 15+
✅ next.config.ts             # Wrapped with Sentry
✅ ChartErrorBoundary.tsx     # React error boundary avec Sentry
```

---

## 🔑 Setup Requis (5 minutes)

### Étape 1: Créer un compte Sentry

1. Aller sur **https://sentry.io/signup/**
2. Créer un compte gratuit (10,000 events/mois)
3. Sélectionner **Next.js** comme plateforme

### Étape 2: Créer un projet

1. Nom du projet: **orderflow-v2**
2. Langue: **Next.js**
3. Cliquer sur **Create Project**

### Étape 3: Copier le DSN

1. Dans le dashboard Sentry, aller dans **Settings** > **Projects** > **orderflow-v2**
2. Cliquer sur **Client Keys (DSN)**
3. Copier le **DSN** (format: `https://xxxxx@yyyyy.ingest.sentry.io/zzzzz`)

### Étape 4: Ajouter le DSN dans .env.local

```bash
# .env.local
NEXT_PUBLIC_SENTRY_DSN="https://xxxxx@yyyyy.ingest.sentry.io/zzzzz"
```

### Étape 5: (Optionnel) Générer un Auth Token

**Uniquement si vous voulez upload les source maps en production:**

1. Dans Sentry: **Settings** > **Auth Tokens**
2. Cliquer **Create New Token**
3. Permissions:
   - ✅ `project:read`
   - ✅ `project:releases`
   - ✅ `org:read`
4. Copier le token et ajouter dans `.env.local`:

```bash
SENTRY_ORG="votre-organisation"
SENTRY_PROJECT="orderflow-v2"
SENTRY_AUTH_TOKEN="sntrys_xxxxxxxxxxxxxx"
```

---

## 🧪 Tester Sentry

### Test 1: Erreur Client-Side

Ajouter temporairement dans n'importe quel composant:

```typescript
// components/test-error.tsx
'use client';

export default function TestError() {
  return (
    <button onClick={() => {
      throw new Error('Test Sentry client-side!');
    }}>
      Trigger Error
    </button>
  );
}
```

Cliquer sur le bouton → L'erreur doit apparaître dans Sentry en ~10 secondes.

### Test 2: Erreur Server-Side

Créer une API route:

```typescript
// app/api/test-sentry/route.ts
export async function GET() {
  throw new Error('Test Sentry server-side!');
}
```

Naviguer vers `/api/test-sentry` → L'erreur doit apparaître dans Sentry.

### Test 3: Vérifier le Dashboard

1. Ouvrir **https://sentry.io**
2. Aller dans **Issues**
3. Vous devriez voir les 2 erreurs de test

---

## 📊 Ce qui est Monitored

### ✅ Erreurs Automatiques

- **React errors** → ChartErrorBoundary
- **API route errors** → Server config
- **WebSocket errors** → (filtrées, pas envoyées)
- **Unhandled promise rejections** → Client config
- **Edge runtime errors** → Edge config

### ✅ Performance Monitoring

- **Page loads** (LCP, FCP, CLS, TTFB)
- **API response times**
- **Database queries** (si activé)
- **WebSocket connections** (optionnel)

### ✅ Session Replay

- **10% des sessions normales** enregistrées
- **100% des sessions avec erreurs** enregistrées
- **Masquage automatique** du texte sensible

---

## 🎯 Features Actives

### 1. Error Filtering

Erreurs **ignorées** automatiquement (pas envoyées à Sentry):

```typescript
// Client
- WebSocket timeout (normal)
- ResizeObserver loop limit (normal)
- Network errors (déjà gérées)

// Server
- Binance API errors (déjà loggées)
- Rate limiting 429 (normal)
- ECONNREFUSED (dev uniquement)
```

### 2. Performance Sampling

```typescript
// Production
tracesSampleRate: 0.1  // 10% des transactions
replaysSessionSampleRate: 0.1  // 10% des sessions

// Development
tracesSampleRate: 1.0  // 100% (debug)
```

### 3. Release Tracking

Si déployé sur Vercel:

```typescript
release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA
```

Permet de voir quelle version Git a causé les bugs.

---

## 🔍 Utilisation Avancée

### Capturer des Erreurs Manuellement

```typescript
import * as Sentry from '@sentry/nextjs';

try {
  riskyOperation();
} catch (error) {
  Sentry.captureException(error, {
    tags: {
      section: 'trading',
      action: 'buy',
    },
    contexts: {
      order: {
        symbol: 'BTC/USDT',
        amount: 100,
      },
    },
  });
}
```

### Ajouter du Contexte Utilisateur

```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.setUser({
  id: userId,
  email: userEmail,
  username: username,
});
```

### Breadcrumbs (Historique d'Actions)

```typescript
Sentry.addBreadcrumb({
  category: 'trading',
  message: 'User clicked BUY button',
  level: 'info',
  data: {
    symbol: 'BTC/USDT',
    price: 69000,
  },
});
```

### Performance Tracking Manuel

```typescript
import * as Sentry from '@sentry/nextjs';

const transaction = Sentry.startTransaction({
  name: 'Chart Rendering',
  op: 'render',
});

// ... code ...

transaction.finish();
```

---

## 📈 Métriques à Surveiller

### Priorité Haute (Surveiller chaque jour)

1. **Error Rate** → Doit rester < 1%
2. **Crash-Free Sessions** → Objectif > 99.5%
3. **LCP (Largest Contentful Paint)** → < 2.5s
4. **CLS (Cumulative Layout Shift)** → < 0.1

### Priorité Moyenne (Surveiller chaque semaine)

1. **Total Errors Count** → Tendance descendante
2. **Affected Users** → Minimiser
3. **Performance Score** → Maintenir > 90

---

## 🐛 Troubleshooting

### Sentry ne reçoit aucune erreur

```bash
# 1. Vérifier que le DSN est défini
echo $NEXT_PUBLIC_SENTRY_DSN

# 2. Vérifier les logs au démarrage
npm run dev
# Devrait afficher: "[Sentry] SDK initialized"

# 3. Forcer un redémarrage
rm -rf .next
npm run dev
```

### Source maps non uploadées

```bash
# Vérifier que le token existe
echo $SENTRY_AUTH_TOKEN

# Build en mode production (requis pour upload)
npm run build

# Vérifier les logs pendant le build
# Devrait afficher: "[Sentry] Uploading source maps..."
```

### Trop d'erreurs envoyées

Ajuster les filtres dans `sentry.client.config.ts`:

```typescript
ignoreErrors: [
  'Votre pattern d\'erreur',
  /Regex pattern/,
],
```

---

## 💰 Limites Gratuit vs Payant

### Plan Gratuit (Developer)

```
✅ 10,000 errors/mois
✅ 100 replays/mois
✅ 30 jours de rétention
✅ Toutes les intégrations
❌ Pas d'alerte email/SMS
❌ Pas de data scrubbing avancé
```

### Si vous dépassez les limites

1. **Filtrer plus d'erreurs** (ignoreErrors)
2. **Réduire le sampling** (tracesSampleRate)
3. **Upgrade vers Team** ($26/mois pour 50,000 errors)

---

## ✨ Résultat Attendu

Une fois configuré:

- ✅ Toutes les erreurs production trackées
- ✅ Session replay pour débugger visuellement
- ✅ Performance monitoring (Core Web Vitals)
- ✅ Release tracking (quelle version a des bugs)
- ✅ Alertes Slack/Email (si configuré)
- ✅ Stack traces lisibles (avec source maps)

**Dashboard Sentry → Vue complète de la santé de l'app en production! 🎯**

---

## 📚 Ressources

- **Docs officielles:** https://docs.sentry.io/platforms/javascript/guides/nextjs/
- **Dashboard:** https://sentry.io
- **Performance Best Practices:** https://docs.sentry.io/product/performance/
- **Session Replay:** https://docs.sentry.io/product/session-replay/

---

**Setup estimé:** 5-10 minutes
**Effort de maintenance:** 0 (automatique)
**Valeur en production:** Inestimable! 🚀
