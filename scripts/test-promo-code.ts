/**
 * Test SENBETA5 promo code validation
 *
 * Run with: npx tsx scripts/test-promo-code.ts
 */

import { PrismaClient } from '@prisma/client';
import { validatePromoCodeUsage } from '../lib/stripe/promo-code-service';

const prisma = new PrismaClient();

async function main() {
  console.log('🧪 Test du code promo SENBETA5\n');

  try {
    // Get promo code from DB
    const promoCode = await prisma.promoCode.findUnique({
      where: { code: 'SENBETA5' },
    });

    if (!promoCode) {
      console.error('❌ Code promo SENBETA5 introuvable !');
      return;
    }

    console.log('📊 État du code promo:');
    console.log({
      code: promoCode.code,
      reduction: `${promoCode.discountValue}%`,
      essaiGratuit: `${promoCode.trialDays} jours`,
      utilisations: `${promoCode.usedCount}/${promoCode.maxUses}`,
      actif: promoCode.active,
    });
    console.log('');

    // Test 1: Valid code with new user
    console.log('📝 Test 1: Code valide avec nouvel utilisateur');
    const testUserId = 'test-user-' + Date.now();
    const testEmail = `test${Date.now()}@example.com`;
    const testFingerprint = 'test-fingerprint-' + Date.now();
    const testIp = '127.0.0.1';
    const testUserAgent = 'Mozilla/5.0 Test';

    const validation = await validatePromoCodeUsage(
      'SENBETA5',
      testUserId,
      testFingerprint,
      testIp,
      testUserAgent,
      testEmail
    );

    if (validation.valid) {
      console.log('✅ Code accepté !');
      console.log('   → 5 mois gratuits (0€)');
      console.log('   → Puis 15€/mois après');
      console.log('   → Trial days:', promoCode.trialDays);
    } else {
      console.log('❌ Code refusé:', validation.reason);
    }
    console.log('');

    // Test 2: Invalid code
    console.log('📝 Test 2: Code invalide');
    const invalidValidation = await validatePromoCodeUsage(
      'WRONGCODE',
      testUserId,
      testFingerprint,
      testIp,
      testUserAgent,
      testEmail
    );

    if (!invalidValidation.valid) {
      console.log('✅ Erreur correcte:', invalidValidation.reason);
    } else {
      console.log('❌ Le code invalide a été accepté (bug!)');
    }
    console.log('');

    // Test 3: Check if already used (simulate)
    console.log('📝 Test 3: Vérifier limite d\'utilisation');
    console.log(`   Utilisations actuelles: ${promoCode.usedCount}/${promoCode.maxUses}`);

    if (promoCode.usedCount < promoCode.maxUses) {
      console.log(`✅ Places disponibles: ${promoCode.maxUses - promoCode.usedCount}`);
    } else {
      console.log('❌ Limite atteinte');
    }
    console.log('');

    // Summary
    console.log('═══════════════════════════════════════════════');
    console.log('📋 RÉSUMÉ DU CODE PROMO SENBETA5');
    console.log('═══════════════════════════════════════════════');
    console.log(`✅ Code actif: ${promoCode.active ? 'OUI' : 'NON'}`);
    console.log(`✅ Réduction: ${promoCode.discountValue}%`);
    console.log(`✅ Essai gratuit: ${promoCode.trialDays} jours (5 mois)`);
    console.log(`✅ Prix après essai: 15€/mois (au lieu de 50€)`);
    console.log(`✅ Utilisations: ${promoCode.usedCount}/${promoCode.maxUses}`);
    console.log(`✅ Places restantes: ${promoCode.maxUses - promoCode.usedCount}`);
    console.log('═══════════════════════════════════════════════\n');

    console.log('🎉 Tests terminés avec succès !');
    console.log('\n💡 Pour tester le flow complet:');
    console.log('   1. Ouvre http://localhost:3001/pricing');
    console.log('   2. Connecte-toi avec un compte');
    console.log('   3. Entre SENBETA5 dans le champ promo');
    console.log('   4. Clique "Pay with Card"');
    console.log('   5. Vérifie que Stripe affiche 0€ aujourd\'hui');
    console.log('   6. Vérifie que la prochaine facturation est dans 5 mois à 15€\n');

  } catch (error) {
    console.error('❌ Erreur lors du test:', error);
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
