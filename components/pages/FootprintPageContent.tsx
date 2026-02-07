'use client';

import dynamic from 'next/dynamic';

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

export default function FootprintPageContent() {
  return (
    <div className="h-full w-full overflow-hidden">
      <FootprintChartPro className="h-full w-full" />
    </div>
  );
}
