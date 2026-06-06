'use client';
import { useReducedMotion } from '@/components/ui/brand/useReducedMotion';

/** électrons scintillants — positions déterministes (pas de Math.random au render SSR) */
const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  left: (i * 53) % 100,
  top: (i * 37) % 60,
  size: 1 + (i % 3) * 0.6,
  dur: 3 + (i % 5),
  delay: i % 4,
}));

const ATOM_PATH = 'M8,100 a92,33 0 1,0 184,0 a92,33 0 1,0 -184,0';
const ORBITS = [
  { rot: 0, color: 'var(--primary)', op: 0.55, dur: 11 },
  { rot: 60, color: 'var(--accent)', op: 0.45, dur: 15 },
  { rot: 120, color: 'var(--primary)', op: 0.45, dur: 9 },
];

export default function HeroBackground() {
  const prefersReduced = useReducedMotion();
  const anim = !prefersReduced;

  return (
    <div className="brand-anim" aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
      {/* aurora */}
      <div style={{
        position: 'absolute', left: '50%', top: -260, width: 1300, height: 700, marginLeft: -650,
        background: 'radial-gradient(440px 300px at 32% 42%, rgb(var(--primary-rgb) / .18), transparent 70%),radial-gradient(400px 280px at 66% 38%, rgb(var(--accent-rgb) / .15), transparent 70%),radial-gradient(320px 240px at 50% 66%, rgb(var(--primary-dark-rgb) / .10), transparent 70%)',
        filter: 'blur(42px)', opacity: 0.58, animation: 'brand-aurora 24s ease-in-out infinite alternate',
      }} />

      {/* grille périodique atténuée */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.22,
        backgroundImage: 'linear-gradient(rgba(255,255,255,.02) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.02) 1px,transparent 1px)',
        backgroundSize: '52px 52px',
        WebkitMaskImage: 'radial-gradient(680px 400px at 50% 24%, #000 22%, transparent 78%)',
        maskImage: 'radial-gradient(680px 400px at 50% 24%, #000 22%, transparent 78%)',
      }} />

      {/* atome orbital (3 ellipses + électrons) */}
      <div style={{ position: 'absolute', left: '50%', top: 46, transform: 'translateX(-50%)', width: 540, height: 540, opacity: 0.16 }}>
        <svg viewBox="0 0 200 200" width="100%" height="100%"
             style={{ transformOrigin: 'center', animation: 'brand-atom-spin var(--brand-spin) linear infinite' }}>
          {ORBITS.map((o, i) => (
            <g key={i} transform={`rotate(${o.rot} 100 100)`}>
              <ellipse cx="100" cy="100" rx="92" ry="33" fill="none" strokeWidth="1" style={{ stroke: o.color, strokeOpacity: o.op }} />
              <circle r={i === 0 ? 2.6 : 2.4} cx={anim ? 0 : 8} cy={anim ? 0 : 100} style={{ fill: o.color }}>
                {anim && <animateMotion dur={`${o.dur}s`} repeatCount="indefinite" path={ATOM_PATH} />}
              </circle>
            </g>
          ))}
          <circle cx="100" cy="100" r="4" opacity="0.7" style={{ fill: 'var(--primary)' }} />
        </svg>
      </div>

      {/* halo de noyau */}
      <div style={{ position: 'absolute', left: '50%', top: 316, transform: 'translate(-50%,-50%)', width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, rgb(var(--primary-rgb) / .10), transparent 62%)', filter: 'blur(16px)' }} />

      {/* particules */}
      {PARTICLES.map((p, i) => (
        <i key={i} style={{
          position: 'absolute', left: `${p.left}%`, top: `${p.top}%`, width: p.size, height: p.size,
          borderRadius: '50%', background: 'rgb(var(--primary-rgb))', boxShadow: '0 0 4px rgb(var(--primary-rgb) / .6)', opacity: 0.2,
          animation: `brand-twinkle ${p.dur}s ease-in-out ${p.delay}s infinite alternate`,
        }} />
      ))}

      {/* grain */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.04, backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }} />

      {/* vignette + fondu bas + ligne d'énergie */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 92% at 50% 0%, transparent 50%, rgba(0,0,0,.55))' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 380, background: 'linear-gradient(to bottom, transparent 0%, var(--background) 72%)' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg,transparent,rgb(var(--primary-rgb) / .55),transparent)' }} />
    </div>
  );
}
