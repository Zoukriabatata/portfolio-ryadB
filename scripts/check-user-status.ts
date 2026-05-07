/**
 * Read-only diagnostic: dump a user's subscription, license, machine,
 * session, and webhook footprint. Useful when an E2E flow looks stuck
 * and you need to triage whether the bug is in DB state, in the JWT
 * cache, or in the UI rendering.
 *
 *   npx tsx scripts/check-user-status.ts <email>
 *
 * No writes. Idempotent. Safe in prod (reads .env.local DATABASE_URL).
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

import { PrismaClient } from '@prisma/client';

const email = process.argv[2];
if (!email) {
  console.error('Usage: npx tsx scripts/check-user-status.ts <email>');
  process.exit(1);
}

const prisma = new PrismaClient();

const fmt = (d: Date | null | undefined) => d ? d.toISOString() : '(null)';
const ago = (d: Date | null | undefined) => {
  if (!d) return '(never)';
  const ms = Date.now() - d.getTime();
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

(async () => {
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      license: { include: { machines: { orderBy: { lastHeartbeatAt: 'desc' } } } },
      sessions: {
        where: { isActive: true },
        orderBy: { lastActivity: 'desc' },
        take: 5,
      },
    },
  });

  if (!user) {
    console.error(`❌ no user found for ${email}`);
    process.exit(1);
  }

  console.log(`✅ User: ${user.email}`);
  console.log(`   ID:                ${user.id}`);
  console.log(`   Name:              ${user.name ?? '(null)'}`);
  console.log(`   Tier:              ${user.subscriptionTier} (since ${fmt(user.subscriptionStart)})`);
  console.log(`   Sub ID:            ${user.subscriptionId ?? '(null)'}`);
  console.log(`   Sub ends:          ${fmt(user.subscriptionEnd)}`);
  console.log(`   Customer ID:       ${user.customerId ?? '(null)'}`);
  console.log(`   Max devices:       ${user.maxDevices}`);
  console.log(`   Created:           ${fmt(user.createdAt)}`);

  console.log('');
  if (user.license) {
    const lic = user.license;
    console.log(`   License:           ${lic.licenseKey} (${lic.status})`);
    console.log(`   Machines:          ${lic.machines.length}/${lic.maxMachines}`);
    for (const m of lic.machines) {
      console.log(`     - ${m.machineId.slice(0, 16)}…  os=${m.os ?? '?'}  v=${m.appVersion ?? '?'}  last heartbeat ${ago(m.lastHeartbeatAt)}`);
    }
  } else {
    console.log(`   License:           (none — desktop login will fail)`);
  }

  console.log('');
  console.log(`   Active web sessions: ${user.sessions.length}`);
  for (const s of user.sessions) {
    console.log(`     - device=${s.deviceId.slice(0, 12)}…  last used ${ago(s.lastActivity)}  expires ${fmt(s.expiresAt)}`);
  }

  console.log('');
  const recentEvents = await prisma.processedWebhookEvent.findMany({
    orderBy: { processedAt: 'desc' },
    take: 5,
  });
  console.log(`   Last ${recentEvents.length} webhook events (any user):`);
  for (const ev of recentEvents) {
    console.log(`     - ${fmt(ev.processedAt)}  ${ev.eventType.padEnd(35)}  ${ev.eventId}`);
  }

  console.log('');
  const payments = await prisma.payment.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  console.log(`   Last ${payments.length} payments:`);
  for (const p of payments) {
    const amt = `$${(p.amount / 100).toFixed(2)} ${p.currency.toUpperCase()}`;
    console.log(`     - ${fmt(p.createdAt)}  ${p.status.padEnd(10)}  ${p.tier.padEnd(5)}  ${amt}  ${p.stripePaymentId ?? '(no payment_intent)'}`);
  }

  await prisma.$disconnect();
})().catch(async (err) => {
  console.error('error:', err);
  await prisma.$disconnect();
  process.exit(1);
});
