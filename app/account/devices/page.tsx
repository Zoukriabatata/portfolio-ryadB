// /account/devices — list every Machine slot bound to the user's
// License and let them revoke any of them. Useful when a slot is
// occupied by an old PC that no longer exists and the user can't
// install on a new machine.
//
// Implementation: server component fetches the data, the per-row
// "Revoke" buttons live in a tiny client component so the DELETE
// fetch + page refresh can happen without leaving the page.

import { redirect } from 'next/navigation';
import { Monitor } from 'lucide-react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { prisma } from '@/lib/db';
import { DeviceRevokeButton } from './revoke-button';
import './devices.css';

export const dynamic = 'force-dynamic';

function fmtDateTime(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function relativeFromNow(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const diffMs = Date.now() - date.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d2 = Math.floor(hr / 24);
  return `${d2}d ago`;
}

function osLabel(os: string | null): string {
  if (!os) return 'Unknown OS';
  const s = os.toLowerCase();
  if (s.includes('win')) return 'Windows';
  if (s.includes('mac') || s.includes('darwin')) return 'macOS';
  if (s.includes('linux')) return 'Linux';
  return os;
}

export default async function DevicesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect(`/auth/login?callbackUrl=${encodeURIComponent('/account/devices')}`);
  }

  const license = await prisma.license.findUnique({
    where: { userId: session.user.id },
    include: {
      machines: {
        orderBy: { lastHeartbeatAt: 'desc' },
      },
    },
  });

  return (
    <main className="devices-page">
      <header className="devices-header">
        <a className="devices-back" href="/account">← Back to account</a>
        <h1>Devices</h1>
        <p>
          Each desktop installation occupies one slot on your license.
          Revoke a slot to free it for a new machine.
        </p>
      </header>

      {!license ? (
        <div className="devices-empty">
          <div className="devices-empty-title">No license yet</div>
          <div className="devices-empty-sub">
            Subscribe to OrderflowV2 to install the desktop app and
            bind devices to your account.
          </div>
          <a className="devices-cta" href="/pricing">
            See plans →
          </a>
        </div>
      ) : (
        <>
          <div className="devices-summary">
            <div className="devices-summary-stat">
              <div className="devices-summary-k">Slots used</div>
              <div className="devices-summary-v">
                <strong>{license.machines.length}</strong>
                <span>/ {license.maxMachines}</span>
              </div>
            </div>
            <div className="devices-summary-stat">
              <div className="devices-summary-k">License</div>
              <div className="devices-summary-v">
                <code>{license.licenseKey}</code>
              </div>
            </div>
            <div className="devices-summary-stat">
              <div className="devices-summary-k">Status</div>
              <div className="devices-summary-v">
                <span className={`devices-badge devices-badge-${license.status.toLowerCase()}`}>
                  {license.status}
                </span>
              </div>
            </div>
          </div>

          {license.machines.length === 0 ? (
            <div className="devices-empty">
              <div className="devices-empty-title">No active machines</div>
              <div className="devices-empty-sub">
                Sign in from the OrderflowV2 desktop app to claim a slot.
              </div>
            </div>
          ) : (
            <ul className="devices-list">
              {license.machines.map((m) => (
                <li key={m.id} className="devices-row">
                  <div className="devices-row-icon" aria-hidden>
                    <Monitor size={20} strokeWidth={1.5} />
                  </div>
                  <div className="devices-row-main">
                    <div className="devices-row-title">
                      {osLabel(m.os)}
                      {m.appVersion ? (
                        <span className="devices-row-version">
                          v{m.appVersion}
                        </span>
                      ) : null}
                    </div>
                    <div className="devices-row-meta">
                      <span title={m.machineId}>
                        <code>{m.machineId.slice(0, 12)}…</code>
                      </span>
                      <span>·</span>
                      <span>First seen {fmtDateTime(m.firstSeenAt)}</span>
                    </div>
                  </div>
                  <div className="devices-row-time">
                    <div className="devices-row-time-label">Last seen</div>
                    <div
                      className="devices-row-time-value"
                      title={fmtDateTime(m.lastHeartbeatAt)}
                    >
                      {relativeFromNow(m.lastHeartbeatAt)}
                    </div>
                  </div>
                  <DeviceRevokeButton machineId={m.id} />
                </li>
              ))}
            </ul>
          )}

          <p className="devices-hint">
            Revoking your CURRENT machine signs the desktop app out on
            that PC. You'll need to log back in to claim a slot again.
          </p>
        </>
      )}
    </main>
  );
}
