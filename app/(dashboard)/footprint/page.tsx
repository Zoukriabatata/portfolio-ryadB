'use client';

import dynamic from 'next/dynamic';

/**
 * PAGE FOOTPRINT PRO - Orderflow Chart Live
 *
 * Chart professionnel style ATAS / NinjaTrader / TradingView :
 * - Layout fixe (pas de scroll page)
 * - OHLC candle à gauche
 * - Delta Profile à droite
 * - Clusters bid x ask par niveau
 * - Imbalances avec highlight configurable
 * - Outils de trading avec sélection, drag, resize, delete
 * - Sauvegarde / chargement de layouts
 * - Personnalisation complète (thèmes, couleurs, fonts)
 */

const FootprintChartPro = dynamic(
  () => import('@/components/charts/FootprintChartPro'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-[#0a0a0a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-zinc-500">Initialisation Footprint Pro...</span>
        </div>
      </div>
    ),
  }
);

export default function FootprintPage() {
  return (
    <div className="h-full w-full overflow-hidden">
      <FootprintChartPro className="h-full w-full" />
    </div>
  );
}
