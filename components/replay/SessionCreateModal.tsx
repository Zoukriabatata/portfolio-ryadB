'use client';

import { useState } from 'react';
import type { RecordingExchange } from '@/lib/replay/ReplayRecorder';

interface SessionCreateModalProps {
  onClose: () => void;
  onStart: (config: SessionConfig) => void;
}

export interface SessionConfig {
  symbol: string;
  exchange: RecordingExchange;
  name: string;
  description: string;
  initialBalance: number;
  tags: string[];
}

const EXCHANGE_OPTIONS: { id: RecordingExchange; name: string; color: string; symbols: string[] }[] = [
  {
    id: 'ib',
    name: 'CME Futures (IB)',
    color: '#e44d26',
    symbols: ['ES', 'MES', 'NQ', 'MNQ', 'YM', 'MYM', 'RTY', 'M2K', 'CL', 'MCL', 'GC', 'MGC', 'ZB', 'ZN', '6E', '6J'],
  },
  {
    id: 'binance',
    name: 'Binance Futures',
    color: '#F0B90B',
    symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ARBUSDT', 'SUIUSDT'],
  },
  {
    id: 'bybit',
    name: 'Bybit',
    color: '#FFAB00',
    symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'AVAXUSDT', 'LINKUSDT'],
  },
  {
    id: 'deribit',
    name: 'Deribit Options',
    color: '#00D084',
    symbols: ['BTC-PERPETUAL', 'ETH-PERPETUAL'],
  },
];

export default function SessionCreateModal({ onClose, onStart }: SessionCreateModalProps) {
  const [exchange, setExchange] = useState<RecordingExchange>('binance');
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [sessionName, setSessionName] = useState('');
  const [description, setDescription] = useState('');
  const [balance, setBalance] = useState('100000');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  const activeExchange = EXCHANGE_OPTIONS.find(e => e.id === exchange) || EXCHANGE_OPTIONS[0];

  const handleSubmit = () => {
    if (!symbol) return;
    onStart({
      symbol: symbol.toUpperCase(),
      exchange,
      name: sessionName || `${symbol} Session`,
      description: description || `${symbol} recording`,
      initialBalance: parseFloat(balance) || 100000,
      tags,
    });
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
      setTagInput('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fadeIn"
      onClick={onClose}>
      <div className="w-full max-w-md rounded-xl p-5 animate-scaleIn"
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)' }}>

        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          New Recording Session
        </h3>

        {/* Exchange selector */}
        <div className="mb-4">
          <label className="text-[10px] font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
            Exchange
          </label>
          <div className="grid grid-cols-2 gap-2">
            {EXCHANGE_OPTIONS.map(ex => (
              <button key={ex.id}
                onClick={() => { setExchange(ex.id); setSymbol(ex.symbols[0]); }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all"
                style={{
                  background: exchange === ex.id ? ex.color + '15' : 'var(--background)',
                  border: `1.5px solid ${exchange === ex.id ? ex.color : 'var(--border)'}`,
                  color: exchange === ex.id ? ex.color : 'var(--text-secondary)',
                }}>
                <div className="w-2 h-2 rounded-full" style={{ background: ex.color }} />
                {ex.name}
              </button>
            ))}
          </div>
        </div>

        {/* Symbol selector */}
        <div className="mb-4">
          <label className="text-[10px] font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
            Symbol
          </label>
          <div className="flex flex-wrap gap-1.5">
            {activeExchange.symbols.map(s => (
              <button key={s}
                onClick={() => setSymbol(s)}
                className="px-2 py-1 rounded text-[10px] font-mono transition-all"
                style={{
                  background: symbol === s ? activeExchange.color + '20' : 'var(--background)',
                  border: `1px solid ${symbol === s ? activeExchange.color : 'var(--border)'}`,
                  color: symbol === s ? activeExchange.color : 'var(--text-muted)',
                }}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Session Name */}
        <div className="mb-4">
          <label className="text-[10px] font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
            Session Name
          </label>
          <input type="text" value={sessionName}
            onChange={e => setSessionName(e.target.value)}
            placeholder={`${symbol} Session`}
            className="w-full px-3 py-1.5 rounded-lg text-xs focus:outline-none"
            style={{ background: 'var(--background)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
          />
        </div>

        {/* Description */}
        <div className="mb-4">
          <label className="text-[10px] font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
            Notes (optional)
          </label>
          <input type="text" value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Session focus, strategy, etc."
            className="w-full px-3 py-1.5 rounded-lg text-xs focus:outline-none"
            style={{ background: 'var(--background)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
          />
        </div>

        {/* Initial Balance with presets */}
        <div className="mb-4">
          <label className="text-[10px] font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
            Initial Balance (paper)
          </label>
          <div className="flex gap-1.5 mb-1.5">
            {['10000', '25000', '50000', '100000', '250000'].map(b => (
              <button key={b} onClick={() => setBalance(b)}
                className="flex-1 py-1 rounded text-[9px] font-mono transition-all"
                style={{
                  background: balance === b ? 'var(--primary)' : 'var(--background)',
                  color: balance === b ? '#fff' : 'var(--text-muted)',
                  border: `1px solid ${balance === b ? 'var(--primary)' : 'var(--border)'}`,
                }}>
                ${(parseInt(b) / 1000)}k
              </button>
            ))}
          </div>
          <input type="number" value={balance}
            onChange={e => setBalance(e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg text-xs font-mono focus:outline-none"
            style={{ background: 'var(--background)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
          />
        </div>

        {/* Tags */}
        <div className="mb-4">
          <label className="text-[10px] font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
            Tags
          </label>
          <div className="flex gap-1.5 items-center">
            <input type="text" value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTag()}
              placeholder="Add tag..."
              className="flex-1 px-2 py-1 rounded text-[10px] focus:outline-none"
              style={{ background: 'var(--background)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            />
            <button onClick={addTag} className="px-2 py-1 rounded text-[10px]"
              style={{ background: 'var(--background)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
              +
            </button>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {tags.map(t => (
                <span key={t} className="px-1.5 py-0.5 rounded text-[9px] flex items-center gap-1"
                  style={{ background: 'var(--primary)', color: 'var(--background)' }}>
                  {t}
                  <button onClick={() => setTags(tags.filter(x => x !== t))} className="opacity-60 hover:opacity-100">×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            Cancel
          </button>
          <button onClick={handleSubmit}
            className="px-4 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: 'var(--primary)', color: '#fff' }}>
            Start Recording
          </button>
        </div>
      </div>
    </div>
  );
}
