'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { createPortal } from 'react-dom';

const STORAGE_KEY = (userId: string) => `senz_welcomed_${userId}`;

export default function WelcomeModal() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!session?.user?.id) return;
    const key = STORAGE_KEY(session.user.id);
    if (!localStorage.getItem(key)) {
      // Small delay so the dashboard renders first
      const t = setTimeout(() => setOpen(true), 800);
      return () => clearTimeout(t);
    }
  }, [session?.user?.id]);

  function dismiss() {
    if (session?.user?.id) {
      localStorage.setItem(STORAGE_KEY(session.user.id), '1');
    }
    setOpen(false);
  }

  if (!mounted || !open) return null;

  const isUltra = session?.user?.tier === 'PRO';
  const name = session?.user?.name?.split(' ')[0] || null;

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={dismiss}
    >
      <div
        className="relative w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: '#12121a', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Glow top */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(74,222,128,0.12), transparent 70%)', filter: 'blur(20px)' }} />

        {/* Close */}
        <button
          onClick={dismiss}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full text-white/40 hover:text-white/80 hover:bg-white/[0.06] transition-all"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="relative px-8 pt-8 pb-7">
          {/* Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold mb-5"
            style={{ background: 'rgba(74,222,128,0.1)', color: '#86efac', border: '1px solid rgba(74,222,128,0.2)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Platform ready
          </div>

          {/* Headline */}
          <h2 className="text-xl font-bold text-white/90 mb-2">
            {name ? `Welcome, ${name}!` : 'Welcome to Senzoukria!'}
          </h2>
          <p className="text-sm text-white/45 leading-relaxed mb-6">
            {isUltra
              ? 'Your PRO plan is active. All professional tools are unlocked and ready.'
              : 'Your free account is ready. Start exploring live charts — upgrade anytime to unlock the full suite.'}
          </p>

          {/* Feature pills */}
          <div className="grid grid-cols-2 gap-2 mb-7">
            {(isUltra
              ? [
                  { icon: '📊', label: 'Live Charts' },
                  { icon: '🔥', label: 'Footprint Charts' },
                  { icon: '🌊', label: 'Liquidity Heatmap' },
                  { icon: '⚡', label: 'GEX Dashboard' },
                  { icon: '📈', label: 'Volatility Surface' },
                  { icon: '🤖', label: 'AI Analysis' },
                ]
              : [
                  { icon: '📊', label: 'Live Charts' },
                  { icon: '⚙️', label: 'Drawing Tools' },
                  { icon: '🔒', label: 'Footprint — PRO' },
                  { icon: '🔒', label: 'Heatmap — PRO' },
                ]
            ).map((f, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span className="text-sm">{f.icon}</span>
                <span className="text-xs text-white/55">{f.label}</span>
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div className="flex flex-col gap-2.5">
            <Link
              href="/live"
              onClick={dismiss}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-black transition-all hover:-translate-y-0.5"
              style={{ background: 'linear-gradient(to right, #86efac, #4ade80)', boxShadow: '0 0 24px rgba(74,222,128,0.25)' }}
            >
              Open Live Charts
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
            {!isUltra && (
              <Link
                href="/pricing"
                onClick={dismiss}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium text-white/60 hover:text-white/90 border border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.04] transition-all"
              >
                View Pricing — from $29/mo
              </Link>
            )}
            <button
              onClick={dismiss}
              className="text-xs text-white/25 hover:text-white/45 transition-colors mt-1"
            >
              Explore on my own
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
