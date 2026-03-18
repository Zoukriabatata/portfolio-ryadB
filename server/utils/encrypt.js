/**
 * AES-256-GCM Credential Encryption
 *
 * Used to encrypt Tradovate username/password before embedding them in the
 * short-lived WS ticket JWT. Even if the JWT were somehow intercepted, the
 * raw credentials would not be readable without the server-side key.
 *
 * Key derivation: scrypt from CREDENTIAL_ENCRYPTION_KEY (or NEXTAUTH_SECRET)
 * Cipher: AES-256-GCM (authenticated encryption — detects tampering)
 */

'use strict';

const { createCipheriv, createDecipheriv, randomBytes, scryptSync } = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const SALT = 'senzoukria-cred-salt'; // Non-secret, just makes scrypt non-trivial

function getDerivedKey() {
  const secret = process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('CREDENTIAL_ENCRYPTION_KEY or NEXTAUTH_SECRET env var is required');
  // Derive a 32-byte key via scrypt (bcrypt-style, but for symmetric encryption)
  return scryptSync(secret, SALT, 32);
}

/**
 * Encrypt a plaintext string.
 * Output format: "<ivHex>:<authTagHex>:<ciphertextHex>"
 *
 * @param {string} plaintext
 * @returns {string}
 */
function encryptCredential(plaintext) {
  const key = getDerivedKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

/**
 * Decrypt a previously encrypted credential string.
 * Throws if the data has been tampered with (GCM auth tag mismatch).
 *
 * @param {string} encryptedData
 * @returns {string}
 */
function decryptCredential(encryptedData) {
  const key = getDerivedKey();
  const parts = encryptedData.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted credential format');

  const [ivHex, tagHex, ciphertext] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

module.exports = { encryptCredential, decryptCredential };
