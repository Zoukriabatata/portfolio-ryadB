'use client';

import { useState, useEffect, useCallback } from 'react';
import { CME_CONTRACTS } from '@/types/ib-protocol';

interface JournalEntry {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  pnl: number | null;
  entryTime: string;
  exitTime: string | null;
  setup: string | null;
  tags: string[];
  notes: string | null;
  rating: number | null;
  emotions: string | null;
}

interface JournalStats {
  totalPnl: number;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number;
}

const SYMBOLS = Object.keys(CME_CONTRACTS);
const SETUPS = ['Breakout', 'Pullback', 'Reversal', 'Scalp', 'Trend Follow', 'Range', 'News'];
const EMOTIONS = ['Calm', 'Confident', 'Anxious', 'FOMO', 'Revenge', 'Greedy', 'Disciplined'];

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [stats, setStats] = useState<JournalStats>({ totalPnl: 0, totalTrades: 0, winCount: 0, lossCount: 0, winRate: 0 });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterSymbol, setFilterSymbol] = useState('');

  // Form state
  const [form, setForm] = useState({
    symbol: 'ES', side: 'LONG' as 'LONG' | 'SHORT',
    entryPrice: '', exitPrice: '', quantity: '1',
    entryTime: new Date().toISOString().slice(0, 16),
    exitTime: '', setup: '', notes: '', rating: 0, emotions: '',
  });

  const fetchEntries = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterSymbol) params.set('symbol', filterSymbol);

    const res = await fetch(`/api/journal?${params}`);
    const data = await res.json();
    setEntries(data.entries || []);
    setStats(data.stats || { totalPnl: 0, totalTrades: 0, winCount: 0, lossCount: 0, winRate: 0 });
    setLoading(false);
  }, [filterSymbol]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch('/api/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        entryPrice: parseFloat(form.entryPrice),
        exitPrice: form.exitPrice ? parseFloat(form.exitPrice) : null,
        quantity: parseInt(form.quantity, 10),
        exitTime: form.exitTime || null,
        rating: form.rating || null,
        tags: form.setup ? [form.setup.toLowerCase()] : [],
      }),
    });
    setShowForm(false);
    setForm({ symbol: 'ES', side: 'LONG', entryPrice: '', exitPrice: '', quantity: '1', entryTime: new Date().toISOString().slice(0, 16), exitTime: '', setup: '', notes: '', rating: 0, emotions: '' });
    fetchEntries();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette entree ?')) return;
    await fetch(`/api/journal/${id}`, { method: 'DELETE' });
    fetchEntries();
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  const formatPnl = (pnl: number | null) => {
    if (pnl === null) return '-';
    const sign = pnl >= 0 ? '+' : '';
    return `${sign}$${pnl.toFixed(2)}`;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Trading Journal</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Suivez vos trades et analysez vos performances</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 rounded-lg transition-colors font-medium"
          style={{ background: 'var(--primary)', color: 'var(--text-primary)' }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--primary-dark)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'var(--primary)'}
        >
          {showForm ? 'Fermer' : '+ Nouveau Trade'}
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>P&L Total</p>
          <p className="text-xl font-bold" style={{ color: stats.totalPnl >= 0 ? 'var(--bull)' : 'var(--bear)' }}>
            {formatPnl(stats.totalPnl)}
          </p>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Trades</p>
          <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{stats.totalTrades}</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Win Rate</p>
          <p className="text-xl font-bold" style={{ color: 'var(--bull)' }}>{stats.winRate}%</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Gagnants</p>
          <p className="text-xl font-bold" style={{ color: 'var(--bull)' }}>{stats.winCount}</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Perdants</p>
          <p className="text-xl font-bold" style={{ color: 'var(--bear)' }}>{stats.lossCount}</p>
        </div>
      </div>

      {/* New Trade Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl p-6 mb-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Nouveau Trade</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Symbole</label>
              <select value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}>
                {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Side</label>
              <select value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value as 'LONG' | 'SHORT' })} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}>
                <option value="LONG">LONG</option>
                <option value="SHORT">SHORT</option>
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Entry Price *</label>
              <input type="number" step="any" value={form.entryPrice} onChange={(e) => setForm({ ...form, entryPrice: e.target.value })} required className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Exit Price</label>
              <input type="number" step="any" value={form.exitPrice} onChange={(e) => setForm({ ...form, exitPrice: e.target.value })} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Quantity</label>
              <input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Entry Time *</label>
              <input type="datetime-local" value={form.entryTime} onChange={(e) => setForm({ ...form, entryTime: e.target.value })} required className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Setup</label>
              <select value={form.setup} onChange={(e) => setForm({ ...form, setup: e.target.value })} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}>
                <option value="">--</option>
                {SETUPS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Emotion</label>
              <select value={form.emotions} onChange={(e) => setForm({ ...form, emotions: e.target.value })} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}>
                <option value="">--</option>
                {EMOTIONS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full px-3 py-2 rounded-lg text-sm resize-none" style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }} placeholder="Contexte, erreurs, lecons..." />
          </div>
          <button type="submit" className="mt-4 px-6 py-2 rounded-lg transition-colors font-medium"
            style={{ background: 'var(--primary)', color: 'var(--text-primary)' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--primary-dark)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'var(--primary)'}>
            Enregistrer
          </button>
        </form>
      )}

      {/* Filter */}
      <div className="flex items-center gap-3 mb-4">
        <select value={filterSymbol} onChange={(e) => setFilterSymbol(e.target.value)} className="px-3 py-1.5 rounded-lg text-sm" style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}>
          <option value="">Tous les symboles</option>
          {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Entries Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ background: 'var(--surface-elevated)' }}>
                <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Date</th>
                <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Symbole</th>
                <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Side</th>
                <th className="text-right px-4 py-3 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Entry</th>
                <th className="text-right px-4 py-3 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Exit</th>
                <th className="text-right px-4 py-3 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Qty</th>
                <th className="text-right px-4 py-3 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>P&L</th>
                <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Setup</th>
                <th className="text-right px-4 py-3 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-8" style={{ color: 'var(--text-muted)' }}>Chargement...</td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8" style={{ color: 'var(--text-muted)' }}>Aucun trade enregistre</td></tr>
              ) : entries.map((entry) => (
                <tr key={entry.id} className="transition-colors" style={{ borderTop: '1px solid var(--border)' }} onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-hover)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-muted)' }}>{formatDate(entry.entryTime)}</td>
                  <td className="px-4 py-3 text-sm font-mono font-bold" style={{ color: 'var(--text-primary)' }}>{entry.symbol}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: entry.side === 'LONG' ? 'var(--bull-bg)' : 'var(--bear-bg)', color: entry.side === 'LONG' ? 'var(--bull)' : 'var(--bear)' }}>
                      {entry.side}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-mono" style={{ color: 'var(--text-primary)' }}>{entry.entryPrice}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono" style={{ color: 'var(--text-muted)' }}>{entry.exitPrice || '-'}</td>
                  <td className="px-4 py-3 text-sm text-right" style={{ color: 'var(--text-muted)' }}>{entry.quantity}</td>
                  <td className="px-4 py-3 text-sm text-right font-bold font-mono" style={{ color: (entry.pnl || 0) >= 0 ? 'var(--bull)' : 'var(--bear)' }}>
                    {formatPnl(entry.pnl)}
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-dimmed)' }}>{entry.setup || '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(entry.id)} className="text-xs transition-colors" style={{ color: 'var(--text-dimmed)' }}
                      onMouseEnter={(e) => e.currentTarget.style.color = 'var(--error)'}
                      onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dimmed)'}>
                      Suppr
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
