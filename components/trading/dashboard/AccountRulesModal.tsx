'use client';

import { useState, useEffect, useRef } from 'react';
import {
  useAccountRulesStore,
  PRESET_DEFAULTS,
  type AccountPreset,
} from '@/stores/useAccountRulesStore';

interface AccountRulesModalProps {
  isOpen:  boolean;
  onClose: () => void;
}

const PRESETS: { value: AccountPreset; label: string; desc: string }[] = [
  { value: 'topstep_50k',  label: 'Topstep 50K',  desc: '$1k daily · $2k DD · $3k target' },
  { value: 'topstep_100k', label: 'Topstep 100K', desc: '$2k daily · $3k DD · $6k target' },
  { value: 'topstep_150k', label: 'Topstep 150K', desc: '$3k daily · $4.5k DD · $9k target' },
  { value: 'apex_50k',     label: 'Apex 50K',     desc: '$1.5k daily · $2.5k DD · $3k target' },
  { value: 'apex_100k',    label: 'Apex 100K',    desc: '$2.5k daily · $3k DD · $6k target' },
  { value: 'custom',       label: 'Custom',       desc: 'Set your own limits' },
];

export default function AccountRulesModal({ isOpen, onClose }: AccountRulesModalProps) {
  const rules = useAccountRulesStore();

  const [enabled,         setEnabled]         = useState(rules.enabled);
  const [preset,          setPreset]          = useState<AccountPreset>(rules.preset);
  const [startingBalance, setStartingBalance] = useState(rules.startingBalance);
  const [dailyLossLimit,  setDailyLossLimit]  = useState(rules.dailyLossLimit);
  const [maxDrawdown,     setMaxDrawdown]     = useState(rules.maxDrawdown);
  const [profitTarget,    setProfitTarget]    = useState(rules.profitTarget);

  const panelRef = useRef<HTMLDivElement>(null);

  // Sync local form state when modal reopens
  useEffect(() => {
    if (isOpen) {
      setEnabled(rules.enabled);
      setPreset(rules.preset);
      setStartingBalance(rules.startingBalance);
      setDailyLossLimit(rules.dailyLossLimit);
      setMaxDrawdown(rules.maxDrawdown);
      setProfitTarget(rules.profitTarget);
    }
  }, [isOpen, rules]);

  // Click outside
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 100);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler); };
  }, [isOpen, onClose]);

  // When preset changes, prefill values
  const handlePresetChange = (p: AccountPreset) => {
    setPreset(p);
    if (p !== 'custom') {
      const d = PRESET_DEFAULTS[p];
      setStartingBalance(d.starting);
      setDailyLossLimit(d.dailyLoss);
      setMaxDrawdown(d.drawdown);
      setProfitTarget(d.target);
    }
  };

  const handleSave = () => {
    rules.setEnabled(enabled);
    if (preset !== 'custom') {
      rules.applyPreset(preset);
    } else {
      rules.setCustomLimits({ startingBalance, dailyLossLimit, maxDrawdown, profitTarget });
    }
    // Trigger evaluation against current equity (parent dashboard will too)
    onClose();
  };

  const handleResetAndApply = () => {
    if (!confirm('Reset account rules and clear day P&L baseline + drawdown peak? This does NOT touch your positions or balance.')) return;
    if (preset !== 'custom') {
      rules.applyPreset(preset);
    } else {
      rules.setCustomLimits({ startingBalance, dailyLossLimit, maxDrawdown, profitTarget });
    }
    rules.reset(startingBalance);
    rules.setEnabled(enabled);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-lg rounded-xl overflow-hidden flex flex-col max-h-[90vh]"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Account Rules</h2>
          <button
            onClick={onClose}
            className="text-xl leading-none px-2 hover:opacity-70"
            style={{ color: 'var(--text-muted)' }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 overflow-y-auto flex flex-col gap-4">
          {/* Master toggle */}
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Enable Rules</div>
              <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Track daily loss, drawdown and profit target like a funded account.
              </div>
            </div>
            <Switch checked={enabled} onChange={setEnabled} />
          </label>

          {/* Preset picker */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Preset</span>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handlePresetChange(opt.value)}
                  className="text-left p-2.5 rounded-lg transition-all"
                  style={{
                    background: preset === opt.value ? 'rgba(74,222,128,0.08)' : 'var(--surface-elevated)',
                    border:     `1px solid ${preset === opt.value ? 'var(--primary)' : 'var(--border)'}`,
                    color:      'var(--text-primary)',
                  }}
                >
                  <div className="text-[12px] font-bold">{opt.label}</div>
                  <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Custom inputs (always editable, but auto-filled from preset) */}
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Starting Balance" value={startingBalance} onChange={setStartingBalance} prefix="$" disabled={preset !== 'custom'} />
            <NumberField label="Daily Loss Limit" value={dailyLossLimit}  onChange={setDailyLossLimit} prefix="$" disabled={preset !== 'custom'} />
            <NumberField label="Max Drawdown"     value={maxDrawdown}     onChange={setMaxDrawdown}    prefix="$" disabled={preset !== 'custom'} />
            <NumberField label="Profit Target"    value={profitTarget}    onChange={setProfitTarget}   prefix="$" disabled={preset !== 'custom'} />
          </div>

          <div className="text-[11px] p-2.5 rounded" style={{ background: 'var(--surface-elevated)', color: 'var(--text-muted)' }}>
            ℹ Rules are display-only for now — they show your progress against the limits.
            Order auto-blocking when limits are hit is coming in the next update.
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-3 border-t" style={{ borderColor: 'var(--border)', background: 'var(--surface-elevated)' }}>
          <button
            onClick={handleResetAndApply}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors hover:brightness-110"
            style={{ background: 'rgba(239,68,68,0.10)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.30)' }}
            title="Apply rules AND reset day baseline + drawdown peak"
          >
            Reset & Apply
          </button>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium hover:brightness-110"
            style={{ background: 'transparent', color: 'var(--text-muted)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 rounded-lg text-[12px] font-bold hover:brightness-110"
            style={{ background: 'var(--primary)', color: 'var(--text-primary)' }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="relative w-10 h-5 rounded-full transition-colors"
      style={{ background: checked ? 'var(--primary)' : 'var(--surface-elevated)', border: '1px solid var(--border)' }}
    >
      <div
        className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
        style={{
          background: '#fff',
          left:       checked ? '20px' : '2px',
          boxShadow:  '0 1px 2px rgba(0,0,0,0.3)',
        }}
      />
    </button>
  );
}

function NumberField({
  label, value, onChange, prefix, disabled,
}: {
  label:    string;
  value:    number;
  onChange: (v: number) => void;
  prefix?:  string;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <div
        className="flex items-center rounded-lg overflow-hidden"
        style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', opacity: disabled ? 0.5 : 1 }}
      >
        {prefix && <span className="pl-2.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>{prefix}</span>}
        <input
          type="number"
          value={value}
          disabled={disabled}
          onChange={e => onChange(Math.max(0, parseFloat(e.target.value) || 0))}
          className="w-full px-2 py-1.5 bg-transparent text-[12px] tabular-nums focus:outline-none"
          style={{ color: 'var(--text-primary)' }}
        />
      </div>
    </label>
  );
}
