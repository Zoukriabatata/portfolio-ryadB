'use client';

/**
 * DashboardAIChat — Editorial Terminal redesign.
 *
 * Renders the conversation area + suggestion chips + input row.
 * The component header (logo + "OrderFlow AI" title + close button)
 * is owned by the FloatingAIChat slide-over wrapper, so this body
 * no longer duplicates it.
 *
 * Visual direction matches the rest of the dashboard surface :
 *   • Geist Sans body, Instrument Serif italic for editorial flourish.
 *   • JetBrains Mono on labels / live indicator / placeholder.
 *   • Pure lime accent reserved for the live dot, focus ring, send
 *     button, and user message bubble. No teal, no orange, no
 *     emoji.
 *   • Message bubbles use minimal-radius (10 px) and 1 px hairline
 *     borders instead of the prior asymmetric speech-bubble shape.
 *     Reads as editorial transcript, not WhatsApp.
 */

import { ArrowUp, Square } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

import { renderMessage } from './renderMessage';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  loading?: boolean;
}

const WELCOME =
  'Posez-moi vos questions sur les marchés, la plateforme, ou le Discord.';

const CHIPS = [
  "Qu'est-ce que le GEX ?",
  'Lien Discord ?',
  'Comment lire le footprint ?',
  "C'est quoi le skew ?",
  'Explain funding rates',
];

export default function DashboardAIChat() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: WELCOME },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;
      const history = messages
        .filter((m) => !m.loading)
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.content }));

      setMessages((prev) => [
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

        const reader = res.body!.getReader();
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
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: 'assistant', content: full };
                return copy;
              });
            } catch {
              /* skip */
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            role: 'assistant',
            content: 'Connection error. Try again in a moment.',
          };
          return copy;
        });
      } finally {
        setLoading(false);
      }
    },
    [messages, loading],
  );

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const showChips = messages.length === 1;

  return (
    <div
      className={cn(
        'flex flex-col h-full',
        'bg-[var(--surface)]',
      )}
    >
      {/* Live / status strip — slim editorial kicker under the
          parent header. Carries the JetBrains Mono "thinking" /
          "ready" state + an abort affordance during a stream. */}
      <div
        className={cn(
          'flex items-center justify-between gap-2',
          'px-4 py-2 shrink-0',
          'border-b border-[var(--border)]',
          'font-[var(--font-jetbrains-mono)] dash-text-xs uppercase tracking-[0.18em]',
        )}
        style={{ color: 'var(--text-muted)' }}
      >
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{
              background: 'var(--primary)',
              boxShadow: '0 0 8px rgb(var(--primary-rgb) / 0.55)',
              animation: 'ai-live-pulse 1.6s ease-in-out infinite',
            }}
          />
          <span style={{ color: 'var(--primary)' }}>
            {loading ? 'thinking' : 'ready'}
          </span>
        </div>
        {loading && (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className={cn(
              'inline-flex items-center gap-1.5',
              'px-2 py-0.5 rounded-md',
              'border border-[color-mix(in_oklab,var(--bear)_40%,transparent)]',
              'transition-colors duration-150',
              'hover:bg-[color-mix(in_oklab,var(--bear)_12%,transparent)]',
              'focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--bear)]',
            )}
            style={{ color: 'var(--bear)' }}
          >
            <Square size={9} fill="currentColor" />
            <span>stop</span>
          </button>
        )}

        <style>{`
          @keyframes ai-live-pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50%      { transform: scale(1.45); opacity: 0.55; }
          }
          @media (prefers-reduced-motion: reduce) {
            [style*="ai-live-pulse"] {
              animation: none !important;
            }
          }
        `}</style>
      </div>

      {/* Messages area */}
      <div
        className={cn(
          'flex-1 overflow-y-auto custom-scrollbar',
          'px-4 py-4 flex flex-col gap-3',
        )}
      >
        {messages.map((m, i) => {
          const isUser = m.role === 'user';
          const isFirst = i === 0;

          if (isFirst && !isUser) {
            // Mono terminal kicker on first paint — matches the rest
            // of the surface (landing, login, dashboard cards).
            return (
              <div key={i} className="flex flex-col gap-2 pt-1">
                <span
                  className={cn(
                    'font-[var(--font-jetbrains-mono)] uppercase',
                    'dash-text-base font-medium tracking-[0.14em]',
                  )}
                  style={{ color: 'var(--text-primary)' }}
                >
                  How can I help today?
                </span>
                <span
                  className="dash-text-sm"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {m.content}
                </span>
              </div>
            );
          }

          return (
            <div
              key={i}
              className={cn(
                'flex',
                isUser ? 'justify-end' : 'justify-start',
              )}
              style={{ animation: 'ai-msg-in 200ms ease-out both' }}
            >
              <div
                className={cn(
                  'max-w-[86%] px-3 py-2 rounded-[10px]',
                  'dash-text-sm leading-relaxed',
                  isUser
                    ? ''
                    : 'border border-[var(--border)]',
                )}
                style={{
                  background: isUser
                    ? 'var(--primary)'
                    : 'var(--surface-elevated)',
                  color: isUser ? 'var(--background)' : 'var(--text-primary)',
                  fontWeight: isUser ? 500 : 400,
                }}
              >
                {m.loading && !m.content ? (
                  <div className="flex gap-1.5 py-1" aria-label="Thinking">
                    {[0, 1, 2].map((j) => (
                      <span
                        key={j}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{
                          background: 'var(--text-muted)',
                          animation: `ai-typing 0.9s ease-in-out ${j * 0.15}s infinite`,
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <span style={{ whiteSpace: 'pre-wrap' }}>
                    {renderMessage(m.content, isUser)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />

        <style>{`
          @keyframes ai-msg-in {
            from { opacity: 0; transform: translateY(4px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @keyframes ai-typing {
            0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
            30%           { transform: translateY(-3px); opacity: 1; }
          }
          @media (prefers-reduced-motion: reduce) {
            [style*="ai-msg-in"],
            [style*="ai-typing"] {
              animation: none !important;
            }
          }
        `}</style>
      </div>

      {/* Suggestion chips — first-paint only. Editorial pill style
          with lime hover. */}
      {showChips && (
        <div
          className={cn(
            'px-4 py-3 shrink-0 flex flex-wrap gap-2',
            'border-t border-[var(--border)]',
          )}
        >
          {CHIPS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => send(q)}
              className={cn(
                'inline-flex items-center',
                'dash-text-xs',
                'px-2.5 py-1 rounded-full',
                'border border-[var(--border)]',
                'bg-[var(--surface-elevated)]',
                'text-[var(--text-secondary)]',
                'transition-colors duration-150',
                'hover:border-[var(--border-glow)]',
                'hover:text-[var(--primary)]',
                'focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--primary)]',
              )}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input row */}
      <div
        className={cn(
          'px-3 py-3 shrink-0',
          'border-t border-[var(--border)]',
        )}
      >
        <div
          className={cn(
            'flex items-end gap-2',
            'rounded-lg p-1',
            'border border-[var(--border)]',
            'bg-[var(--surface-elevated)]',
            'transition-colors duration-150',
            'focus-within:border-[var(--border-glow)]',
          )}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="Ask anything…"
            rows={1}
            disabled={loading}
            className={cn(
              'flex-1 resize-none bg-transparent outline-none',
              'dash-text-sm px-2 py-2',
              'placeholder:font-[var(--font-jetbrains-mono)]',
              'placeholder:text-[var(--text-muted)]',
            )}
            style={{
              color: 'var(--text-primary)',
              maxHeight: 96,
              minHeight: 34,
            }}
          />
          <button
            type="button"
            onClick={() => send(input)}
            disabled={!input.trim() || loading}
            aria-label="Send message"
            className={cn(
              'press-fb shrink-0 w-9 h-9 rounded-md',
              'grid place-items-center',
              'transition-all duration-150',
              'disabled:opacity-30 disabled:cursor-not-allowed',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]',
              !input.trim() || loading
                ? 'bg-[var(--surface)]'
                : 'bg-[var(--primary)] hover:scale-[1.04]',
            )}
            style={{
              color: !input.trim() || loading ? 'var(--text-muted)' : 'var(--background)',
            }}
          >
            <ArrowUp size={16} strokeWidth={2.5} />
          </button>
        </div>
        <div
          className={cn(
            'mt-2 px-1 flex items-center justify-between',
            'font-[var(--font-jetbrains-mono)] dash-text-xs',
          )}
          style={{ color: 'var(--text-dimmed)' }}
        >
          <span>Enter to send · Shift+Enter for newline</span>
          <span className="uppercase tracking-[0.18em]">v1</span>
        </div>
      </div>
    </div>
  );
}
