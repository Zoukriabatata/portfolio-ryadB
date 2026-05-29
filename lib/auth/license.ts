/**
 * License helpers — generation + preview window.
 *
 * The preview window is the public launch period (2026-05-30 → 2026-06-17)
 * during which any new registration is auto-promoted to PRO tier without
 * touching Stripe. After PREVIEW_END the heartbeat naturally locks
 * the user out (subscriptionEnd < now), and the standard Stripe checkout
 * takes over.
 */

import { randomUUID } from 'crypto';

/**
 * Format: `OFV2-<uuidv4>`. Shared by the Stripe webhook (paying users)
 * and the register endpoint (preview users) so the desktop heartbeat
 * sees one consistent key shape regardless of how access was granted.
 */
export function generateLicenseKey(): string {
  return `OFV2-${randomUUID()}`;
}

/**
 * Hard end-of-day on the last day of the public preview, in UTC.
 * After this instant, new registrations no longer get auto-PRO and
 * the heartbeat starts rejecting preview-granted licenses.
 */
export const PREVIEW_END = new Date('2026-06-17T23:59:59.000Z');

/**
 * True iff we are still inside the public preview window. Callers
 * pass `Date.now()` explicitly so tests can pin time — never call
 * `new Date()` inside this helper.
 */
export function isPreviewWindow(nowMs: number = Date.now()): boolean {
  return nowMs < PREVIEW_END.getTime();
}
