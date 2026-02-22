/**
 * ADMIN PAYMENTS API
 *
 * Handles admin review (approve/reject) of manual payment proofs
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { prisma } from '@/lib/db';
import { apiRateLimit, tooManyRequests } from '@/lib/auth/rate-limiter';

const ADMIN_EMAILS = ['ryad.bouderga78@gmail.com'];

// GET - List pending payment proofs (admin only)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const rl = apiRateLimit(session.user.id);
    if (!rl.allowed) return tooManyRequests(rl);

    if (!ADMIN_EMAILS.includes(session.user.email!)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const payments = await prisma.payment.findMany({
      where: {
        status: 'PENDING',
        proofText: { not: null },
      },
      include: {
        user: {
          select: {
            email: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' }, // Oldest first
    });

    return NextResponse.json({ payments });
  } catch (error) {
    console.error('Error fetching pending payments:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des paiements' },
      { status: 500 }
    );
  }
}

// POST - Approve or reject a payment proof (admin only)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const rl = apiRateLimit(session.user.id);
    if (!rl.allowed) return tooManyRequests(rl);

    if (!ADMIN_EMAILS.includes(session.user.email!)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = await req.json();
    const { paymentId, action, adminNote } = body;

    // Validate action
    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'Action invalide. Utilisez "approve" ou "reject".' },
        { status: 400 }
      );
    }

    // Validate paymentId
    if (!paymentId || typeof paymentId !== 'string') {
      return NextResponse.json(
        { error: 'ID de paiement requis' },
        { status: 400 }
      );
    }

    // Find the payment
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      return NextResponse.json(
        { error: 'Paiement non trouvé' },
        { status: 404 }
      );
    }

    if (payment.status !== 'PENDING') {
      return NextResponse.json(
        { error: 'Ce paiement a déjà été traité' },
        { status: 400 }
      );
    }

    const now = new Date();

    if (action === 'approve') {
      // Update payment status to COMPLETED
      await prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: 'COMPLETED',
          completedAt: now,
          reviewedBy: session.user.id,
          reviewedAt: now,
          adminNote: adminNote || null,
        },
      });

      // Activate user subscription: ULTRA for 30 days
      const subscriptionEnd = new Date(now);
      subscriptionEnd.setDate(subscriptionEnd.getDate() + 30);

      await prisma.user.update({
        where: { id: payment.userId },
        data: {
          subscriptionTier: 'ULTRA',
          subscriptionStart: now,
          subscriptionEnd: subscriptionEnd,
        },
      });

      return NextResponse.json({ success: true, action: 'approved' });
    }

    if (action === 'reject') {
      // Update payment status to FAILED
      await prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: 'FAILED',
          reviewedBy: session.user.id,
          reviewedAt: now,
          adminNote: adminNote || null,
        },
      });

      return NextResponse.json({ success: true, action: 'rejected' });
    }
  } catch (error) {
    console.error('Error processing payment review:', error);
    return NextResponse.json(
      { error: 'Erreur lors du traitement du paiement' },
      { status: 500 }
    );
  }
}
