'use client';

/**
 * SUPPORT CHAT WIDGET
 * ─────────────────────────────────────────────────────────────────────────────
 * Chat interface for the AI support agent.
 * Streams tokens in real-time (SSE) from /api/ai/support.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  loading?: boolean;
}

interface SupportChatProps {
  /** Colors from theme (pass settings.colors) */
  colors?: {
    background?:       string;
    surface?:          string;
    textPrimary?:      string;
    textSecondary?:    string;
    currentPriceColor?: string;
    gridColor?:        string;
  };
  /** Initial message to show */
  welcomeMessage?: string;
  className?: string;
}

const DEFAULT_WELCOME =
  'Bonjour ! Je suis votre assistant trading. Posez-moi vos questions sur le GEX, le skew, l\'option flow ou l\'utilisation de la plateforme.';

const SUGGESTED_QUESTIONS = [
  'C\'est quoi le GEX ?',
  'Comment lire le skew ?',
  'Qu\'est-ce que le flip level ?',
  'Expliquer le Put/Call Ratio',
];

export default function SupportChat({ colors = {}, welcomeMessage = DEFAULT_WELCOME, className = '' }: SupportChatProps) {
  const {
    background      = '#0d0d0d',
    surface         = '#1a1a1a',
    textPrimary     = '#e2e8f0',
    textSecondary   = '#64748b',
    currentPriceColor = '#3b82f6',
    gridColor       = '#1e293b',
  } = colors;

  const [messages,  setMessages]  = useState<Message[]>([
    { role: 'assistant', content: welcomeMessage },
  ]);
  const [input,     setInput]     = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen,    setIsOpen]    = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef       = useRef<AbortController | null>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: Message = { role: 'user', content: text.trim() };
    const loadingMsg: Message = { role: 'assistant', content: '', loading: true };

    const history = messages
      .filter(m => !m.loading)
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content }));

    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setInput('');
    setIsLoading(true);

    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/ai/support', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: text.trim(), history }),
        signal:  abortRef.current.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      let   fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') break;
          try {
            const json = JSON.parse(data) as { token: string };
            fullText += json.token;
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: 'assistant', content: fullText };
              return updated;
            });
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const errorText = err instanceof Error ? err.message : 'Erreur de connexion';
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: `⚠️ ${errorText}`,
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }, [messages, isLoading]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const stopGeneration = () => {
    abortRef.current?.abort();
    setIsLoading(false);
  };

  // ── Floating button ─────────────────────────────────────────────────────────
  const FloatingBtn = (
    <button
      onClick={() => setIsOpen(o => !o)}
      className="fixed bottom-6 right-6 max-sm:right-3 max-sm:bottom-16 z-50 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-transform hover:scale-105"
      style={{ backgroundColor: currentPriceColor }}
      title="Assistant IA"
    >
      {isOpen ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      ) : (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      )}
    </button>
  );

  // ── Chat panel ──────────────────────────────────────────────────────────────
  if (!isOpen) return <>{FloatingBtn}</>;

  return (
    <>
      {FloatingBtn}
      <div
        className={`fixed bottom-24 right-6 max-sm:right-3 max-sm:bottom-16 z-50 flex flex-col rounded-xl shadow-2xl overflow-hidden ${className}`}
        style={{ width: 'min(90vw, 380px)', height: 520, backgroundColor: surface, border: `1px solid ${gridColor}` }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 px-4 py-3 border-b"
          style={{ borderColor: gridColor, backgroundColor: background }}
        >
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-sm font-semibold" style={{ color: textPrimary }}>
            Assistant Trading
          </span>
          <span className="text-xs ml-auto" style={{ color: textSecondary }}>
            Claude · Haiku
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ backgroundColor: background }}>
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className="max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed"
                style={{
                  backgroundColor: msg.role === 'user' ? currentPriceColor : surface,
                  color:           msg.role === 'user' ? '#fff' : textPrimary,
                  border:          msg.role === 'assistant' ? `1px solid ${gridColor}` : 'none',
                }}
              >
                {msg.loading && !msg.content ? (
                  <div className="flex gap-1 items-center py-1">
                    {[0, 1, 2].map(j => (
                      <div
                        key={j}
                        className="w-1.5 h-1.5 rounded-full animate-bounce"
                        style={{ backgroundColor: textSecondary, animationDelay: `${j * 0.15}s` }}
                      />
                    ))}
                  </div>
                ) : (
                  <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggestions (only when no messages from user yet) */}
        {messages.length === 1 && (
          <div
            className="px-3 py-2 flex flex-wrap gap-1.5 border-t"
            style={{ borderColor: gridColor, backgroundColor: background }}
          >
            {SUGGESTED_QUESTIONS.map(q => (
              <button
                key={q}
                onClick={() => sendMessage(q)}
                className="text-xs px-2 py-1 rounded-full transition-colors hover:opacity-80"
                style={{ backgroundColor: surface, color: textSecondary, border: `1px solid ${gridColor}` }}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div
          className="flex items-end gap-2 px-3 py-2 border-t"
          style={{ borderColor: gridColor, backgroundColor: background }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Posez votre question…"
            rows={1}
            disabled={isLoading}
            className="flex-1 resize-none text-sm rounded-lg px-3 py-2 outline-none"
            style={{
              backgroundColor: surface,
              color:           textPrimary,
              border:          `1px solid ${gridColor}`,
              maxHeight:       80,
            }}
          />
          {isLoading ? (
            <button
              onClick={stopGeneration}
              className="p-2 rounded-lg transition-colors"
              style={{ backgroundColor: '#ef4444', color: '#fff' }}
              title="Arrêter"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" />
              </svg>
            </button>
          ) : (
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim()}
              className="p-2 rounded-lg transition-colors disabled:opacity-40"
              style={{ backgroundColor: currentPriceColor, color: '#fff' }}
              title="Envoyer (Enter)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </>
  );
}
