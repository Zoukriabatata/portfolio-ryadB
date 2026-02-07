'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  generateAdvancedFingerprint,
  storeFingerprint,
  updateFingerprintTimestamp,
} from '@/lib/auth/fingerprint-client';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fingerprint, setFingerprint] = useState<string>('');

  const router = useRouter();

  // ✅ GENERATE BROWSER FINGERPRINT ON MOUNT
  useEffect(() => {
    const initFingerprint = async () => {
      try {
        const fp = await generateAdvancedFingerprint();
        setFingerprint(fp);
        storeFingerprint(fp);
        updateFingerprintTimestamp();
      } catch (error) {
        console.error('Fingerprint generation failed:', error);
        setFingerprint('error_fallback');
      }
    };

    initFingerprint();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // Validation
    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      setIsLoading(false);
      return;
    }

    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères');
      setIsLoading(false);
      return;
    }

    try {
      // ✅ INCLUDE FINGERPRINT IN REGISTRATION
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          password,
          deviceFingerprint: fingerprint,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Erreur lors de l\'inscription');
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/auth/login');
      }, 2000);
    } catch (err) {
      setError('Une erreur est survenue');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
            SENZOUKRIA
          </h1>
          <p className="text-zinc-500 mt-2">Créez votre compte</p>
        </div>

        {/* Register Form */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8">
          <h2 className="text-xl font-semibold text-white mb-6">Inscription</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm">
              ✓ Compte créé avec succès ! Redirection...
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">Nom (optionnel)</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-green-500 transition-colors"
                placeholder="Votre nom"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">Email *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-green-500 transition-colors"
                placeholder="vous@exemple.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">Mot de passe *</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-green-500 transition-colors"
                placeholder="Minimum 8 caractères"
                required
                minLength={8}
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">Confirmer le mot de passe *</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-green-500 transition-colors"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || success}
              className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-t-2 border-white" />
                  Création...
                </span>
              ) : (
                'Créer mon compte'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-zinc-500 text-sm">
              Déjà inscrit ?{' '}
              <Link href="/auth/login" className="text-green-400 hover:text-green-300">
                Se connecter
              </Link>
            </p>
          </div>
        </div>

        {/* Terms */}
        <div className="mt-6 text-center">
          <p className="text-zinc-600 text-xs">
            En créant un compte, vous acceptez nos conditions d'utilisation.
          </p>
        </div>
      </div>
    </div>
  );
}
