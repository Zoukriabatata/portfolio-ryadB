'use client';

import { useState } from 'react';
import { throttledFetch } from '@/lib/api/throttledFetch';
import type { DataFeedProviderInfo } from '@/lib/boutique/providers';
import { useDataFeedStore } from '@/stores/useDataFeedStore';
import { useTranslation } from '@/lib/i18n/useTranslation';
import {
  BinanceIcon, BybitIcon, DeribitIcon, RithmicIcon,
  InteractiveBrokersIcon, TradovateIcon, CQGIcon, DxFeedIcon, AMPIcon, DatabentoIcon,
} from '@/components/ui/Icons';

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  BinanceIcon, BybitIcon, DeribitIcon, RithmicIcon,
  InteractiveBrokersIcon, TradovateIcon, CQGIcon, DxFeedIcon, AMPIcon, DatabentoIcon,
};

type ModalState = 'idle' | 'connecting' | 'success' | 'error';
type ModalMode = 'configure' | 'info';

interface ConfigureModalProps {
  provider: DataFeedProviderInfo;
  onClose: () => void;
}

export default function ConfigureModal({ provider, onClose }: ConfigureModalProps) {
  const { t } = useTranslation();
  const { configs, setConfig, updateStatus, removeConfig } = useDataFeedStore();
  const Icon = ICON_MAP[provider.iconName];
  const currentConfig = configs[provider.id];
  const isConnected  = currentConfig?.status === 'connected';
  const isConfigured = currentConfig?.status === 'configured'; // saved but not verified

  // Mode: show info if already connected/configured, configure if not
  const [mode, setMode] = useState<ModalMode>((isConnected || isConfigured) ? 'info' : 'configure');

  // Pre-fill fields from existing store config
  const [fields, setFields] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    provider.fields.forEach(f => {
      init[f.key] = (currentConfig as any)?.[f.key] || '';
    });
    return init;
  });
  const [state, setState] = useState<ModalState>('idle');
  const [message, setMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});

  const updateField = (key: string, value: string) => {
    setFields(prev => ({ ...prev, [key]: value }));
    // Clear error on edit
    if (fieldErrors[key]) setFieldErrors(prev => ({ ...prev, [key]: false }));
  };

  // Validate required text/password fields before submitting
  const validateFields = (): boolean => {
    const errors: Record<string, boolean> = {};
    provider.fields.forEach(f => {
      if (f.type !== 'select' && !fields[f.key]?.trim()) {
        errors[f.key] = true;
      }
    });
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Single "Connect" button — tests + saves in one step
  const handleConnect = async () => {
    // Crypto providers: instant connect (public WebSocket, no credentials)
    if (!provider.requiresCredentials) {
      setState('connecting');
      setConfig(provider.id, { status: 'connected' });
      updateStatus(provider.id, 'connected');
      setState('success');
      setMessage('Connected via public WebSocket');
      setTimeout(onClose, 800);
      return;
    }

    if (!validateFields()) return; // Stop if required fields empty

    setState('connecting');
    setMessage('');

    try {
      // Step 1: Test the connection
      const testRes = await throttledFetch('/api/datafeed/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: provider.id.toUpperCase(), ...fields }),
      });
      const testData = await testRes.json() as {
        success: boolean; verified?: boolean; latency?: number; message?: string; error?: string;
      };

      if (!testData.success) {
        setState('error');
        setMessage(testData.error || 'Connection failed');
        return; // Don't save — test failed
      }

      const isVerified = testData.verified !== false; // true for tradovate/databento/crypto; false for gateway

      // Step 2: Test passed → save to database
      const saveRes = await throttledFetch('/api/datafeed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: provider.id.toUpperCase(),
          host: fields.host,
          port: fields.port ? parseInt(fields.port) : undefined,
          username: fields.username,
          apiKey: fields.apiKey || fields.password,
          verified: isVerified,
        }),
      });
      const saveData = await saveRes.json();

      if (!saveData.config) {
        setState('error');
        setMessage(saveData.error || 'Failed to save configuration');
        return;
      }

      // Step 3: Update local store — 'connected' only when credentials were actually verified
      const localStatus = isVerified ? 'connected' : 'configured';
      setConfig(provider.id, { ...fields, status: localStatus });
      updateStatus(provider.id, localStatus);

      setState('success');
      const latencyInfo = testData.latency ? ` (${testData.latency}ms)` : '';
      setMessage(testData.message ? `${testData.message}${latencyInfo}` : isVerified ? `Connected${latencyInfo}` : 'Saved');
      setTimeout(onClose, 1200);
    } catch {
      setState('error');
      setMessage('Network error — check your connection');
    }
  };

  const handleDisconnect = () => {
    removeConfig(provider.id);
    // Also delete from DB
    throttledFetch(`/api/datafeed?provider=${provider.id.toUpperCase()}`, { method: 'DELETE' }).catch(() => {});
    setMessage('Disconnected');
    setState('idle');
    setMode('configure');
    // Reset fields
    const init: Record<string, string> = {};
    provider.fields.forEach(f => { init[f.key] = ''; });
    setFields(init);
  };

  const handleReconfigure = () => {
    setMode('configure');
    setState('idle');
    setMessage('');
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--surface-elevated)',
    border: '1px solid var(--border-light)',
    color: 'var(--text-primary)',
  };

  const lastConnected = currentConfig?.lastConnected
    ? new Date(currentConfig.lastConnected).toLocaleString()
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-modal-overlay"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${provider.name} connection`}
        className="w-full max-w-md rounded-2xl p-6 animate-modal-content"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 25px 50px rgba(0,0,0,0.3)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center"
            style={{ background: `${provider.color}15`, border: `1px solid ${provider.color}25` }}
          >
            {Icon && <Icon size={22} />}
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              {provider.name}
            </h3>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {provider.connectionType}
            </span>
          </div>
          {/* Status pill */}
          {isConnected && mode === 'info' && (
            <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full"
              style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
              Connected
            </span>
          )}
          {isConfigured && mode === 'info' && (
            <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full"
              style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}>
              Saved
            </span>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg hover:bg-[var(--surface-elevated)] transition-colors"
            style={{ color: 'var(--text-muted)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ===== MODE: INFO (already connected) ===== */}
        {mode === 'info' && (
          <div className="space-y-4">
            {/* Connection info */}
            <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--surface-elevated)' }}>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Status</span>
                {isConnected
                  ? <span className="text-xs font-medium" style={{ color: 'var(--success)' }}>Connected ✓</span>
                  : <span className="text-xs font-medium" style={{ color: '#F59E0B' }}>Saved — not verified</span>
                }
              </div>
              {isConfigured && (
                <div className="text-[11px] mt-1 px-2 py-1.5 rounded-lg"
                  style={{ background: 'rgba(245,158,11,0.08)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.2)' }}>
                  Credentials saved locally. They will be verified when the gateway connects.
                </div>
              )}
              {lastConnected && (
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Last connected</span>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{lastConnected}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Type</span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{provider.connectionType}</span>
              </div>
              {currentConfig?.username && (
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Account</span>
                  <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{currentConfig.username}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleReconfigure}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
                style={{ background: 'var(--surface-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              >
                Reconfigure
              </button>
              <button
                onClick={handleDisconnect}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
                style={{ background: 'var(--error-bg)', color: 'var(--error)', border: '1px solid color-mix(in srgb, var(--error) 30%, transparent)' }}
              >
                Disconnect
              </button>
            </div>
          </div>
        )}

        {/* ===== MODE: CONFIGURE ===== */}
        {mode === 'configure' && (
          <>
            {/* No-credentials provider: instant connect */}
            {!provider.requiresCredentials ? (
              <div className="space-y-4">
                <div className="rounded-xl p-4 text-sm" style={{ background: 'var(--surface-elevated)', color: 'var(--text-secondary)' }}>
                  {t('boutique.publicWs')}
                </div>
                <button
                  onClick={handleConnect}
                  disabled={state === 'connecting'}
                  className="w-full py-3 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ background: provider.color, color: '#000' }}
                >
                  {state === 'connecting' ? 'Connecting...' : state === 'success' ? 'Connected!' : 'Connect'}
                </button>
              </div>
            ) : (
              /* Credential fields + single Connect button */
              <div className="space-y-3">
                {provider.fields.map((field, idx) => (
                  <div key={field.key}>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      {field.label}
                      {field.type !== 'select' && (
                        <span style={{ color: 'var(--error)', marginLeft: 2 }}>*</span>
                      )}
                    </label>
                    {field.type === 'select' ? (
                      <select
                        value={fields[field.key] || field.options?.[0]?.value || ''}
                        onChange={e => updateField(field.key, e.target.value)}
                        className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus-glow"
                        style={inputStyle}
                      >
                        {field.options?.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={field.type}
                        value={fields[field.key] || ''}
                        onChange={e => updateField(field.key, e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleConnect(); }}
                        placeholder={field.placeholder}
                        autoFocus={idx === 0}
                        autoComplete={field.type === 'password' ? 'current-password' : 'username'}
                        className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus-glow"
                        style={{
                          ...inputStyle,
                          border: fieldErrors[field.key]
                            ? '1px solid var(--error)'
                            : inputStyle.border,
                        }}
                      />
                    )}
                    {fieldErrors[field.key] && (
                      <p className="text-[10px] mt-1" style={{ color: 'var(--error)' }}>
                        {field.label} is required
                      </p>
                    )}
                  </div>
                ))}

                {/* Gateway notice */}
                {(provider.connectionType === 'Local Gateway' || provider.connectionType === 'TWS Gateway' || provider.connectionType === 'Gateway') && (
                  <div className="rounded-lg p-3 text-xs" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>
                    {t('boutique.requiresGateway')} — Make sure your local gateway is running before connecting.
                  </div>
                )}

                {/* Single Connect button */}
                <div className="pt-2">
                  <button
                    onClick={handleConnect}
                    disabled={state === 'connecting'}
                    className="w-full py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ background: provider.color, color: '#000' }}
                  >
                    {state === 'connecting' ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                        Testing & connecting...
                      </span>
                    ) : state === 'success' ? (
                      'Connected!'
                    ) : (
                      'Connect'
                    )}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Status message */}
        {message && (
          <div
            className="mt-3 rounded-lg px-3 py-2 text-xs"
            style={{
              background: state === 'success' ? 'var(--success-bg)' : state === 'error' ? 'var(--error-bg)' : 'var(--surface-elevated)',
              color: state === 'success' ? 'var(--success)' : state === 'error' ? 'var(--error)' : 'var(--text-secondary)',
            }}
          >
            {message}
            {/* Special captcha guidance */}
            {state === 'error' && message.toLowerCase().includes('captcha') && (
              <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(239,68,68,0.2)' }}>
                <a
                  href="https://trader.tradovate.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium"
                  style={{ color: 'var(--error)' }}
                >
                  Open Tradovate ↗
                </a>
                {' — log in there first, then come back and try again.'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
