/**
 * Add 5 months free trial to SENBETA5 promo code
 *
 * Run with: npx tsx scripts/add-trial-senbeta5.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Ajout de 5 mois gratuits au code SENBETA5...');

  try {
    // Update SENBETA5 to include 5 months trial
    const updated = await prisma.promoCode.update({
      where: { code: 'SENBETA5' },
      data: {
        trialDays: 150, // 5 mois = ~150 jours
        stripeCouponId: null, // Reset to force recreation
      },
    });

    console.log('✅ Code promo SENBETA5 mis à jour:', {
      id: updated.id,
      code: updated.code,
      reduction: `${updated.discountValue}%`,
      essaiGratuit: `${updated.trialDays} jours (5 mois)`,
      prixPendantEssai: '0€',
      prixApresEssai: '15€/mois (70% de réduction)',
      utilisations: `${updated.usedCount}/${updated.maxUses}`,
      actif: updated.active ? 'Oui' : 'Non',
    });

    console.log('\n🎉 Mise à jour terminée !');
    console.log(`\n📋 Avantages du code "SENBETA5":`);
    console.log(`   1️⃣  5 mois gratuits (0€)`);
    console.log(`   2️⃣  Puis 70% de réduction à vie (15€/mois au lieu de 50€)`);
    console.log(`   3️⃣  Limité à 5 utilisateurs\n`);

  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour:', error);
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
