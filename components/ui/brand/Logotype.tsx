'use client';
import { useReducedMotion } from './useReducedMotion';

interface LogotypeProps {
  /** hauteur de police en px */
  fontSize?: number;
  animated?: boolean;
  className?: string;
}

// ellipse de l'orbite intérieure du o-atome (viewBox 40, rx17 ry6)
const O_ORBIT = 'M3,20 a17,6 0 1,0 34,0 a17,6 0 1,0 -34,0';

/** Logotype « senz⊛ukria » : le « o » est l'atome (anneau blanc + orbite/électron néon thème). */
export default function Logotype({ fontSize = 19, animated = true, className }: LogotypeProps) {
  const prefersReduced = useReducedMotion();
  const anim = animated && !prefersReduced;

  return (
    <span
      className={className}
      style={{
        fontFamily: 'var(--font-fraunces)',
        fontWeight: 600,
        fontSize,
        letterSpacing: '-.01em',
        color: 'var(--text-primary)',
        display: 'inline-flex',
        alignItems: 'baseline',
        lineHeight: 1,
      }}
      aria-label="senzoukria"
    >
      senz
      <span
        className={animated ? 'brand-anim' : undefined}
        style={{ display: 'inline-block', width: '.62em', height: '.62em', transform: 'translateY(.06em)', margin: '0 .02em' }}
        aria-hidden="true"
      >
        <svg viewBox="0 0 40 40" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          {/* "o" lettre, suit la couleur du texte (thème) */}
          <circle cx="20" cy="20" r="15.5" fill="none" stroke="currentColor" strokeWidth="3" />
          {/* atome néon thème : orbite + électron, glow via #neon */}
          <g filter="url(#neon)">
            <g transform="rotate(-26 20 20)">
              <ellipse cx="20" cy="20" rx="17" ry="6" fill="none" strokeWidth="1.5" style={{ stroke: 'var(--primary)', strokeOpacity: 0.9 }} />
              <circle r="2.4" cx={anim ? 0 : 3} cy={anim ? 0 : 20} style={{ fill: 'var(--primary-light)' }}>
                {anim && <animateMotion dur="6s" repeatCount="indefinite" path={O_ORBIT} />}
              </circle>
            </g>
          </g>
        </svg>
      </span>
      ukria
    </span>
  );
}
