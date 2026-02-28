'use client';

/**
 * SENZOUKRIA Logo
 * Inspired by Senku from Dr. Stone
 * Scientific/Trading aesthetic with green energy accents
 */

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  animated?: boolean;
}

export default function Logo({ size = 'md', showText = true, animated = true }: LogoProps) {
  const sizes = {
    sm: { icon: 28, text: 'text-sm' },
    md: { icon: 36, text: 'text-lg' },
    lg: { icon: 48, text: 'text-2xl' },
  };

  const { icon: iconSize, text: textSize } = sizes[size];

  return (
    <div className="flex items-center gap-2">
      {/* Subtle animation keyframes for nav-size logo */}
      {animated && size === 'sm' && (
        <style>{`
          @keyframes subtlePulse { 0%, 100% { opacity: 0.15; } 50% { opacity: 0.25; } }
          @keyframes subtleFade { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.7; } }
          @keyframes subtleGlow { 0%, 100% { filter: drop-shadow(0 0 2px var(--logo-mid, #f59e0b)); } 50% { filter: drop-shadow(0 0 6px var(--logo-bright, #fbbf24)); } }
        `}</style>
      )}

      {/* Logo Icon - Scientific/Energy inspired */}
      <div className={`relative ${animated ? 'group' : ''}`}>
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={animated ? 'transition-transform duration-300 group-hover:scale-110' : ''}
          style={animated && size === 'sm' ? { animation: 'subtleGlow 4s ease-in-out infinite' } : undefined}
        >
          {/* Background glow */}
          <defs>
            <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--logo-bright, #fbbf24)" />
              <stop offset="50%" stopColor="var(--logo-mid, #f59e0b)" />
              <stop offset="100%" stopColor="var(--logo-dark, #d97706)" />
            </linearGradient>
            <linearGradient id="energyGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--logo-bright, #fbbf24)" stopOpacity="0" />
              <stop offset="50%" stopColor="var(--logo-bright, #fbbf24)" stopOpacity="1" />
              <stop offset="100%" stopColor="var(--logo-bright, #fbbf24)" stopOpacity="0" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          {/* Outer hexagon - scientific frame */}
          <path
            d="M24 4L42 14V34L24 44L6 34V14L24 4Z"
            fill="url(#logoGradient)"
            fillOpacity="0.15"
            stroke="url(#logoGradient)"
            strokeWidth="1.5"
            style={animated ? {
              animation: size === 'sm' ? 'subtlePulse 4s ease-in-out infinite' : 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            } : undefined}
          />

          {/* Inner energy core */}
          <circle
            cx="24"
            cy="24"
            r="12"
            fill="none"
            stroke="url(#logoGradient)"
            strokeWidth="2"
            strokeDasharray="4 2"
            className=""
          />

          {/* Central S letter - stylized */}
          <path
            d="M28 16C28 16 26 14 22 14C18 14 16 16 16 19C16 22 18 23 22 24C26 25 28 26 28 29C28 32 26 34 22 34C18 34 16 32 16 32"
            fill="none"
            stroke="var(--logo-mid, #f59e0b)"
            strokeWidth="3"
            strokeLinecap="round"
            filter="url(#glow)"
          />

          {/* Energy sparks */}
          <circle cx="8" cy="24" r="2" fill="var(--logo-bright, #fbbf24)" style={animated ? {
            animation: size === 'sm' ? 'subtleFade 3s ease-in-out infinite' : 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
          } : undefined} />
          <circle cx="40" cy="24" r="2" fill="var(--logo-bright, #fbbf24)" style={animated ? {
            animation: size === 'sm' ? 'subtleFade 3s ease-in-out infinite 1s' : 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite 0.5s',
          } : undefined} />
          <circle cx="24" cy="8" r="2" fill="var(--logo-bright, #fbbf24)" style={animated ? {
            animation: size === 'sm' ? 'subtleFade 3s ease-in-out infinite 2s' : 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite 1s',
          } : undefined} />

          {/* Bottom accent dot */}
          <circle cx="24" cy="40" r="1.5" fill="var(--logo-mid, #f59e0b)" opacity="0.5" />
        </svg>

        {/* Glow effect behind */}
        {animated && (
          <div className="absolute inset-0 blur-xl rounded-full scale-150 opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: 'var(--logo-mid, #f59e0b)', opacity: 'inherit' }} />
        )}
      </div>

      {/* Text */}
      {showText && (
        <div className="flex flex-col">
          <span className={`font-bold ${textSize} tracking-tight`} style={{ background: 'linear-gradient(to right, var(--logo-bright, #fbbf24), var(--logo-mid, #f59e0b), var(--logo-dark, #d97706))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            SENZOU<span style={{ WebkitTextFillColor: 'var(--text-primary)' }}>KRIA</span>
          </span>
          {size !== 'sm' && (
            <span className="text-[10px] text-[var(--text-muted)] tracking-widest uppercase -mt-1">
              Trading Intelligence
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Favicon/App Icon version
 */
export function LogoIcon({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="logoGradientIcon" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--logo-bright, #fbbf24)" />
          <stop offset="100%" stopColor="var(--logo-dark, #d97706)" />
        </linearGradient>
      </defs>
      <path
        d="M24 4L42 14V34L24 44L6 34V14L24 4Z"
        fill="url(#logoGradientIcon)"
        fillOpacity="0.2"
        stroke="url(#logoGradientIcon)"
        strokeWidth="2"
      />
      <path
        d="M28 16C28 16 26 14 22 14C18 14 16 16 16 19C16 22 18 23 22 24C26 25 28 26 28 29C28 32 26 34 22 34C18 34 16 32 16 32"
        fill="none"
        stroke="var(--logo-mid, #f59e0b)"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
