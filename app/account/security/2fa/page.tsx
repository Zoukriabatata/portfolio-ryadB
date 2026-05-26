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
        fontFamily: 'Inter, system-ui, sans-serif',
        color: '#e5e7eb',
      }}
    >
      <div
        style={{
          maxWidth: 460,
          width: '100%',
          padding: 32,
          borderRadius: 14,
          border: '1px solid rgba(34, 197, 94, 0.20)',
          background:
            'linear-gradient(180deg, rgba(34,197,94,0.04) 0%, #0e1116 60%)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 36, marginBottom: 14 }}>🔐</div>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: '#f9fafb' }}>
          Two-factor authentication
        </div>
        <div
          style={{
            display: 'inline-block',
            padding: '3px 10px',
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.16em',
            background: 'rgba(251, 191, 36, 0.10)',
            border: '1px solid rgba(251, 191, 36, 0.55)',
            color: '#fbbf24',
            textTransform: 'uppercase',
            marginBottom: 18,
          }}
        >
          Coming soon
        </div>
        <div
          style={{
            fontSize: 13,
            color: '#9ca3af',
            lineHeight: 1.6,
            marginBottom: 22,
            textAlign: 'left',
          }}
        >
          We're working on TOTP (Google Authenticator / 1Password / Authy)
          and WebAuthn (hardware keys, passkeys) for OrderflowV2 accounts.
          Once available, you'll be able to enable 2FA from this page in a
          single scan — no support ticket needed.
          <br /><br />
          In the meantime, your account is protected by:
          <ul style={{ marginTop: 8, paddingLeft: 18, color: '#d1d5db' }}>
            <li>Bcrypt-hashed passwords</li>
            <li>Device fingerprint binding (max {1} desktop per slot)</li>
            <li>Rate-limited login + failed-attempt lockout</li>
          </ul>
        </div>
        <a
          href="/account"
          style={{
            display: 'inline-block',
            padding: '10px 18px',
            borderRadius: 8,
            background: 'linear-gradient(180deg,#22c55e 0%,#16a34a 100%)',
            color: '#0b1015',
            fontWeight: 700,
            textDecoration: 'none',
            fontSize: 13,
            letterSpacing: '0.04em',
          }}
        >
          Back to account
        </a>
      </div>
    </main>
  );
}
