'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, Suspense } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  UserIcon,
  ShieldIcon,
  SlidersIcon,
  LinkIcon,
  BellIcon,
  DatabaseIcon,
  KeyIcon,
  GlobeIcon,
  PaletteIcon,
  LogOutIcon,
  RithmicIcon,
  InteractiveBrokersIcon,
  TradovateIcon,
  CQGIcon,
  NinjaTraderIcon,
  BinanceIcon,
  BybitIcon,
  DeribitIcon,
} from '@/components/ui/Icons';
import { useUIThemeStore, applyUITheme, UI_THEMES, type UIThemeId } from '@/stores/useUIThemeStore';
import { throttledFetch } from '@/lib/api/throttledFetch';
import { useDataFeedStore } from '@/stores/useDataFeedStore';
import { useAccountPrefsStore, type SupportedLanguage } from '@/stores/useAccountPrefsStore';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { TranslationKey } from '@/lib/i18n/translations';
import { TradovateAuth, TradovateClient } from '@/lib/brokers/tradovate';

type TicketCategory = 'BILLING' | 'TECHNICAL' | 'ACCOUNT' | 'FEATURE_REQUEST' | 'OTHER';
type AccountTab = 'profile' | 'preferences' | 'connections' | 'security' | 'notifications' | 'data' | 'support';

interface SupportTicket {
  id: string;
  subject: string;
  category: TicketCategory;
  status: string;
  createdAt: string;
  response?: string;
}

interface BrokerConnection {
  id: string;
  name: string;
  icon: React.ComponentType<any>;
  color: string;
  connected: boolean;
  description: string;
  fields: { key: string; label: string; type: 'text' | 'password'; placeholder: string }[];
}

const BROKER_CONNECTIONS: BrokerConnection[] = [
  {
    id: 'rithmic', name: 'Rithmic', icon: RithmicIcon, color: '#0ea5e9', connected: false,
    description: 'Professional futures data & execution',
    fields: [
      { key: 'username', label: 'Username', type: 'text', placeholder: 'Rithmic username' },
      { key: 'password', label: 'Password', type: 'password', placeholder: 'Rithmic password' },
      { key: 'server', label: 'Server', type: 'text', placeholder: 'e.g. Chicago' },
    ],
  },
  {
    id: 'ib', name: 'Interactive Brokers', icon: InteractiveBrokersIcon, color: '#dc2626', connected: false,
    description: 'Multi-asset broker - stocks, futures, options',
    fields: [
      { key: 'host', label: 'TWS Host', type: 'text', placeholder: '127.0.0.1' },
      { key: 'port', label: 'TWS Port', type: 'text', placeholder: '7497' },
      { key: 'clientId', label: 'Client ID', type: 'text', placeholder: '1' },
    ],
  },
  {
    id: 'tradovate', name: 'Tradovate', icon: TradovateIcon, color: '#6366f1', connected: false,
    description: 'Commission-free futures trading',
    fields: [
      { key: 'apiKey', label: 'Username', type: 'text', placeholder: 'Tradovate username' },
      { key: 'apiSecret', label: 'Password', type: 'password', placeholder: 'Tradovate password' },
      { key: 'cid', label: 'CID (App ID)', type: 'text', placeholder: 'Optional — your app client ID' },
      { key: 'sec', label: 'API Secret', type: 'password', placeholder: 'Optional — your API secret key' },
    ],
  },
  {
    id: 'cqg', name: 'CQG', icon: CQGIcon, color: '#f59e0b', connected: false,
    description: 'Institutional-grade market data',
    fields: [
      { key: 'username', label: 'Username', type: 'text', placeholder: 'CQG username' },
      { key: 'password', label: 'Password', type: 'password', placeholder: 'CQG password' },
    ],
  },
  {
    id: 'ninja', name: 'NinjaTrader', icon: NinjaTraderIcon, color: '#14b8a6', connected: false,
    description: 'Futures & forex trading platform',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'text', placeholder: 'NinjaTrader API key' },
    ],
  },
  {
    id: 'binance', name: 'Binance', icon: BinanceIcon, color: '#f0b90b', connected: false,
    description: 'Crypto spot & futures',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'text', placeholder: 'Binance API key' },
      { key: 'apiSecret', label: 'API Secret', type: 'password', placeholder: 'Binance API secret' },
    ],
  },
  {
    id: 'bybit', name: 'Bybit', icon: BybitIcon, color: '#f7a600', connected: false,
    description: 'Crypto derivatives exchange',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'text', placeholder: 'Bybit API key' },
      { key: 'apiSecret', label: 'API Secret', type: 'password', placeholder: 'Bybit API secret' },
    ],
  },
  {
    id: 'deribit', name: 'Deribit', icon: DeribitIcon, color: '#22d3ee', connected: false,
    description: 'Crypto options & futures',
    fields: [
      { key: 'clientId', label: 'Client ID', type: 'text', placeholder: 'Deribit client ID' },
      { key: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: 'Deribit client secret' },
    ],
  },
];

const TABS: { id: AccountTab; labelKey: TranslationKey; icon: React.ComponentType<any> }[] = [
  { id: 'profile', labelKey: 'account.profile', icon: UserIcon },
  { id: 'preferences', labelKey: 'account.preferences', icon: SlidersIcon },
  { id: 'connections', labelKey: 'account.connections', icon: LinkIcon },
  { id: 'security', labelKey: 'account.security', icon: ShieldIcon },
  { id: 'notifications', labelKey: 'account.notifications', icon: BellIcon },
  { id: 'data', labelKey: 'account.data', icon: DatabaseIcon },
  { id: 'support', labelKey: 'account.support', icon: UserIcon },
];

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>{title}</h3>
      {children}
    </div>
  );
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="flex-1 pr-4">
        <div className="text-sm" style={{ color: 'var(--text-primary)' }}>{label}</div>
        {description && <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{description}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative w-10 h-5 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/50"
      style={{ background: checked ? 'var(--primary)' : 'var(--surface-elevated)' }}
    >
      <div
        className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
        style={{
          background: checked ? 'var(--primary-foreground, #fff)' : 'var(--text-muted)',
          left: checked ? '22px' : '2px',
        }}
      />
    </button>
  );
}

function AccountContent() {
  const sessionData = useSession();
  const session = sessionData?.data;
  const status = sessionData?.status || 'loading';
  const router = useRouter();
  const searchParams = useSearchParams();
  const success = searchParams.get('success');

  const [activeTab, setActiveTab] = useState<AccountTab>('profile');
  const { activeTheme, setTheme } = useUIThemeStore();

  // Support state
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState<TicketCategory>('TECHNICAL');
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Preferences from persistent store
  const prefs = useAccountPrefsStore();
  const { t } = useTranslation();

  // Profile editing
  const [profileName, setProfileName] = useState('');
  const [profileDisplayName, setProfileDisplayName] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  // Connections
  const [expandedBroker, setExpandedBroker] = useState<string | null>(null);
  const [brokerFields, setBrokerFields] = useState<Record<string, Record<string, string>>>({});
  const [connectionStatus, setConnectionStatus] = useState<Record<string, 'idle' | 'testing' | 'connecting' | 'connected' | 'configured' | 'error'>>({});
  const [connectionMessage, setConnectionMessage] = useState<Record<string, string>>({});
  const dataFeedStore = useDataFeedStore();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    }
  }, [status, router]);

  // Load profile from API on mount
  useEffect(() => {
    if (session?.user && !profileLoaded) {
      const controller = new AbortController();
      setProfileName(session.user.name || '');
      throttledFetch('/api/auth/profile', { signal: controller.signal })
        .then(r => {
          if (!r.ok) throw new Error(`Profile fetch failed: ${r.status}`);
          return r.json();
        })
        .then(data => {
          if (data.user) {
            setProfileName(data.user.name || '');
            setProfileDisplayName(data.user.displayName || '');
          }
          setProfileLoaded(true);
        })
        .catch((err) => {
          if (err.name !== 'AbortError') setProfileLoaded(true);
        });
      return () => controller.abort();
    }
  }, [session, profileLoaded]);

  // Refresh session after successful payment
  useEffect(() => {
    if (success === 'true' && sessionData.update) {
      // Poll session to pick up tier change from webhook
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        await sessionData.update();
        if (attempts >= 15) clearInterval(interval); // stop after 30s
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [success, sessionData]);

  // Load saved broker configs from localStorage on mount
  useEffect(() => {
    const savedFields: Record<string, Record<string, string>> = {};
    const savedStatus: Record<string, 'idle' | 'configured'> = {};
    for (const broker of BROKER_CONNECTIONS) {
      try {
        const saved = localStorage.getItem(`senzoukria-broker-${broker.id}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          const hasValues = Object.values(parsed).some((v: any) => v && String(v).trim() !== '');
          if (hasValues) {
            savedFields[broker.id] = parsed;
            savedStatus[broker.id] = 'configured';
          }
        }
      } catch {}
    }
    if (Object.keys(savedFields).length > 0) {
      setBrokerFields(prev => ({ ...prev, ...savedFields }));
      setConnectionStatus(prev => ({ ...prev, ...savedStatus }));
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'support') fetchTickets();
  }, [activeTab]);

  useEffect(() => {
    applyUITheme(activeTheme);
  }, [activeTheme]);

  const fetchTickets = async () => {
    try {
      const res = await throttledFetch('/api/support');
      if (!res.ok) return;
      const data = await res.json();
      setTickets(data.tickets || []);
    } catch {}
  };

  const handleSaveProfile = async () => {
    setProfileSaving(true);
    setProfileSaved(false);
    try {
      const res = await throttledFetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: profileName, displayName: profileDisplayName }),
      });
      if (res.ok) {
        setProfileSaved(true);
        if (sessionData.update) sessionData.update();
        setTimeout(() => setProfileSaved(false), 3000);
      }
    } catch {} finally { setProfileSaving(false); }
  };

  const handleManageSubscription = async () => {
    setIsLoading(true);
    try {
      const res = await throttledFetch('/api/stripe/portal', { method: 'POST' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {} finally { setIsLoading(false); }
  };

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await throttledFetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message, category }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        setSubmitSuccess(true);
        setSubject('');
        setMessage('');
        fetchTickets();
        setTimeout(() => setSubmitSuccess(false), 5000);
      }
    } catch {} finally { setIsLoading(false); }
  };

  const handleTestConnection = async (brokerId: string) => {
    setConnectionStatus(prev => ({ ...prev, [brokerId]: 'testing' }));
    setConnectionMessage(prev => ({ ...prev, [brokerId]: '' }));

    try {
      if (brokerId === 'ib') {
        const gatewayUrl = process.env.NEXT_PUBLIC_IB_GATEWAY_URL || 'ws://localhost:4000';
        const healthUrl = gatewayUrl.replace('wss://', 'https://').replace('ws://', 'http://') + '/health';
        const response = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
        if (response.ok) {
          const data = await response.json();
          setConnectionStatus(prev => ({ ...prev, [brokerId]: 'connected' }));
          setConnectionMessage(prev => ({ ...prev, [brokerId]: `Gateway online (${data.connectedUsers || 0} users)` }));
          dataFeedStore.updateStatus('ib', 'connected');
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } else if (brokerId === 'tradovate') {
        // Test Tradovate API connectivity
        const config = brokerFields[brokerId] || {};
        if (!config.apiKey || !config.apiSecret) {
          throw new Error('API Key and Secret are required');
        }
        const auth = new TradovateAuth('demo');
        await auth.authenticate({
          name: config.apiKey,
          password: config.apiSecret,
          ...(config.cid ? { cid: parseInt(config.cid, 10) } : {}),
          ...(config.sec ? { sec: config.sec } : {}),
        });
        const client = new TradovateClient(auth);
        const accounts = await client.getAccounts();
        auth.disconnect();
        setConnectionStatus(prev => ({ ...prev, [brokerId]: 'connected' }));
        setConnectionMessage(prev => ({ ...prev, [brokerId]: `Authenticated — ${accounts.length} account(s) found` }));
      } else if (['rithmic', 'ninja', 'cqg'].includes(brokerId)) {
        await new Promise(r => setTimeout(r, 800));
        const names: Record<string, string> = { rithmic: 'Rithmic', ninja: 'NinjaTrader', cqg: 'CQG' };
        setConnectionStatus(prev => ({ ...prev, [brokerId]: 'configured' }));
        setConnectionMessage(prev => ({ ...prev, [brokerId]: `${names[brokerId] || brokerId} credentials saved — direct connection coming in a future update. Use Tradovate or Binance/Bybit for live data now.` }));
      } else {
        // Crypto brokers - test API key validity
        const config = brokerFields[brokerId] || {};
        if (!config.apiKey) {
          throw new Error('API Key is required');
        }
        await new Promise(r => setTimeout(r, 800));
        setConnectionStatus(prev => ({ ...prev, [brokerId]: 'configured' }));
        setConnectionMessage(prev => ({ ...prev, [brokerId]: 'API key saved — real-time integration coming soon' }));
      }
    } catch (error: any) {
      setConnectionStatus(prev => ({ ...prev, [brokerId]: 'error' }));
      const msg = error.message?.includes('AbortError') || error.message?.includes('timeout')
        ? 'Connection timed out — check your network or gateway'
        : `Connection failed: ${error.message || 'Unknown error'}`;
      setConnectionMessage(prev => ({ ...prev, [brokerId]: msg }));
    }
  };

  const handleConnect = async (brokerId: string) => {
    setConnectionStatus(prev => ({ ...prev, [brokerId]: 'connecting' }));
    setConnectionMessage(prev => ({ ...prev, [brokerId]: '' }));

    try {
      // Save broker configuration to localStorage
      const config = brokerFields[brokerId] || {};
      localStorage.setItem(`senzoukria-broker-${brokerId}`, JSON.stringify(config));

      if (brokerId === 'ib') {
        const ibConfig = config as Record<string, string>;
        dataFeedStore.setConfig('ib', {
          host: ibConfig.host || '127.0.0.1',
          port: parseInt(ibConfig.port || '7497', 10),
          status: 'configured',
        });
        const gatewayUrl = process.env.NEXT_PUBLIC_IB_GATEWAY_URL || 'ws://localhost:4000';
        const healthUrl = gatewayUrl.replace('wss://', 'https://').replace('ws://', 'http://') + '/health';
        try {
          const response = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
          if (response.ok) {
            setConnectionStatus(prev => ({ ...prev, [brokerId]: 'connected' }));
            setConnectionMessage(prev => ({ ...prev, [brokerId]: 'Configuration saved — Gateway connected' }));
            dataFeedStore.updateStatus('ib', 'connected');
          } else {
            throw new Error('Gateway unavailable');
          }
        } catch {
          setConnectionStatus(prev => ({ ...prev, [brokerId]: 'configured' }));
          setConnectionMessage(prev => ({ ...prev, [brokerId]: 'Configuration saved. Start gateway: cd gateway && npm run dev' }));
        }
      } else if (brokerId === 'tradovate') {
        // Real Tradovate connection
        if (!config.apiKey || !config.apiSecret) {
          throw new Error('API Key and API Secret are required');
        }
        const auth = new TradovateAuth('demo');
        const tokenResp = await auth.authenticate({
          name: config.apiKey,
          password: config.apiSecret,
          ...(config.cid ? { cid: parseInt(config.cid, 10) } : {}),
          ...(config.sec ? { sec: config.sec } : {}),
        });
        const client = new TradovateClient(auth);
        const accounts = await client.getAccounts();
        const balances = await client.getCashBalances();
        const totalBalance = balances.reduce((sum, b) => sum + b.amount, 0);
        auth.disconnect();
        setConnectionStatus(prev => ({ ...prev, [brokerId]: 'connected' }));
        setConnectionMessage(prev => ({
          ...prev,
          [brokerId]: `Connected as ${tokenResp.name} — ${accounts.length} account(s), balance: $${totalBalance.toLocaleString()}`,
        }));
      } else if (['rithmic', 'ninja', 'cqg'].includes(brokerId)) {
        await new Promise(r => setTimeout(r, 1000));
        setConnectionStatus(prev => ({ ...prev, [brokerId]: 'configured' }));
        setConnectionMessage(prev => ({ ...prev, [brokerId]: 'Configuration saved — local gateway required for live connection' }));
      } else {
        // Crypto brokers (binance, bybit, deribit) — save config
        await new Promise(r => setTimeout(r, 500));
        setConnectionStatus(prev => ({ ...prev, [brokerId]: 'configured' }));
        setConnectionMessage(prev => ({ ...prev, [brokerId]: 'API credentials saved — real-time trading integration coming soon' }));
      }
    } catch (error: any) {
      setConnectionStatus(prev => ({ ...prev, [brokerId]: 'error' }));
      setConnectionMessage(prev => ({ ...prev, [brokerId]: `Error: ${error.message}` }));
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <div className="animate-spin rounded-full h-8 w-8 border-t-2" style={{ borderColor: 'var(--primary)' }} />
      </div>
    );
  }

  if (!session) return null;

  const tierStyles: Record<string, React.CSSProperties> = {
    FREE: { color: 'var(--text-muted)', background: 'var(--surface-elevated)' },
    ULTRA: { color: 'var(--accent, #c084fc)', background: 'var(--accent-bg, rgba(168, 85, 247, 0.2))' },
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--surface-elevated)',
    border: '1px solid var(--border-light)',
    color: 'var(--text-primary)',
  };

  return (
    <div className="min-h-screen overflow-y-auto animate-fadeIn" style={{ background: 'var(--background)' }}>
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/live" className="text-xl font-bold" style={{ color: 'var(--primary-light)' }}>
              SENZOUKRIA
            </Link>
            <span className="text-xs px-2 py-1 rounded-full font-medium"
              style={tierStyles[session.user.tier as keyof typeof tierStyles] || tierStyles.FREE}>
              {session.user.tier === 'ULTRA' ? 'SENULTRA' : 'FREE'}
            </span>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:bg-[var(--error)]/15 active:scale-95"
            style={{ color: 'var(--error)', border: '1px solid var(--error)', opacity: 0.8 }}
          >
            <LogOutIcon size={16} />
            {t('account.signOut')}
          </button>
        </div>

        {success && (
          <div className="mb-6 p-4 rounded-lg" style={{ background: 'var(--success-bg)', border: '1px solid var(--success)', color: 'var(--success)' }}>
            Payment successful! Your subscription is now active.
          </div>
        )}

        <div className="flex gap-8">
          {/* Sidebar Navigation */}
          <nav className="w-48 flex-shrink-0">
            <div className="space-y-1">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-all text-left"
                    style={{
                      background: isActive ? 'var(--surface-elevated)' : 'transparent',
                      color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                    }}
                  >
                    <Icon size={15} color={isActive ? 'var(--primary)' : 'currentColor'} />
                    {t(tab.labelKey)}
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Main Content */}
          <div className="flex-1 space-y-6 min-w-0">
            <div className="animate-fadeIn" key={activeTab}>

            {/* ===== PROFILE TAB ===== */}
            {activeTab === 'profile' && (
              <>
                <SectionCard title={t('account.personalInfo')}>
                  <div className="space-y-0">
                    <SettingRow label={t('account.avatar')}>
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                        style={{ background: 'var(--primary-dark)', color: 'var(--primary-foreground, #fff)' }}>
                        {(session.user.name || session.user.email || 'U')[0].toUpperCase()}
                      </div>
                    </SettingRow>
                    <SettingRow label={t('account.email')}>
                      <span className="text-sm font-mono" style={{ color: 'var(--text-secondary)' }}>{session.user.email}</span>
                    </SettingRow>
                    <SettingRow label={t('account.name')}>
                      <input
                        type="text"
                        value={profileName}
                        onChange={e => setProfileName(e.target.value)}
                        placeholder="Your name"
                        className="px-3 py-1.5 rounded-lg text-sm w-48 focus:outline-none"
                        style={inputStyle}
                      />
                    </SettingRow>
                    <SettingRow label={t('account.displayName')} description="Visible in journal and sessions">
                      <input
                        type="text"
                        value={profileDisplayName}
                        onChange={e => setProfileDisplayName(e.target.value)}
                        placeholder="Trader123"
                        className="px-3 py-1.5 rounded-lg text-sm w-48 focus:outline-none"
                        style={inputStyle}
                      />
                    </SettingRow>
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <button
                      onClick={handleSaveProfile}
                      disabled={profileSaving}
                      className="px-5 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                      style={{ background: 'var(--primary)', color: 'var(--primary-foreground, #000)' }}
                    >
                      {profileSaving ? t('common.loading') : t('account.saveProfile')}
                    </button>
                    {profileSaved && (
                      <span className="text-xs font-medium" style={{ color: 'var(--success)' }}>
                        &#10003; {t('account.savedSuccess')}
                      </span>
                    )}
                  </div>
                </SectionCard>

                <SectionCard title={t('account.subscription')}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <span className="inline-block px-3 py-1 rounded-full text-sm font-medium"
                        style={tierStyles[session.user.tier as keyof typeof tierStyles] || tierStyles.FREE}>
                        {session.user.tier === 'ULTRA' ? 'SENULTRA' : 'Free Plan'}
                      </span>
                      {session.user.tier === 'ULTRA' && (
                        <span className="text-xs ml-3" style={{ color: 'var(--text-muted)' }}>$29/mo</span>
                      )}
                    </div>
                  </div>
                  {session.user.tier === 'FREE' ? (
                    <Link href="/pricing"
                      className="block w-full py-3 text-center font-semibold rounded-lg transition-colors"
                      style={{ background: 'var(--primary)', color: 'var(--primary-foreground, #fff)' }}>
                      {t('account.upgradeTo')}
                    </Link>
                  ) : (
                    <button onClick={handleManageSubscription} disabled={isLoading}
                      className="w-full py-3 rounded-lg transition-colors disabled:opacity-50 text-sm font-medium"
                      style={{ background: 'var(--surface-elevated)', color: 'var(--text-primary)' }}>
                      {isLoading ? t('common.loading') : t('account.manageSubscription')}
                    </button>
                  )}
                </SectionCard>
              </>
            )}

            {/* ===== PREFERENCES TAB ===== */}
            {activeTab === 'preferences' && (
              <>
                <SectionCard title="General">
                  <div className="space-y-0">
                    <SettingRow label={t('account.language')} description="Interface language">
                      <select value={prefs.language} onChange={e => prefs.setLanguage(e.target.value as SupportedLanguage)}
                        className="px-3 py-1.5 rounded-lg text-sm focus:outline-none" style={inputStyle}>
                        <option value="en">English</option>
                        <option value="fr">Français</option>
                        <option value="es">Español</option>
                        <option value="de">Deutsch</option>
                        <option value="ar">العربية</option>
                      </select>
                    </SettingRow>
                    <SettingRow label={t('account.timezone')}>
                      <select value={prefs.timezone} onChange={e => prefs.setTimezone(e.target.value)}
                        className="px-3 py-1.5 rounded-lg text-sm focus:outline-none" style={inputStyle}>
                        <option value="America/New_York">New York (EST)</option>
                        <option value="America/Chicago">Chicago (CST)</option>
                        <option value="America/Los_Angeles">Los Angeles (PST)</option>
                        <option value="Europe/London">London (GMT)</option>
                        <option value="Europe/Paris">Europe/Paris (CET)</option>
                        <option value="Asia/Tokyo">Tokyo (JST)</option>
                        <option value="Asia/Shanghai">Shanghai (CST)</option>
                        <option value="UTC">UTC</option>
                      </select>
                    </SettingRow>
                    <SettingRow label={t('account.compactMode')} description="Reduce UI spacing">
                      <Toggle checked={prefs.compactMode} onChange={prefs.setCompactMode} />
                    </SettingRow>
                    <SettingRow label={t('account.sounds')} description={t('account.soundsDesc')}>
                      <Toggle checked={prefs.soundEnabled} onChange={prefs.setSoundEnabled} />
                    </SettingRow>
                    <SettingRow label={t('account.alertSound')} description="Sound type for order fills">
                      <select
                        value={prefs.alertSound}
                        onChange={e => prefs.setAlertSound(e.target.value as 'beep' | 'voice_male' | 'voice_female' | 'voice_senzoukria' | 'none')}
                        className="px-3 py-1.5 rounded-lg text-sm focus:outline-none"
                        style={{ ...inputStyle, opacity: prefs.soundEnabled ? 1 : 0.4 }}
                        disabled={!prefs.soundEnabled}
                      >
                        <option value="beep">{t('account.alertBeep')}</option>
                        <option value="voice_male">{t('account.alertVoiceMale')}</option>
                        <option value="voice_female">{t('account.alertVoiceFemale')}</option>
                        <option value="voice_senzoukria">{t('account.alertVoiceSenzoukria')}</option>
                        <option value="none">{t('account.alertNone')}</option>
                      </select>
                    </SettingRow>
                  </div>
                </SectionCard>

                <SectionCard title="Default Charts">
                  <div className="space-y-0">
                    <SettingRow label={t('account.defaultSymbol')}>
                      <select value={prefs.defaultSymbol} onChange={e => prefs.setDefaultSymbol(e.target.value)}
                        className="px-3 py-1.5 rounded-lg text-sm focus:outline-none" style={inputStyle}>
                        <option value="BTCUSDT">BTC/USDT</option>
                        <option value="ETHUSDT">ETH/USDT</option>
                        <option value="ES">ES (S&P 500)</option>
                        <option value="NQ">NQ (Nasdaq)</option>
                        <option value="YM">YM (Dow Jones)</option>
                        <option value="CL">CL (Crude Oil)</option>
                        <option value="GC">GC (Gold)</option>
                      </select>
                    </SettingRow>
                    <SettingRow label={t('account.defaultTimeframe')}>
                      <select value={prefs.defaultTimeframe} onChange={e => prefs.setDefaultTimeframe(e.target.value)}
                        className="px-3 py-1.5 rounded-lg text-sm focus:outline-none" style={inputStyle}>
                        <option value="1m">1 minute</option>
                        <option value="5m">5 minutes</option>
                        <option value="15m">15 minutes</option>
                        <option value="1h">1 hour</option>
                        <option value="4h">4 hours</option>
                        <option value="1d">1 day</option>
                      </select>
                    </SettingRow>
                    <SettingRow label={t('account.autoConnect')} description="Automatically connect on startup">
                      <Toggle checked={prefs.autoConnect} onChange={prefs.setAutoConnect} />
                    </SettingRow>
                  </div>
                </SectionCard>

                <SectionCard title={t('account.theme')}>
                  <div className="grid grid-cols-2 gap-3">
                    {UI_THEMES.map((theme) => (
                      <button
                        key={theme.id}
                        onClick={() => setTheme(theme.id)}
                        className="flex items-center gap-3 p-3 rounded-lg transition-all text-left"
                        style={{
                          background: activeTheme === theme.id ? 'var(--surface-elevated)' : 'transparent',
                          border: `1px solid ${activeTheme === theme.id ? 'var(--primary)' : 'var(--border)'}`,
                        }}
                      >
                        <div className="flex gap-1">
                          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: theme.preview.bg, border: '1px solid rgba(255,255,255,0.1)' }} />
                          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: theme.preview.primary }} />
                          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: theme.preview.accent }} />
                        </div>
                        <div>
                          <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{theme.name}</div>
                          <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{theme.description}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </SectionCard>
              </>
            )}

            {/* ===== CONNECTIONS TAB ===== */}
            {activeTab === 'connections' && (
              <>
                <SectionCard title="Brokers & Data Feeds">
                  <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                    Connect your broker accounts for live trading and real-time data.
                  </p>
                  <div className="space-y-2">
                    {BROKER_CONNECTIONS.map((broker) => {
                      const Icon = broker.icon;
                      const isExpanded = expandedBroker === broker.id;
                      return (
                        <div key={broker.id} className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                          <button
                            onClick={() => setExpandedBroker(isExpanded ? null : broker.id)}
                            className="w-full flex items-center gap-3 p-4 transition-colors text-left"
                            style={{ background: isExpanded ? 'var(--surface-elevated)' : 'transparent' }}
                          >
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                              style={{ background: `${broker.color}15` }}>
                              <Icon size={18} color={broker.color} />
                            </div>
                            <div className="flex-1">
                              <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{broker.name}</div>
                              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{broker.description}</div>
                            </div>
                            <span className="text-xs px-2 py-1 rounded-full"
                              style={
                                connectionStatus[broker.id] === 'connected'
                                  ? { background: 'var(--success-bg)', color: 'var(--success)' }
                                  : connectionStatus[broker.id] === 'configured'
                                  ? { background: 'var(--info-bg)', color: 'var(--info)' }
                                  : { background: 'var(--surface-elevated)', color: 'var(--text-muted)' }
                              }>
                              {connectionStatus[broker.id] === 'connected' ? 'Connected'
                                : connectionStatus[broker.id] === 'configured' ? 'Configured'
                                : connectionStatus[broker.id] === 'testing' ? 'Testing...'
                                : connectionStatus[broker.id] === 'connecting' ? 'Connecting...'
                                : 'Not configured'}
                            </span>
                          </button>
                          {isExpanded && (
                            <div className="px-4 pb-4 pt-2 space-y-3" style={{ borderTop: '1px solid var(--border)' }}>
                              {broker.fields.map((field) => (
                                <div key={field.key}>
                                  <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{field.label}</label>
                                  <input
                                    type={field.type}
                                    placeholder={field.placeholder}
                                    value={brokerFields[broker.id]?.[field.key] || ''}
                                    onChange={e => setBrokerFields(prev => ({
                                      ...prev,
                                      [broker.id]: { ...prev[broker.id], [field.key]: e.target.value },
                                    }))}
                                    className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                                    style={inputStyle}
                                  />
                                </div>
                              ))}
                              <div className="flex gap-2 pt-2">
                                <button
                                  onClick={() => handleConnect(broker.id)}
                                  disabled={connectionStatus[broker.id] === 'connecting'}
                                  className="flex-1 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                                  style={{ background: 'var(--primary)', color: 'var(--primary-foreground, #fff)' }}>
                                  {connectionStatus[broker.id] === 'connecting' ? 'Connecting...' : 'Connect'}
                                </button>
                                <button
                                  onClick={() => handleTestConnection(broker.id)}
                                  disabled={connectionStatus[broker.id] === 'testing'}
                                  className="px-4 py-2 rounded-lg text-xs transition-colors disabled:opacity-50"
                                  style={{ background: 'var(--surface-elevated)', color: 'var(--text-muted)' }}>
                                  {connectionStatus[broker.id] === 'testing' ? 'Testing...' : 'Test'}
                                </button>
                              </div>
                              {connectionMessage[broker.id] && (
                                <div className="mt-2 px-3 py-2 rounded-lg text-xs"
                                  style={{
                                    backgroundColor:
                                      connectionStatus[broker.id] === 'connected' ? 'var(--success-bg)' :
                                      connectionStatus[broker.id] === 'configured' ? 'var(--info-bg)' :
                                      'var(--error-bg)',
                                    color:
                                      connectionStatus[broker.id] === 'connected' ? 'var(--success)' :
                                      connectionStatus[broker.id] === 'configured' ? 'var(--info)' :
                                      'var(--error)',
                                    border: `1px solid ${
                                      connectionStatus[broker.id] === 'connected' ? 'var(--success)' :
                                      connectionStatus[broker.id] === 'configured' ? 'var(--info)' :
                                      'var(--error)'}`,
                                  }}>
                                  {connectionMessage[broker.id]}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>

                <SectionCard title="API Keys">
                  <SettingRow label="Senzoukria API Key" description="Access the API from external scripts">
                    <div className="flex items-center gap-2">
                      <code className="text-xs px-2 py-1 rounded font-mono"
                        style={{ background: 'var(--surface-elevated)', color: 'var(--text-secondary)' }}>
                        {showApiKey ? 'sk-sen-xxxx-xxxx-xxxx' : '••••••••••••'}
                      </code>
                      <button onClick={() => setShowApiKey(!showApiKey)}
                        className="text-xs px-2 py-1 rounded transition-colors"
                        style={{ color: 'var(--primary)' }}>
                        {showApiKey ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </SettingRow>
                </SectionCard>
              </>
            )}

            {/* ===== SECURITY TAB ===== */}
            {activeTab === 'security' && (
              <>
                <SectionCard title="Authentication">
                  <div className="space-y-0">
                    <SettingRow label="Password" description="Last changed: never">
                      <button className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                        style={{ background: 'var(--surface-elevated)', color: 'var(--text-primary)' }}>
                        Change
                      </button>
                    </SettingRow>
                    <SettingRow label="Two-Factor Authentication" description="Secure your account with TOTP">
                      <Toggle checked={prefs.twoFA} onChange={prefs.setTwoFA} />
                    </SettingRow>
                    <SettingRow label="Biometric Login" description="Face ID / fingerprint">
                      <Toggle checked={false} onChange={() => {}} />
                    </SettingRow>
                  </div>
                </SectionCard>

                <SectionCard title="Active Sessions">
                  <div className="space-y-3">
                    {[
                      { device: 'Windows - Chrome', location: 'Paris, France', current: true, last: 'Now' },
                      { device: 'iPhone - Safari', location: 'Paris, France', current: false, last: '2h ago' },
                    ].map((s, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg"
                        style={{ background: 'var(--surface-elevated)' }}>
                        <div>
                          <div className="text-sm flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                            {s.device}
                            {s.current && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                                style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
                                Active
                              </span>
                            )}
                          </div>
                          <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {s.location} &middot; {s.last}
                          </div>
                        </div>
                        {!s.current && (
                          <button className="text-xs px-2 py-1 rounded transition-colors"
                            style={{ color: 'var(--error)' }}>
                            Revoke
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </SectionCard>

                <SectionCard title="Limits">
                  <SettingRow label="Connected Devices">
                    <span className="text-sm font-mono" style={{ color: 'var(--text-secondary)' }}>
                      2 / {session.user.tier === 'ULTRA' ? '5' : '2'}
                    </span>
                  </SettingRow>
                  <SettingRow label="API Requests / day">
                    <span className="text-sm font-mono" style={{ color: 'var(--text-secondary)' }}>
                      {session.user.tier === 'ULTRA' ? 'Unlimited' : '1,000'}
                    </span>
                  </SettingRow>
                </SectionCard>
              </>
            )}

            {/* ===== NOTIFICATIONS TAB ===== */}
            {activeTab === 'notifications' && (
              <>
                <SectionCard title="Trading Alerts">
                  <div className="space-y-0">
                    <SettingRow label="Trade Execution" description="Notification when a trade is executed">
                      <Toggle checked={prefs.notifyTrades} onChange={prefs.setNotifyTrades} />
                    </SettingRow>
                    <SettingRow label="Price Alerts" description="When a price level is hit">
                      <Toggle checked={prefs.notifyAlerts} onChange={prefs.setNotifyAlerts} />
                    </SettingRow>
                    <SettingRow label="Market News" description="Breaking news and macro events">
                      <Toggle checked={prefs.notifyNews} onChange={prefs.setNotifyNews} />
                    </SettingRow>
                  </div>
                </SectionCard>

                <SectionCard title="Platform">
                  <div className="space-y-0">
                    <SettingRow label="Updates" description="New features and changelog">
                      <Toggle checked={prefs.notifyUpdates} onChange={prefs.setNotifyUpdates} />
                    </SettingRow>
                    <SettingRow label="Email Notifications">
                      <Toggle checked={prefs.notifyEmail} onChange={prefs.setNotifyEmail} />
                    </SettingRow>
                    <SettingRow label="Push Notifications">
                      <Toggle checked={prefs.notifyPush} onChange={prefs.setNotifyPush} />
                    </SettingRow>
                  </div>
                </SectionCard>
              </>
            )}

            {/* ===== DATA TAB ===== */}
            {activeTab === 'data' && (
              <>
                <SectionCard title="Local Storage">
                  <div className="space-y-0">
                    <SettingRow label="Chart Cache" description="Cached historical data">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>24 MB</span>
                        <button className="text-xs px-2 py-1 rounded transition-colors"
                          style={{ color: 'var(--error)' }}
                          onClick={() => { if (typeof window !== 'undefined') { localStorage.clear(); location.reload(); } }}>
                          Clear
                        </button>
                      </div>
                    </SettingRow>
                    <SettingRow label="Saved Settings" description="Zustand stores + preferences">
                      <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>8 stores</span>
                    </SettingRow>
                    <SettingRow label="Trading Journal" description="Locally stored trades">
                      <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>SQLite</span>
                    </SettingRow>
                  </div>
                </SectionCard>

                <SectionCard title="Import / Export">
                  <div className="grid grid-cols-2 gap-3">
                    <button className="py-3 rounded-lg text-sm font-medium transition-colors"
                      style={{ background: 'var(--surface-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                      Export Settings
                    </button>
                    <button className="py-3 rounded-lg text-sm font-medium transition-colors"
                      style={{ background: 'var(--surface-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                      Import Settings
                    </button>
                    <button className="py-3 rounded-lg text-sm font-medium transition-colors"
                      style={{ background: 'var(--surface-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                      Export Journal (CSV)
                    </button>
                    <button className="py-3 rounded-lg text-sm font-medium transition-colors"
                      style={{ background: 'var(--surface-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                      Export Journal (JSON)
                    </button>
                  </div>
                </SectionCard>

                <SectionCard title="Danger Zone">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--error-bg)', border: '1px solid var(--error)' }}>
                      <div>
                        <div className="text-sm font-medium" style={{ color: 'var(--error)' }}>Reset Everything</div>
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Deletes all local settings</div>
                      </div>
                      <button className="text-xs px-3 py-1.5 rounded-lg font-medium"
                        style={{ background: 'var(--error-bg)', color: 'var(--error)', border: '1px solid var(--error)' }}>
                        Reset
                      </button>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--error-bg)', border: '1px solid var(--error)' }}>
                      <div>
                        <div className="text-sm font-medium" style={{ color: 'var(--error)' }}>Delete Account</div>
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Irreversible action</div>
                      </div>
                      <button className="text-xs px-3 py-1.5 rounded-lg font-medium"
                        style={{ background: 'var(--error-bg)', color: 'var(--error)', border: '1px solid var(--error)' }}>
                        Delete
                      </button>
                    </div>
                  </div>
                </SectionCard>
              </>
            )}

            {/* ===== SUPPORT TAB ===== */}
            {activeTab === 'support' && (
              <>
                <SectionCard title="Contact Support">
                  <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                    Direct email: <a href="mailto:ryad.bouderga78@gmail.com" style={{ color: 'var(--primary-light)' }}>ryad.bouderga78@gmail.com</a>
                  </p>

                  {submitSuccess && (
                    <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
                      Ticket submitted! We&apos;ll respond within 24-48h.
                    </div>
                  )}

                  <form onSubmit={handleSubmitTicket} className="space-y-4">
                    <div>
                      <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Category</label>
                      <select value={category} onChange={e => setCategory(e.target.value as TicketCategory)}
                        className="w-full px-4 py-3 rounded-lg text-sm focus:outline-none" style={inputStyle}>
                        <option value="TECHNICAL">Technical Issue</option>
                        <option value="BILLING">Billing</option>
                        <option value="ACCOUNT">My Account</option>
                        <option value="FEATURE_REQUEST">Feature Request</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Subject</label>
                      <input type="text" value={subject} onChange={e => setSubject(e.target.value)}
                        className="w-full px-4 py-3 rounded-lg text-sm focus:outline-none" style={inputStyle}
                        placeholder="Brief summary of your request" required />
                    </div>
                    <div>
                      <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Message</label>
                      <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4}
                        className="w-full px-4 py-3 rounded-lg text-sm focus:outline-none resize-none" style={inputStyle}
                        placeholder="Describe your issue in detail..." required />
                    </div>
                    <button type="submit" disabled={isLoading}
                      className="w-full py-3 font-semibold rounded-lg transition-colors disabled:opacity-50 text-sm"
                      style={{ background: 'var(--primary)', color: 'var(--primary-foreground, #fff)' }}>
                      {isLoading ? 'Sending...' : 'Submit'}
                    </button>
                  </form>
                </SectionCard>

                {tickets.length > 0 && (
                  <SectionCard title="My Tickets">
                    <div className="space-y-3">
                      {tickets.map((ticket) => (
                        <div key={ticket.id} className="p-4 rounded-lg" style={{ background: 'var(--surface-elevated)' }}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{ticket.subject}</span>
                            <span className="text-xs px-2 py-1 rounded"
                              style={
                                ticket.status === 'RESOLVED' ? { background: 'var(--success-bg)', color: 'var(--success)' } :
                                ticket.status === 'IN_PROGRESS' ? { background: 'var(--warning-bg)', color: 'var(--warning)' } :
                                { background: 'var(--surface-hover)', color: 'var(--text-muted)' }
                              }>
                              {ticket.status === 'OPEN' ? 'Open' :
                               ticket.status === 'IN_PROGRESS' ? 'In Progress' :
                               ticket.status === 'RESOLVED' ? 'Resolved' : 'Closed'}
                            </span>
                          </div>
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {new Date(ticket.createdAt).toLocaleDateString('en-US')}
                          </p>
                          {ticket.response && (
                            <div className="mt-3 p-3 rounded text-sm" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
                              <strong>Response:</strong> {ticket.response}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                )}
              </>
            )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <div className="animate-spin rounded-full h-8 w-8 border-t-2" style={{ borderColor: 'var(--primary)' }} />
      </div>
    }>
      <AccountContent />
    </Suspense>
  );
}
