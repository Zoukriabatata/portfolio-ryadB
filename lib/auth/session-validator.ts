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
import { sendEmail } from '@/lib/auth/email-verification';

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
 * Uses the shared SMTP transport from email-verification.ts.
 * Falls back to console.warn if SMTP is not configured.
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
  console.warn(`Security alert for ${email}:`, data);

  const { subject, content, text } = getSecurityAlertEmail(data);

  await sendEmail({ to: email, subject, content, text });
}

function getSecurityAlertEmail(data: {
  type: string;
  reason?: string;
  distance?: number;
  timeDiff?: number;
}): { subject: string; content: string; text: string } {
  if (data.type === 'concurrent_session') {
    return {
      subject: 'Alerte de sécurité — Session suspecte détectée',
      content: `
        <h2 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #e2e8f0;">
          Activité suspecte détectée
        </h2>
        <p style="margin: 0 0 24px; font-size: 15px; color: #94a3b8; line-height: 1.6;">
          Nous avons détecté une activité inhabituelle sur votre compte Senzoukria.
          Votre session semble être utilisée depuis plusieurs appareils ou emplacements simultanément.
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
          <tr>
            <td style="padding: 16px 20px; background-color: #1a1520; border-radius: 8px; border-left: 3px solid #f59e0b;">
              <p style="margin: 0 0 4px; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">
                Détail
              </p>
              <p style="margin: 0; font-size: 14px; color: #fbbf24; font-weight: 500;">
                ${data.reason || 'Session concurrente détectée'}
              </p>
            </td>
          </tr>
        </table>

        <p style="margin: 0 0 24px; font-size: 15px; color: #94a3b8; line-height: 1.6;">
          Par mesure de sécurité, votre session a été invalidée. Vous devrez vous reconnecter.
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding: 12px 16px; background-color: #1c1215; border-radius: 8px; border-left: 3px solid #ef4444;">
              <p style="margin: 0; font-size: 13px; color: #fca5a5; line-height: 1.5;">
                <strong>Si ce n'était pas vous</strong>, changez immédiatement votre mot de passe
                et vérifiez les appareils connectés à votre compte.
              </p>
            </td>
          </tr>
        </table>`,
      text: `Alerte de sécurité Senzoukria\n\nActivité suspecte détectée sur votre compte.\n${data.reason || 'Session concurrente détectée'}\n\nVotre session a été invalidée par mesure de sécurité.\nSi ce n'était pas vous, changez immédiatement votre mot de passe.`,
    };
  }

  if (data.type === 'impossible_travel') {
    const distanceStr = data.distance ? `${Math.round(data.distance)} km` : 'inconnue';
    const timeStr = data.timeDiff ? `${data.timeDiff.toFixed(1)}h` : 'inconnu';

    return {
      subject: 'Alerte de sécurité — Connexion depuis un lieu inhabituel',
      content: `
        <h2 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #e2e8f0;">
          Connexion depuis un lieu inhabituel
        </h2>
        <p style="margin: 0 0 24px; font-size: 15px; color: #94a3b8; line-height: 1.6;">
          Nous avons détecté une connexion à votre compte depuis un emplacement géographique
          incompatible avec votre activité récente.
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 16px;">
          <tr>
            <td style="padding: 16px 20px; background-color: #1a1520; border-radius: 8px; border-left: 3px solid #f59e0b;">
              <p style="margin: 0 0 4px; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">
                Détail
              </p>
              <p style="margin: 0 0 8px; font-size: 14px; color: #fbbf24; font-weight: 500;">
                ${data.reason || 'Voyage impossible détecté'}
              </p>
              <p style="margin: 0; font-size: 13px; color: #94a3b8;">
                Distance : ${distanceStr} en ${timeStr}
              </p>
            </td>
          </tr>
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding: 12px 16px; background-color: #1c1215; border-radius: 8px; border-left: 3px solid #ef4444;">
              <p style="margin: 0; font-size: 13px; color: #fca5a5; line-height: 1.5;">
                <strong>Si ce n'était pas vous</strong>, votre compte est peut-être compromis.
                Changez votre mot de passe immédiatement.
              </p>
            </td>
          </tr>
        </table>`,
      text: `Alerte de sécurité Senzoukria\n\nConnexion depuis un lieu inhabituel détectée.\n${data.reason || 'Voyage impossible détecté'}\nDistance : ${distanceStr} en ${timeStr}\n\nSi ce n'était pas vous, changez immédiatement votre mot de passe.`,
    };
  }

  // Generic fallback
  return {
    subject: 'Alerte de sécurité — Senzoukria',
    content: `
      <h2 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #e2e8f0;">
        Alerte de sécurité
      </h2>
      <p style="margin: 0 0 24px; font-size: 15px; color: #94a3b8; line-height: 1.6;">
        Une activité inhabituelle a été détectée sur votre compte Senzoukria.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding: 16px 20px; background-color: #1a1520; border-radius: 8px; border-left: 3px solid #f59e0b;">
            <p style="margin: 0; font-size: 14px; color: #fbbf24;">
              ${data.reason || data.type}
            </p>
          </td>
        </tr>
      </table>`,
    text: `Alerte de sécurité Senzoukria\n\n${data.reason || data.type}\n\nSi ce n'était pas vous, changez immédiatement votre mot de passe.`,
  };
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
