'use client';

/**
 * USER TESTER PAGE — /bilansUTILISATEUR
 * Displays the autonomous AI agent testing the site in real-time.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ClipboardList, Play, RefreshCw, CheckCircle2, XCircle,
  Loader2, Trash2, Brain, Globe, Zap, MessageSquare, BarChart2,
  ChevronDown, ChevronRight, Star, ThumbsUp, ThumbsDown, Lightbulb,
  Terminal, FileText, Layers, Wrench, TrendingUp, Shield, Gauge,
  Sparkles, AlertCircle, Clock, ArrowRight, ListChecks,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

type ActionStatus = 'running' | 'ok' | 'fail';

interface AgentAction {
  id: string;
  tool: string;
  input: Record<string, unknown>;
  status: ActionStatus;
  detail?: string;
}

interface Improvement {
  title: string;
  description: string;
  action: string;
  category: 'bug' | 'performance' | 'ux' | 'feature' | 'security' | 'reliability';
  impact: 'critical' | 'high' | 'medium' | 'low';
  effort: 'minutes' | 'hours' | 'days';
}

interface BilanReport {
  overall_score: number;
  summary: string;
  what_works: string[];
  what_fails: string[];
  recommendations?: string[];
  user_experience: string;
  verdict: string;
  improvements?: Improvement[];
  quick_wins?: string[];
}

interface SavedBilan {
  id: string;
  date: string;
  score: number;
  verdict: string;
  report: BilanReport;
  durationMs: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

const TOOL_ICONS: Record<string, React.ReactNode> = {
  navigate:           <Globe size={13} />,
  inspect_page:       <Layers size={13} />,
  call_api:           <Zap size={13} />,
  chat_with_support:  <MessageSquare size={13} />,
  get_market_data:    <BarChart2 size={13} />,
  run_feature_suite:  <ListChecks size={13} />,
  log_ui_test:        <Wrench size={13} />,
  write_report:       <FileText size={13} />,
};

const TOOL_LABELS: Record<string, string> = {
  navigate:           'Navigation',
  inspect_page:       'Inspection',
  call_api:           'Appel API',
  chat_with_support:  'Chat IA',
  get_market_data:    'Données',
  run_feature_suite:  'Suite Tests',
  log_ui_test:        'Test UI',
  write_report:       'Rapport',
};

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  bug:         { label: 'Bug',          icon: <XCircle size={11} />,     color: '#f87171' },
  performance: { label: 'Performance',  icon: <Gauge size={11} />,       color: '#60a5fa' },
  ux:          { label: 'UX',           icon: <Sparkles size={11} />,    color: '#a78bfa' },
  feature:     { label: 'Feature',      icon: <TrendingUp size={11} />,  color: '#34d399' },
  security:    { label: 'Sécurité',     icon: <Shield size={11} />,      color: '#fb923c' },
  reliability: { label: 'Fiabilité',    icon: <CheckCircle2 size={11} />,color: '#f59e0b' },
};

const IMPACT_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  critical: { label: 'Critique',  color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
  high:     { label: 'Élevé',     color: '#fb923c', bg: 'rgba(251,146,60,0.12)' },
  medium:   { label: 'Moyen',     color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  low:      { label: 'Faible',    color: '#6b7280', bg: 'rgba(107,114,128,0.10)' },
};

const EFFORT_CONFIG: Record<string, { label: string; color: string }> = {
  minutes: { label: '< 30min', color: '#34d399' },
  hours:   { label: 'Quelques heures', color: '#f59e0b' },
  days:    { label: 'Plusieurs jours', color: '#f87171' },
};

const STORAGE_KEY = 'uf_bilans_v3';
const MAX_HISTORY = 10;

function scoreColor(s: number) {
  if (s >= 80) return '#34d399';
  if (s >= 55) return '#f59e0b';
  return '#f87171';
}
function scoreLabel(s: number) {
  if (s >= 90) return 'Excellent';
  if (s >= 75) return 'Bon';
  if (s >= 55) return 'Moyen';
  return 'Dégradé';
}
function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}
function loadHistory(): SavedBilan[] {
  if (typeof window === 'undefined') return [];
  try {
    // migrate from old key
    const old = localStorage.getItem('uf_bilans_v2');
    if (old) { localStorage.setItem(STORAGE_KEY, old); localStorage.removeItem('uf_bilans_v2'); }
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}
function saveToHistory(b: SavedBilan, prev: SavedBilan[]) {
  const updated = [b, ...prev].slice(0, MAX_HISTORY);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ScoreDial({ score }: { score: number }) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = scoreColor(score);
  return (
    <div className="relative w-28 h-28 flex items-center justify-center flex-shrink-0">
      <svg width="112" height="112" viewBox="0 0 112 112">
        <circle cx="56" cy="56" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
        <circle cx="56" cy="56" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 56 56)"
          style={{ transition: 'stroke-dasharray 1s ease' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-bold text-white">{score}</span>
        <span className="text-[11px] font-medium" style={{ color }}>{scoreLabel(score)}</span>
      </div>
    </div>
  );
}

function ActionCard({ action }: { action: AgentAction }) {
  const [open, setOpen] = useState(false);
  const icon = TOOL_ICONS[action.tool] ?? <Terminal size={13} />;
  const label = TOOL_LABELS[action.tool] ?? action.tool;
  const inputLabel = String(
    action.input.suite ?? action.input.feature ?? action.input.reason ??
    action.input.path ?? action.input.endpoint ?? action.input.message ?? action.input.symbol ?? ''
  );

  return (
    <div className="rounded-lg border border-white/8 overflow-hidden text-sm" style={{ backgroundColor: '#111' }}>
      <button
        className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/5 transition-colors text-left"
        onClick={() => action.detail && setOpen(o => !o)}
      >
        <span className={
          action.status === 'running' ? 'text-blue-400'
          : action.status === 'ok'   ? 'text-emerald-400'
          : 'text-red-400'
        }>{icon}</span>
        <span className="text-white/50 text-[11px] font-mono w-24 flex-shrink-0">{label}</span>
        <span className="flex-1 text-white/70 truncate text-xs">{inputLabel}</span>
        {action.status === 'running' && <Loader2 size={12} className="text-blue-400 animate-spin flex-shrink-0" />}
        {action.status === 'ok'      && <CheckCircle2 size={12} className="text-emerald-400 flex-shrink-0" />}
        {action.status === 'fail'    && <XCircle size={12} className="text-red-400 flex-shrink-0" />}
        {action.detail && (
          open
            ? <ChevronDown size={12} className="text-white/30 flex-shrink-0" />
            : <ChevronRight size={12} className="text-white/30 flex-shrink-0" />
        )}
      </button>
      {open && action.detail && (
        <div className="border-t border-white/8 px-3 py-2 text-xs text-white/50 font-mono whitespace-pre-wrap">
          {action.detail}
        </div>
      )}
    </div>
  );
}

function ImprovementCard({ item, index }: { item: Improvement; index: number }) {
  const [open, setOpen] = useState(false);
  const impact = IMPACT_CONFIG[item.impact] ?? IMPACT_CONFIG.medium;
  const effort = EFFORT_CONFIG[item.effort] ?? EFFORT_CONFIG.hours;
  const cat    = CATEGORY_CONFIG[item.category] ?? CATEGORY_CONFIG.feature;

  return (
    <div className="rounded-xl border overflow-hidden transition-all"
      style={{ borderColor: `${impact.color}30`, backgroundColor: impact.bg }}>
      <button className="w-full text-left p-4" onClick={() => setOpen(o => !o)}>
        <div className="flex items-start gap-3">
          {/* Priority badge */}
          <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5"
            style={{ backgroundColor: `${impact.color}25`, color: impact.color }}>
            {index + 1}
          </span>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-sm font-semibold text-white">{item.title}</span>
              {/* Tags */}
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                style={{ backgroundColor: `${impact.color}20`, color: impact.color }}>
                {impact.label}
              </span>
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]"
                style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: cat.color }}>
                {cat.icon}<span className="ml-0.5">{cat.label}</span>
              </span>
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]"
                style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: effort.color }}>
                <Clock size={9} />{effort.label}
              </span>
            </div>
            <p className="text-xs text-white/55 leading-relaxed">{item.description}</p>
          </div>

          <div className="flex-shrink-0 mt-1">
            {open ? <ChevronDown size={14} className="text-white/30" /> : <ChevronRight size={14} className="text-white/30" />}
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t px-4 py-3 space-y-1.5" style={{ borderColor: `${impact.color}20` }}>
          <div className="flex items-center gap-2 text-xs font-medium" style={{ color: impact.color }}>
            <ArrowRight size={11} /> Action à effectuer
          </div>
          <p className="text-xs text-white/70 leading-relaxed font-mono bg-black/30 rounded-lg p-3 whitespace-pre-wrap">
            {item.action}
          </p>
        </div>
      )}
    </div>
  );
}

function ReportView({ report }: { report: BilanReport }) {
  const lines = report.user_experience.split('\n');
  const improvements = report.improvements ?? [];
  const criticals = improvements.filter(i => i.impact === 'critical');
  const highs     = improvements.filter(i => i.impact === 'high');
  const mediums   = improvements.filter(i => i.impact === 'medium');
  const lows      = improvements.filter(i => i.impact === 'low');
  const sorted = [...criticals, ...highs, ...mediums, ...lows];

  return (
    <div className="space-y-5">

      {/* Score + verdict */}
      <div className="flex items-center gap-6 p-5 rounded-2xl border border-white/8" style={{ backgroundColor: '#111' }}>
        <ScoreDial score={report.overall_score} />
        <div className="flex-1 space-y-1.5">
          <p className="text-white font-semibold text-base">{report.verdict}</p>
          <p className="text-white/55 text-sm leading-relaxed">{report.summary}</p>
          {improvements.length > 0 && (
            <div className="flex gap-2 flex-wrap mt-2">
              {criticals.length > 0 && <span className="px-2 py-0.5 rounded text-[11px] font-medium" style={{ backgroundColor: 'rgba(248,113,113,0.15)', color: '#f87171' }}>{criticals.length} critique{criticals.length > 1 ? 's' : ''}</span>}
              {highs.length > 0     && <span className="px-2 py-0.5 rounded text-[11px] font-medium" style={{ backgroundColor: 'rgba(251,146,60,0.15)', color: '#fb923c' }}>{highs.length} élevé{highs.length > 1 ? 's' : ''}</span>}
              {mediums.length > 0   && <span className="px-2 py-0.5 rounded text-[11px] font-medium" style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>{mediums.length} moyen{mediums.length > 1 ? 's' : ''}</span>}
              {lows.length > 0      && <span className="px-2 py-0.5 rounded text-[11px] font-medium" style={{ backgroundColor: 'rgba(107,114,128,0.15)', color: '#9ca3af' }}>{lows.length} faible{lows.length > 1 ? 's' : ''}</span>}
            </div>
          )}
        </div>
      </div>

      {/* Quick wins */}
      {report.quick_wins && report.quick_wins.length > 0 && (
        <div className="rounded-xl border border-emerald-500/25 p-4 space-y-2.5" style={{ backgroundColor: 'rgba(52,211,153,0.05)' }}>
          <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
            <Sparkles size={14} /> Quick Wins — Impact immédiat, effort minimal
          </div>
          {report.quick_wins.map((w, i) => (
            <div key={i} className="flex gap-2.5 text-xs text-white/70">
              <span className="text-emerald-400 flex-shrink-0 font-bold">→</span>{w}
            </div>
          ))}
        </div>
      )}

      {/* Improvements */}
      {sorted.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Lightbulb size={14} className="text-amber-400" />
            <h3 className="text-sm font-semibold text-white/70">Améliorations recommandées</h3>
            <span className="text-xs text-white/30">({sorted.length} au total)</span>
          </div>
          {sorted.map((item, i) => (
            <ImprovementCard key={i} item={item} index={i} />
          ))}
        </div>
      )}

      {/* Legacy recommendations fallback */}
      {!improvements.length && report.recommendations && report.recommendations.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 p-4 space-y-2" style={{ backgroundColor: '#f59e0b08' }}>
          <div className="flex items-center gap-2 text-amber-400 font-medium text-sm mb-3">
            <Lightbulb size={13} /> Recommandations
          </div>
          {report.recommendations.map((r, i) => (
            <div key={i} className="flex gap-3 text-xs text-white/65">
              <span className="text-amber-400 font-bold flex-shrink-0">{i + 1}.</span>{r}
            </div>
          ))}
        </div>
      )}

      {/* What works / what fails */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-emerald-500/20 p-4 space-y-2" style={{ backgroundColor: '#34d39908' }}>
          <div className="flex items-center gap-2 text-emerald-400 font-medium text-sm">
            <ThumbsUp size={13} /> Points forts
          </div>
          {report.what_works.map((w, i) => (
            <p key={i} className="text-xs text-white/65 flex gap-2">
              <span className="text-emerald-400 flex-shrink-0">✓</span>{w}
            </p>
          ))}
        </div>
        <div className="rounded-xl border border-red-500/20 p-4 space-y-2" style={{ backgroundColor: '#f8717108' }}>
          <div className="flex items-center gap-2 text-red-400 font-medium text-sm">
            <ThumbsDown size={13} /> Problèmes
          </div>
          {report.what_fails.length > 0
            ? report.what_fails.map((w, i) => (
                <p key={i} className="text-xs text-white/65 flex gap-2">
                  <span className="text-red-400 flex-shrink-0">✗</span>{w}
                </p>
              ))
            : <p className="text-xs text-white/40">Aucun problème majeur détecté.</p>
          }
        </div>
      </div>

      {/* UX Narrative */}
      <div className="rounded-xl border border-white/8 overflow-hidden" style={{ backgroundColor: '#111' }}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/8">
          <Brain size={13} className="text-indigo-400" />
          <span className="text-sm font-medium text-white/70">Expérience utilisateur détaillée</span>
        </div>
        <div className="p-4 space-y-2">
          {lines.map((line, i) => {
            if (line.startsWith('## ') || line.startsWith('### ')) {
              return <h3 key={i} className="text-white font-semibold text-sm mt-3 first:mt-0">{line.replace(/^#{2,3}\s/, '')}</h3>;
            }
            if (line.startsWith('- ') || line.startsWith('* ')) {
              const content = line.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>');
              return <p key={i} className="text-xs text-white/60 pl-3 border-l border-white/10" dangerouslySetInnerHTML={{ __html: `• ${content}` }} />;
            }
            if (!line.trim()) return <div key={i} className="h-1" />;
            const rendered = line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>');
            return <p key={i} className="text-xs text-white/60 leading-relaxed" dangerouslySetInnerHTML={{ __html: rendered }} />;
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function UserTesterPage() {
  const [isRunning, setIsRunning]   = useState(false);
  const [actions, setActions]       = useState<AgentAction[]>([]);
  const [thinking, setThinking]     = useState('');
  const [report, setReport]         = useState<BilanReport | null>(null);
  const [history, setHistory]       = useState<SavedBilan[]>([]);
  const [selected, setSelected]     = useState<SavedBilan | null>(null);
  const [startTime, setStartTime]   = useState(0);
  const [error, setError]           = useState('');
  const abortRef  = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setHistory(loadHistory()); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [actions, thinking]);

  const runTest = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    setActions([]);
    setThinking('');
    setReport(null);
    setSelected(null);
    setError('');
    const t0 = Date.now();
    setStartTime(t0);

    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/ai/user-tester', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setError((err as { error?: string }).error ?? `Erreur ${res.status}`);
        return;
      }

      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      let finalReport: BilanReport | null = null;
      let finalScore = 50;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });

        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6);
          if (raw === '[DONE]') break;
          try {
            const ev = JSON.parse(raw) as Record<string, unknown>;
            if (ev.type === 'thinking') {
              setThinking(ev.text as string);
            } else if (ev.type === 'action') {
              setActions(prev => [...prev, {
                id:     String(ev.id ?? Date.now()),
                tool:   ev.tool as string,
                input:  ev.input as Record<string, unknown>,
                status: 'running',
              }]);
            } else if (ev.type === 'result') {
              setActions(prev => prev.map(a =>
                a.id === (ev.id as string) ? { ...a, status: ev.status as ActionStatus, detail: ev.detail as string } : a
              ));
            } else if (ev.type === 'report') {
              finalReport = ev.report as BilanReport;
              setReport(finalReport);
            } else if (ev.type === 'done') {
              finalScore = ev.score as number;
            } else if (ev.type === 'error') {
              setError(ev.message as string);
            }
          } catch { /* skip */ }
        }
      }

      if (finalReport) {
        const saved: SavedBilan = {
          id: `bilan_${Date.now()}`,
          date: new Date().toISOString(),
          score: finalScore,
          verdict: finalReport.verdict,
          report: finalReport,
          durationMs: Date.now() - t0,
        };
        setHistory(prev => saveToHistory(saved, prev));
      }

    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
      }
    } finally {
      setIsRunning(false);
      setStartTime(0);
    }
  }, [isRunning]);

  const stop = () => { abortRef.current?.abort(); setIsRunning(false); };

  const displayReport  = selected?.report ?? report;
  const displayActions = selected ? [] : actions;
  const elapsed        = isRunning && startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;

  return (
    <div className="w-full min-h-screen flex text-white" style={{ backgroundColor: '#0a0a0a' }}>

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <div className="w-60 flex-shrink-0 border-r border-white/8 flex flex-col" style={{ backgroundColor: '#0d0d0d' }}>
        <div className="px-4 py-4 border-b border-white/8">
          <div className="flex items-center gap-2 mb-1">
            <ClipboardList size={15} className="text-indigo-400" />
            <span className="text-sm font-semibold text-white">Bilans IA</span>
          </div>
          <p className="text-[10px] text-white/30">Audit autonome de la plateforme</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {history.length === 0 && (
            <p className="text-[11px] text-white/25 px-2 pt-3">Aucun bilan. Lancez le premier audit.</p>
          )}
          {history.map(b => (
            <div
              key={b.id}
              onClick={() => { setSelected(b); setReport(b.report); setActions([]); setError(''); }}
              className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${selected?.id === b.id ? 'bg-white/10' : 'hover:bg-white/5'}`}
            >
              <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                style={{ backgroundColor: `${scoreColor(b.score)}20`, color: scoreColor(b.score) }}>
                {b.score}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-white/60 truncate">{fmtDate(b.date)}</p>
                <p className="text-[10px] text-white/30 truncate">{b.verdict}</p>
              </div>
              <button
                onClick={e => {
                  e.stopPropagation();
                  const updated = history.filter(h => h.id !== b.id);
                  setHistory(updated);
                  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
                  if (selected?.id === b.id) setSelected(null);
                }}
                className="opacity-0 group-hover:opacity-100 text-white/25 hover:text-red-400 transition-all flex-shrink-0"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <div className="flex items-center justify-between px-7 py-4 border-b border-white/8 flex-shrink-0">
          <div>
            <h1 className="font-semibold text-white">Audit Utilisateur IA</h1>
            <p className="text-xs text-white/35 mt-0.5">
              {isRunning
                ? `Audit en cours… ${elapsed}s`
                : "L'IA explore le site et génère des recommandations concrètes"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selected && (
              <button onClick={() => { setSelected(null); setReport(null); }}
                className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-white/40 hover:text-white hover:border-white/20 transition-colors">
                Nouveau bilan
              </button>
            )}
            {isRunning ? (
              <button onClick={stop}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                style={{ backgroundColor: '#ef444420', color: '#f87171', border: '1px solid #ef444440' }}>
                <RefreshCw size={13} className="animate-spin" /> Arrêter
              </button>
            ) : (
              <button onClick={runTest}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:scale-105 active:scale-95"
                style={{ backgroundColor: '#6366f1', color: 'white' }}>
                <Play size={13} /> Lancer l'Audit
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-7 space-y-5">

          {/* Error */}
          {error && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-red-500/20" style={{ backgroundColor: '#ef444410' }}>
              <AlertCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-red-300 font-medium text-sm">Erreur</p>
                <p className="text-red-200/60 text-xs mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!isRunning && displayActions.length === 0 && !displayReport && !error && (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: '#1a1a2e' }}>
                <Brain size={28} className="text-indigo-400" />
              </div>
              <div>
                <p className="text-white/60 font-medium">Audit autonome de la plateforme</p>
                <p className="text-white/30 text-sm mt-1.5 max-w-sm">
                  L'IA teste toutes les features, identifie les problèmes<br />
                  et génère des recommandations d'amélioration concrètes.
                </p>
              </div>
              <button onClick={runTest}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium mt-2 hover:scale-105 active:scale-95 transition-transform"
                style={{ backgroundColor: '#6366f1', color: 'white' }}>
                <Play size={14} /> Lancer l'Audit
              </button>
            </div>
          )}

          {/* Live agent feed */}
          {(isRunning || displayActions.length > 0) && !selected && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Terminal size={13} className="text-indigo-400" />
                <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider">Actions de l'agent</h2>
                {isRunning && <Loader2 size={13} className="text-indigo-400 animate-spin ml-1" />}
              </div>
              {isRunning && thinking && (
                <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg border border-indigo-500/20" style={{ backgroundColor: '#6366f110' }}>
                  <Brain size={13} className="text-indigo-400 mt-0.5 flex-shrink-0" />
                  <p className="text-indigo-200/70 text-xs leading-relaxed">{thinking}</p>
                </div>
              )}
              {displayActions.map((a, i) => <ActionCard key={`${a.id}-${i}`} action={a} />)}
              <div ref={bottomRef} />
            </div>
          )}

          {/* Final report */}
          {displayReport && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Star size={13} className="text-amber-400" />
                <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider">
                  {selected ? `Bilan du ${fmtDate(selected.date)}` : 'Bilan Final'}
                </h2>
                {selected && <span className="text-xs text-white/30">· {Math.round(selected.durationMs / 1000)}s</span>}
              </div>
              <ReportView report={displayReport} />
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
