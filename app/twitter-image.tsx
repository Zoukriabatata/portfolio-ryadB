import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Senzoukria — Professional Order Flow Analytics';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function TwitterImage() {
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
              'linear-gradient(rgba(74,222,128,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(74,222,128,0.4) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        {/* Glow effect */}
        <div
          style={{
            position: 'absolute',
            top: '-200px',
            left: '50%',
            width: '800px',
            height: '400px',
            borderRadius: '50%',
            background: 'radial-gradient(ellipse, rgba(74,222,128,0.18) 0%, transparent 70%)',
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
          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '96px',
              height: '96px',
              borderRadius: '24px',
              background: 'linear-gradient(160deg, #141830, #0a0c16)',
              border: '1px solid rgba(255,255,255,0.14)',
              marginBottom: '10px',
              boxShadow: '0 0 60px rgba(74,222,128,0.25)',
            }}
          >
            <div
              style={{
                position: 'absolute',
                width: '70px',
                height: '70px',
                borderRadius: '50%',
                border: '2px solid rgba(74,222,128,0.30)',
                display: 'flex',
              }}
            />
            <div style={{ display: 'flex', fontSize: '46px', fontWeight: 600, fontFamily: 'Georgia, serif', color: '#e8eaf6' }}>Sz</div>
          </div>

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

          <div
            style={{
              width: '120px',
              height: '3px',
              background: 'linear-gradient(90deg, transparent, #4ade80, #2dd4bf, transparent)',
              borderRadius: '2px',
              display: 'flex',
              margin: '4px 0',
            }}
          />

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
            The Science of Orderflow
          </div>

          <div
            style={{
              display: 'flex',
              gap: '16px',
              marginTop: '28px',
            }}
          >
            {['Footprint', 'NT Bridge', 'Rithmic', 'CME Futures'].map(
              (feature) => (
                <div
                  key={feature}
                  style={{
                    display: 'flex',
                    padding: '8px 20px',
                    borderRadius: '100px',
                    border: '1px solid rgba(74,222,128,0.35)',
                    background: 'rgba(74,222,128,0.10)',
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

        <div
          style={{
            position: 'absolute',
            bottom: '0',
            left: '0',
            right: '0',
            height: '4px',
            background: 'linear-gradient(90deg, #4ade80, #2dd4bf, #4ade80)',
            display: 'flex',
          }}
        />
      </div>
    ),
    { ...size }
  );
}
