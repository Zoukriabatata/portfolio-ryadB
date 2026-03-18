'use client';

/**
 * FloatingChat — assistant IA flottant (bouton bas-droite)
 * Utilisé sur la landing page et potentiellement partout.
 * Utilise CSS variables → s'adapte au thème.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { renderMessage } from './renderMessage';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  loading?: boolean;
}

const WELCOME = "Bonjour ! Je suis l'assistant OrderFlow. Posez-moi vos questions sur la plateforme, le trading, ou rejoignez notre communauté Discord 👋";

const SUGGESTIONS = [
  'C\'est quoi le GEX ?',
  'Lien Discord ?',
  'Comment lire le footprint ?',
  'Quels outils sont disponibles ?',
];

export default function FloatingChat() {
  const [open, setOpen]       = useState(false);
  const [messages, setMessages] = useState<Msg[]>([{ role: 'assistant', content: WELCOME }]);
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const [unread, setUnread]   = useState(0);
  const [pulse, setPulse]     = useState(true);

  const endRef   = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // stop pulse after 4 s
  useEffect(() => {
    const t = setTimeout(() => setPulse(false), 4000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

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

      if (!open) setUnread(u => u + 1);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: 'assistant', content: '⚠️ Erreur de connexion. Réessaie.' };
        return copy;
      });
    } finally {
      setLoading(false);
    }
  }, [messages, loading, open]);

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  return (
    <>
      {/* ── Chat panel ── */}
      {open && (
        <div
          className="fixed bottom-20 right-5 z-[200] flex flex-col overflow-hidden"
          style={{
            width: 360,
            height: 500,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
            animation: 'slideUp 0.25s cubic-bezier(0.22,1,0.36,1)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
            style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth={2}>
                <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
                <path d="M12 2a10 10 0 0 1 10 10" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold leading-none" style={{ color: 'var(--text-primary)' }}>
                OrderFlow AI
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>En ligne · Claude Haiku</span>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-7 h-7 flex items-center justify-center rounded-full transition-colors"
              style={{ color: 'var(--text-dimmed)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-elevated)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div
            className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5"
            style={{ background: 'var(--background)' }}
          >
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} items-end gap-2`}>
                {m.role === 'assistant' && (
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 self-end mb-0.5"
                    style={{ background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.2)' }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth={2.5}>
                      <circle cx="12" cy="12" r="3" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
                    </svg>
                  </div>
                )}
                <div
                  className="max-w-[82%] px-3 py-2 text-[12px] leading-relaxed"
                  style={{
                    borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    background: m.role === 'user'
                      ? 'var(--primary)'
                      : 'var(--surface-elevated)',
                    color: m.role === 'user' ? '#000' : 'var(--text-primary)',
                    border: m.role === 'assistant' ? '1px solid var(--border)' : 'none',
                    fontWeight: m.role === 'user' ? 500 : 400,
                  }}
                >
                  {m.loading && !m.content ? (
                    <div className="flex gap-1 items-center py-0.5">
                      {[0, 1, 2].map(j => (
                        <span
                          key={j}
                          className="w-1.5 h-1.5 rounded-full animate-bounce"
                          style={{ background: 'var(--text-muted)', animationDelay: `${j * 0.12}s` }}
                        />
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

          {/* Suggestions — only on welcome screen */}
          {messages.length === 1 && (
            <div
              className="px-3 pt-2 pb-1 flex flex-wrap gap-1.5 flex-shrink-0"
              style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}
            >
              {SUGGESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="text-[10px] px-2.5 py-1 rounded-full transition-all duration-100"
                  style={{
                    background: 'var(--surface-elevated)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                  }}
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

          {/* Input */}
          <div
            className="flex items-end gap-2 px-3 py-2.5 flex-shrink-0"
            style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="Posez votre question…"
              rows={1}
              disabled={loading}
              className="flex-1 resize-none text-[12px] rounded-xl px-3 py-2 outline-none transition-colors"
              style={{
                background: 'var(--surface-elevated)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                maxHeight: 80,
                minHeight: 36,
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(74,222,128,0.4)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
            />
            <button
              onClick={() => loading ? abortRef.current?.abort() : send(input)}
              disabled={!loading && !input.trim()}
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-100 disabled:opacity-30"
              style={{
                background: loading ? 'rgba(239,68,68,0.15)' : 'var(--primary)',
                color: loading ? '#ef4444' : '#000',
                border: loading ? '1px solid rgba(239,68,68,0.3)' : 'none',
              }}
            >
              {loading ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Floating button ── */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-5 right-5 z-[200] w-13 h-13 flex items-center justify-center rounded-full transition-all duration-200"
        style={{
          width: 52,
          height: 52,
          background: open
            ? 'var(--surface-elevated)'
            : 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
          boxShadow: open
            ? '0 4px 20px rgba(0,0,0,0.3)'
            : '0 8px 32px rgba(74,222,128,0.35)',
          border: open ? '1px solid var(--border)' : 'none',
          transform: open ? 'scale(1)' : pulse ? 'scale(1.08)' : 'scale(1)',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.1)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
        title="Assistant IA"
      >
        {/* pulse ring */}
        {!open && pulse && (
          <span
            className="absolute inset-0 rounded-full animate-ping"
            style={{ background: 'rgba(74,222,128,0.3)' }}
          />
        )}
        {/* unread badge */}
        {!open && unread > 0 && (
          <span
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
            style={{ background: '#ef4444', color: '#fff' }}
          >
            {unread}
          </span>
        )}
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke={open ? 'var(--text-primary)' : '#000'} strokeWidth={2.5}>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth={2}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>
    </>
  );
}
