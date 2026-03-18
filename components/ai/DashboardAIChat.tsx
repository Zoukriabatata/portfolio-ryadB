'use client';

/**
 * DashboardAIChat — panel IA inline intégré dans le dashboard.
 * Même API /api/ai/support mais version embedded (pas floating).
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { renderMessage } from './renderMessage';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  loading?: boolean;
}

const WELCOME = 'Bonjour ! Posez-moi vos questions sur les marchés, la plateforme, ou le Discord 🚀';

const CHIPS = [
  'Qu\'est-ce que le GEX ?',
  'Lien Discord ?',
  'Comment lire le footprint ?',
  'C\'est quoi le skew ?',
  'Explain funding rates',
];

export default function DashboardAIChat() {
  const [messages, setMessages] = useState<Msg[]>([{ role: 'assistant', content: WELCOME }]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const endRef   = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const history = messages.filter(m => !m.loading).slice(-12)
      .map(m => ({ role: m.role, content: m.content }));

    setMessages(prev => [
      ...prev,
      { role: 'user', content: text.trim() },
      { role: 'assistant', content: '', loading: true },
    ]);
    setInput('');
    setLoading(true);
    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/ai/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim(), history }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      let full = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const d = line.slice(6);
          if (d === '[DONE]') break;
          try {
            const { token } = JSON.parse(d) as { token: string };
            full += token;
            setMessages(prev => {
              const copy = [...prev];
              copy[copy.length - 1] = { role: 'assistant', content: full };
              return copy;
            });
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: 'assistant', content: '⚠️ Erreur de connexion.' };
        return copy;
      });
    } finally {
      setLoading(false);
    }
  }, [messages, loading]);

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  return (
    <div
      className="rounded-[10px] border flex flex-col overflow-hidden"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)', minHeight: 340 }}
    >
      {/* ── Header ── */}
      <div
        className="px-4 py-2.5 flex items-center gap-2.5 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.25)' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth={2}>
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3m0 14v3M2 12h3m14 0h3m-2.6-7.4-2.1 2.1M6.7 17.3l-2.1 2.1m0-14.8 2.1 2.1m10.6 10.6 2.1 2.1" />
          </svg>
        </div>
        <div className="flex-1">
          <span className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>
            OrderFlow AI
          </span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full"
          style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)' }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--primary)' }} />
          <span className="text-[9px] font-medium" style={{ color: 'var(--primary)' }}>live</span>
        </div>
        {loading && (
          <button
            onClick={() => abortRef.current?.abort()}
            className="text-[9px] px-2 py-0.5 rounded-full transition-colors"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}
          >
            stop
          </button>
        )}
      </div>

      {/* ── Messages ── */}
      <div
        className="flex-1 overflow-y-auto px-3 py-3 space-y-3 custom-scrollbar"
        style={{ background: 'var(--background)', maxHeight: 260 }}
      >
        {messages.map((m, i) => (
          <div key={i} className={`flex items-end gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && (
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 self-end"
                style={{ background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.2)' }}
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth={2.5}>
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </div>
            )}
            <div
              className="max-w-[84%] px-3 py-2 text-[12px] leading-relaxed"
              style={{
                borderRadius: m.role === 'user' ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
                background: m.role === 'user' ? 'var(--primary)' : 'var(--surface-elevated)',
                color: m.role === 'user' ? '#000' : 'var(--text-primary)',
                border: m.role === 'assistant' ? '1px solid var(--border)' : 'none',
                fontWeight: m.role === 'user' ? 500 : 400,
                animation: 'slideUp 0.2s ease',
              }}
            >
              {m.loading && !m.content ? (
                <div className="flex gap-1 py-0.5">
                  {[0,1,2].map(j => (
                    <span key={j} className="w-1.5 h-1.5 rounded-full animate-bounce"
                      style={{ background: 'var(--text-muted)', animationDelay: `${j*0.12}s` }} />
                  ))}
                </div>
              ) : (
                <span style={{ whiteSpace: 'pre-wrap' }}>{renderMessage(m.content, m.role === 'user')}</span>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* ── Chips ── */}
      {messages.length === 1 && (
        <div
          className="px-3 py-2 flex gap-1.5 flex-wrap flex-shrink-0"
          style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}
        >
          {CHIPS.map(q => (
            <button
              key={q}
              onClick={() => send(q)}
              className="text-[10px] px-2.5 py-1 rounded-full transition-all duration-100"
              style={{ background: 'var(--surface-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(74,222,128,0.4)';
                (e.currentTarget as HTMLElement).style.color = 'var(--primary)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
              }}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* ── Input ── */}
      <div
        className="flex items-end gap-2 px-3 py-2 flex-shrink-0"
        style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="Posez votre question… (Entrée pour envoyer)"
          rows={1}
          disabled={loading}
          className="flex-1 resize-none text-[12px] rounded-lg px-3 py-2 outline-none transition-colors"
          style={{
            background: 'var(--surface-elevated)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            maxHeight: 72,
            minHeight: 34,
          }}
          onFocus={e => { e.currentTarget.style.borderColor = 'rgba(74,222,128,0.4)'; }}
          onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || loading}
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-30"
          style={{ background: 'var(--primary)', color: '#000' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
