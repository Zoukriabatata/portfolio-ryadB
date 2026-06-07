'use client';

import Link from 'next/link';
import Logotype from '@/components/ui/brand/Logotype';

/**
 * Coquille de marque partagée par les pages auth (login excepté, qui garde
 * son layout magazine). Fournit : fond tokenisé + glows ambiants, le mark
 * de marque (Logotype, lien accueil) et une carte verre. Le titre éditorial
 * (Fraunces) et le contenu (formulaire) vivent dans `children` via
 * <AuthHeading>, pour que chaque page contrôle son titre selon l'état.
 */
export default function AuthShell({
  children,
  maxWidth = 'max-w-md',
}: {
  children: React.ReactNode;
  maxWidth?: string;
}) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: 'var(--background)' }}
    >
      <div
        className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgb(var(--primary-rgb) / 0.06) 0%, transparent 70%)', filter: 'blur(80px)' }}
      />
      <div
        className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgb(var(--primary-rgb) / 0.03) 0%, transparent 70%)', filter: 'blur(80px)' }}
      />

      <div className={`w-full ${maxWidth} animate-fadeIn relative z-10`}>
        <div className="flex justify-center mb-8">
          <Link href="/" aria-label="Senzoukria">
            <Logotype fontSize={24} />
          </Link>
        </div>
        <div
          className="rounded-2xl p-8 animate-slideUp backdrop-blur-sm"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** En-tête éditorial intra-carte : eyebrow mono + titre Fraunces + sous-titre. */
export function AuthHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-6">
      {eyebrow && (
        <div
          className="mb-2"
          style={{
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 10,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          {eyebrow}
        </div>
      )}
      <h1 className="font-display text-3xl mb-2" style={{ color: 'var(--text-primary)' }}>
        {title}
      </h1>
      {subtitle && (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
