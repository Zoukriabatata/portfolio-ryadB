'use client';

import dynamic from 'next/dynamic';

/**
 * PAGE LIVE TRADING PRO
 *
 * Charting professionnel en temps réel :
 *
 * - Multi-timeframes : 15s, 30s, 1m, 3m, 5m, 15m, 30m, 1h, 4h, 1D, 3D, 1W
 * - Agrégation hiérarchique optimisée
 * - 5 thèmes prédéfinis + personnalisation
 * - Outils de dessin interactifs
 * - WebSocket Binance temps réel
 */

const LiveChartPro = dynamic(
  () => import('@/components/charts/LiveChartPro'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-[#0a0a0a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-zinc-500">Initialisation...</span>
        </div>
      </div>
    ),
  }
);

export default function LivePage() {
  return (
    <div className="h-[calc(100vh-56px)] flex flex-col">
      <LiveChartPro className="flex-1" />
    </div>
  );
}
