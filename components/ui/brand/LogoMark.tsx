'use client';
import { resolveMarkColors, type MarkVariant } from './logoVariants';
import { useReducedMotion } from './useReducedMotion';

interface LogoMarkProps {
  /** côté en px */
  size?: number;
  variant?: MarkVariant;
  /** forme réduite (≤32px) : "Sz" seul, sans atome ni numéro */
  minimal?: boolean;
  /** active orbite + charge d'énergie */
  animated?: boolean;
  className?: string;
}

// ellipse de Bohr (rx44 ry17, centre 50,50) — MÊME tracé pour la ligne
// visible ET le déplacement de l'électron (animateMotion path).
const ORBIT_PATH = 'M6,50 a44,17 0 1,0 88,0 a44,17 0 1,0 -88,0';

export default function LogoMark({
  size = 48, variant = 'default', minimal = false, animated = true, className,
}: LogoMarkProps) {
  const c = resolveMarkColors(variant);
  const prefersReduced = useReducedMotion();
  const anim = animated && !prefersReduced;
  const showAtom = !minimal;
  const svgClass = `${animated ? 'brand-anim' : ''}${className ? ` ${className}` : ''}`.trim();

  // fill/stroke en `style` (CSS) pour que var(--…) résolve le thème — les
  // attributs SVG (fill="…") ne supportent pas var().
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={svgClass || undefined}
      role="img"
      aria-label="Senzoukria"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="50" cy="50" r="45" strokeWidth="1.3" style={{ fill: c.fill, stroke: c.edge }} />

      {showAtom && (
        <>
          <g transform="rotate(-26 50 50)">
            <path d={ORBIT_PATH} fill="none" strokeWidth="1" style={{ stroke: c.electron, strokeOpacity: 0.16 }} />
            <circle r="2.6" cx={anim ? 0 : 6} cy={anim ? 0 : 50} filter="url(#szGlow)" style={{ fill: c.electron }}>
              {anim && <animateMotion dur="6s" repeatCount="indefinite" path={ORBIT_PATH} />}
            </circle>
          </g>

          {animated && (
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="url(#szCharge)"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeDasharray="283"
              strokeDashoffset="283"
              transform="rotate(-90 50 50)"
              opacity="0"
              style={{ animation: 'brand-charge var(--brand-charge) ease-in-out infinite' }}
            />
          )}

          <text
            x="50"
            y="33"
            textAnchor="middle"
            fontFamily="var(--font-jetbrains-mono)"
            fontSize="9.5"
            fontWeight={500}
            letterSpacing="0.5"
            style={{ fill: c.electron, fillOpacity: 0.9 }}
          >
            79
          </text>
        </>
      )}

      <text
        x="50.5"
        y={showAtom ? 62 : 64.5}
        textAnchor="middle"
        fontFamily="var(--font-fraunces)"
        fontSize={showAtom ? 34 : 47}
        fontWeight={showAtom ? 600 : 700}
        letterSpacing={showAtom ? -1.2 : -1.6}
        style={{ fill: c.symbol }}
      >
        Sz
      </text>
    </svg>
  );
}
