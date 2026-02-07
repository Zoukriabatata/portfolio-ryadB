'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface User {
  id: string;
  email: string;
  name: string | null;
  subscriptionTier: 'FREE' | 'ULTRA';
  subscriptionStart: string | null;
  subscriptionEnd: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  maxDevices: number;
}

interface PaymentProof {
  id: string;
  email: string;
  method: string;
  amount: string;
  reference: string;
  date: string;
  status: string;
}

type AdminTab = 'users' | 'payments';

const ADMIN_EMAILS = ['ryad.bouderga78@gmail.com'];

export default function AdminPage() {
  const sessionData = useSession();
  const session = sessionData?.data;
  const status = sessionData?.status || 'loading';
  const router = useRouter();

  const [users, setUsers] = useState<User[]>([]);
  const [proofs, setProofs] = useState<PaymentProof[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchEmail, setSearchEmail] = useState('');
  const [selectedDuration, setSelectedDuration] = useState<'month' | 'year' | 'lifetime'>('month');
  const [activeTab, setActiveTab] = useState<AdminTab>('users');

  const isAdmin = session?.user?.email && ADMIN_EMAILS.includes(session.user.email);

  useEffect(() => {
    if (status === 'loading') return;

    if (!session || !isAdmin) {
      router.push('/');
      return;
    }

    fetchUsers();
    fetchProofs();
  }, [session, status, isAdmin, router]);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        setUsers(data.users);
      }
    } catch {
      setError('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const fetchProofs = async () => {
    try {
      const res = await fetch('/api/admin/payments');
      const data = await res.json();

      if (data.error) {
        console.error('Fetch proofs error:', data.error);
      } else {
        setProofs(data.proofs || []);
      }
    } catch {
      console.error('Erreur de connexion (proofs)');
    }
  };

  const handleProofAction = async (proofId: string, action: 'approve' | 'reject') => {
    setActionLoading(proofId);

    try {
      const res = await fetch('/api/admin/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proofId, action }),
      });

      const data = await res.json();

      if (data.success) {
        await fetchProofs();
        await fetchUsers();
      } else {
        alert(data.error || 'Erreur');
      }
    } catch {
      alert('Erreur de connexion');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAction = async (email: string, action: 'activate' | 'deactivate' | 'extend') => {
    setActionLoading(email);

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, action, duration: selectedDuration }),
      });

      const data = await res.json();

      if (data.success) {
        await fetchUsers();
      } else {
        alert(data.error || 'Erreur');
      }
    } catch {
      alert('Erreur de connexion');
    } finally {
      setActionLoading(null);
    }
  };

  const handleQuickActivate = async () => {
    if (!searchEmail) return;

    setActionLoading('quick');

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: searchEmail,
          action: 'activate',
          duration: selectedDuration
        }),
      });

      const data = await res.json();

      if (data.success) {
        setSearchEmail('');
        await fetchUsers();
        alert(data.message);
      } else {
        alert(data.error || 'Erreur');
      }
    } catch {
      alert('Erreur de connexion');
    } finally {
      setActionLoading(null);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <div className="animate-spin rounded-full h-8 w-8 border-t-2" style={{ borderColor: 'var(--primary)' }} />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const filteredUsers = users.filter(u =>
    u.email.toLowerCase().includes(searchEmail.toLowerCase()) ||
    u.name?.toLowerCase().includes(searchEmail.toLowerCase())
  );

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const isExpired = (endDate: string | null) => {
    if (!endDate) return false;
    return new Date(endDate) < new Date();
  };

  return (
    <div className="min-h-screen p-6" style={{ background: 'var(--background)' }}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/" className="text-sm mb-2 inline-block" style={{ color: 'var(--text-dimmed)', transition: 'color 0.2s' }} onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-dimmed)')}>
              ← Retour
            </Link>
            <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Admin <span style={{ color: 'var(--primary-light)' }}>Panel</span>
            </h1>
            <p className="mt-1" style={{ color: 'var(--text-muted)' }}>Gestion des accès SENultra</p>
          </div>

          <div className="text-right text-sm" style={{ color: 'var(--text-dimmed)' }}>
            <div>Total utilisateurs: {users.length}</div>
            <div style={{ color: 'var(--primary-light)' }}>
              Ultra actifs: {users.filter(u => u.subscriptionTier === 'ULTRA' && !isExpired(u.subscriptionEnd)).length}
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg" style={{ background: 'var(--error-bg)', border: '1px solid rgba(239, 68, 68, 0.3)', color: 'var(--error)' }}>
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-8 p-1 rounded-lg" style={{ background: 'var(--surface)' }}>
          {(['users', 'payments'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="flex-1 px-4 py-2.5 rounded-md text-sm font-medium transition-all"
              style={{
                background: activeTab === tab ? 'var(--primary-glow)' : 'transparent',
                color: activeTab === tab ? 'var(--primary-light)' : 'var(--text-muted)',
              }}
            >
              {tab === 'users' ? `Utilisateurs (${users.length})` : `Preuves de Paiement (${proofs.filter(p => p.status === 'PENDING').length})`}
            </button>
          ))}
        </div>

        {activeTab === 'payments' && (
          <div className="rounded-xl overflow-hidden mb-8" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="p-4" style={{ background: 'var(--surface-elevated)', borderBottom: '1px solid var(--border)' }}>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Preuves de Paiement en Attente</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Vérifiez et approuvez les paiements manuels</p>
            </div>

            {proofs.length === 0 ? (
              <div className="p-8 text-center" style={{ color: 'var(--text-dimmed)' }}>
                Aucune preuve de paiement en attente
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ background: 'var(--surface-elevated)' }}>
                      <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Email</th>
                      <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Méthode</th>
                      <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Référence</th>
                      <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Date</th>
                      <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Statut</th>
                      <th className="text-right px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proofs.map((proof) => (
                      <tr key={proof.id} className="transition-colors" style={{ borderTop: '1px solid var(--border)' }} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                        <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>{proof.email}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium" style={{ background: 'var(--surface-elevated)', color: 'var(--text-secondary)' }}>
                            {proof.method}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm font-mono" style={{ color: 'var(--text-muted)' }}>{proof.reference || '-'}</td>
                        <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-dimmed)' }}>{formatDate(proof.date)}</td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
                            style={
                              proof.status === 'PENDING'
                                ? { background: 'var(--warning-bg)', color: 'var(--warning)' }
                                : proof.status === 'COMPLETED'
                                  ? { background: 'var(--success-bg)', color: 'var(--success)' }
                                  : { background: 'var(--error-bg)', color: 'var(--error)' }
                            }
                          >
                            {proof.status === 'PENDING' ? 'En attente' : proof.status === 'COMPLETED' ? 'Approuvé' : 'Rejeté'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {proof.status === 'PENDING' && (
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => handleProofAction(proof.id, 'approve')}
                                disabled={actionLoading === proof.id}
                                className="px-3 py-1 rounded transition-colors text-sm disabled:opacity-50"
                                style={{ background: 'var(--success-bg)', color: 'var(--success)' }}
                              >
                                {actionLoading === proof.id ? '...' : 'Approuver'}
                              </button>
                              <button
                                onClick={() => handleProofAction(proof.id, 'reject')}
                                disabled={actionLoading === proof.id}
                                className="px-3 py-1 rounded transition-colors text-sm disabled:opacity-50"
                                style={{ background: 'var(--error-bg)', color: 'var(--error)' }}
                              >
                                {actionLoading === proof.id ? '...' : 'Rejeter'}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'users' && <>
        {/* Quick Activate */}
        <div className="mb-8 p-6 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Activation rapide</h2>

          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm mb-2" style={{ color: 'var(--text-muted)' }}>Email de l&apos;utilisateur</label>
              <input
                type="email"
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full px-4 py-2 rounded-lg focus:outline-none"
                style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)', '--tw-placeholder-color': 'var(--text-dimmed)' } as React.CSSProperties}
              />
            </div>

            <div>
              <label className="block text-sm mb-2" style={{ color: 'var(--text-muted)' }}>Durée</label>
              <select
                value={selectedDuration}
                onChange={(e) => setSelectedDuration(e.target.value as 'month' | 'year' | 'lifetime')}
                className="px-4 py-2 rounded-lg focus:outline-none"
                style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              >
                <option value="month">1 mois</option>
                <option value="year">1 an</option>
                <option value="lifetime">Lifetime</option>
              </select>
            </div>

            <button
              onClick={handleQuickActivate}
              disabled={!searchEmail || actionLoading === 'quick'}
              className="px-6 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              style={{ background: 'var(--primary)', color: 'var(--text-primary)' }}
            >
              {actionLoading === 'quick' ? 'Activation...' : 'Activer SENultra'}
            </button>
          </div>
        </div>

        {/* Users Table */}
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ background: 'var(--surface-elevated)' }}>
                  <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Utilisateur</th>
                  <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Statut</th>
                  <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Expiration</th>
                  <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Inscrit le</th>
                  <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Dernière connexion</th>
                  <th className="text-right px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="transition-colors" style={{ borderTop: '1px solid var(--border)' }} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                    <td className="px-4 py-3">
                      <div style={{ color: 'var(--text-primary)' }}>{user.email}</div>
                      {user.name && <div className="text-sm" style={{ color: 'var(--text-dimmed)' }}>{user.name}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
                        style={
                          user.subscriptionTier === 'ULTRA'
                            ? isExpired(user.subscriptionEnd)
                              ? { background: 'var(--error-bg)', color: 'var(--error)' }
                              : { background: 'var(--primary-glow)', color: 'var(--primary-light)' }
                            : { background: 'var(--surface-elevated)', color: 'var(--text-muted)' }
                        }
                      >
                        {user.subscriptionTier}
                        {user.subscriptionTier === 'ULTRA' && isExpired(user.subscriptionEnd) && ' (expiré)'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span style={{ color: isExpired(user.subscriptionEnd) ? 'var(--error)' : 'var(--text-muted)' }}>
                        {formatDate(user.subscriptionEnd)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-dimmed)' }}>
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-dimmed)' }}>
                      {formatDate(user.lastLoginAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        {user.subscriptionTier !== 'ULTRA' || isExpired(user.subscriptionEnd) ? (
                          <button
                            onClick={() => handleAction(user.email, 'activate')}
                            disabled={actionLoading === user.email}
                            className="px-3 py-1 rounded transition-colors text-sm disabled:opacity-50"
                            style={{ background: 'var(--primary-glow)', color: 'var(--primary-light)' }}
                          >
                            {actionLoading === user.email ? '...' : 'Activer'}
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => handleAction(user.email, 'extend')}
                              disabled={actionLoading === user.email}
                              className="px-3 py-1 rounded transition-colors text-sm disabled:opacity-50"
                              style={{ background: 'var(--success-bg)', color: 'var(--success)' }}
                            >
                              {actionLoading === user.email ? '...' : 'Prolonger'}
                            </button>
                            <button
                              onClick={() => handleAction(user.email, 'deactivate')}
                              disabled={actionLoading === user.email}
                              className="px-3 py-1 rounded transition-colors text-sm disabled:opacity-50"
                              style={{ background: 'var(--error-bg)', color: 'var(--error)' }}
                            >
                              {actionLoading === user.email ? '...' : 'Désactiver'}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredUsers.length === 0 && (
            <div className="p-8 text-center" style={{ color: 'var(--text-dimmed)' }}>
              Aucun utilisateur trouvé
            </div>
          )}
        </div>
        </>}
      </div>
    </div>
  );
}
