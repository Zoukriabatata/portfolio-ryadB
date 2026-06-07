// /account/security/2fa — placeholder. Two-factor auth via TOTP/WebAuthn
// is on the roadmap but not yet implemented. We render a clean
// informational page rather than a 404 so the desktop deep-link stays
// honest about the feature being "in development".

import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';

export const dynamic = 'force-dynamic';

export default async function TwoFactorPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect(
      `/auth/login?callbackUrl=${encodeURIComponent('/account/security/2fa')}`,
    );
  }
  return (
    <main
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        color: 'var(--text-primary)',
      }}
    >
      <div
        style={{
          maxWidth: 460,
          width: '100%',
          padding: 32,
          borderRadius: 16,
          border: '1px solid rgb(var(--primary-rgb) / 0.2)',
          background: 'linear-gradient(180deg, rgb(var(--primary-rgb) / 0.04) 0%, var(--surface) 60%)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            margin: '0 auto 14px',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgb(var(--primary-rgb) / 0.1)',
            border: '1px solid rgb(var(--primary-rgb) / 0.25)',
            color: 'var(--primary)',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
          · Security
        </div>
        <div className="font-display" style={{ fontSize: 24, marginBottom: 10, color: 'var(--text-primary)' }}>
          Two-factor authentication
        </div>
        <div
          style={{
            display: 'inline-block',
            padding: '3px 10px',
            borderRadius: 5,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.16em',
            background: 'var(--warning-bg)',
            border: '1px solid rgb(var(--warning-rgb) / 0.45)',
            color: 'var(--warning)',
            textTransform: 'uppercase',
            marginBottom: 18,
            fontFamily: 'var(--font-jetbrains-mono)',
          }}
        >
          Coming soon
        </div>
        <div
          style={{
            fontSize: 13,
            color: 'var(--text-muted)',
            lineHeight: 1.6,
            marginBottom: 22,
            textAlign: 'left',
          }}
        >
          We&apos;re working on TOTP (Google Authenticator / 1Password / Authy)
          and WebAuthn (hardware keys, passkeys) for Senzoukria accounts.
          Once available, you&apos;ll be able to enable 2FA from this page in a
          single scan — no support ticket needed.
          <br /><br />
          In the meantime, your account is protected by:
          <ul style={{ marginTop: 8, paddingLeft: 18, color: 'var(--text-secondary)' }}>
            <li>Bcrypt-hashed passwords</li>
            <li>Device fingerprint binding (max {1} desktop per slot)</li>
            <li>Rate-limited login + failed-attempt lockout</li>
          </ul>
        </div>
        <a
          href="/account"
          className="btn-brand"
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '10px 18px', borderRadius: 10, textDecoration: 'none', fontSize: 13 }}
        >
          Back to account
        </a>
      </div>
    </main>
  );
}
