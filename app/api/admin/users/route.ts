import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// Admin emails qui peuvent accéder à cette API
const ADMIN_EMAILS = ['ryad.bouderga78@gmail.com'];

// Vérifier si l'utilisateur est admin (via header ou session)
async function isAdmin(request: NextRequest): Promise<boolean> {
  const adminSecret = request.headers.get('x-admin-secret');

  // Option 1: Secret header pour les appels API directs
  if (adminSecret === process.env.ADMIN_SECRET) {
    return true;
  }

  // Option 2: Vérifier via l'email de l'utilisateur connecté
  const userEmail = request.headers.get('x-user-email');
  if (userEmail && ADMIN_EMAILS.includes(userEmail)) {
    return true;
  }

  return false;
}

// GET - Liste tous les utilisateurs
export async function GET(request: NextRequest) {
  if (!await isAdmin(request)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        subscriptionTier: true,
        subscriptionStart: true,
        subscriptionEnd: true,
        createdAt: true,
        lastLoginAt: true,
        maxDevices: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Admin API error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST - Activer/Désactiver l'accès d'un utilisateur
export async function POST(request: NextRequest) {
  if (!await isAdmin(request)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { email, action, duration } = body;

    if (!email || !action) {
      return NextResponse.json({ error: 'Email et action requis' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
    }

    if (action === 'activate') {
      // Calculer la date de fin en fonction de la durée
      const now = new Date();
      let endDate: Date;

      switch (duration) {
        case 'month':
          endDate = new Date(now.setMonth(now.getMonth() + 1));
          break;
        case 'year':
          endDate = new Date(now.setFullYear(now.getFullYear() + 1));
          break;
        case 'lifetime':
          endDate = new Date('2099-12-31');
          break;
        default:
          // Par défaut 1 mois
          endDate = new Date(now.setMonth(now.getMonth() + 1));
      }

      const updatedUser = await prisma.user.update({
        where: { email },
        data: {
          subscriptionTier: 'ULTRA',
          subscriptionStart: new Date(),
          subscriptionEnd: endDate,
          maxDevices: 2,
        },
      });

      return NextResponse.json({
        success: true,
        message: `Accès SENultra activé pour ${email}`,
        user: {
          email: updatedUser.email,
          tier: updatedUser.subscriptionTier,
          subscriptionEnd: updatedUser.subscriptionEnd,
        },
      });

    } else if (action === 'deactivate') {
      const updatedUser = await prisma.user.update({
        where: { email },
        data: {
          subscriptionTier: 'FREE',
          subscriptionEnd: null,
          maxDevices: 1,
        },
      });

      return NextResponse.json({
        success: true,
        message: `Accès désactivé pour ${email}`,
        user: {
          email: updatedUser.email,
          tier: updatedUser.subscriptionTier,
        },
      });

    } else if (action === 'extend') {
      // Étendre l'abonnement existant
      if (!user.subscriptionEnd) {
        return NextResponse.json({ error: 'Utilisateur sans abonnement actif' }, { status: 400 });
      }

      let newEndDate = new Date(user.subscriptionEnd);

      switch (duration) {
        case 'month':
          newEndDate.setMonth(newEndDate.getMonth() + 1);
          break;
        case 'year':
          newEndDate.setFullYear(newEndDate.getFullYear() + 1);
          break;
        default:
          newEndDate.setMonth(newEndDate.getMonth() + 1);
      }

      const updatedUser = await prisma.user.update({
        where: { email },
        data: {
          subscriptionEnd: newEndDate,
        },
      });

      return NextResponse.json({
        success: true,
        message: `Abonnement étendu pour ${email}`,
        user: {
          email: updatedUser.email,
          subscriptionEnd: updatedUser.subscriptionEnd,
        },
      });

    } else {
      return NextResponse.json({ error: 'Action invalide' }, { status: 400 });
    }

  } catch (error) {
    console.error('Admin API error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
