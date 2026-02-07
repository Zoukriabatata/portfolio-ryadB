/**
 * Update SENBETA5 promo code to 70% discount (15€/month instead of free)
 *
 * Run with: npx tsx scripts/update-senbeta5.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Mise à jour du code promo SENBETA5...');

  try {
    // Update SENBETA5 to 70% discount
    const updated = await prisma.promoCode.update({
      where: { code: 'SENBETA5' },
      data: {
        discountValue: 70, // 70% de réduction (50€ → 15€)
        stripeCouponId: null, // Reset Stripe coupon to force recreation
      },
    });

    console.log('✅ Code promo SENBETA5 mis à jour:', {
      id: updated.id,
      code: updated.code,
      reduction: `${updated.discountValue}%`,
      prixMensuel: '50€ → 15€/mois',
      prixAnnuel: '480€ → 144€/an (12€/mois)',
      utilisations: `${updated.usedCount}/${updated.maxUses}`,
      actif: updated.active ? 'Oui' : 'Non',
    });

    console.log('\n🎉 Mise à jour terminée !');
    console.log(`\nLe code "SENBETA5" offre maintenant une réduction de 70%`);
    console.log(`Prix final : 15€/mois ou 144€/an\n`);

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
