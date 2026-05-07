/**
 * Generate an Ed25519 keypair for license JWT signing.
 *
 *   npx tsx scripts/generate-ed25519-keys.ts            # verbose (dev)
 *   npx tsx scripts/generate-ed25519-keys.ts --quiet    # env-only (prod)
 *
 * Outputs base64-encoded PEM blobs ready to paste into .env.local
 * as LICENSE_JWT_PRIVATE_KEY / LICENSE_JWT_PUBLIC_KEY.
 *
 * Pass --quiet (alias --env-only) to suppress the decoded PEM dump and
 * any banner — useful when redirecting stdout to a file destined for
 * Vercel env vars, so the file never holds a plaintext PEM.
 *
 * SECURITY: The private key NEVER leaves the server. The public key is
 * the only piece that gets bundled into the desktop binary later (for
 * offline verification of cached JWTs).
 */

import { generateKeyPairSync } from 'node:crypto';

const quiet = process.argv.includes('--quiet') || process.argv.includes('--env-only');

const { publicKey, privateKey } = generateKeyPairSync('ed25519');

const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicPem  = publicKey.export({  type: 'spki',  format: 'pem' }).toString();

const privateB64 = Buffer.from(privatePem, 'utf-8').toString('base64');
const publicB64  = Buffer.from(publicPem,  'utf-8').toString('base64');

if (!quiet) {
  console.log('# ─── Ed25519 keypair for desktop license JWTs ────────────────────────────');
  console.log('# Add these to your .env.local (do NOT commit, do NOT share the private key):\n');
}
console.log(`LICENSE_JWT_PRIVATE_KEY=${privateB64}`);
console.log(`LICENSE_JWT_PUBLIC_KEY=${publicB64}`);
if (!quiet) {
  console.log('\n# ─── PEM (for inspection / desktop bundle) ───────────────────────────────');
  console.log('# Public key (safe to embed in the desktop binary):\n');
  console.log(publicPem);
  console.log('# Private key (server only — keep secret):\n');
  console.log(privatePem);
}
