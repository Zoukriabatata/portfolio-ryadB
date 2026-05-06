/**
 * Ed25519 JWT — desktop license tokens
 *
 * The web backend signs short-lived (24h) JWTs that the desktop app uses
 * as its proof of identity for /api/license/heartbeat and any other
 * authenticated desktop endpoint. Algorithm is fixed to EdDSA (Ed25519):
 *
 *   - Compact, fast to verify (matters because the desktop heartbeats
 *     every few hours from possibly slow networks).
 *   - Public key is small enough to embed safely in the desktop binary
 *     once we ship the offline grace-period verification step.
 *
 * Keys are stored as base64-encoded PKCS8 (private) and SPKI (public) PEM
 * blobs in env vars — see scripts/generate-ed25519-keys.ts.
 *
 *   LICENSE_JWT_PRIVATE_KEY  base64(PEM PKCS8) — server only
 *   LICENSE_JWT_PUBLIC_KEY   base64(PEM SPKI)  — server (verify) + bundled into desktop later
 */

import { SignJWT, jwtVerify, importPKCS8, importSPKI, type JWTPayload } from 'jose';

const ALG    = 'EdDSA';
const ISSUER = 'orderflowv2';
const AUD    = 'orderflowv2-desktop';

export interface LicenseJwtClaims extends JWTPayload {
  /** Internal user ID (cuid). Used to look up the License row on heartbeat. */
  sub:        string;
  /** "OFV2-…" — denormalized so the desktop app can show it in the UI without a round-trip. */
  licenseKey: string;
  /** Hardware fingerprint of the desktop machine (machine-uid crate). */
  machineId:  string;
  /** Snapshot of subscriptionTier at issuance. UI hint only — server re-checks on every protected call. */
  tier:       'PRO';
}

export interface SignOptions {
  /** Token lifetime in seconds. Defaults to 24h. */
  ttlSeconds?: number;
}

export interface VerifyOk {
  valid:   true;
  payload: LicenseJwtClaims;
}
export interface VerifyErr {
  valid: false;
  error: 'NO_TOKEN' | 'INVALID_SIGNATURE' | 'EXPIRED' | 'BAD_PAYLOAD' | 'KEYS_NOT_CONFIGURED';
  message?: string;
}
export type VerifyResult = VerifyOk | VerifyErr;

/* ────────────────────────────────────────────────────────────────────────── */

function decodePemFromEnv(envName: string): string {
  const b64 = process.env[envName];
  if (!b64) throw new Error(`${envName} is not set`);
  const pem = Buffer.from(b64, 'base64').toString('utf-8').trim();
  if (!pem.startsWith('-----BEGIN')) {
    throw new Error(`${envName} does not look like a PEM blob after base64-decoding`);
  }
  return pem;
}

let _privateKeyPromise: Promise<CryptoKey> | null = null;
let _publicKeyPromise:  Promise<CryptoKey> | null = null;

function getPrivateKey(): Promise<CryptoKey> {
  if (!_privateKeyPromise) {
    _privateKeyPromise = importPKCS8(decodePemFromEnv('LICENSE_JWT_PRIVATE_KEY'), ALG);
  }
  return _privateKeyPromise;
}

function getPublicKey(): Promise<CryptoKey> {
  if (!_publicKeyPromise) {
    _publicKeyPromise = importSPKI(decodePemFromEnv('LICENSE_JWT_PUBLIC_KEY'), ALG);
  }
  return _publicKeyPromise;
}

/** For tests / key rotation — drop the cached imports. */
export function _resetKeyCache() {
  _privateKeyPromise = null;
  _publicKeyPromise  = null;
}

/* ────────────────────────────────────────────────────────────────────────── */

export async function signLicenseJwt(
  claims: Pick<LicenseJwtClaims, 'sub' | 'licenseKey' | 'machineId' | 'tier'>,
  opts: SignOptions = {}
): Promise<string> {
  const ttl = opts.ttlSeconds ?? 24 * 60 * 60;
  const key = await getPrivateKey();
  return new SignJWT({
    licenseKey: claims.licenseKey,
    machineId:  claims.machineId,
    tier:       claims.tier,
  })
    .setProtectedHeader({ alg: ALG, typ: 'JWT' })
    .setIssuer(ISSUER)
    .setAudience(AUD)
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(key);
}

export async function verifyLicenseJwt(token: string | null | undefined): Promise<VerifyResult> {
  if (!token) return { valid: false, error: 'NO_TOKEN' };

  let key: CryptoKey;
  try {
    key = await getPublicKey();
  } catch (err) {
    return {
      valid: false,
      error: 'KEYS_NOT_CONFIGURED',
      message: err instanceof Error ? err.message : 'Unknown key error',
    };
  }

  try {
    const { payload } = await jwtVerify(token, key, {
      issuer:     ISSUER,
      audience:   AUD,
      algorithms: [ALG],
    });

    if (
      typeof payload.sub        !== 'string' ||
      typeof payload.licenseKey !== 'string' ||
      typeof payload.machineId  !== 'string' ||
      payload.tier              !== 'PRO'
    ) {
      return { valid: false, error: 'BAD_PAYLOAD' };
    }

    return { valid: true, payload: payload as LicenseJwtClaims };
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'ERR_JWT_EXPIRED') return { valid: false, error: 'EXPIRED' };
    return {
      valid: false,
      error: 'INVALID_SIGNATURE',
      message: err instanceof Error ? err.message : 'Unknown verify error',
    };
  }
}
