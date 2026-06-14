'use client';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

const PROMO_CODE      = 'SZK60';
const PROMO_DISCOUNT  = 60;
const PRICE_FULL      = 29;
const PRICE_PROMO     = +(PRICE_FULL * (1 - PROMO_DISCOUNT / 100)).toFixed(2); // 11.60
const TARGET          = new Date('2026-06-17T23:59:59').getTime();

interface Left { d: number; h: number; m: number; s: number }

function Seg({ val, label }: { val: string; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      <div
        style={{
          minWidth: 32, textAlign: 'center', fontFamily: 'var(--font-jetbrains-mono)', fontWeight: 600, fontSize: 15,
          color: 'var(--primary-light)', fontVariantNumeric: 'tabular-nums',
          background: 'rgb(var(--primary-rgb) / 0.08)', border: '1px solid rgb(var(--primary-rgb) / 0.20)',
          borderRadius: 6, padding: '4px 5px', lineHeight: 1,
        }}
      >
        {val}
      </div>
      <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 7, letterSpacing: '.1em', color: 'var(--text-muted)' }}>{label}</span>
    </div>
  );
}

export default function PreviewBanner() {
  const [open, setOpen]       = useState(true);
  const [closing, setClosing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [left, setLeft]       = useState<Left>({ d: 0, h: 0, m: 0, s: 0 });
  const [percent, setPercent] = useState(0);
  const rafRef                = useRef<number>(0);

  useEffect(() => {
    setMounted(true);

    // Countdown tick
    const pad = (n: number) => n;
    const tick = () => {
      const diff = TARGET - Date.now();
      if (diff <= 0) { setLeft({ d: 0, h: 0, m: 0, s: 0 }); return; }
      const s = Math.floor(diff / 1000);
      setLeft({ d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 });
    };
    tick();
    const id = setInterval(tick, 1000);

    // Count-up 0 → 60%
    const start    = performance.now();
    const duration = 900;
    const countUp  = (now: number) => {
      const t     = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setPercent(Math.round(eased * PROMO_DISCOUNT));
      if (t < 1) rafRef.current = requestAnimationFrame(countUp);
    };
    rafRef.current = requestAnimationFrame(countUp);

    return () => { clearInterval(id); cancelAnimationFrame(rafRef.current); };
  }, []);

  if (!mounted || !open) return null;

  const pad = (n: number) => String(n).padStart(2, '0');
  const dismiss = () => { setClosing(true); setTimeout(() => setOpen(false), 380); };

  const copyCode = () => {
    navigator.clipboard.writeText(PROMO_CODE).then(() => {
      toast.success('Code copied!', { description: 'Paste it at checkout for 60% off.' });
    });
  };

  return (
    <div
      className="brand-anim"
      role="status"
      aria-label="Promo code widget"
      style={{
        position: 'fixed', top: 92, left: 20, zIndex: 150, width: 258,
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
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <span style={{ fontSize: 11 }} aria-hidden="true">⚡</span>
        <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--primary)' }}>
          Promo Code
        </span>
        <button
          onClick={dismiss}
          aria-label="Dismiss promo"
          style={{ marginLeft: 'auto', width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', lineHeight: 0 }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* ── Discount display ── */}
      <div style={{ textAlign: 'center', marginBottom: 10 }}>
        <div style={{ fontFamily: 'var(--font-fraunces, var(--font-display))', fontStyle: 'italic', fontWeight: 600, fontSize: 46, lineHeight: 1, color: 'var(--primary)', textShadow: '0 0 28px rgb(var(--primary-rgb) / 0.45)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
          {percent}%
        </div>
        <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 13, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--primary-light)', marginTop: 1 }}>
          OFF
        </div>
        <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9.5, letterSpacing: '0.06em', color: 'var(--text-muted)', marginTop: 4 }}>
          first month · ${PRICE_PROMO}/mo
        </div>
      </div>

      {/* ── Code chip + copy ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button
          onClick={copyCode}
          title="Copy promo code"
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            fontFamily: 'var(--font-jetbrains-mono)', fontWeight: 700, fontSize: 13, letterSpacing: '0.14em',
            color: 'var(--primary-light)',
            background: 'rgb(var(--primary-rgb) / 0.10)',
            border: '1px solid rgb(var(--primary-rgb) / 0.40)',
            borderRadius: 8, padding: '8px 10px', cursor: 'pointer',
            transition: 'background 0.15s, border-color 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgb(var(--primary-rgb) / 0.18)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgb(var(--primary-rgb) / 0.10)'; }}
        >
          {PROMO_CODE}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
      </div>

      {/* ── Countdown ── */}
      <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 7 }}>
        Expires in
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
        <Seg val={String(left.d)} label="DAYS" />
        <Seg val={pad(left.h)}   label="HRS"  />
        <Seg val={pad(left.m)}   label="MIN"  />
        <Seg val={pad(left.s)}   label="SEC"  />
      </div>
    </div>
  );
}
