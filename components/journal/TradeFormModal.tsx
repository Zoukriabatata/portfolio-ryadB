'use client';

import { useState, useEffect } from 'react';
import { throttledFetch } from '@/lib/api/throttledFetch';
import Modal from '@/components/ui/Modal';
import { CME_CONTRACTS } from '@/types/ib-protocol';
import { SETUPS, EMOTIONS, TIMEFRAMES } from '@/types/journal';
import type { JournalEntry, TradeFormData } from '@/types/journal';

const SYMBOLS = Object.keys(CME_CONTRACTS);

const DEFAULT_FORM: TradeFormData = {
  symbol: 'ES',
  side: 'LONG',
  entryPrice: '',
  exitPrice: '',
  quantity: '1',
  entryTime: new Date().toISOString().slice(0, 16),
  exitTime: '',
  timeframe: '',
  setup: '',
  notes: '',
  rating: 0,
  emotions: '',
  tags: [],
  screenshotUrls: [],
  playbookSetupId: '',
};

interface TradeFormModalProps {
  open: boolean;
  onClose: () => void;
  editTrade?: JournalEntry | null;
  onSuccess: () => void;
}

export default function TradeFormModal({ open, onClose, editTrade, onSuccess }: TradeFormModalProps) {
  const [form, setForm] = useState<TradeFormData>({ ...DEFAULT_FORM });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editTrade) {
      setForm({
        symbol: editTrade.symbol,
        side: editTrade.side,
        entryPrice: String(editTrade.entryPrice),
        exitPrice: editTrade.exitPrice ? String(editTrade.exitPrice) : '',
        quantity: String(editTrade.quantity),
        entryTime: new Date(editTrade.entryTime).toISOString().slice(0, 16),
        exitTime: editTrade.exitTime ? new Date(editTrade.exitTime).toISOString().slice(0, 16) : '',
        timeframe: editTrade.timeframe || '',
        setup: editTrade.setup || '',
        notes: editTrade.notes || '',
        rating: editTrade.rating || 0,
        emotions: editTrade.emotions || '',
        tags: editTrade.tags ? (typeof editTrade.tags === 'string' ? JSON.parse(editTrade.tags) : editTrade.tags) : [],
        screenshotUrls: editTrade.screenshotUrls || [],
        playbookSetupId: editTrade.playbookSetupId || '',
      });
    } else {
      setForm({ ...DEFAULT_FORM, entryTime: new Date().toISOString().slice(0, 16) });
    }
  }, [editTrade, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const payload = {
        symbol: form.symbol,
        side: form.side,
        entryPrice: parseFloat(form.entryPrice),
        exitPrice: form.exitPrice ? parseFloat(form.exitPrice) : null,
        quantity: parseInt(form.quantity, 10) || 1,
        entryTime: form.entryTime,
        exitTime: form.exitTime || null,
        timeframe: form.timeframe || null,
        setup: form.setup || null,
        notes: form.notes || null,
        rating: form.rating || null,
        emotions: form.emotions || null,
        tags: form.tags.length > 0 ? form.tags : form.setup ? [form.setup.toLowerCase()] : [],
        screenshotUrls: form.screenshotUrls,
        playbookSetupId: form.playbookSetupId || null,
      };

      const url = editTrade ? `/api/journal/${editTrade.id}` : '/api/journal';
      const method = editTrade ? 'PUT' : 'POST';

      const res = await throttledFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        onSuccess();
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const update = (field: keyof TradeFormData, value: string | number | string[]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const inputStyle = 'w-full px-3 py-2 rounded-lg text-sm bg-[var(--surface)] border border-[var(--border-light)] text-[var(--text-primary)] focus:border-[var(--border-focus)] focus:outline-none transition-colors';
  const labelStyle = 'block text-xs font-medium mb-1.5 text-[var(--text-muted)]';

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={editTrade ? 'Edit Trade' : 'New Trade'}
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !form.entryPrice || !form.entryTime}
            className="px-5 py-2 rounded-lg text-sm font-medium transition-all hover:-translate-y-0.5 active:scale-[0.97] disabled:opacity-50 disabled:hover:translate-y-0"
            style={{ background: 'var(--primary)', color: 'var(--background)' }}
          >
            {submitting ? 'Saving...' : editTrade ? 'Update' : 'Save Trade'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Row 1: Symbol, Side, Quantity */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelStyle}>Symbol *</label>
            <select value={form.symbol} onChange={(e) => update('symbol', e.target.value)} className={inputStyle}>
              {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={labelStyle}>Side *</label>
            <div className="flex gap-2">
              {(['LONG', 'SHORT'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => update('side', s)}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                    form.side === s ? 'scale-[1.02]' : 'opacity-50 hover:opacity-80'
                  }`}
                  style={{
                    background: s === 'LONG'
                      ? (form.side === s ? 'var(--bull)' : 'var(--surface)')
                      : (form.side === s ? 'var(--bear)' : 'var(--surface)'),
                    color: form.side === s ? 'var(--background)' : 'var(--text-muted)',
                    border: `1px solid ${form.side === s ? 'transparent' : 'var(--border-light)'}`,
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelStyle}>Quantity</label>
            <input
              type="number"
              min="1"
              value={form.quantity}
              onChange={(e) => update('quantity', e.target.value)}
              className={inputStyle}
            />
          </div>
        </div>

        {/* Row 2: Prices */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelStyle}>Entry Price *</label>
            <input
              type="number"
              step="any"
              value={form.entryPrice}
              onChange={(e) => update('entryPrice', e.target.value)}
              required
              className={inputStyle}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className={labelStyle}>Exit Price</label>
            <input
              type="number"
              step="any"
              value={form.exitPrice}
              onChange={(e) => update('exitPrice', e.target.value)}
              className={inputStyle}
              placeholder="0.00"
            />
          </div>
        </div>

        {/* Row 3: Times */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelStyle}>Entry Time *</label>
            <input
              type="datetime-local"
              value={form.entryTime}
              onChange={(e) => update('entryTime', e.target.value)}
              required
              className={inputStyle}
            />
          </div>
          <div>
            <label className={labelStyle}>Exit Time</label>
            <input
              type="datetime-local"
              value={form.exitTime}
              onChange={(e) => update('exitTime', e.target.value)}
              className={inputStyle}
            />
          </div>
        </div>

        {/* Row 4: Setup, Timeframe, Emotion */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelStyle}>Setup</label>
            <select value={form.setup} onChange={(e) => update('setup', e.target.value)} className={inputStyle}>
              <option value="">--</option>
              {SETUPS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={labelStyle}>Timeframe</label>
            <select value={form.timeframe} onChange={(e) => update('timeframe', e.target.value)} className={inputStyle}>
              <option value="">--</option>
              {TIMEFRAMES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={labelStyle}>Emotion</label>
            <select value={form.emotions} onChange={(e) => update('emotions', e.target.value)} className={inputStyle}>
              <option value="">--</option>
              {EMOTIONS.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
        </div>

        {/* Row 5: Rating */}
        <div>
          <label className={labelStyle}>Rating</label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => update('rating', form.rating === star ? 0 : star)}
                className="text-xl transition-transform hover:scale-110"
                style={{ color: star <= form.rating ? 'var(--warning)' : 'var(--text-dimmed)' }}
              >
                ★
              </button>
            ))}
          </div>
        </div>

        {/* Row 6: Notes */}
        <div>
          <label className={labelStyle}>Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            rows={3}
            className={`${inputStyle} resize-none`}
            placeholder="Context, mistakes, lessons learned..."
          />
        </div>
      </form>
    </Modal>
  );
}
