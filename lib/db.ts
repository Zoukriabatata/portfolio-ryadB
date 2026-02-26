/**
 * PRISMA DATABASE CLIENT
 *
 * Singleton pattern for database connection
 * Prevents multiple instances in development
 * Gracefully handles missing/invalid DATABASE_URL in dev mode
 */

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaUnavailable?: boolean;
};

function createPrismaClient(): PrismaClient | null {
  // If already known to be unavailable, skip
  if (globalForPrisma.prismaUnavailable) return null;

  try {
    const url = process.env.DATABASE_URL || '';
    // Validate that URL looks like a PostgreSQL connection string
    if (!url.startsWith('postgresql://') && !url.startsWith('postgres://')) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[DB] DATABASE_URL is not a valid PostgreSQL URL. Database features disabled in dev mode.');
        globalForPrisma.prismaUnavailable = true;
        return null;
      }
    }
    return new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[DB] Failed to initialize Prisma client. Database features disabled.', e);
      globalForPrisma.prismaUnavailable = true;
      return null;
    }
    throw e;
  }
}

const client = globalForPrisma.prisma ?? createPrismaClient();
if (client && process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = client;
}

// Export as PrismaClient type for compatibility — callers must check for null via isPrismaAvailable()
export const prisma = client as PrismaClient;
export const isPrismaAvailable = () => client !== null;
export default prisma;
