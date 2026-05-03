'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

function ResetPasswordForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const token        = searchParams.get('token') ?? '';

  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess]     = useState(false);
  const [error, setError]         = useState('');

  // Reject obviously malformed token early
  const tokenLooksValid = token.length >= 32 && /^[a-f0-9]+$/i.test(token);

  useEffect(() => {
    if (success) {
      const t = setTimeout(() => router.push('/auth/login'), 3000);
      return () => clearTimeout(t);
    }
  }, [success, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error ?? 'Une erreur est survenue. Réessayez.');
        return;
      }

      setSuccess(true);
    } catch {
      setError('Une erreur est survenue. Réessayez.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: 'var(--background)' }}
    >
      <div
        className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(74,222,128,0.06) 0%, transparent 70%)', filter: 'blur(80px)' }}
      />
      <div
        className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(74,222,128,0.03) 0%, transparent 70%)', filter: 'blur(80px)' }}
      />

      <div className="w-full max-w-md animate-fadeIn relative z-10">
        <div className="text-center mb-8">
          <div
            className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, var(--primary-dark), var(--primary))', boxShadow: '0 0 40px rgba(74,222,128,0.25)' }}
          >
            <span className="text-xl font-black text-white">S</span>
          </div>
          <h1
            className="text-3xl font-bold"
            style={{ background: 'linear-gradient(to right, var(--primary-light), var(--primary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
          >
            SENZOUKRIA
          </h1>
        </div>

        <div
          className="rounded-2xl p-8 animate-slideUp backdrop-blur-sm"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
        >
          {!tokenLooksValid ? (
            <>
              <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                Lien invalide
              </h2>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                Ce lien de réinitialisation est invalide ou incomplet. Demandez un nouveau lien.
              </p>
              <Link
                href="/auth/forgot-password"
                className="block w-full text-center py-3 font-semibold rounded-lg transition-all duration-200 hover:opacity-90"
                style={{ background: 'linear-gradient(to right, var(--primary), var(--primary-dark))', color: '#fff' }}
              >
                Demander un nouveau lien
              </Link>
            </>
          ) : success ? (
            <>
              <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                Mot de passe réinitialisé ✓
              </h2>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                Votre mot de passe a été mis à jour. Redirection vers la page de connexion…
              </p>
              <Link
                href="/auth/login"
                className="block w-full text-center py-3 font-semibold rounded-lg transition-all duration-200 hover:opacity-90"
                style={{ background: 'linear-gradient(to right, var(--primary), var(--primary-dark))', color: '#fff' }}
              >
                Se connecter maintenant
              </Link>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                Nouveau mot de passe
              </h2>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                Choisissez un nouveau mot de passe pour votre compte. Minimum 8 caractères.
              </p>

              {error && (
                <div
                  className="mb-4 p-3 rounded-lg text-sm animate-error-shake"
                  role="alert"
                  style={{ background: 'var(--error-bg)', border: '1px solid var(--error)', color: 'var(--error)' }}
                >
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm mb-1.5" style={{ color: 'var(--text-muted)' }}>
                    Nouveau mot de passe
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                    autoComplete="new-password"
                    required
                    minLength={8}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                    style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1.5" style={{ color: 'var(--text-muted)' }}>
                    Confirmer le mot de passe
                  </label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                    style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 font-semibold rounded-lg transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
                  style={{ background: 'linear-gradient(to right, var(--primary), var(--primary-dark))', color: '#fff' }}
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin rounded-full h-4 w-4 border-t-2 border-white/50" />
                      Mise à jour…
                    </span>
                  ) : (
                    'Réinitialiser mon mot de passe'
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[var(--primary)]" role="status" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
