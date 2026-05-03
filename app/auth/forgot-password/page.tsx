'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail]         = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError]         = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error ?? 'An error occurred. Please try again.');
        return;
      }

      setSubmitted(true);
    } catch {
      setError('An error occurred. Please try again.');
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
        {/* Logo */}
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
          {submitted ? (
            <>
              <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                Vérifiez votre boîte mail
              </h2>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                Si un compte existe avec <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>, un lien de réinitialisation vient d&apos;être envoyé.
                Le lien expire dans 24 heures.
              </p>

              <div
                className="p-4 rounded-lg mb-6 text-sm"
                style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
              >
                <p className="mb-2">📧 Pas reçu ?</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>Vérifiez vos spams / courriers indésirables</li>
                  <li>Attendez 1-2 minutes</li>
                  <li>Vérifiez l&apos;orthographe de votre email</li>
                </ul>
              </div>

              <Link
                href="/auth/login"
                className="block w-full text-center py-3 font-semibold rounded-lg transition-all duration-200 hover:opacity-90"
                style={{ background: 'linear-gradient(to right, var(--primary), var(--primary-dark))', color: '#fff' }}
              >
                Retour à la connexion
              </Link>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                Mot de passe oublié ?
              </h2>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                Entrez votre email — nous vous enverrons un lien pour réinitialiser votre mot de passe.
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
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                    autoComplete="email"
                    required
                    placeholder="vous@exemple.com"
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
                      Envoi en cours…
                    </span>
                  ) : (
                    'Envoyer le lien'
                  )}
                </button>
              </form>

              <div className="mt-6 text-center">
                <Link
                  href="/auth/login"
                  className="text-sm font-medium"
                  style={{ color: 'var(--primary-light)' }}
                >
                  ← Retour à la connexion
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
