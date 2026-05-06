/**
 * promote-user-to-pro
 *
 * Local-only dev tool: pretends a Stripe webhook just fired for the
 * given user. Sets subscriptionTier=PRO, fills in
 * subscriptionStart/End/Id/customerId, bumps maxDevices, and upserts
 * a License row so the desktop app can log in.
 *
 *   npx tsx scripts/promote-user-to-pro.ts <email>
 *
 * Idempotent — re-running on an already-PRO user resets the trial
 * window to +30 days but keeps the existing License key.
 */

import { randomUUID } from 'node:crypto';
import { prisma, isPrismaAvailable } from '@/lib/db';

async function main() {
  const email = (process.argv[2] || '').toLowerCase().trim();
  if (!email) {
    console.error('Usage: npx tsx scripts/promote-user-to-pro.ts <email>');
    process.exit(1);
  }

  if (!isPrismaAvailable()) {
    console.error('❌ Prisma client unavailable — check DATABASE_URL in .env.local');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`❌ User not found: ${email}`);
    process.exit(1);
  }

  const now = new Date();
  const subEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionTier:  'PRO',
      subscriptionStart: now,
      subscriptionEnd:   subEnd,
      subscriptionId:    'sub_test_local_' + randomUUID(),
      customerId:        user.customerId ?? 'cus_test_local_' + randomUUID(),
      maxDevices:        2,
    },
  });

  const license = await prisma.license.upsert({
    where:  { userId: user.id },
    create: {
      userId:      user.id,
      licenseKey:  'OFV2-' + randomUUID(),
      status:      'ACTIVE',
      maxMachines: 2,
    },
    update: {},
  });

  console.log('✅ User promoted to PRO');
  console.log(`   Email:        ${user.email}`);
  console.log(`   User ID:      ${user.id}`);
  console.log(`   License key:  ${license.licenseKey}`);
  console.log(`   Sub end:      ${subEnd.toISOString()}`);
  console.log(`   Status:       ${license.status}`);
}

main()
  .catch(err => {
    console.error('❌ Script failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
