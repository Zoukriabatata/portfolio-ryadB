'use client';

import { useId } from 'react';

/**
 * Checkbox de marque accessible.
 *
 * Pattern « input natif masqué + boîte stylée » : on garde un vrai
 * <input type="checkbox"> (clavier, form, lecteurs d'écran) qu'on rend
 * visuellement invisible, et on peint une boîte custom synchronisée sur
 * `peer-checked`. L'état coché dessine un checkmark SVG via `.animate-check`
 * (keyframe `checkDraw` dans styles/animations.css).
 *
 * Tokens de marque uniquement (--primary, --border, --text-muted…), pas de
 * couleur en dur. Cohérent avec les inputs de la page auth (ring primary/30).
 */
export default function Checkbox({
  checked,
  onChange,
  children,
  id,
  className = '',
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
  id?: string;
  className?: string;
}) {
  const autoId = useId();
  const inputId = id ?? autoId;

  return (
    <label
      htmlFor={inputId}
      className={`group flex items-start gap-2.5 cursor-pointer text-xs ${className}`}
      style={{ color: 'var(--text-muted)' }}
    >
      <span className="relative mt-px flex-shrink-0">
        {/* Input réel — masqué mais focusable. `peer` pilote la boîte. */}
        <input
          id={inputId}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 h-[18px] w-[18px] cursor-pointer opacity-0"
        />
        {/* Boîte peinte */}
        <span
          aria-hidden="true"
          className="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] transition-all duration-200 peer-checked:scale-[0.92] peer-focus-visible:ring-2 peer-focus-visible:ring-[rgb(var(--primary-rgb)/0.35)]"
          style={{
            background: checked ? 'var(--primary)' : 'var(--surface-elevated)',
            border: `1px solid ${checked ? 'var(--primary)' : 'var(--border)'}`,
            boxShadow: checked
              ? '0 0 0 3px rgb(var(--primary-rgb) / 0.12)'
              : 'none',
          }}
        >
          {checked && (
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--background)"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path className="animate-check" d="M5 12.5l4.5 4.5L19 7" />
            </svg>
          )}
        </span>
      </span>
      <span className="leading-relaxed">{children}</span>
    </label>
  );
}
