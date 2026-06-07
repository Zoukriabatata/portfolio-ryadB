'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { signIn } from 'next-auth/react';
import AuthShell, { AuthHeading } from '@/components/auth/AuthShell';

const ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
  Configuration: {
    title: 'Configuration error',
    description: 'The authentication service is misconfigured. Please contact support.',
  },
  AccessDenied: {
    title: 'Access denied',
    description: 'You do not have permission to access this resource.',
  },
  Verification: {
    title: 'Link expired',
    description: 'The verification link has expired or has already been used.',
  },
  OAuthSignin: {
    title: 'OAuth error',
    description: 'Could not start sign-in with the external provider.',
  },
  OAuthCallback: {
    title: 'OAuth error',
    description: 'Something went wrong while returning from the authentication provider.',
  },
  OAuthCreateAccount: {
    title: 'Account creation failed',
    description: 'Could not create an account with this provider.',
  },
  EmailCreateAccount: {
    title: 'Account creation failed',
    description: 'Could not create an account with this email.',
  },
  Callback: {
    title: 'Sign-in error',
    description: 'An error occurred during sign-in. Please try again.',
  },
  OAuthAccountNotLinked: {
    title: 'Email already registered',
    description: 'An account with this email already exists. Sign in with your email & password instead — or ask support to link your Google account.',
  },
  SessionRequired: {
    title: 'Sign-in required',
    description: 'You must be signed in to access this page.',
  },
  account_locked: {
    title: 'Account locked',
    description: 'Your account is temporarily locked after too many attempts. Please try again later.',
  },
  oauth_error: {
    title: 'Google sign-in error',
    description: 'Could not sign in with Google. Try again or use email & password.',
  },
  session_invalid: {
    title: 'Invalid session',
    description: 'Your session was invalidated for security reasons. Please sign in again.',
  },
  security_check: {
    title: 'Security check',
    description: 'Unusual activity detected. Please sign in again to confirm your identity.',
  },
};

const DEFAULT_ERROR = {
  title: 'Authentication error',
  description: 'An unexpected error occurred. Please try again.',
};

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const errorCode = searchParams.get('error') || '';
  const reason = searchParams.get('reason') || '';

  const errorInfo = ERROR_MESSAGES[errorCode] || DEFAULT_ERROR;

  return (
    <AuthShell>
      {/* Error icon */}
      <div
        className="w-12 h-12 mb-5 rounded-xl flex items-center justify-center"
        style={{ background: 'var(--bear-bg)', border: '1px solid rgb(var(--bear-rgb) / 0.2)', color: 'var(--bear)' }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
      </div>

      <AuthHeading eyebrow="· Authentication" title={errorInfo.title} subtitle={errorInfo.description} />

      {reason && (
        <p
          className="text-xs mb-6 font-mono rounded-lg px-3 py-2"
          style={{ color: 'var(--text-dimmed)', background: 'var(--surface-elevated)', border: '1px solid var(--border)' }}
        >
          {decodeURIComponent(reason)}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {/* Google quick retry — shown for OAuth errors */}
        {(errorCode.startsWith('OAuth') || errorCode === 'oauth_error') && (
          <button
            type="button"
            onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
            className="btn-brand-ghost inline-flex items-center justify-center gap-2.5 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 hover:-translate-y-0.5"
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
            className="btn-brand-ghost flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 hover:-translate-y-0.5"
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
            className="btn-brand flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 hover:-translate-y-0.5"
          >
            Home
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary)' }} />
      </div>
    }>
      <AuthErrorContent />
    </Suspense>
  );
}
