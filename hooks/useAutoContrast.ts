import { useMemo } from 'react';
import { relativeLuminance, hexToRgb } from '@/lib/utils/colorUtils';

/**
 * Returns contrasting text colors for a given background hex color.
 * Uses WCAG luminance to determine if background is dark or light.
 */
export function useAutoContrast(bgColor: string) {
  return useMemo(() => {
    const [r, g, b] = hexToRgb(bgColor);
    const lum = relativeLuminance(r, g, b);
    const isDark = lum <= 0.179;
    return {
      textColor: isDark ? '#ffffff' : '#000000',
      mutedColor: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)',
      isDark,
    };
  }, [bgColor]);
}
