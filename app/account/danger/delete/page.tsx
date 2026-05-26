// /account/danger/delete — irreversible account deletion confirmation
// page. Server component checks auth, then renders the client form.

import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { prisma } from '@/lib/db';
import { DeleteAccountForm } from './delete-form';
import './delete.css';

export const dynamic = 'force-dynamic';

export default async function DeleteAccountPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect(
      `/auth/login?callbackUrl=${encodeURIComponent('/account/danger/delete')}`,
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, password: true, subscriptionTier: true, subscriptionEnd: true },
  });

  if (!user) {
    redirect('/auth/login');
  }

  const hasActiveSub =
    user.subscriptionTier !== 'FREE' &&
    user.subscriptionEnd &&
    user.subscriptionEnd.getTime() > Date.now();

  return (
    <main className="acct-delete-page">
      <header className="acct-delete-header">
        <a className="acct-delete-back" href="/account">← Back to account</a>
        <h1>Delete account</h1>
        <p>
          This permanently erases your OrderflowV2 account and every
          piece of data attached to it. This action <strong>cannot be undone</strong>.
        </p>
      </header>

      <div className="acct-delete-card">
        <div className="acct-delete-section">
          <div className="acct-delete-section-title">What will be deleted</div>
          <ul className="acct-delete-list">
            <li>Your user profile, email, and password</li>
            <li>Your license and every desktop device slot</li>
            <li>Journal entries, playbook setups, daily notes</li>
            <li>Data-feed configurations and broker connections</li>
            <li>Support ticket history</li>
            <li>Payment history (Stripe records remain — required by law)</li>
          </ul>
        </div>

        {hasActiveSub && (
          <div className="acct-delete-banner">
            <strong>Heads up:</strong> you have an active subscription.
            Deleting your account will <em>cancel it immediately</em> via
            Stripe. You will not be billed for upcoming periods.
          </div>
        )}

        <DeleteAccountForm
          email={user.email}
          hasPassword={Boolean(user.password)}
        />
      </div>
    </main>
  );
}
