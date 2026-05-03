'use client';

import { useState } from 'react';
import Link from 'next/link';

type Category = 'QUESTION' | 'BUG' | 'FEATURE_REQUEST' | 'OTHER';

const CATEGORIES: { value: Category; label: string; description: string }[] = [
  { value: 'QUESTION',        label: 'Question',         description: 'Une question sur la plateforme'           },
  { value: 'BUG',             label: 'Bug',              description: 'Quelque chose ne fonctionne pas'          },
  { value: 'FEATURE_REQUEST', label: 'Suggestion',       description: 'Idée d\'amélioration ou nouvelle feature' },
  { value: 'OTHER',           label: 'Autre',            description: 'Autre demande'                            },
];

export default function ContactPage() {
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [subject, setSubject]   = useState('');
  const [message, setMessage]   = useState('');
  const [category, setCategory] = useState<Category>('QUESTION');
  const [company, setCompany]   = useState(''); // honeypot
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent]         = useState(false);
  const [error, setError]       = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const res = await fetch('/api/contact', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name, email, subject, message, category, company }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? 'Une erreur est survenue. Réessayez.');
        return;
      }
      setSent(true);
    } catch {
      setError('Une erreur est survenue. Vérifiez votre connexion.');
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

      <div className="w-full max-w-2xl animate-fadeIn relative z-10 py-10">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <div
              className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, var(--primary-dark), var(--primary))', boxShadow: '0 0 40px rgba(74,222,128,0.25)' }}
            >
              <span className="text-xl font-black text-white">S</span>
            </div>
          </Link>
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Contactez-nous</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Une question, un bug, une suggestion ? Écrivez-nous, on répond sous 24-48h.
          </p>
        </div>

        <div
          className="rounded-2xl p-8 animate-slideUp backdrop-blur-sm"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
        >
          {sent ? (
            <div className="text-center py-8">
              <div
                className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid var(--primary)' }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--primary)' }}>
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Message envoyé ✓</h2>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                Merci pour votre message. Nous vous répondrons à <strong style={{ color: 'var(--text-primary)' }}>{email}</strong> sous 24-48h.
              </p>
              <Link
                href="/"
                className="inline-block px-6 py-3 font-semibold rounded-lg transition-all duration-200 hover:opacity-90"
                style={{ background: 'linear-gradient(to right, var(--primary), var(--primary-dark))', color: '#fff' }}
              >
                Retour à l&apos;accueil
              </Link>
            </div>
          ) : (
            <>
              {error && (
                <div
                  className="mb-4 p-3 rounded-lg text-sm animate-error-shake"
                  role="alert"
                  style={{ background: 'var(--error-bg)', border: '1px solid var(--error)', color: 'var(--error)' }}
                >
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Honeypot — hidden from real users, visible to bots */}
                <div
                  style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}
                  aria-hidden="true"
                  tabIndex={-1}
                >
                  <label>
                    Company (do not fill)
                    <input
                      type="text"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      tabIndex={-1}
                      autoComplete="off"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm mb-1.5" style={{ color: 'var(--text-muted)' }}>
                      Votre nom
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                      required
                      maxLength={100}
                      placeholder="Jean Dupont"
                      className="w-full px-4 py-3 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                      style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-1.5" style={{ color: 'var(--text-muted)' }}>
                      Email
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      required
                      maxLength={200}
                      placeholder="vous@exemple.com"
                      className="w-full px-4 py-3 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                      style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm mb-1.5" style={{ color: 'var(--text-muted)' }}>
                    Catégorie
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {CATEGORIES.map((c) => (
                      <button
                        type="button"
                        key={c.value}
                        onClick={() => setCategory(c.value)}
                        className="text-left p-3 rounded-lg transition-all duration-150"
                        style={{
                          background:   category === c.value ? 'rgba(74,222,128,0.08)' : 'var(--surface-elevated)',
                          border:       `1px solid ${category === c.value ? 'var(--primary)' : 'var(--border)'}`,
                          color:        'var(--text-primary)',
                        }}
                      >
                        <div className="font-medium text-sm">{c.label}</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{c.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm mb-1.5" style={{ color: 'var(--text-muted)' }}>
                    Sujet
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    required
                    minLength={3}
                    maxLength={200}
                    placeholder="Résumé de votre message"
                    className="w-full px-4 py-3 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                    style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>

                <div>
                  <label className="block text-sm mb-1.5" style={{ color: 'var(--text-muted)' }}>
                    Message
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                    minLength={10}
                    maxLength={5000}
                    rows={6}
                    placeholder="Décrivez votre demande en détail..."
                    className="w-full px-4 py-3 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 resize-y"
                    style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  />
                  <p className="text-xs mt-1.5" style={{ color: 'var(--text-dimmed)' }}>
                    {message.length} / 5000
                  </p>
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
                    'Envoyer le message'
                  )}
                </button>
              </form>

              <div className="mt-8 pt-6 border-t" style={{ borderColor: 'var(--border)' }}>
                <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
                  Vous pouvez aussi nous joindre directement par email à{' '}
                  <a
                    href="mailto:ryad.bouderga78@gmail.com"
                    className="font-medium hover:underline"
                    style={{ color: 'var(--primary-light)' }}
                  >
                    ryad.bouderga78@gmail.com
                  </a>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
