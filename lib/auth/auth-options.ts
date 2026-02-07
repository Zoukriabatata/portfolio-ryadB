/**
 * NEXTAUTH CONFIGURATION
 *
 * Secure authentication with device tracking
 */

import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from '@/lib/db';
import {
  verifyPassword,
  generateDeviceFingerprint,
  parseUserAgent,
  checkRateLimit,
  recordLoginAttempt,
  generateSessionId,
  TIER_CONFIG,
  type SubscriptionTier,
} from './security';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string | null;
      tier: SubscriptionTier;
      deviceId: string;
      sessionId: string;
    };
  }

  interface User {
    id: string;
    email: string;
    name: string | null;
    tier: SubscriptionTier;
    deviceId?: string;
    sessionId?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    email: string;
    name: string | null;
    tier: SubscriptionTier;
    deviceId: string;
    sessionId: string;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        deviceFingerprint: { label: 'Device', type: 'text' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email et mot de passe requis');
        }

        const email = credentials.email.toLowerCase().trim();

        // Rate limiting
        const rateLimit = checkRateLimit(email);
        if (!rateLimit.allowed) {
          throw new Error(`Trop de tentatives. Réessayez dans ${rateLimit.lockoutTime} minutes.`);
        }

        // Find user
        const user = await prisma.user.findUnique({
          where: { email },
          include: { devices: true, sessions: { where: { isActive: true } } },
        });

        if (!user) {
          recordLoginAttempt(email, false);
          throw new Error('Identifiants invalides');
        }

        // Check if account is locked
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          throw new Error('Compte temporairement verrouillé. Réessayez plus tard.');
        }

        // Verify password
        const isValid = await verifyPassword(credentials.password, user.password);
        if (!isValid) {
          recordLoginAttempt(email, false);

          // Increment failed attempts
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: user.failedLoginAttempts + 1,
              lockedUntil: user.failedLoginAttempts >= 4 ?
                new Date(Date.now() + 30 * 60 * 1000) : null, // Lock for 30 min after 5 attempts
            },
          });

          throw new Error('Identifiants invalides');
        }

        // Get device info
        const userAgent = req?.headers?.['user-agent'] || 'Unknown';
        const ip = req?.headers?.['x-forwarded-for']?.toString().split(',')[0] || 'Unknown';
        const deviceFingerprint = credentials.deviceFingerprint ||
          generateDeviceFingerprint(userAgent, ip);
        const deviceInfo = parseUserAgent(userAgent);

        // Check device limit
        const tierConfig = TIER_CONFIG[user.subscriptionTier as SubscriptionTier];
        const activeDevices = user.devices.filter((d: { isActive: boolean }) => d.isActive);

        // If device is new and limit reached
        const existingDevice = activeDevices.find((d: { fingerprint: string }) => d.fingerprint === deviceFingerprint);
        if (!existingDevice && activeDevices.length >= tierConfig.maxDevices) {
          // Deactivate oldest device
          const oldestDevice = activeDevices.sort((a: { lastUsed: Date }, b: { lastUsed: Date }) =>
            a.lastUsed.getTime() - b.lastUsed.getTime()
          )[0] as { id: string; fingerprint: string } | undefined;

          if (oldestDevice) {
            // Deactivate old device and its sessions
            await prisma.$transaction([
              prisma.device.update({
                where: { id: oldestDevice.id },
                data: { isActive: false },
              }),
              prisma.session.updateMany({
                where: { deviceId: oldestDevice.fingerprint },
                data: { isActive: false },
              }),
            ]);
          }
        }

        // Create or update device
        await prisma.device.upsert({
          where: {
            userId_fingerprint: {
              userId: user.id,
              fingerprint: deviceFingerprint,
            },
          },
          update: {
            lastUsed: new Date(),
            isActive: true,
            browser: deviceInfo.browser,
            os: deviceInfo.os,
            name: deviceInfo.name,
          },
          create: {
            userId: user.id,
            fingerprint: deviceFingerprint,
            browser: deviceInfo.browser,
            os: deviceInfo.os,
            name: deviceInfo.name,
            isActive: true,
          },
        });

        // Create session
        const sessionId = generateSessionId();
        await prisma.session.create({
          data: {
            userId: user.id,
            token: sessionId,
            deviceId: deviceFingerprint,
            ipAddress: ip,
            userAgent,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
          },
        });

        // Update user login info
        await prisma.user.update({
          where: { id: user.id },
          data: {
            lastLoginAt: new Date(),
            lastLoginIp: ip,
            currentDeviceId: deviceFingerprint,
            failedLoginAttempts: 0,
            lockedUntil: null,
          },
        });

        recordLoginAttempt(email, true);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          tier: user.subscriptionTier as SubscriptionTier,
          deviceId: deviceFingerprint,
          sessionId,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.tier = user.tier;
        token.deviceId = user.deviceId || '';
        token.sessionId = user.sessionId || '';
      }
      return token;
    },

    async session({ session, token }) {
      session.user = {
        id: token.id,
        email: token.email,
        name: token.name,
        tier: token.tier,
        deviceId: token.deviceId,
        sessionId: token.sessionId,
      };
      return session;
    },
  },

  pages: {
    signIn: '/auth/login',
    error: '/auth/error',
  },

  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },

  secret: process.env.NEXTAUTH_SECRET,
};
