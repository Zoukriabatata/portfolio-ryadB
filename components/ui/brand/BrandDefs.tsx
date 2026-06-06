/**
 * Defs SVG partagées par tous les composants de marque.
 * Monté UNE seule fois (layout). Les ids (#szFill, #szEdge, #szCharge,
 * #szGlow, #neon) sont référencés par url(#id) depuis les autres SVG.
 *
 * Les couleurs de marque passent par les variables de thème (var(--primary)…)
 * via `style` (les attributs SVG ne résolvent pas var()). → suit le thème actif.
 */
export default function BrandDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
      <defs>
        <radialGradient id="szFill" cx="30%" cy="16%" r="85%">
          <stop offset="0%" style={{ stopColor: 'var(--primary)', stopOpacity: 0.12 }} />
          <stop offset="42%" style={{ stopColor: '#ffffff', stopOpacity: 0.018 }} />
          <stop offset="100%" style={{ stopColor: '#ffffff', stopOpacity: 0 }} />
        </radialGradient>
        <linearGradient id="szEdge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: '#ffffff', stopOpacity: 0.22 }} />
          <stop offset="100%" style={{ stopColor: '#ffffff', stopOpacity: 0.05 }} />
        </linearGradient>
        <linearGradient id="szCharge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--primary-light)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--primary-dark)' }} />
        </linearGradient>
        <filter id="szGlow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="neon" x="-150%" y="-150%" width="400%" height="400%">
          <feGaussianBlur stdDeviation="1.2" result="n1" />
          <feGaussianBlur stdDeviation="2.8" result="n2" />
          <feMerge>
            <feMergeNode in="n2" />
            <feMergeNode in="n1" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  );
}
