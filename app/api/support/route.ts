/**
 * SUPPORT TICKET API
 *
 * Creates support tickets and sends email notifications
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { prisma } from '@/lib/db';

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'ryad.bouderga78@gmail.com';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const body = await req.json();
    const { subject, message, category } = body;

    if (!subject || !message || !category) {
      return NextResponse.json(
        { error: 'Tous les champs sont requis' },
        { status: 400 }
      );
    }

    // Create support ticket
    const ticket = await prisma.supportTicket.create({
      data: {
        userId: session.user.id,
        subject,
        message,
        category,
        priority: session.user.tier === 'ULTRA' ? 'HIGH' : 'NORMAL',
      },
    });

    // TODO: Send email notification to support
    // For now, just log it
    console.log(`
=== NEW SUPPORT TICKET ===
From: ${session.user.email}
Tier: ${session.user.tier}
Subject: ${subject}
Category: ${category}
Message: ${message}
Ticket ID: ${ticket.id}
==========================
    `);

    return NextResponse.json({
      success: true,
      ticketId: ticket.id,
      message: 'Votre ticket a été créé. Nous vous répondrons sous 24-48h.',
    });
  } catch (error) {
    console.error('Support ticket error:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la création du ticket' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const tickets = await prisma.supportTicket.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ tickets });
  } catch (error) {
    console.error('Get tickets error:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des tickets' },
      { status: 500 }
    );
  }
}
