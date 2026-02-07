# 🚀 Guide de Déploiement SENZOUKRIA

## Méthode 1 : Script Automatique (Le plus simple)

### Une seule commande à lancer :

```bash
bash deploy.sh
```

**Ce qui va se passer :**
1. Ton navigateur s'ouvre pour te connecter à Vercel (1 fois seulement)
2. Le site se déploie automatiquement
3. Tu reçois l'URL de ton site en ligne

**Ensuite, pour mettre à jour :**
```bash
vercel --prod
```

---

## Méthode 2 : Étape par Étape

### Étape 1 : Se connecter à Vercel (1 fois)
```bash
vercel login
```
→ Suis les instructions dans le navigateur

### Étape 2 : Déployer
```bash
vercel --prod
```

### Étape 3 : Pour les mises à jour futures
```bash
git add .
git commit -m "Update"
vercel --prod
```

---

## Méthode 3 : Avec GitHub (Auto-deploy)

### Avantage : Déploiement automatique à chaque commit

1. **Crée un repo GitHub :**
   - Va sur https://github.com/new
   - Nom : `orderflow-v2`
   - Clique "Create repository"

2. **Connecte ton projet :**
   ```bash
   git remote add origin https://github.com/TON-USERNAME/orderflow-v2.git
   git push -u origin master
   ```

3. **Sur Vercel :**
   - Va sur https://vercel.com/new
   - Import from GitHub
   - Sélectionne `orderflow-v2`
   - Clique "Deploy"

4. **Ensuite, pour toute modification :**
   ```bash
   git add .
   git commit -m "Ma modification"
   git push
   ```
   → Vercel redéploie automatiquement en 2 minutes ! ✨

---

## Variables d'Environnement (Important!)

Sur Vercel, ajoute ces variables dans : Settings → Environment Variables

```env
DATABASE_URL=file:./dev.db
NEXTAUTH_SECRET=ton-secret-aleatoire-tres-long
NEXTAUTH_URL=https://ton-site.vercel.app
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_ULTRA_MONTHLY_PRICE_ID=price_...
STRIPE_ULTRA_YEARLY_PRICE_ID=price_...
```

---

## 🎯 Résultat

Après déploiement :
- ✅ Site en ligne : `https://orderflow-v2.vercel.app`
- ✅ HTTPS automatique
- ✅ CDN global (ultra rapide partout dans le monde)
- ✅ Mises à jour instantanées

---

## 🆘 Besoin d'aide ?

1. **Vercel Dashboard** : https://vercel.com/dashboard
2. **Logs en temps réel** : https://vercel.com/dashboard → ton projet → Deployments
3. **Support Vercel** : https://vercel.com/support

---

## 💡 Modifications en local

Tu peux TOUJOURS modifier en local :

```bash
# 1. Développe localement
npm run dev

# 2. Teste sur http://localhost:3001

# 3. Quand c'est prêt
git commit -am "Update"
git push  # (si GitHub connecté)
# OU
vercel --prod  # (si direct Vercel)
```

Les deux versions (locale + online) coexistent sans problème !
