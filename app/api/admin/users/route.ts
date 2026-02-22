import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { prisma } from '@/lib/db';
import { apiRateLimit, tooManyRequests } from '@/lib/auth/rate-limiter';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

// GET - Liste tous les utilisateurs
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const rl = await apiRateLimit(session.user.id);
  if (!rl.allowed) return tooManyRequests(rl);

  if (!ADMIN_EMAILS.includes(session.user.email)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
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
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const rl2 = await apiRateLimit(session.user.id);
  if (!rl2.allowed) return tooManyRequests(rl2);

  if (!ADMIN_EMAILS.includes(session.user.email)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
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
      // Calculer la date de fin en fonction de la durée (immutable)
      const now = new Date();
      let endDate: Date;

      switch (duration) {
        case 'month':
          endDate = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
          break;
        case 'year':
          endDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
          break;
        case 'lifetime':
          endDate = new Date('2099-12-31');
          break;
        default:
          endDate = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
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

      const base = new Date(user.subscriptionEnd);
      let newEndDate: Date;

      switch (duration) {
        case 'month':
          newEndDate = new Date(base.getFullYear(), base.getMonth() + 1, base.getDate());
          break;
        case 'year':
          newEndDate = new Date(base.getFullYear() + 1, base.getMonth(), base.getDate());
          break;
        default:
          newEndDate = new Date(base.getFullYear(), base.getMonth() + 1, base.getDate());
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
