/**
 * Generate an Ed25519 keypair for license JWT signing.
 *
 *   npx tsx scripts/generate-ed25519-keys.ts
 *
 * Outputs base64-encoded PEM blobs ready to paste into .env.local
 * as LICENSE_JWT_PRIVATE_KEY / LICENSE_JWT_PUBLIC_KEY.
 *
 * SECURITY: The private key NEVER leaves the server. The public key is
 * the only piece that gets bundled into the desktop binary later (for
 * offline verification of cached JWTs).
 */

import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');

const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicPem  = publicKey.export({  type: 'spki',  format: 'pem' }).toString();

const privateB64 = Buffer.from(privatePem, 'utf-8').toString('base64');
const publicB64  = Buffer.from(publicPem,  'utf-8').toString('base64');

console.log('# ─── Ed25519 keypair for desktop license JWTs ────────────────────────────');
console.log('# Add these to your .env.local (do NOT commit, do NOT share the private key):\n');
console.log(`LICENSE_JWT_PRIVATE_KEY=${privateB64}`);
console.log(`LICENSE_JWT_PUBLIC_KEY=${publicB64}`);
console.log('\n# ─── PEM (for inspection / desktop bundle) ───────────────────────────────');
console.log('# Public key (safe to embed in the desktop binary):\n');
console.log(publicPem);
console.log('# Private key (server only — keep secret):\n');
console.log(privatePem);
