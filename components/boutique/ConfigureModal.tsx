'use client';

import { useState } from 'react';
import { throttledFetch } from '@/lib/api/throttledFetch';
import type { DataFeedProviderInfo } from '@/lib/boutique/providers';
import { useDataFeedStore } from '@/stores/useDataFeedStore';
import { useTranslation } from '@/lib/i18n/useTranslation';
import {
  BinanceIcon, BybitIcon, DeribitIcon, RithmicIcon,
  InteractiveBrokersIcon, TradovateIcon, CQGIcon, DxFeedIcon, AMPIcon,
} from '@/components/ui/Icons';

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  BinanceIcon, BybitIcon, DeribitIcon, RithmicIcon,
  InteractiveBrokersIcon, TradovateIcon, CQGIcon, DxFeedIcon, AMPIcon,
};

type ModalState = 'idle' | 'testing' | 'saving' | 'success' | 'error';

interface ConfigureModalProps {
  provider: DataFeedProviderInfo;
  onClose: () => void;
}

export default function ConfigureModal({ provider, onClose }: ConfigureModalProps) {
  const { t } = useTranslation();
  const { setConfig, updateStatus } = useDataFeedStore();
  const Icon = ICON_MAP[provider.iconName];

  const [fields, setFields] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    provider.fields.forEach(f => { init[f.key] = ''; });
    return init;
  });
  const [state, setState] = useState<ModalState>('idle');
  const [message, setMessage] = useState('');

  const updateField = (key: string, value: string) => {
    setFields(prev => ({ ...prev, [key]: value }));
  };

  const handleTest = async () => {
    setState('testing');
    setMessage('');
    try {
      const res = await throttledFetch('/api/datafeed/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: provider.id.toUpperCase(), ...fields }),
      });
      const data = await res.json();
      if (data.success) {
        const latencyInfo = data.latency ? ` (${data.latency}ms)` : '';
        setMessage(data.message ? `${data.message}${latencyInfo}` : `Connection successful${latencyInfo}`);
        setState('success');
      } else {
        setMessage(data.error || 'Connection failed');
        setState('error');
      }
    } catch {
      setMessage('Network error — check your connection');
      setState('error');
    }
  };

  const handleConnect = async () => {
    // Crypto providers auto-connect without credentials
    if (!provider.requiresCredentials) {
      setConfig(provider.id, { status: 'connected' });
      updateStatus(provider.id, 'connected');
      setState('success');
      setMessage('Connected via public WebSocket');
      setTimeout(onClose, 800);
      return;
    }

    setState('saving');
    setMessage('');
    try {
      const res = await throttledFetch('/api/datafeed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: provider.id.toUpperCase(),
          host: fields.host,
          port: fields.port ? parseInt(fields.port) : undefined,
          username: fields.username,
          apiKey: fields.apiKey || fields.password,
        }),
      });
      const data = await res.json();
      if (data.config) {
        setConfig(provider.id, {
          ...fields,
          status: 'configured',
        });
        updateStatus(provider.id, 'configured');
        setState('success');
        setMessage('Configuration saved');
        setTimeout(onClose, 800);
      } else {
        setMessage(data.error || 'Failed to save');
        setState('error');
      }
    } catch {
      setMessage('Network error');
      setState('error');
    }
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--surface-elevated)',
    border: '1px solid var(--border-light)',
    color: 'var(--text-primary)',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Configure ${provider.name}`}
        className="w-full max-w-md rounded-2xl p-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: `${provider.color}18` }}
          >
            {Icon && <Icon size={22} />}
          </div>
          <div>
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              {provider.name}
            </h3>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {provider.connectionType}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto p-1.5 rounded-lg hover:bg-[var(--surface-elevated)] transition-colors"
            style={{ color: 'var(--text-muted)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* No-credentials provider: instant connect */}
        {!provider.requiresCredentials ? (
          <div className="space-y-4">
            <div className="rounded-xl p-4 text-sm" style={{ background: 'var(--surface-elevated)', color: 'var(--text-secondary)' }}>
              {t('boutique.publicWs')}
            </div>
            <button
              onClick={handleConnect}
              disabled={state === 'saving'}
              className="w-full py-3 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: provider.color, color: '#000' }}
            >
              {state === 'saving' ? 'Connecting...' : state === 'success' ? 'Connected!' : t('boutique.connect')}
            </button>
          </div>
        ) : (
          /* Credential fields */
          <div className="space-y-3">
            {provider.fields.map(field => (
              <div key={field.key}>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  {field.label}
                </label>
                <input
                  type={field.type}
                  value={fields[field.key] || ''}
                  onChange={e => updateField(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1"
                  style={{ ...inputStyle, '--tw-ring-color': provider.color } as React.CSSProperties}
                />
              </div>
            ))}

            {/* Gateway notice */}
            {(provider.connectionType === 'Local Gateway' || provider.connectionType === 'TWS Gateway' || provider.connectionType === 'Gateway') && (
              <div className="rounded-lg p-3 text-xs" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
                {t('boutique.requiresGateway')} — Make sure your local gateway is running before connecting.
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleTest}
                disabled={state === 'testing' || state === 'saving'}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: 'var(--surface-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              >
                {state === 'testing' ? 'Testing...' : t('boutique.testConnection')}
              </button>
              <button
                onClick={handleConnect}
                disabled={state === 'saving' || state === 'testing'}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: provider.color, color: '#000' }}
              >
                {state === 'saving' ? 'Saving...' : state === 'success' ? 'Saved!' : t('boutique.configure')}
              </button>
            </div>
          </div>
        )}

        {/* Status message */}
        {message && (
          <div
            className="mt-3 rounded-lg px-3 py-2 text-xs"
            style={{
              background: state === 'success' ? 'rgba(34,197,94,0.1)' : state === 'error' ? 'rgba(239,68,68,0.1)' : 'var(--surface-elevated)',
              color: state === 'success' ? '#22c55e' : state === 'error' ? '#ef4444' : 'var(--text-secondary)',
            }}
          >
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
