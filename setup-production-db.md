# Configuration Base de Données Production

## Après avoir créé la base Vercel Postgres :

### 1. Récupérer l'URL de la base de données

```bash
# Télécharger les variables d'environnement de production
vercel env pull .env.production
```

### 2. Exécuter les migrations Prisma

```bash
# Utiliser l'URL de production pour les migrations
npx prisma migrate deploy --schema prisma/schema.prisma
```

OU si tu veux utiliser `DATABASE_URL` depuis Vercel :

```bash
# Récupérer DATABASE_URL depuis Vercel
vercel env pull

# Puis exécuter les migrations
npx prisma migrate deploy
```

### 3. (Optionnel) Créer un utilisateur admin

Tu peux créer un script pour initialiser ton premier utilisateur :

```typescript
// scripts/create-admin.ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD env vars');

  const hashedPassword = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      subscriptionTier: 'PRO',   // 'ULTRA' n'existe plus
      emailVerified: new Date(),  // DateTime, pas boolean
      subscriptionEnd: new Date('2099-12-31'),
    },
    create: {
      email,
      password: hashedPassword,
      name: 'Admin',
      subscriptionTier: 'PRO',
      emailVerified: new Date(),
      subscriptionEnd: new Date('2099-12-31'),
    },
  });

  console.log('✅ Admin créé/mis à jour:', admin.email);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

Exécuter avec :
```bash
ADMIN_EMAIL="ton@email.com" ADMIN_PASSWORD="motdepasse" npx tsx scripts/create-admin.ts
```

---

## Alternative : Neon (PostgreSQL gratuit)

Si tu préfères Neon :

1. Va sur https://neon.tech
2. Crée un compte gratuit
3. Crée un nouveau projet
4. Copie la `DATABASE_URL` (Connection String)
5. Ajoute-la à Vercel :
   ```bash
   vercel env add DATABASE_URL
   # Colle l'URL de Neon
   # Environnement: Production
   ```
6. Redéploie :
   ```bash
   vercel --prod
   ```

---

## Vérification

Après configuration, teste la connexion :

```bash
# En local avec l'URL de production
DATABASE_URL="postgresql://..." npx prisma db push
```

Si ça fonctionne, l'authentification devrait marcher sur le site !
