'use client';

/**
 * components/ai/VisionPanel.tsx
 * Multimodal chat — text messages + optional image attachment.
 * Conversation persisted in localStorage (text only — blob URLs don't survive refresh).
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Paperclip, Send, X, ScanEye, Square, Copy, Check, Trash2 } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role:      'user' | 'assistant';
  content:   string;
  imageUrl?: string;   // blob URL — display only, not persisted
  loading?:  boolean;
}

interface PersistedMessage {
  role:    'user' | 'assistant';
  content: string;
}

const STORAGE_KEY = 'vision_chat_history';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function saveHistory(messages: ChatMessage[]) {
  try {
    const toSave: PersistedMessage[] = messages
      .filter(m => !m.loading && m.content)
      .map(m => ({ role: m.role, content: m.content }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch { /* quota */ }
}

function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as PersistedMessage[]).map(m => ({ ...m }));
  } catch { return []; }
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function Md({ text }: { text: string }) {
  return (
    <div className="space-y-0.5">
      {text.split('\n').map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} className="h-2" />;
        // Bold **...**
        const parts = t.split(/\*\*([^*]+)\*\*/g).map((p, j) =>
          j % 2 === 1 ? <strong key={j} className="font-semibold">{p}</strong> : <span key={j}>{p}</span>
        );
        // Bullet
        if (t.startsWith('- ') || t.startsWith('• '))
          return (
            <div key={i} className="flex gap-1.5">
              <span className="mt-0.5 flex-shrink-0" style={{ color: 'var(--primary)' }}>•</span>
              <span>{parts.slice(1)}</span>
            </div>
          );
        // Numbered
        if (/^\d+\./.test(t)) return <div key={i}>{parts}</div>;
        // Heading-like (all caps label followed by colon)
        if (/^[A-Z][A-Z\s]+:/.test(t)) return <div key={i} className="font-semibold mt-1">{parts}</div>;
        return <div key={i}>{parts}</div>;
      })}
    </div>
  );
}

function Dots() {
  return (
    <div className="flex gap-1 items-center py-0.5">
      {[0, 1, 2].map(i => (
        <span key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
          style={{ background: 'var(--text-muted)', animationDelay: `${i * 0.15}s` }} />
      ))}
    </div>
  );
}

// Copy button for assistant messages
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy}
      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
      style={{ color: 'var(--text-muted)' }} title="Copy">
      {copied ? <Check size={10} /> : <Copy size={10} />}
    </button>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VisionPanel() {
  const [messages,     setMessages]     = useState<ChatMessage[]>([]);
  const [hydrated,     setHydrated]     = useState(false);
  const [input,        setInput]        = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [attachedUrl,  setAttachedUrl]  = useState<string | null>(null);
  const [isLoading,    setIsLoading]    = useState(false);
  const [backend,      setBackend]      = useState<'claude' | 'ollama' | null>(null);

  const bottomRef    = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const abortRef     = useRef<AbortController | null>(null);

  // Load history after hydration (avoids SSR/client mismatch)
  useEffect(() => {
    setMessages(loadHistory());
    setHydrated(true);
  }, []);

  // Persist on every change (only after hydration to avoid overwriting with empty)
  useEffect(() => { if (hydrated) saveHistory(messages); }, [messages, hydrated]);

  // Auto-scroll
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Auto-grow textarea
  const grow = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 130)}px`;
  };

  // ── Attachment ─────────────────────────────────────────────────────────────

  const attachFile = useCallback((f: File) => {
    const ok = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    if (!ok.includes(f.type) || f.size > 10 * 1024 * 1024) return;
    if (attachedUrl) URL.revokeObjectURL(attachedUrl);
    setAttachedFile(f);
    setAttachedUrl(URL.createObjectURL(f));
  }, [attachedUrl]);

  const clearAttachment = useCallback(() => {
    if (attachedUrl) URL.revokeObjectURL(attachedUrl);
    setAttachedFile(null);
    setAttachedUrl(null);
  }, [attachedUrl]);

  // ── Send ───────────────────────────────────────────────────────────────────

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const file    = attachedFile;
    const prevUrl = attachedUrl;

    const history = messages
      .filter(m => !m.loading && m.content)
      .slice(-14)
      .map(m => ({ role: m.role, content: m.content }));

    setMessages(prev => [
      ...prev,
      { role: 'user', content: text, imageUrl: prevUrl ?? undefined },
      { role: 'assistant', content: '', loading: true },
    ]);
    setInput('');
    clearAttachment();
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setIsLoading(true);

    try {
      const form = new FormData();
      form.append('message', text);
      form.append('history', JSON.stringify(history));
      if (file) form.append('image', file);

      const res = await fetch('/api/ai/vision', {
        method: 'POST', body: form,
        signal: abortRef.current.signal,
      });
      const b = res.headers.get('X-Vision-Backend');
      if (b === 'claude' || b === 'ollama') setBackend(b);

      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as
          { error: string; hint?: string; installed_models?: string[] };
        let err = json.error;
        if (json.hint)             err += `\n\n${json.hint}`;
        if (json.installed_models) err += `\n\nInstalled: ${json.installed_models.join(', ') || 'none'}`;
        setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: err }]);
        return;
      }

      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      let full = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') break;
          try {
            full += (JSON.parse(data) as { token: string }).token;
            setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: full }]);
          } catch { /* skip */ }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: 'assistant', content: 'Connexion perdue. Vérifie qu\'Ollama tourne.' },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, attachedFile, attachedUrl, messages, clearAttachment]);

  const stop = () => {
    abortRef.current?.abort();
    setIsLoading(false);
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.loading) return [...prev.slice(0, -1), { ...last, loading: false }];
      return prev;
    });
  };

  const clearAll = () => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const canSend = input.trim().length > 0 && !isLoading;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--background)' }}
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) attachFile(f); }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 h-10 border-b"
        style={{ borderColor: 'var(--border)' }}>
        <ScanEye size={13} style={{ color: 'var(--primary)' }} />
        <span className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>Vision</span>
        <span className="text-[9px] px-1.5 py-0.5 rounded font-mono"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          {backend === 'claude' ? 'claude · sonnet' : backend === 'ollama' ? 'local · ollama' : 'claude / ollama'}
        </span>
        <div className="flex-1" />
        {messages.length > 0 && (
          <button onClick={clearAll}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded transition-colors"
            style={{ color: 'var(--text-muted)', background: 'var(--surface)' }}>
            <Trash2 size={9} /> Clear
          </button>
        )}
      </div>

      {/* ── Messages ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center gap-3 py-10 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <ScanEye size={26} style={{ color: 'var(--text-muted)' }} />
            </div>
            <div>
              <p className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                Vision + Chat
              </p>
              <p className="text-[11px] mt-1 max-w-xs" style={{ color: 'var(--text-muted)' }}>
                Pose une question · ou clique sur 📎 pour joindre un graphique
              </p>
            </div>
            <div className="flex flex-col gap-1.5 mt-2">
              {['Analyse ce graphique', 'Quel est le biais actuel ?', 'Explique-moi le GEX'].map(s => (
                <button key={s} onClick={() => setInput(s)}
                  className="text-[10px] px-3 py-1.5 rounded-full border transition-colors hover:opacity-80"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'var(--surface)' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>

            {msg.role === 'assistant' && (
              <div className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center mt-0.5"
                style={{ background: 'var(--primary)15', border: '1px solid var(--primary)30' }}>
                <ScanEye size={11} style={{ color: 'var(--primary)' }} />
              </div>
            )}

            <div className={`group relative min-w-0 ${msg.role === 'user' ? 'max-w-[80%]' : 'max-w-[88%]'}`}>

              {/* Image — shown full-width above the text bubble */}
              {msg.imageUrl && (
                <div className="mb-1.5 rounded-xl overflow-hidden border"
                  style={{ borderColor: 'rgba(255,255,255,.12)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={msg.imageUrl} alt="chart"
                    className="w-full object-contain max-h-96 cursor-zoom-in"
                    style={{ background: '#0a0a0a' }}
                    onClick={() => window.open(msg.imageUrl, '_blank')}
                  />
                </div>
              )}

              {/* Bubble */}
              <div className={`rounded-xl px-3 py-2.5 text-[11.5px] leading-relaxed ${
                msg.role === 'user' ? 'rounded-tr-sm' : 'rounded-tl-sm'
              }`}
                style={msg.role === 'user'
                  ? { background: 'var(--primary)', color: '#fff' }
                  : { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }
                }>
                {msg.loading && !msg.content
                  ? <Dots />
                  : msg.role === 'assistant'
                    ? <Md text={msg.content} />
                    : <span className="whitespace-pre-wrap">{msg.content}</span>
                }
                {msg.loading && msg.content && (
                  <span className="inline-block w-1 h-3.5 ml-0.5 animate-pulse align-middle"
                    style={{ background: 'currentColor', opacity: 0.5 }} />
                )}
              </div>

              {/* Copy button (assistant only) */}
              {msg.role === 'assistant' && msg.content && !msg.loading && (
                <div className="absolute -bottom-4 left-0">
                  <CopyBtn text={msg.content} />
                </div>
              )}
            </div>

            {msg.role === 'user' && (
              <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5 text-[9px] font-bold"
                style={{ background: 'var(--primary)', color: '#fff' }}>U</div>
            )}
          </div>
        ))}

        <div ref={bottomRef} className="h-5" />
      </div>

      {/* ── Input area ──────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t px-3 pt-2 pb-3 space-y-2"
        style={{ borderColor: 'var(--border)', background: 'var(--background)' }}>

        {/* Large image preview when attached */}
        {attachedUrl && (
          <div className="relative rounded-xl overflow-hidden border"
            style={{ borderColor: 'var(--primary)40', background: '#0a0a0a' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={attachedUrl} alt="preview"
              className="w-full max-h-64 object-contain"
            />
            <button onClick={clearAttachment}
              className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,.7)', color: '#fff' }}>
              <X size={13} />
            </button>
            <div className="absolute bottom-0 left-0 right-0 px-3 py-1.5 text-[9px]"
              style={{ background: 'linear-gradient(transparent,rgba(0,0,0,.6))', color: 'rgba(255,255,255,.7)' }}>
              {attachedFile?.name} · {((attachedFile?.size ?? 0) / 1024).toFixed(0)} KB
            </div>
          </div>
        )}

        {/* Input row */}
        <div className="flex items-end gap-2">
          <button onClick={() => fileInputRef.current?.click()}
            title="Joindre une image"
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all"
            style={{
              background: attachedUrl ? 'var(--primary)15' : 'var(--surface)',
              border:     `1px solid ${attachedUrl ? 'var(--primary)50' : 'var(--border)'}`,
              color:      attachedUrl ? 'var(--primary)' : 'var(--text-muted)',
            }}>
            <Paperclip size={13} />
          </button>
          <input ref={fileInputRef} type="file"
            accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
            className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) attachFile(f); e.target.value = ''; }} />

          <textarea ref={textareaRef} value={input}
            onChange={e => { setInput(e.target.value); grow(); }}
            onKeyDown={handleKey}
            placeholder={attachedUrl ? 'Décris ce que tu veux analyser…' : 'Message…'}
            rows={1} disabled={isLoading}
            className="flex-1 resize-none rounded-lg px-3 py-2 text-[11px] outline-none
                       transition-colors placeholder:opacity-40 leading-relaxed"
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', minHeight: '34px', maxHeight: '130px',
            }} />

          {isLoading ? (
            <button onClick={stop}
              className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: '#ef444415', border: '1px solid #ef444440', color: '#ef4444' }}>
              <Square size={11} fill="currentColor" />
            </button>
          ) : (
            <button onClick={send} disabled={!canSend}
              className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center
                         transition-all disabled:opacity-30"
              style={{
                background: canSend ? 'var(--primary)' : 'var(--surface)',
                border:     `1px solid ${canSend ? 'var(--primary)' : 'var(--border)'}`,
                color:      canSend ? '#fff' : 'var(--text-muted)',
                boxShadow:  canSend ? '0 0 10px var(--primary)40' : 'none',
              }}>
              <Send size={11} />
            </button>
          )}
        </div>

        <p className="text-[9px] text-center" style={{ color: 'var(--text-muted)' }}>
          Entrée → envoyer · Shift+Entrée → ligne · 📎 image · conversation sauvegardée
        </p>
      </div>
    </div>
  );
}
