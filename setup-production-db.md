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
  const hashedPassword = await bcrypt.hash('ton_mot_de_passe_secure', 12);

  const admin = await prisma.user.create({
    data: {
      email: 'admin@orderflow.com',
      password: hashedPassword,
      name: 'Admin',
      subscriptionTier: 'ULTRA',
      emailVerified: true,
    },
  });

  console.log('✅ Admin créé:', admin.email);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

Exécuter avec :
```bash
npx tsx scripts/create-admin.ts
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
