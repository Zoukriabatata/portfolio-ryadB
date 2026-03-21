import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Senzoukria — Professional Order Flow Analytics';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(145deg, #0a0a0f 0%, #0d0d1a 30%, #111128 60%, #0a0a0f 100%)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Grid pattern overlay */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            opacity: 0.08,
            backgroundImage:
              'linear-gradient(rgba(99,102,241,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.5) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        {/* Glow effect top */}
        <div
          style={{
            position: 'absolute',
            top: '-200px',
            left: '50%',
            width: '800px',
            height: '400px',
            borderRadius: '50%',
            background: 'radial-gradient(ellipse, rgba(99,102,241,0.15) 0%, transparent 70%)',
            display: 'flex',
          }}
        />

        {/* Glow effect bottom-right */}
        <div
          style={{
            position: 'absolute',
            bottom: '-100px',
            right: '-100px',
            width: '500px',
            height: '300px',
            borderRadius: '50%',
            background: 'radial-gradient(ellipse, rgba(139,92,246,0.1) 0%, transparent 70%)',
            display: 'flex',
          }}
        />

        {/* Main content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            zIndex: 1,
          }}
        >
          {/* Logo icon */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '80px',
              height: '80px',
              borderRadius: '20px',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              marginBottom: '8px',
              boxShadow: '0 0 60px rgba(99,102,241,0.3)',
            }}
          >
            <svg
              width="44"
              height="44"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 3v18h18" />
              <path d="M7 16l4-8 4 4 4-8" />
            </svg>
          </div>

          {/* Brand name */}
          <div
            style={{
              fontSize: '72px',
              fontWeight: 800,
              letterSpacing: '8px',
              color: 'white',
              textTransform: 'uppercase' as const,
              display: 'flex',
            }}
          >
            SENZOUKRIA
          </div>

          {/* Divider line */}
          <div
            style={{
              width: '120px',
              height: '3px',
              background: 'linear-gradient(90deg, transparent, #6366f1, #8b5cf6, transparent)',
              borderRadius: '2px',
              display: 'flex',
              margin: '4px 0',
            }}
          />

          {/* Tagline */}
          <div
            style={{
              fontSize: '22px',
              fontWeight: 500,
              color: 'rgba(255,255,255,0.7)',
              letterSpacing: '4px',
              textTransform: 'uppercase' as const,
              display: 'flex',
            }}
          >
            Professional Order Flow Analytics
          </div>

          {/* Feature pills */}
          <div
            style={{
              display: 'flex',
              gap: '16px',
              marginTop: '28px',
            }}
          >
            {['Heatmaps', 'Footprint', 'Delta Profile', 'GEX'].map(
              (feature) => (
                <div
                  key={feature}
                  style={{
                    display: 'flex',
                    padding: '8px 20px',
                    borderRadius: '100px',
                    border: '1px solid rgba(99,102,241,0.3)',
                    background: 'rgba(99,102,241,0.08)',
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: '14px',
                    fontWeight: 500,
                    letterSpacing: '1px',
                  }}
                >
                  {feature}
                </div>
              )
            )}
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            position: 'absolute',
            bottom: '0',
            left: '0',
            right: '0',
            height: '4px',
            background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #6366f1)',
            display: 'flex',
          }}
        />
      </div>
    ),
    { ...size }
  );
}
