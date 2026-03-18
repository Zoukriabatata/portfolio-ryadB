/**
 * WS Ticket Verification
 *
 * The Next.js API route /api/tradovate/ws-ticket issues a short-lived JWT
 * containing the user's Tradovate credentials (AES-encrypted). This module
 * verifies and decodes that ticket on the server side.
 *
 * Tokens are signed with NEXTAUTH_SECRET / WS_TICKET_SECRET and expire in 60s.
 */

'use strict';

const jwt = require('jsonwebtoken');
const { decryptCredential } = require('./encrypt');

function getSecret() {
  const secret = process.env.WS_TICKET_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('WS_TICKET_SECRET or NEXTAUTH_SECRET env var is required');
  return secret;
}

/**
 * Verify a WS ticket and return the decoded payload.
 * Throws if the token is expired, tampered, or invalid.
 *
 * @param {string} token
 * @returns {{ userId: string; username: string; password: string; mode: string }}
 */
function verifyTicket(token) {
  const secret = getSecret();

  // jwt.verify throws on expiry / bad signature
  const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });

  // Decrypt credentials that were encrypted by the Next.js API before signing
  return {
    userId: payload.userId,
    username: decryptCredential(payload.username),
    password: decryptCredential(payload.password),
    mode: payload.mode || 'demo',
  };
}

module.exports = { verifyTicket };
