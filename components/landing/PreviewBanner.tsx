'use client';
import { useEffect, useState } from 'react';

// Fin de la fenêtre preview : 17 juin 2026 (fin de journée, heure locale).
const TARGET = new Date('2026-06-17T23:59:59').getTime();

interface Left { d: number; h: number; m: number; s: number }

// Segment de compte à rebours — composant module-level (pas recréé au render).
function Seg({ val, label }: { val: string; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      <div
        style={{
          minWidth: 32, textAlign: 'center', fontFamily: 'var(--font-jetbrains-mono)', fontWeight: 600, fontSize: 17,
          color: 'var(--primary-light)', fontVariantNumeric: 'tabular-nums',
          background: 'rgb(var(--primary-rgb) / 0.08)', border: '1px solid rgb(var(--primary-rgb) / 0.20)',
          borderRadius: 6, padding: '5px 6px', lineHeight: 1,
        }}
      >
        {val}
      </div>
      <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 8, letterSpacing: '.1em', color: 'var(--text-muted)' }}>{label}</span>
    </div>
  );
}

/**
 * Panel tombant fixe (côté gauche) — compte à rebours "Free PRO ends in".
 * Drop-in animé pour accrocher le regard, dismissible (mémorisé).
 */
export default function PreviewBanner() {
  const [open, setOpen] = useState(true);
  const [closing, setClosing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [left, setLeft] = useState<Left>({ d: 0, h: 0, m: 0, s: 0 });

  useEffect(() => {
    // Pas de persistance : le panel réapparaît à chaque reload (rappel preview active).
    setMounted(true);

    const tick = () => {
      const diff = TARGET - Date.now();
      if (diff <= 0) { setLeft({ d: 0, h: 0, m: 0, s: 0 }); return; }
      const s = Math.floor(diff / 1000);
      setLeft({
        d: Math.floor(s / 86400),
        h: Math.floor((s % 86400) / 3600),
        m: Math.floor((s % 3600) / 60),
        s: s % 60,
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Rendu uniquement après hydratation : pas de mismatch SSR + le drop-in se joue à l'arrivée.
  if (!mounted || !open) return null;

  const pad = (n: number) => String(n).padStart(2, '0');
  const dismiss = () => {
    setClosing(true);
    setTimeout(() => setOpen(false), 380); // laisse jouer l'animation de sortie
  };

  return (
    <div
      className="brand-anim"
      role="status"
      style={{
        position: 'fixed', top: 92, left: 20, zIndex: 150, width: 252,
        background: 'rgb(var(--primary-rgb) / 0.07)',
        border: '1px solid rgb(var(--primary-rgb) / 0.28)',
        borderRadius: 14, padding: '13px 14px',
        backdropFilter: 'blur(16px) saturate(140%)', WebkitBackdropFilter: 'blur(16px) saturate(140%)',
        boxShadow: '0 18px 44px rgba(0,0,0,.45), 0 0 30px rgb(var(--primary-rgb) / 0.14)',
        animation: closing
          ? 'brand-drop-out 0.38s cubic-bezier(.4,0,1,.6) forwards'
          : 'brand-drop 0.9s cubic-bezier(.22,1.2,.36,1) both, brand-floaty 5s ease-in-out 0.9s infinite',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <span className="relative inline-flex w-1.5 h-1.5">
          <span className="absolute inset-0 rounded-full animate-ping" style={{ background: 'var(--primary)', opacity: 0.55 }} />
          <span className="relative inline-flex w-1.5 h-1.5 rounded-full" style={{ background: 'var(--primary)' }} />
        </span>
        <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--primary)' }}>Public preview</span>
        <button
          onClick={dismiss}
          aria-label="Dismiss announcement"
          style={{ marginLeft: 'auto', width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', lineHeight: 0 }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 10 }}>Free PRO ends in</div>

      <div style={{ display: 'flex', gap: 7, justifyContent: 'space-between' }}>
        <Seg val={String(left.d)} label="DAYS" />
        <Seg val={pad(left.h)} label="HRS" />
        <Seg val={pad(left.m)} label="MIN" />
        <Seg val={pad(left.s)} label="SEC" />
      </div>
    </div>
  );
}
