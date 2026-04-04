'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { usePriceAlerts } from '@/hooks/usePriceAlerts';
import { useMarketStore } from '@/stores/useMarketStore';
import { toast } from 'sonner';

interface AlertButtonProps {
  theme: { colors: { surface: string; border: string; text: string; textMuted: string; textSecondary: string; background: string; toolActive: string } };
}

export default function AlertButton({ theme }: AlertButtonProps) {
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);

  // Form state
  const [condition, setCondition] = useState<'above' | 'below'>('above');
  const [targetPrice, setTargetPrice] = useState('');
  const [label, setLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const symbol = useMarketStore(s => s.symbol);
  const currentPrice = useMarketStore(s => s.currentPrice);

  const { alerts, createAlert, deleteAlert, recentlyTriggered, dismissTriggered } = usePriceAlerts();

  useEffect(() => { setMounted(true); }, []);

  // Auto-fill price on open
  useEffect(() => {
    if (open && currentPrice > 0 && !targetPrice) {
      setTargetPrice(currentPrice.toFixed(2));
    }
  }, [open, currentPrice, targetPrice]);

  // Toast on trigger
  useEffect(() => {
    if (recentlyTriggered) {
      const dir = recentlyTriggered.condition === 'above' ? '↑' : '↓';
      toast.success(`${dir} Alert: ${recentlyTriggered.symbol} hit $${recentlyTriggered.targetPrice.toLocaleString()}`, {
        duration: 6000,
        description: recentlyTriggered.label || undefined,
      });
      dismissTriggered();
    }
  }, [recentlyTriggered, dismissTriggered]);

  function handleOpen() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      const vpWidth = document.documentElement.clientWidth;
      setPanelPos({ top: rect.bottom + 4, right: Math.max(0, vpWidth - rect.right) });
    }
    setOpen(v => !v);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const price = parseFloat(targetPrice);
    if (!price || price <= 0) return;

    setSubmitting(true);
    const ok = await createAlert({ symbol, condition, targetPrice: price, label: label.trim() || undefined });
    setSubmitting(false);

    if (ok) {
      toast.success('Alert created');
      setTargetPrice('');
      setLabel('');
    } else {
      toast.error('Failed to create alert (max 10 active)');
    }
  }

  const activeCount = alerts.filter(a => a.symbol === symbol).length;

  const panel = open && mounted ? createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />

      {/* Panel */}
      <div
        className="fixed z-[9999] rounded-xl overflow-hidden shadow-2xl"
        style={{
          top: panelPos.top, right: panelPos.right,
          width: 280,
          background: theme.colors.surface,
          border: `1px solid ${theme.colors.border}`,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${theme.colors.border}` }}>
          <span className="text-xs font-semibold" style={{ color: theme.colors.text }}>
            Price Alerts — {symbol}
          </span>
          <button onClick={() => setOpen(false)} className="opacity-40 hover:opacity-80 transition-opacity">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Create form */}
        <form onSubmit={handleSubmit} className="px-4 py-3" style={{ borderBottom: `1px solid ${theme.colors.border}` }}>
          <div className="flex gap-1.5 mb-2">
            {(['above', 'below'] as const).map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setCondition(c)}
                className="flex-1 py-1.5 rounded text-[11px] font-semibold transition-all"
                style={{
                  background: condition === c ? (c === 'above' ? 'rgba(74,222,128,0.15)' : 'rgba(239,68,68,0.15)') : 'transparent',
                  color: condition === c ? (c === 'above' ? '#4ade80' : '#f87171') : theme.colors.textMuted,
                  border: `1px solid ${condition === c ? (c === 'above' ? 'rgba(74,222,128,0.3)' : 'rgba(239,68,68,0.3)') : theme.colors.border}`,
                }}
              >
                {c === 'above' ? '↑ Above' : '↓ Below'}
              </button>
            ))}
          </div>

          <input
            type="number"
            value={targetPrice}
            onChange={e => setTargetPrice(e.target.value)}
            placeholder="Target price"
            step="any"
            required
            className="w-full px-3 py-2 rounded text-[12px] font-mono focus:outline-none mb-2"
            style={{ background: theme.colors.background, border: `1px solid ${theme.colors.border}`, color: theme.colors.text }}
          />

          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Note (optional)"
            maxLength={80}
            className="w-full px-3 py-2 rounded text-[12px] focus:outline-none mb-2.5"
            style={{ background: theme.colors.background, border: `1px solid ${theme.colors.border}`, color: theme.colors.text }}
          />

          <button
            type="submit"
            disabled={submitting || !targetPrice}
            className="w-full py-2 rounded text-[12px] font-bold transition-all disabled:opacity-40"
            style={{ background: 'linear-gradient(to right, #4ade80, #22c55e)', color: '#0a0a0f' }}
          >
            {submitting ? 'Creating…' : 'Set Alert'}
          </button>
        </form>

        {/* Active alerts list */}
        <div className="max-h-48 overflow-y-auto">
          {alerts.length === 0 ? (
            <p className="text-center py-4 text-[11px]" style={{ color: theme.colors.textMuted }}>
              No active alerts
            </p>
          ) : (
            alerts.map(alert => (
              <div key={alert.id} className="flex items-center justify-between px-4 py-2.5"
                style={{ borderTop: `1px solid ${theme.colors.border}` }}>
                <div className="flex-1 min-w-0">
                  <span className="text-[11px] font-mono" style={{ color: theme.colors.text }}>
                    {alert.symbol}
                  </span>
                  <span className="ml-1.5 text-[11px]"
                    style={{ color: alert.condition === 'above' ? '#4ade80' : '#f87171' }}>
                    {alert.condition === 'above' ? '↑' : '↓'} ${alert.targetPrice.toLocaleString()}
                  </span>
                  {alert.label && (
                    <p className="text-[10px] truncate mt-0.5" style={{ color: theme.colors.textMuted }}>
                      {alert.label}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => deleteAlert(alert.id)}
                  className="ml-2 opacity-30 hover:opacity-70 transition-opacity flex-shrink-0"
                  title="Delete alert"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </>,
    document.body
  ) : null;

  if (!mounted) return null;

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        data-tooltip="Price Alerts"
        data-tooltip-pos="bottom"
        className="relative flex items-center gap-1 px-2 py-1 rounded transition-all hover:brightness-110"
        style={{
          background: open ? theme.colors.toolActive : 'transparent',
          color: open ? theme.colors.text : theme.colors.textMuted,
          border: `1px solid ${open ? theme.colors.border : 'transparent'}`,
        }}
      >
        {/* Bell icon */}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {activeCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full text-[8px] font-bold flex items-center justify-center"
            style={{ background: '#f59e0b', color: '#0a0a0f' }}>
            {activeCount > 9 ? '9+' : activeCount}
          </span>
        )}
      </button>
      {panel}
    </>
  );
}
