/**
 * En-tête de module unifié (voix de marque) : eyebrow mono + titre Fraunces
 * (`font-display`) + slot `actions`. Sert à amener Fraunces dans l'app sur les
 * pages-modules à titre simple (trading, journal…), SANS toucher au rendu
 * canvas ni aux barres d'outils orderflow denses.
 *
 * - défaut (`bar={false}`) : bloc typographique sans bordure/fond, s'intègre
 *   dans une page padded (dashboards).
 * - `bar` : barre de chrome pleine largeur (surface + bordure basse) pour un
 *   module full-bleed.
 */
export default function ModuleHeader({
  eyebrow,
  title,
  accent,
  subtitle,
  actions,
  bar = false,
}: {
  eyebrow?: string;
  title: string;
  /** Mot-accent optionnel (Fraunces italic lime) — pattern editorial-contraste. */
  accent?: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  bar?: boolean;
}) {
  return (
    <header
      className={
        bar
          ? 'flex items-end justify-between gap-4 px-5 py-3 border-b shrink-0'
          : 'flex flex-col md:flex-row md:items-end md:justify-between gap-3'
      }
      style={bar ? { background: 'var(--surface)', borderColor: 'var(--border)' } : undefined}
    >
      <div className="min-w-0">
        {eyebrow && (
          <div
            className="mb-1.5"
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
        <h1 className="font-display text-2xl leading-none" style={{ color: 'var(--text-primary)' }}>
          {title}
          {accent && <span className="font-display-accent"> {accent}</span>}
        </h1>
        {subtitle && (
          <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}
