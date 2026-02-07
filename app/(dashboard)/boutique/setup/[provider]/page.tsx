'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useDataFeedStore } from '@/stores/useDataFeedStore';
import type { DataFeedProvider } from '@/stores/useDataFeedStore';

// Provider-specific config
const PROVIDER_INFO: Record<string, {
  name: string;
  color: string;
  signupUrl: string;
  prerequisites: string[];
  dataGuide: string[];
  fields: { key: string; label: string; placeholder: string; type?: string }[];
  defaultPort: number;
}> = {
  ib: {
    name: 'Interactive Brokers',
    color: '#e31937',
    signupUrl: 'https://www.interactivebrokers.com',
    prerequisites: [
      'Create an Interactive Brokers account',
      'Fund your account (minimum varies by region)',
      'Subscribe to market data in Account Management',
      'Download and install TWS or IB Gateway',
    ],
    dataGuide: [
      'Log into IBKR Account Management',
      'Go to Settings → Market Data Subscriptions',
      'Subscribe to: US Securities Snapshot & Futures Value Bundle',
      'Enable API access in TWS: Edit → Global Configuration → API → Settings',
      'Check "Enable ActiveX and Socket Clients"',
      'Note the Socket port (default: 7497 for TWS, 4001 for Gateway)',
    ],
    fields: [
      { key: 'host', label: 'TWS/Gateway Host', placeholder: '127.0.0.1' },
      { key: 'port', label: 'Socket Port', placeholder: '4001', type: 'number' },
      { key: 'username', label: 'Client ID', placeholder: '1' },
    ],
    defaultPort: 4001,
  },
  dxfeed: {
    name: 'dxFeed',
    color: '#2563eb',
    signupUrl: 'https://www.dxfeed.com',
    prerequisites: [
      'Create a dxFeed account',
      'Subscribe to a market data plan',
      'Obtain your API credentials from the dashboard',
    ],
    dataGuide: [
      'Log into your dxFeed dashboard',
      'Navigate to API Access section',
      'Generate a new API token',
      'Note your connection endpoint URL',
    ],
    fields: [
      { key: 'host', label: 'Endpoint URL', placeholder: 'demo.dxfeed.com' },
      { key: 'port', label: 'Port', placeholder: '7300', type: 'number' },
      { key: 'apiKey', label: 'API Token', placeholder: 'Your dxFeed API token' },
    ],
    defaultPort: 7300,
  },
  rithmic: {
    name: 'Rithmic',
    color: '#22c55e',
    signupUrl: 'https://www.rithmic.com',
    prerequisites: [
      'Open an account with a Rithmic-compatible broker (e.g., AMP, Optimus)',
      'Subscribe to CME market data through your broker',
      'Request Rithmic API credentials from your broker',
    ],
    dataGuide: [
      'Contact your broker for Rithmic credentials',
      'You will receive: username, password, and system name',
      'Market data subscriptions are managed by your broker',
      'Ensure your account has the required exchange permissions',
    ],
    fields: [
      { key: 'host', label: 'Server', placeholder: 'rithmic_server_url' },
      { key: 'port', label: 'Port', placeholder: '443', type: 'number' },
      { key: 'username', label: 'Username', placeholder: 'Your Rithmic username' },
      { key: 'apiKey', label: 'Password', placeholder: 'Your Rithmic password' },
    ],
    defaultPort: 443,
  },
  amp: {
    name: 'AMP Futures',
    color: '#8b5cf6',
    signupUrl: 'https://www.ampfutures.com',
    prerequisites: [
      'Open an AMP Futures trading account',
      'Fund your account (minimum $100)',
      'CME data is included with your account',
    ],
    dataGuide: [
      'Log into your AMP Futures client portal',
      'Navigate to Platform Connections',
      'Select "SENZOUKRIA" as your platform (or use API access)',
      'Your credentials will be generated automatically',
    ],
    fields: [
      { key: 'host', label: 'Server', placeholder: 'amp_server_url' },
      { key: 'port', label: 'Port', placeholder: '443', type: 'number' },
      { key: 'username', label: 'Username', placeholder: 'Your AMP username' },
      { key: 'apiKey', label: 'API Key', placeholder: 'Your AMP API key' },
    ],
    defaultPort: 443,
  },
};

const STEPS = ['Prerequisites', 'Data Subscriptions', 'Connection', 'Confirmation'];

export default function SetupProviderPage() {
  const params = useParams();
  const router = useRouter();
  const providerId = params.provider as string;
  const provider = PROVIDER_INFO[providerId];
  const { setConfig, updateStatus } = useDataFeedStore();

  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [testError, setTestError] = useState('');
  const [checklist, setChecklist] = useState<boolean[]>([]);

  if (!provider) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <div className="text-center">
          <p style={{ color: 'var(--text-muted)' }}>Provider not found</p>
          <Link href="/boutique" className="mt-4 inline-block text-sm" style={{ color: 'var(--primary-light)' }}>
            Back to Marketplace
          </Link>
        </div>
      </div>
    );
  }

  // Initialize checklist
  if (checklist.length === 0 && provider.prerequisites.length > 0) {
    setChecklist(new Array(provider.prerequisites.length).fill(false));
  }

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setTestError('');

    try {
      const res = await fetch('/api/datafeed/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: providerId,
          host: formData.host || '',
          port: parseInt(formData.port || String(provider.defaultPort)),
          username: formData.username || '',
          apiKey: formData.apiKey || '',
        }),
      });

      const data = await res.json();
      if (data.success) {
        setTestResult('success');
      } else {
        setTestResult('error');
        setTestError(data.error || 'Connection failed');
      }
    } catch {
      setTestResult('error');
      setTestError('Network error - could not reach server');
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConfig = () => {
    setConfig(providerId as DataFeedProvider, {
      status: testResult === 'success' ? 'connected' : 'configured',
      host: formData.host,
      port: parseInt(formData.port || String(provider.defaultPort)),
      username: formData.username,
      apiKey: formData.apiKey,
    });

    if (testResult === 'success') {
      updateStatus(providerId as DataFeedProvider, 'connected');
    }

    router.push('/boutique');
  };

  return (
    <div className="h-full overflow-auto p-6" style={{ background: 'var(--background)' }}>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/boutique" className="text-sm" style={{ color: 'var(--text-muted)' }}>
            ← Back
          </Link>
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: provider.color }}
            >
              {provider.name[0]}
            </div>
            <div>
              <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                Setup {provider.name}
              </h1>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Step {step + 1} of {STEPS.length}
              </p>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="flex gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex-1">
              <div
                className="h-1.5 rounded-full transition-colors"
                style={{
                  backgroundColor: i <= step ? provider.color : 'var(--surface-elevated)',
                }}
              />
              <p className="text-[10px] mt-1" style={{ color: i <= step ? 'var(--text-secondary)' : 'var(--text-dimmed)' }}>
                {s}
              </p>
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="rounded-xl p-6 mb-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {step === 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Prerequisites</h2>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                Before configuring {provider.name}, ensure you have completed the following:
              </p>
              <div className="space-y-3">
                {provider.prerequisites.map((prereq, i) => (
                  <label key={i} className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={checklist[i] || false}
                      onChange={() => {
                        const newChecklist = [...checklist];
                        newChecklist[i] = !newChecklist[i];
                        setChecklist(newChecklist);
                      }}
                      className="mt-0.5 w-4 h-4 rounded accent-current"
                      style={{ accentColor: provider.color }}
                    />
                    <span className="text-sm" style={{ color: checklist[i] ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      {prereq}
                    </span>
                  </label>
                ))}
              </div>
              <a
                href={provider.signupUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-6 text-sm font-medium"
                style={{ color: provider.color }}
              >
                Open {provider.name} website →
              </a>
            </div>
          )}

          {step === 1 && (
            <div>
              <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Data Subscriptions</h2>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                Follow these steps to activate your market data:
              </p>
              <ol className="space-y-4">
                {provider.dataGuide.map((step_text, i) => (
                  <li key={i} className="flex gap-3">
                    <span
                      className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ backgroundColor: provider.color }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-sm pt-0.5" style={{ color: 'var(--text-secondary)' }}>{step_text}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Connection Configuration</h2>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                Enter your {provider.name} connection details:
              </p>
              <div className="space-y-4">
                {provider.fields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-sm mb-1.5" style={{ color: 'var(--text-muted)' }}>{field.label}</label>
                    <input
                      type={field.type || 'text'}
                      value={formData[field.key] || ''}
                      onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                      placeholder={field.placeholder}
                      className="w-full px-4 py-2.5 rounded-lg text-sm focus:outline-none"
                      style={{
                        background: 'var(--surface-elevated)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>
                ))}
              </div>

              <button
                onClick={handleTestConnection}
                disabled={testing}
                className="mt-6 px-6 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-50"
                style={{ backgroundColor: provider.color }}
              >
                {testing ? 'Testing...' : 'Test Connection'}
              </button>

              {testResult === 'success' && (
                <div className="mt-4 p-3 rounded-lg text-sm" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
                  Connection successful!
                </div>
              )}
              {testResult === 'error' && (
                <div className="mt-4 p-3 rounded-lg text-sm" style={{ background: 'var(--error-bg)', color: 'var(--error)' }}>
                  {testError}
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="text-center py-6">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ backgroundColor: testResult === 'success' ? 'var(--success-bg)' : 'var(--surface-elevated)' }}
              >
                <span className="text-2xl">
                  {testResult === 'success' ? '✓' : '⚙'}
                </span>
              </div>
              <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                {testResult === 'success' ? 'Connected!' : 'Configuration Saved'}
              </h2>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                {testResult === 'success'
                  ? `${provider.name} is connected and ready to stream data.`
                  : `Your ${provider.name} configuration has been saved. You can test the connection later.`}
              </p>
              <button
                onClick={handleSaveConfig}
                className="px-8 py-3 rounded-lg text-sm font-medium text-white"
                style={{ backgroundColor: provider.color }}
              >
                Finish Setup
              </button>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between">
          <button
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
            className="px-4 py-2 rounded-lg text-sm transition-opacity disabled:opacity-30"
            style={{ color: 'var(--text-muted)', background: 'var(--surface)' }}
          >
            Previous
          </button>
          {step < STEPS.length - 1 && (
            <button
              onClick={() => setStep(step + 1)}
              className="px-6 py-2 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: provider.color }}
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
