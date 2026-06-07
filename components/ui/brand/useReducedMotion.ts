'use client';
import { useEffect, useState } from 'react';

/**
 * `true` quand l'utilisateur préfère réduire les animations.
 * SSR → false (animations actives) ; ajusté après hydratation.
 * Sert à conditionner les animations SMIL (animateMotion), que la
 * media-query CSS de brand.css ne peut pas désactiver.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}
