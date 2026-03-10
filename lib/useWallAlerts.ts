import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { GEXStreamData } from '@/types/trading-bias';

const BULL  = '#34d399';
const BEAR  = '#f87171';
const TEAL  = '#26beaf';
const WARN  = '#fbbf24';

const COOLDOWN_MS = 10 * 60 * 1000; // 10 min before same alert can fire again

interface AlertLevel {
  label: string;
  value: number;
  color: string;
  descAbove: string;
  descBelow: string;
}

/**
 * Fires sonner toast when spot price crosses a key GEX level.
 * Safe to call unconditionally — no-ops when gexData is null.
 * Cooldown: same level won't alert again for 10 minutes.
 */
export function useWallAlerts(gexData: GEXStreamData | null, symbol: string) {
  const prevSpotRef  = useRef<number | null>(null);
  const cooldownMap  = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!gexData?.spotPrice) return;

    const spot = gexData.spotPrice;
    const prev = prevSpotRef.current;

    // First render — just store, no alert
    if (prev === null || prev === spot) {
      prevSpotRef.current = spot;
      return;
    }

    const levels: AlertLevel[] = [
      {
        label:       'Call Wall',
        value:       gexData.callWall,
        color:       BULL,
        descAbove:   'Price broke above resistance — watch for gamma squeeze continuation or rejection',
        descBelow:   'Price fell back below Call Wall — bearish rejection signal',
      },
      {
        label:       'Put Wall',
        value:       gexData.putWall,
        color:       BEAR,
        descAbove:   'Price recaptured Put Wall — dealer buyback pressure eases, bullish signal',
        descBelow:   'Price broke Put Wall support — dealers sell, downside accelerates',
      },
      {
        label:       'Zero Gamma',
        value:       gexData.zeroGamma,
        color:       TEAL,
        descAbove:   'Gamma flip UP — dealers switch to long gamma, market stabilizes',
        descBelow:   'Gamma flip DOWN — dealers short gamma, expect amplified moves',
      },
    ].filter(l => l.value > 0);

    const now = Date.now();

    for (const level of levels) {
      const crossed = (prev < level.value && spot >= level.value) ||
                      (prev > level.value && spot <= level.value);
      if (!crossed) continue;

      const dir = spot >= level.value ? 'above' : 'below';
      const key = `${symbol}-${level.label}-${dir}-${Math.round(level.value)}`;

      const lastFired = cooldownMap.current.get(key) ?? 0;
      if (now - lastFired < COOLDOWN_MS) continue;

      cooldownMap.current.set(key, now);

      const isUp = dir === 'above';
      toast(
        `${symbol} ${isUp ? '↑ broke above' : '↓ fell below'} ${level.label} $${level.value.toFixed(0)}`,
        {
          description: isUp ? level.descAbove : level.descBelow,
          duration: 7000,
          style: {
            background: 'var(--surface)',
            border: `1px solid var(--border)`,
            borderLeft: `3px solid ${level.color}`,
            color: 'var(--text-primary)',
          },
        }
      );
    }

    prevSpotRef.current = spot;
  }, [gexData, symbol]);
}
