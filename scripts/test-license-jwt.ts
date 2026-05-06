/**
 * Smoke test for lib/license/jwt.ts — generates a fresh keypair, signs a
 * token, verifies the happy path, then exercises the failure modes.
 * Not part of the test suite; just a sanity check during 1.6.
 *
 *   npx tsx scripts/test-license-jwt.ts
 */

import { generateKeyPairSync } from 'node:crypto';
import { signLicenseJwt, verifyLicenseJwt, _resetKeyCache } from '../lib/license/jwt';

async function main() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  process.env.LICENSE_JWT_PRIVATE_KEY = Buffer.from(
    privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    'utf-8',
  ).toString('base64');
  process.env.LICENSE_JWT_PUBLIC_KEY = Buffer.from(
    publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    'utf-8',
  ).toString('base64');
  _resetKeyCache();

  const tok = await signLicenseJwt(
    { sub: 'user_test', licenseKey: 'OFV2-abc', machineId: 'mid_x', tier: 'PRO' },
    { ttlSeconds: 60 },
  );
  console.log('TOKEN parts=', tok.split('.').length, ' len=', tok.length);

  const ok = await verifyLicenseJwt(tok);
  console.log('happy:', ok);
  if (!ok.valid) throw new Error('happy path should be valid');

  const tampered = tok.slice(0, -4) + 'AAAA';
  const bad = await verifyLicenseJwt(tampered);
  console.log('tampered:', bad);
  if (bad.valid || bad.error !== 'INVALID_SIGNATURE') throw new Error('tampered path should be INVALID_SIGNATURE');

  const none = await verifyLicenseJwt(null);
  console.log('none:', none);
  if (none.valid || none.error !== 'NO_TOKEN') throw new Error('null token should be NO_TOKEN');

  const expSign = await signLicenseJwt(
    { sub: 'user_test', licenseKey: 'OFV2-abc', machineId: 'mid_x', tier: 'PRO' },
    { ttlSeconds: -10 },
  );
  const exp = await verifyLicenseJwt(expSign);
  console.log('expired:', exp);
  if (exp.valid || exp.error !== 'EXPIRED') throw new Error('expired path should be EXPIRED');

  console.log('\nALL CHECKS PASSED');
}

main().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
