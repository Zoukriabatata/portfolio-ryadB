// /account/security/password — bridge to the existing password-reset
// flow. Logged-in users land on /auth/reset-password if a fresh token
// is generated for them; otherwise they're sent to /auth/forgot-password
// where they request one via email.
//
// We keep the dedicated route so the desktop app can deep-link to it
// without knowing the internal auth flow shape.

import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';

export const dynamic = 'force-dynamic';

export default async function PasswordPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect(
      `/auth/login?callbackUrl=${encodeURIComponent('/account/security/password')}`,
    );
  }
  // The forgot-password page auto-fills the email for signed-in users
  // and sends a reset link, completing the password change off the
  // user's email. Cleaner than building a new in-app change form
  // (especially without an "old password" verification step).
  redirect('/auth/forgot-password?source=account');
}
