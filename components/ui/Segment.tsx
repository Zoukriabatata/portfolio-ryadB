'use client';

interface SegmentOption<T extends string> {
  id: T;
  label: React.ReactNode;
}

/**
 * Contrôle segmenté / pills unifié de l'app. État actif TEINTÉ (fond lime 0.12
 * + texte primary-light + liseré), jamais de pilule blanc-sur-lime plein.
 * Remplace les tabs/segmented ad hoc des modules.
 */
export default function Segment<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className = '',
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const pad = size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs';
  return (
    <div
      className={`inline-flex items-center gap-1 p-0.5 rounded-lg ${className}`}
      style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)' }}
      role="tablist"
    >
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={`press-fb rounded-md font-medium transition-colors ${pad}`}
            style={
              active
                ? {
                    background: 'rgb(var(--primary-rgb) / 0.12)',
                    color: 'var(--primary-light)',
                    boxShadow: 'inset 0 0 0 1px rgb(var(--primary-rgb) / 0.25)',
                  }
                : { color: 'var(--text-muted)' }
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
