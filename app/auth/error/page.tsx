'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { signIn } from 'next-auth/react';

const ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
  Configuration: {
    title: 'Erreur de configuration',
    description: 'Le service d\'authentification est mal configur\u00e9. Contactez le support.',
  },
  AccessDenied: {
    title: 'Acc\u00e8s refus\u00e9',
    description: 'Vous n\'avez pas la permission d\'acc\u00e9der \u00e0 cette ressource.',
  },
  Verification: {
    title: 'Lien expir\u00e9',
    description: 'Le lien de v\u00e9rification a expir\u00e9 ou a d\u00e9j\u00e0 \u00e9t\u00e9 utilis\u00e9.',
  },
  OAuthSignin: {
    title: 'Erreur OAuth',
    description: 'Impossible d\'initier la connexion avec le fournisseur externe.',
  },
  OAuthCallback: {
    title: 'Erreur OAuth',
    description: 'Erreur lors du retour du fournisseur d\'authentification.',
  },
  OAuthCreateAccount: {
    title: 'Cr\u00e9ation de compte impossible',
    description: 'Impossible de cr\u00e9er un compte avec ce fournisseur.',
  },
  EmailCreateAccount: {
    title: 'Cr\u00e9ation de compte impossible',
    description: 'Impossible de cr\u00e9er un compte avec cet email.',
  },
  Callback: {
    title: 'Erreur de connexion',
    description: 'Une erreur est survenue lors de la connexion. R\u00e9essayez.',
  },
  OAuthAccountNotLinked: {
    title: 'Email already registered',
    description: 'An account with this email already exists. Sign in with your email & password instead — or ask support to link your Google account.',
  },
  SessionRequired: {
    title: 'Session requise',
    description: 'Vous devez \u00eatre connect\u00e9 pour acc\u00e9der \u00e0 cette page.',
  },
  account_locked: {
    title: 'Compte verrouill\u00e9',
    description: 'Votre compte est temporairement verrouill\u00e9 suite \u00e0 trop de tentatives. R\u00e9essayez plus tard.',
  },
  oauth_error: {
    title: 'Erreur de connexion Google',
    description: 'Impossible de se connecter avec Google. R\u00e9essayez ou utilisez email/mot de passe.',
  },
  session_invalid: {
    title: 'Session invalide',
    description: 'Votre session a \u00e9t\u00e9 invalid\u00e9e pour raison de s\u00e9curit\u00e9. Reconnectez-vous.',
  },
  security_check: {
    title: 'V\u00e9rification de s\u00e9curit\u00e9',
    description: 'Activit\u00e9 inhabituelle d\u00e9tect\u00e9e. Veuillez vous reconnecter pour confirmer votre identit\u00e9.',
  },
};

const DEFAULT_ERROR = {
  title: 'Erreur d\'authentification',
  description: 'Une erreur inattendue est survenue. Veuillez r\u00e9essayer.',
};

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const errorCode = searchParams.get('error') || '';
  const reason = searchParams.get('reason') || '';

  const errorInfo = ERROR_MESSAGES[errorCode] || DEFAULT_ERROR;

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        {/* Error icon */}
        <div
          className="w-14 h-14 mx-auto mb-4 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        </div>

        <h2 className="text-xl font-semibold text-white/90 mb-2">
          {errorInfo.title}
        </h2>
        <p className="text-sm text-white/40 mb-2 leading-relaxed">
          {errorInfo.description}
        </p>

        {reason && (
          <p className="text-xs text-white/25 mb-6 font-mono bg-white/[0.03] rounded-lg px-3 py-2">
            {decodeURIComponent(reason)}
          </p>
        )}

        {!reason && <div className="mb-6" />}

        <div className="flex flex-col items-center gap-3">
          {/* Google quick retry — shown for OAuth errors */}
          {(errorCode.startsWith('OAuth') || errorCode === 'oauth_error') && (
            <button
              type="button"
              onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
              className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 border hover:opacity-90"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.85)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Retry with Google
            </button>
          )}

          <div className="flex items-center gap-3">
            <Link
              href="/auth/login"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white/80 hover:text-white text-sm font-medium transition-all duration-200 border border-white/10 hover:border-white/20"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              Sign in
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 text-sm font-medium transition-all duration-200 border border-emerald-500/20 hover:border-emerald-500/30"
            >
              Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
      </div>
    }>
      <AuthErrorContent />
    </Suspense>
  );
}
