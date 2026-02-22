/**
 * PAYMENT PROOF API
 *
 * Handles payment proof submission and retrieval for manual payments
 * (PayPal, Revolut, Binance)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { prisma } from '@/lib/db';
import { apiRateLimit, tooManyRequests } from '@/lib/auth/rate-limiter';

// GET - List user's payment proofs
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const rl = await apiRateLimit(session.user.id);
    if (!rl.allowed) return tooManyRequests(rl);

    const proofs = await prisma.payment.findMany({
      where: {
        userId: session.user.id,
        proofText: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        amount: true,
        currency: true,
        status: true,
        tier: true,
        billingPeriod: true,
        paymentMethod: true,
        proofText: true,
        adminNote: true,
        reviewedAt: true,
        createdAt: true,
        completedAt: true,
      },
    });

    return NextResponse.json({ proofs });
  } catch (error) {
    console.error('Error fetching payment proofs:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des preuves de paiement' },
      { status: 500 }
    );
  }
}

// POST - Submit a payment proof
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const rl = await apiRateLimit(session.user.id);
    if (!rl.allowed) return tooManyRequests(rl);

    const body = await req.json();
    const { paymentMethod, transactionRef, notes, amount } = body;

    // Validate payment method
    const validMethods = ['PAYPAL', 'REVOLUT', 'BINANCE'];
    if (!paymentMethod || !validMethods.includes(paymentMethod)) {
      return NextResponse.json(
        { error: 'Méthode de paiement invalide. Utilisez PAYPAL, REVOLUT ou BINANCE.' },
        { status: 400 }
      );
    }

    // Validate transaction reference
    if (!transactionRef || typeof transactionRef !== 'string' || transactionRef.trim().length === 0) {
      return NextResponse.json(
        { error: 'La référence de transaction est requise' },
        { status: 400 }
      );
    }

    // Build proof text from transaction ref + optional notes
    const proofText = transactionRef.trim() + (notes ? '\n---\n' + notes.trim() : '');

    // Create payment record
    const proof = await prisma.payment.create({
      data: {
        userId: session.user.id,
        amount: amount || 5000, // 50€ in cents by default
        currency: 'eur',
        status: 'PENDING',
        tier: 'ULTRA',
        billingPeriod: 'MONTHLY',
        paymentMethod: paymentMethod,
        proofText: proofText,
      },
    });

    return NextResponse.json({ success: true, proof });
  } catch (error) {
    console.error('Error submitting payment proof:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la soumission de la preuve de paiement' },
      { status: 500 }
    );
  }
}
