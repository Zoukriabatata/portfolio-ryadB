/**
 * SECURITY UTILITIES
 *
 * Anti-sharing, device fingerprinting, session management
 */

import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// Warn if critical env vars are missing in production
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET not configured - authentication features will not work properly');
}

// ============ PASSWORD HASHING ============

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

// ============ JWT TOKENS ============

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';
const TOKEN_EXPIRY = '24h';
const REFRESH_TOKEN_EXPIRY = '7d';

export interface TokenPayload {
  userId: string;
  email: string;
  tier: string;
  deviceId: string;
  sessionId: string;
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign({ ...payload, type: 'refresh' }, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

// ============ DEVICE FINGERPRINTING ============

export interface DeviceInfo {
  fingerprint: string;
  browser: string;
  os: string;
  name: string;
}

export function generateDeviceFingerprint(
  userAgent: string,
  ip: string,
  additionalData?: Record<string, string>
): string {
  const data = {
    userAgent,
    ip,
    ...additionalData,
  };

  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(data))
    .digest('hex');

  return hash.substring(0, 32);
}

export function parseUserAgent(userAgent: string): Partial<DeviceInfo> {
  // Simple parsing - in production use device-detector-js for better results
  const browser = userAgent.includes('Chrome') ? 'Chrome' :
                  userAgent.includes('Firefox') ? 'Firefox' :
                  userAgent.includes('Safari') ? 'Safari' :
                  userAgent.includes('Edge') ? 'Edge' : 'Unknown';

  const os = userAgent.includes('Windows') ? 'Windows' :
             userAgent.includes('Mac') ? 'macOS' :
             userAgent.includes('Linux') ? 'Linux' :
             userAgent.includes('Android') ? 'Android' :
             userAgent.includes('iOS') ? 'iOS' : 'Unknown';

  return {
    browser,
    os,
    name: `${browser} on ${os}`,
  };
}

// ============ SESSION SECURITY ============

export function generateSessionId(): string {
  return uuidv4();
}

export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

// ============ RATE LIMITING (Progressive Lockout) ============

const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();

// Progressive lockout thresholds
// 5 failed attempts  → 30 min lockout
// 10 failed attempts → 2 hour lockout
// 20 failed attempts → 24 hour lockout
function getLockoutDuration(attempts: number): number {
  if (attempts >= 20) return 24 * 60 * 60 * 1000;  // 24 hours
  if (attempts >= 10) return 2 * 60 * 60 * 1000;    // 2 hours
  if (attempts >= 5) return 30 * 60 * 1000;          // 30 minutes
  return 0; // No lockout
}

const MAX_LOGIN_ATTEMPTS = 5; // First lockout threshold

export function checkRateLimit(identifier: string): { allowed: boolean; remainingAttempts: number; lockoutTime?: number } {
  const now = Date.now();
  const record = loginAttempts.get(identifier);

  if (!record) {
    return { allowed: true, remainingAttempts: MAX_LOGIN_ATTEMPTS };
  }

  const lockoutDuration = getLockoutDuration(record.count);

  // Reset if lockout window expired
  if (lockoutDuration > 0 && now - record.firstAttempt > lockoutDuration) {
    loginAttempts.delete(identifier);
    return { allowed: true, remainingAttempts: MAX_LOGIN_ATTEMPTS };
  }

  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    const elapsed = now - record.firstAttempt;
    const remaining = lockoutDuration - elapsed;
    const lockoutTime = Math.ceil(remaining / 1000 / 60); // minutes remaining
    return { allowed: false, remainingAttempts: 0, lockoutTime };
  }

  return { allowed: true, remainingAttempts: MAX_LOGIN_ATTEMPTS - record.count };
}

export function recordLoginAttempt(identifier: string, success: boolean): void {
  if (success) {
    loginAttempts.delete(identifier);
    return;
  }

  const now = Date.now();
  const record = loginAttempts.get(identifier);

  if (!record) {
    loginAttempts.set(identifier, { count: 1, firstAttempt: now });
  } else {
    record.count++;
    // Reset the timer on each new threshold to extend lockout
    const lockoutDuration = getLockoutDuration(record.count);
    if (lockoutDuration > getLockoutDuration(record.count - 1)) {
      record.firstAttempt = now; // Reset timer when escalating to next lockout tier
    }
  }
}

// ============ SUBSCRIPTION TIERS ============

export type SubscriptionTier = 'FREE' | 'ULTRA';

export interface TierConfig {
  name: string;
  displayName: string;
  price: number; // Monthly in EUR
  yearlyPrice: number;
  maxDevices: number;
  features: string[];
  pages: string[]; // Allowed routes
}

export const TIER_CONFIG: Record<SubscriptionTier, TierConfig> = {
  FREE: {
    name: 'FREE',
    displayName: 'Free',
    price: 0,
    yearlyPrice: 0,
    maxDevices: 1,
    features: [
      'Landing page access',
      'Pricing page access',
      'Account management',
    ],
    pages: ['/', '/account'],
  },
  ULTRA: {
    name: 'ULTRA',
    displayName: 'SENULTRA',
    price: 50,
    yearlyPrice: 480, // 2 months free
    maxDevices: 2,
    features: [
      'All FREE features',
      'Footprint charts',
      'GEX Dashboard',
      'Volatility analysis',
      'All crypto symbols',
      'Drawing tools',
      'Backtesting',
      'Session replay',
      'Trade journal',
      'News & Calendar',
      'Data feed configuration',
      'Priority support',
      '2 devices simultaneously',
    ],
    pages: ['/', '/chart', '/live', '/boutique', '/account', '/footprint', '/orderflow', '/volatility', '/gex', '/backtest', '/news', '/replay', '/journal'],
  },
};

export function canAccessPage(tier: SubscriptionTier, pathname: string): boolean {
  const config = TIER_CONFIG[tier];
  if (!config) return false;

  // Check exact match first
  if (config.pages.includes(pathname)) return true;

  // Check if pathname starts with any allowed page
  return config.pages.some(page =>
    page !== '/' && pathname.startsWith(page)
  );
}

export function getRequiredTierForPage(pathname: string): SubscriptionTier {
  // Check from lowest tier to highest
  for (const tier of ['FREE', 'ULTRA'] as SubscriptionTier[]) {
    if (canAccessPage(tier, pathname)) {
      return tier;
    }
  }
  return 'ULTRA'; // Default to highest if not found
}

// ============ ENCRYPTION ============

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '32-character-default-key-here!!';
const IV_LENGTH = 16;

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(text: string): string {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift()!, 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

// ============ INPUT VALIDATION ============

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
}

export function validateString(value: unknown, minLength = 1, maxLength = 1000): value is string {
  return typeof value === 'string' && value.trim().length >= minLength && value.length <= maxLength;
}

export function sanitizeInput(input: string): string {
  return input.trim().replace(/[<>]/g, '');
}

export interface ApiErrorResponse {
  error: string;
  code?: string;
  details?: string;
}

export function apiError(message: string, status: number, code?: string): Response {
  const body: ApiErrorResponse = { error: message };
  if (code) body.code = code;
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
