'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Renvoie `true` brièvement (`durMs`) quand `value` change, pour piloter une
 * classe d'animation (`value-flash`) sans remonter le nœud :
 *
 *   const flash = useValueFlash(netGex);
 *   <span className={flash ? 'value-flash' : ''}>{netGex}</span>
 *
 * Respecte prefers-reduced-motion (la classe CSS coupe déjà l'animation, mais
 * on évite aussi le re-render inutile). Motion P8.
 */
export function useValueFlash<T>(value: T, durMs = 700): boolean {
  const [flashing, setFlashing] = useState(false);
  const prev = useRef(value);

  useEffect(() => {
    if (Object.is(prev.current, value)) return;
    prev.current = value;
    setFlashing(true);
    const t = setTimeout(() => setFlashing(false), durMs);
    return () => clearTimeout(t);
  }, [value, durMs]);

  return flashing;
}

/**
 * Variante directionnelle : renvoie la classe `flash-bull`/`flash-bear` quand
 * `value` monte/descend (fond vert/rouge bref), sinon ''. Pour les lignes
 * DOM/Tape qui s'actualisent.
 */
export function useDirectionalFlash(value: number, durMs = 500): string {
  const [cls, setCls] = useState('');
  const prev = useRef(value);

  useEffect(() => {
    if (value === prev.current) return;
    const dir = value > prev.current ? 'flash-bull' : 'flash-bear';
    prev.current = value;
    setCls(dir);
    const t = setTimeout(() => setCls(''), durMs);
    return () => clearTimeout(t);
  }, [value, durMs]);

  return cls;
}
