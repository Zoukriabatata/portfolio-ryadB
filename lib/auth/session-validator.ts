/**
 * Session Validator - Concurrent Session Detection
 *
 * Detects account sharing by identifying suspicious session patterns:
 * 1. Same session token used from different IPs within 30 seconds
 * 2. Multiple active sessions beyond tier limits
 * 3. Same session with different browser fingerprints
 *
 * Uses in-memory tracking (lightweight) + database persistence
 */

import { prisma } from '@/lib/db';

interface SessionActivity {
  sessionId: string;
  ip: string;
  fingerprint: string;
  timestamp: number;
}

// In-memory tracker (fast, lightweight)
// Cleared every 5 minutes to prevent memory leaks
const sessionActivityTracker = new Map<string, SessionActivity[]>();

// Cleanup old activities every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [userId, activities] of sessionActivityTracker.entries()) {
    const recent = activities.filter(a => now - a.timestamp < 300_000); // Keep last 5 min
    if (recent.length === 0) {
      sessionActivityTracker.delete(userId);
    } else {
      sessionActivityTracker.set(userId, recent);
    }
  }
}, 5 * 60 * 1000);

/**
 * Detect concurrent session abuse
 *
 * Checks if user is sharing their session token across multiple devices/IPs.
 * Returns suspicious=true if abuse is detected, with severity level.
 *
 * @param userId - User ID
 * @param sessionId - Session token
 * @param currentIp - Current IP address
 * @param currentFingerprint - Browser fingerprint
 * @returns {suspicious, reason, severity}
 */
export async function detectConcurrentSession(
  userId: string,
  sessionId: string,
  currentIp: string,
  currentFingerprint: string
): Promise<{
  suspicious: boolean;
  reason?: string;
  severity: 'low' | 'medium' | 'high';
}> {
  const now = Date.now();
  const activities = sessionActivityTracker.get(userId) || [];

  // Clean old activities (>5 minutes)
  const recentActivities = activities.filter(
    a => now - a.timestamp < 300_000
  );

  // 🚨 CHECK 1: SAME SESSION, DIFFERENT IPs IN <30 SECONDS
  // This is the strongest indicator of token sharing
  const sameSessionDiffIp = recentActivities.find(
    a => a.sessionId === sessionId &&
         a.ip !== currentIp &&
         now - a.timestamp < 30_000
  );

  if (sameSessionDiffIp) {
    // VERY SUSPICIOUS: Token is being used simultaneously from different IPs
    await logSecurityEvent(userId, 'token_sharing', {
      sessionId,
      ip1: sameSessionDiffIp.ip,
      ip2: currentIp,
      timeDiff: now - sameSessionDiffIp.timestamp,
    });

    // Invalidate session immediately
    await invalidateSession(sessionId);

    return {
      suspicious: true,
      reason: `Token utilisé simultanément depuis ${sameSessionDiffIp.ip} et ${currentIp}`,
      severity: 'high',
    };
  }

  // 🚨 CHECK 2: TOO MANY ACTIVE SESSIONS
  // Count unique sessions in recent activity
  const uniqueSessions = new Set(
    recentActivities.map(a => a.sessionId)
  ).size;

  // Get user's subscription tier to check max sessions
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionTier: true },
  });

  // Max concurrent sessions: FREE=1, ULTRA=2
  const maxSessions = user?.subscriptionTier === 'ULTRA' ? 2 : 1;

  if (uniqueSessions > maxSessions) {
    await logSecurityEvent(userId, 'too_many_sessions', {
      count: uniqueSessions,
      max: maxSessions,
    });

    return {
      suspicious: true,
      reason: `Trop de sessions actives (${uniqueSessions}/${maxSessions})`,
      severity: 'medium',
    };
  }

  // 🚨 CHECK 3: SAME SESSION, DIFFERENT FINGERPRINT
  // Could indicate device emulation or browser manipulation
  const sameSessionDiffFingerprint = recentActivities.find(
    a => a.sessionId === sessionId &&
         a.fingerprint !== currentFingerprint &&
         a.fingerprint !== 'unknown' &&
         currentFingerprint !== 'unknown' &&
         now - a.timestamp < 60_000
  );

  if (sameSessionDiffFingerprint) {
    await logSecurityEvent(userId, 'fingerprint_mismatch', {
      sessionId,
      fingerprint1: sameSessionDiffFingerprint.fingerprint.substring(0, 16),
      fingerprint2: currentFingerprint.substring(0, 16),
    });

    return {
      suspicious: true,
      reason: 'Empreinte navigateur modifiée',
      severity: 'low',
    };
  }

  // ✅ ALL CHECKS PASSED - Update tracker
  recentActivities.push({
    sessionId,
    ip: currentIp,
    fingerprint: currentFingerprint,
    timestamp: now
  });
  sessionActivityTracker.set(userId, recentActivities);

  // Persist session activity to DB (async, non-blocking)
  updateSessionInDB(sessionId, currentIp).catch(err =>
    console.error('Session update error:', err)
  );

  return {
    suspicious: false,
    severity: 'low',
  };
}

/**
 * Log security event to database
 *
 * Creates audit trail for suspicious activities.
 */
async function logSecurityEvent(
  userId: string,
  event: string,
  data: any
): Promise<void> {
  try {
    // Try to insert security event
    // If SecurityEvent table doesn't exist yet, just log to console
    await prisma.$executeRawUnsafe(`
      INSERT INTO SecurityEvent (userId, event, data, createdAt)
      VALUES (?, ?, ?, ?)
    `, userId, event, JSON.stringify(data), new Date());
  } catch (error) {
    // Table might not exist yet - log to console for now
    console.warn('🚨 Security event:', {
      userId,
      event,
      data,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Invalidate session immediately
 *
 * Expires the session token so it can't be used anymore.
 */
async function invalidateSession(sessionId: string): Promise<void> {
  try {
    await prisma.session.update({
      where: { token: sessionId },
      data: {
        expiresAt: new Date(), // Expire immediately
      },
    });
  } catch (error) {
    console.error('Failed to invalidate session:', error);
  }
}

/**
 * Update session activity in database
 *
 * Non-blocking update to track last activity time and IP.
 */
async function updateSessionInDB(
  sessionId: string,
  currentIp: string
): Promise<void> {
  await prisma.session.update({
    where: { token: sessionId },
    data: {
      lastActivity: new Date(),
      ipAddress: currentIp,
    },
  });
}

/**
 * Send security alert to user
 *
 * Notifies user of suspicious activity via email.
 * TODO: Implement email sending service
 */
export async function sendSecurityAlert(
  email: string,
  data: {
    type: string;
    reason?: string;
    distance?: number;
    timeDiff?: number;
  }
): Promise<void> {
  // For now, just log - implement email service later
  console.warn(`📧 Security alert for ${email}:`, data);

  // TODO: Send email using your email service
  // Example with Resend, SendGrid, or Nodemailer:
  /*
  await sendEmail({
    to: email,
    subject: '⚠️ Activité suspecte détectée sur votre compte',
    html: `
      <p>Une activité inhabituelle a été détectée sur votre compte:</p>
      <p><strong>${data.reason || data.type}</strong></p>
      <p>Si ce n'était pas vous, changez immédiatement votre mot de passe.</p>
    `,
  });
  */
}

/**
 * Get active session count for user
 *
 * Helper function to check how many concurrent sessions exist.
 */
export async function getActiveSessionCount(userId: string): Promise<number> {
  const count = await prisma.session.count({
    where: {
      userId,
      expiresAt: { gt: new Date() },
    },
  });

  return count;
}

/**
 * Force logout all sessions for user
 *
 * Useful for security incidents or password changes.
 */
export async function invalidateAllSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId },
    data: {
      expiresAt: new Date(),
    },
  });

  // Clear from in-memory tracker
  sessionActivityTracker.delete(userId);
}
