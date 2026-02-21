'use client';

import { useState, useEffect, Suspense } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  generateAdvancedFingerprint,
  storeFingerprint,
  getStoredFingerprint,
  shouldRefreshFingerprint,
  updateFingerprintTimestamp,
} from '@/lib/auth/fingerprint-client';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [fingerprint, setFingerprint] = useState<string>('');

  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/chart';

  const sessionData = useSession();
  const session = sessionData?.data;
  const status = sessionData?.status || 'loading';

  // ✅ GENERATE BROWSER FINGERPRINT ON MOUNT
  useEffect(() => {
    const initFingerprint = async () => {
      try {
        // Check if we have a stored fingerprint
        const stored = getStoredFingerprint();

        if (stored && !shouldRefreshFingerprint()) {
          // Use existing fingerprint
          setFingerprint(stored);
        } else {
          // Generate new fingerprint
          const fp = await generateAdvancedFingerprint();
          setFingerprint(fp);
          storeFingerprint(fp);
          updateFingerprintTimestamp();
        }
      } catch (error) {
        console.error('Fingerprint generation failed:', error);
        // Fallback fingerprint
        setFingerprint('error_fallback');
      }
    };

    initFingerprint();
  }, []);

  // Redirect if already logged in
  useEffect(() => {
    if (status === 'authenticated') {
      router.push(callbackUrl);
    }
  }, [status, router, callbackUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // ✅ INCLUDE FINGERPRINT IN LOGIN REQUEST
      const result = await signIn('credentials', {
        email,
        password,
        deviceFingerprint: fingerprint, // Send fingerprint to server for device tracking
        redirect: false,
      });

      if (result?.error) {
        setError(result.error);
      } else {
        router.push(callbackUrl);
      }
    } catch (err) {
      setError('An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-green-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
            SENZOUKRIA
          </h1>
          <p className="text-zinc-500 mt-2">Professional Trading Platform</p>
        </div>

        {/* Login Form */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8">
          <h2 className="text-xl font-semibold text-white mb-6">Sign In</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-green-500 transition-colors"
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-green-500 transition-colors"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-t-2 border-white" />
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Separator */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-700" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-3 bg-zinc-900/50 text-zinc-500">or</span>
            </div>
          </div>

          {/* Google Sign In */}
          <button
            type="button"
            onClick={() => signIn('google', { callbackUrl })}
            className="w-full py-3 flex items-center justify-center gap-3 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white hover:bg-zinc-700/50 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Sign in with Google
          </button>

          <div className="mt-6 text-center">
            <p className="text-zinc-500 text-sm">
              Don&apos;t have an account?{' '}
              <Link href="/auth/register" className="text-green-400 hover:text-green-300">
                Create account
              </Link>
            </p>
          </div>
        </div>

        {/* Security Notice */}
        <div className="mt-6 text-center">
          <p className="text-zinc-600 text-xs">
            Secure login &bull; One device at a time
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-green-500" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
