/**
 * SUPPORT TICKET API
 *
 * Creates support tickets and sends email notifications
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'ryad.bouderga78@gmail.com';

const ticketSchema = z.object({
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
  category: z.enum(['BILLING', 'TECHNICAL', 'ACCOUNT', 'FEATURE_REQUEST', 'OTHER']),
}).strict();

/** Strip HTML tags and dangerous characters */
function sanitize(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/[<>"'`]/g, '')
    .trim();
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const parsed = ticketSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'All fields are required and must be valid' },
        { status: 400 }
      );
    }

    const { subject, message, category } = parsed.data;

    // Create support ticket with sanitized input
    const ticket = await prisma.supportTicket.create({
      data: {
        userId: session.user.id,
        subject: sanitize(subject),
        message: sanitize(message),
        category,
        priority: session.user.tier === 'ULTRA' ? 'HIGH' : 'NORMAL',
      },
    });

    console.log(`
=== NEW SUPPORT TICKET ===
From: ${session.user.email}
Tier: ${session.user.tier}
Subject: ${sanitize(subject)}
Category: ${category}
Ticket ID: ${ticket.id}
==========================
    `);

    return NextResponse.json({
      success: true,
      ticketId: ticket.id,
      message: 'Your ticket has been created. We will respond within 24-48h.',
    });
  } catch (error) {
    console.error('Support ticket error:', error);
    return NextResponse.json(
      { error: 'Error creating ticket' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tickets = await prisma.supportTicket.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ tickets });
  } catch (error) {
    console.error('Get tickets error:', error);
    return NextResponse.json(
      { error: 'Error retrieving tickets' },
      { status: 500 }
    );
  }
}
