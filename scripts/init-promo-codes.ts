/**
 * Initialize Promo Codes
 *
 * Creates the SENBETA5 promo code in the database
 * Run with: npx tsx scripts/init-promo-codes.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Initialisation des codes promo...');

  try {
    // Créer SENBETA5
    const senbeta5 = await prisma.promoCode.upsert({
      where: { code: 'SENBETA5' },
      update: {},
      create: {
        code: 'SENBETA5',
        discountType: 'PERCENTAGE',
        discountValue: 100, // 100% de réduction (gratuit)
        maxUses: 5,
        usedCount: 0,
        active: true,
        validFrom: new Date(),
        // Pas de validUntil = code valide indéfiniment
      },
    });

    console.log('✅ Code promo SENBETA5 créé:', {
      id: senbeta5.id,
      code: senbeta5.code,
      utilisations: `${senbeta5.usedCount}/${senbeta5.maxUses}`,
      reduction: `${senbeta5.discountValue}%`,
      actif: senbeta5.active ? 'Oui' : 'Non',
      createdAt: senbeta5.createdAt,
    });

    console.log('\n🎉 Initialisation terminée !');
    console.log(`\nLe code "SENBETA5" offre une réduction de 100% (gratuit)`);
    console.log(`Limité à ${senbeta5.maxUses} utilisations au total\n`);

  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
