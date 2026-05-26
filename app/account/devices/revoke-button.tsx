'use client';

// Tiny client component that handles the DELETE call for one
// Machine row and refreshes the server page once the slot is freed.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function DeviceRevokeButton({ machineId }: { machineId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onRevoke = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/account/license/machines/${encodeURIComponent(machineId)}`,
          { method: 'DELETE' },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body?.error || `HTTP ${res.status}`);
          return;
        }
        setConfirming(false);
        router.refresh();
      } catch (e) {
        setError(String(e));
      }
    });
  };

  if (confirming) {
    return (
      <div className="devices-revoke-confirm">
        <button
          type="button"
          className="devices-revoke-btn devices-revoke-btn-danger"
          onClick={onRevoke}
          disabled={pending}
        >
          {pending ? 'Revoking…' : 'Confirm revoke'}
        </button>
        <button
          type="button"
          className="devices-revoke-btn devices-revoke-btn-ghost"
          onClick={() => setConfirming(false)}
          disabled={pending}
        >
          Cancel
        </button>
        {error ? <span className="devices-revoke-err">{error}</span> : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      className="devices-revoke-btn"
      onClick={() => setConfirming(true)}
    >
      Revoke
    </button>
  );
}
