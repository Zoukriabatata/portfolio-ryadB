'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';

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
    title: 'Compte d\u00e9j\u00e0 existant',
    description: 'Un compte existe d\u00e9j\u00e0 avec cet email. Connectez-vous avec votre m\u00e9thode habituelle.',
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

        <div className="flex items-center justify-center gap-3">
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white/80 hover:text-white text-sm font-medium transition-all duration-200 border border-white/10 hover:border-white/20"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
            Se connecter
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 text-sm font-medium transition-all duration-200 border border-emerald-500/20 hover:border-emerald-500/30"
          >
            Accueil
          </Link>
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
