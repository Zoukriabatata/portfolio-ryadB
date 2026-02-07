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
      {/* Logo Icon - Scientific/Energy inspired */}
      <div className={`relative ${animated ? 'group' : ''}`}>
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={animated ? 'transition-transform duration-300 group-hover:scale-110' : ''}
        >
          {/* Background glow */}
          <defs>
            <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#22c55e" />
              <stop offset="50%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>
            <linearGradient id="energyGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#22c55e" stopOpacity="0" />
              <stop offset="50%" stopColor="#22c55e" stopOpacity="1" />
              <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
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
            className={animated ? 'animate-pulse' : ''}
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
            className={animated ? 'origin-center animate-spin' : ''}
            style={{ animationDuration: '8s' }}
          />

          {/* Central S letter - stylized */}
          <path
            d="M28 16C28 16 26 14 22 14C18 14 16 16 16 19C16 22 18 23 22 24C26 25 28 26 28 29C28 32 26 34 22 34C18 34 16 32 16 32"
            fill="none"
            stroke="#22c55e"
            strokeWidth="3"
            strokeLinecap="round"
            filter="url(#glow)"
          />

          {/* Energy sparks */}
          <circle cx="8" cy="24" r="2" fill="#22c55e" className={animated ? 'animate-ping' : ''} style={{ animationDuration: '2s' }} />
          <circle cx="40" cy="24" r="2" fill="#22c55e" className={animated ? 'animate-ping' : ''} style={{ animationDuration: '2s', animationDelay: '0.5s' }} />
          <circle cx="24" cy="8" r="2" fill="#22c55e" className={animated ? 'animate-ping' : ''} style={{ animationDuration: '2s', animationDelay: '1s' }} />

          {/* Scientific formula accent (E=mc²) small */}
          <text x="32" y="40" fontSize="6" fill="#22c55e" fontFamily="monospace" opacity="0.7">
            E²
          </text>
        </svg>

        {/* Glow effect behind */}
        {animated && (
          <div className="absolute inset-0 bg-green-500/20 blur-xl rounded-full scale-150 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        )}
      </div>

      {/* Text */}
      {showText && (
        <div className="flex flex-col">
          <span className={`font-bold ${textSize} tracking-tight bg-gradient-to-r from-green-400 via-emerald-300 to-green-500 bg-clip-text text-transparent`}>
            SENZOU<span className="text-white">KRIA</span>
          </span>
          {size !== 'sm' && (
            <span className="text-[10px] text-zinc-500 tracking-widest uppercase -mt-1">
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
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#059669" />
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
        stroke="#22c55e"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
