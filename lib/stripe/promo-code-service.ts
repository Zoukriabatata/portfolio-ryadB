/**
 * Promo Code Service - Validation & Anti-Abuse Detection
 *
 * Manages promo codes with strict limits and prevents abuse through:
 * - Device fingerprint matching (+50 score)
 * - IP address matching (+30 score)
 * - Email similarity detection (+40 score)
 * - User agent matching (+20 score)
 * - Suspicious if score >= 60
 */

import { prisma } from '@/lib/db';
import crypto from 'crypto';

interface PromoCodeValidation {
  valid: boolean;
  reason?: string;
  promoCode?: any;
  similarityScore?: number;
}

/**
 * Valider l'utilisation d'un code promo par un utilisateur
 */
export async function validatePromoCodeUsage(
  code: string,
  userId: string,
  deviceFingerprint: string,
  ipAddress: string,
  userAgent: string,
  email: string
): Promise<PromoCodeValidation> {

  // 1. Vérifier que le code existe et est actif
  const promoCode = await prisma.promoCode.findUnique({
    where: { code: code.toUpperCase() },
    include: { usages: true },
  });

  if (!promoCode) {
    return { valid: false, reason: 'Invalid promo code' };
  }

  if (!promoCode.active) {
    return { valid: false, reason: 'This promo code is no longer active' };
  }

  // 2. Vérifier la date de validité
  if (promoCode.validUntil && new Date(promoCode.validUntil) < new Date()) {
    return { valid: false, reason: 'Ce code promo a expiré' };
  }

  // 3. Vérifier la limite globale
  if (promoCode.usedCount >= promoCode.maxUses) {
    return { valid: false, reason: 'This promo code has reached its usage limit' };
  }

  // 4. Vérifier si l'utilisateur a déjà utilisé ce code
  const existingUsage = await prisma.promoCodeUsage.findUnique({
    where: {
      promoCodeId_userId: {
        promoCodeId: promoCode.id,
        userId,
      },
    },
  });

  if (existingUsage) {
    return { valid: false, reason: 'You have already used this promo code' };
  }

  // 5. DÉTECTION ANTI-ABUS
  const abuseCheck = await detectPromoCodeAbuse(
    promoCode.id,
    deviceFingerprint,
    ipAddress,
    email,
    userAgent
  );

  if (abuseCheck.suspicious) {
    return {
      valid: false,
      reason: 'This promo code cannot be used with this account',
      similarityScore: abuseCheck.score,
    };
  }

  return { valid: true, promoCode };
}

/**
 * Détecter si un utilisateur essaie d'abuser du code promo
 * avec plusieurs comptes (même device, IP, email similaire)
 */
async function detectPromoCodeAbuse(
  promoCodeId: string,
  deviceFingerprint: string,
  ipAddress: string,
  email: string,
  userAgent: string
): Promise<{ suspicious: boolean; score: number; reasons: string[] }> {

  const emailHash = hashEmail(email);
  let score = 0;
  const reasons: string[] = [];

  // Récupérer toutes les utilisations validées de ce code
  const completedUsages = await prisma.promoCodeUsage.findMany({
    where: {
      promoCodeId,
      paymentCompleted: true, // Seulement les usages validés
    },
  });

  if (completedUsages.length === 0) {
    return { suspicious: false, score: 0, reasons: [] };
  }

  // CHECK 1: Même device fingerprint
  const sameFingerprint = completedUsages.find(
    u => u.deviceFingerprint === deviceFingerprint
  );
  if (sameFingerprint) {
    score += 50;
    reasons.push('Même appareil détecté');
  }

  // CHECK 2: Même IP
  const sameIp = completedUsages.find(
    u => u.ipAddress === ipAddress
  );
  if (sameIp) {
    score += 30;
    reasons.push('Même adresse IP détectée');
  }

  // CHECK 3: Email très similaire (ex: test@gmail.com vs test2@gmail.com)
  const similarEmail = completedUsages.find(u => {
    const similarity = calculateEmailSimilarity(u.emailHash, emailHash);
    return similarity > 0.8; // 80% de similarité
  });
  if (similarEmail) {
    score += 40;
    reasons.push('Email similaire détecté');
  }

  // CHECK 4: User agent identique (même navigateur + OS)
  const sameUserAgent = completedUsages.find(
    u => u.userAgent === userAgent
  );
  if (sameUserAgent) {
    score += 20;
    reasons.push('Même navigateur détecté');
  }

  // VERDICT: Suspect si score >= 60 (au moins 2 critères majeurs)
  const suspicious = score >= 60;

  return { suspicious, score, reasons };
}

/**
 * Hash de l'email pour comparaison sans stocker l'email en clair
 */
function hashEmail(email: string): string {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

/**
 * Calculer similarité entre 2 emails hashés
 * (Utilise comparaison des premiers caractères pour détecter domaines similaires)
 */
function calculateEmailSimilarity(hash1: string, hash2: string): number {
  if (hash1 === hash2) return 1.0;

  // Comparer les premiers caractères (domaine similaire)
  const prefix1 = hash1.substring(0, 8);
  const prefix2 = hash2.substring(0, 8);

  let matches = 0;
  for (let i = 0; i < 8; i++) {
    if (prefix1[i] === prefix2[i]) matches++;
  }

  return matches / 8;
}

/**
 * Enregistrer une tentative d'utilisation (avant paiement)
 */
export async function recordPromoCodeAttempt(
  promoCodeId: string,
  userId: string,
  deviceFingerprint: string,
  ipAddress: string,
  userAgent: string,
  email: string
): Promise<string> {

  const emailHash = hashEmail(email);

  const usage = await prisma.promoCodeUsage.create({
    data: {
      promoCodeId,
      userId,
      deviceFingerprint,
      ipAddress,
      userAgent,
      emailHash,
      paymentCompleted: false,
    },
  });

  return usage.id;
}

/**
 * Confirmer l'utilisation après paiement réussi
 */
export async function confirmPromoCodeUsage(
  usageId: string,
  paymentId: string
): Promise<void> {

  // Récupérer l'usage pour obtenir le promoCodeId
  const usage = await prisma.promoCodeUsage.findUnique({
    where: { id: usageId },
    select: { promoCodeId: true },
  });

  if (!usage) {
    console.error(`PromoCodeUsage ${usageId} not found`);
    return;
  }

  await prisma.$transaction([
    // Marquer l'usage comme confirmé
    prisma.promoCodeUsage.update({
      where: { id: usageId },
      data: {
        paymentCompleted: true,
        paymentId,
      },
    }),

    // Incrémenter le compteur du code promo
    prisma.promoCode.update({
      where: { id: usage.promoCodeId },
      data: { usedCount: { increment: 1 } },
    }),
  ]);
}

/**
 * Créer le code promo SENBETA5 initial
 */
export async function initializeSENBETA5(): Promise<void> {

  const existing = await prisma.promoCode.findUnique({
    where: { code: 'SENBETA5' },
  });

  if (!existing) {
    await prisma.promoCode.create({
      data: {
        code: 'SENBETA5',
        discountType: 'PERCENTAGE',
        discountValue: 100,
        maxUses: 5,
        usedCount: 0,
        active: false, // Disabled — replaced by MOBYR45
      },
    });
  } else if (existing.active) {
    await prisma.promoCode.update({
      where: { code: 'SENBETA5' },
      data: { active: false },
    });
  }

  // Initialize MOBYR45 — 45% off, unlimited uses
  const mobyr = await prisma.promoCode.findUnique({
    where: { code: 'MOBYR45' },
  });

  if (!mobyr) {
    await prisma.promoCode.create({
      data: {
        code: 'MOBYR45',
        discountType: 'PERCENTAGE',
        discountValue: 45,
        maxUses: 9999,
        usedCount: 0,
        active: true,
        stripeCouponId: 'MOBYR45',
      },
    });
    console.log('✅ Code promo MOBYR45 créé (45% off)');
  }
}
