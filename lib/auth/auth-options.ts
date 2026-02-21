/**
 * NEXTAUTH CONFIGURATION
 *
 * Secure authentication with device tracking
 * Providers: Credentials (email/password) + Google OAuth
 */

import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
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
      image?: string | null;
      tier: SubscriptionTier;
      deviceId: string;
      sessionId: string;
    };
  }

  interface User {
    id: string;
    email: string;
    name: string | null;
    image?: string | null;
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
    picture?: string | null;
    tier: SubscriptionTier;
    deviceId: string;
    sessionId: string;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      authorization: {
        params: {
          prompt: 'select_account',
        },
      },
    }),

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

        if (!user || !user.password) {
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
    async signIn({ user, account, profile }) {
      // Credentials provider — already handled in authorize()
      if (account?.provider === 'credentials') {
        return true;
      }

      // Google OAuth — find or create user, link account
      if (account?.provider === 'google' && profile?.email) {
        try {
          const email = profile.email.toLowerCase().trim();

          // Find existing user by email
          let dbUser = await prisma.user.findUnique({
            where: { email },
            include: { accounts: true },
          });

          if (!dbUser) {
            // Create new user (FREE tier, no password)
            dbUser = await prisma.user.create({
              data: {
                email,
                name: profile.name || null,
                avatar: (profile as { picture?: string }).picture || null,
                emailVerified: new Date(),
                subscriptionTier: 'FREE',
                maxDevices: 1,
              },
              include: { accounts: true },
            });
          } else {
            // Update name/avatar if not set
            if (!dbUser.name && profile.name) {
              await prisma.user.update({
                where: { id: dbUser.id },
                data: {
                  name: profile.name,
                  avatar: (profile as { picture?: string }).picture || dbUser.avatar,
                  emailVerified: dbUser.emailVerified || new Date(),
                },
              });
            }
          }

          // Link Google account if not already linked
          const existingAccount = dbUser.accounts?.find(
            (a: { provider: string }) => a.provider === 'google'
          );

          if (!existingAccount) {
            await prisma.account.create({
              data: {
                userId: dbUser.id,
                type: account.type || 'oauth',
                provider: account.provider,
                providerAccountId: account.providerAccountId,
                access_token: account.access_token || null,
                refresh_token: account.refresh_token || null,
                expires_at: account.expires_at || null,
                token_type: account.token_type || null,
                scope: account.scope || null,
                id_token: account.id_token || null,
              },
            });
          }

          // Create session in DB
          const sessionId = generateSessionId();
          const deviceFingerprint = `google_${dbUser.id}`;

          await prisma.session.create({
            data: {
              userId: dbUser.id,
              token: sessionId,
              deviceId: deviceFingerprint,
              ipAddress: 'oauth',
              userAgent: 'Google OAuth',
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
          });

          // Update login info
          await prisma.user.update({
            where: { id: dbUser.id },
            data: {
              lastLoginAt: new Date(),
              failedLoginAttempts: 0,
              lockedUntil: null,
            },
          });

          // Attach DB info to user object for jwt callback
          user.id = dbUser.id;
          user.tier = dbUser.subscriptionTier as SubscriptionTier;
          user.deviceId = deviceFingerprint;
          user.sessionId = sessionId;

          return true;
        } catch (error) {
          console.error('[Auth] Google signIn error:', error);
          return false;
        }
      }

      return true;
    },

    async jwt({ token, user, account }) {
      // First sign-in — populate token from user object
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image || null;
        token.tier = user.tier || 'FREE';
        token.deviceId = user.deviceId || '';
        token.sessionId = user.sessionId || '';
      }

      // For Google OAuth, ensure we have the DB user's data
      if (account?.provider === 'google' && !token.tier) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.tier = dbUser.subscriptionTier as SubscriptionTier;
        }
      }

      return token;
    },

    async session({ session, token }) {
      session.user = {
        id: token.id,
        email: token.email,
        name: token.name,
        image: token.picture,
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
