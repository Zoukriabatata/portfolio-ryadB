'use client';

import { useState, useRef, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { useTradingStore, type ClosedTrade } from '@/stores/useTradingStore';
import { useAccountRulesStore, PRESET_DEFAULTS, type AccountPreset } from '@/stores/useAccountRulesStore';
import Certificate, { type CertificateData } from './Certificate';
import { generateCertificatePDF, makeCertificateId } from '@/lib/certificate/generateCertificatePDF';

const PRESET_LABELS: Record<AccountPreset, string> = {
  topstep_50k:  'Topstep 50K Combine',
  topstep_100k: 'Topstep 100K Combine',
  topstep_150k: 'Topstep 150K Combine',
  apex_50k:     'Apex 50K',
  apex_100k:    'Apex 100K',
  custom:       'Custom Account',
};

/**
 * Renders the certificate offscreen and exposes a "Download PDF" button.
 *
 * The certificate node is positioned absolutely off-viewport (left: -10000px)
 * so it doesn't affect layout or interfere with the user, but html2canvas
 * can still snapshot it because it's in the DOM.
 */
export default function CertificateButton() {
  const { data: session } = useSession();
  const certRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const { connections, activeBroker, positions, closedTrades } = useTradingStore(
    useShallow(s => ({
      connections:  s.connections,
      activeBroker: s.activeBroker,
      positions:    s.positions,
      closedTrades: s.closedTrades,
    })),
  );

  const rules = useAccountRulesStore();

  const certData = useMemo<CertificateData>(() => {
    const broker      = activeBroker ?? 'demo';
    const balance     = connections[broker]?.balance ?? 0;
    const unrealized  = positions.reduce((sum, p) => sum + p.pnl, 0);
    const finalEquity = balance + unrealized;
    const profit      = finalEquity - rules.startingBalance;

    const winsArr = closedTrades.filter(t => t.pnl > 0);
    const lossArr = closedTrades.filter(t => t.pnl < 0);
    const winRate = closedTrades.length
      ? (winsArr.length / closedTrades.length) * 100
      : 0;

    const grossWin  = winsArr.reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(lossArr.reduce((s, t) => s + t.pnl, 0));
    const profitFactor = grossLoss > 0
      ? grossWin / grossLoss
      : (grossWin > 0 ? Infinity : 0);

    const bestTrade = closedTrades.reduce<ClosedTrade | null>(
      (best, t) => (best === null || t.pnl > best.pnl ? t : best),
      null,
    );

    const startDate = closedTrades.length > 0
      ? new Date(Math.min(...closedTrades.map(t => t.entryTime)))
      : new Date(rules.dayStartedAt ?? Date.now());

    const passedAt = rules.lockedAt ? new Date(rules.lockedAt) : new Date();

    const userName = session?.user?.name?.trim()
      || session?.user?.email?.split('@')[0]
      || 'Demo Trader';

    const certId = makeCertificateId(`${userName}-${rules.preset}-${passedAt.getTime()}`);

    return {
      userName,
      presetLabel:     PRESET_LABELS[rules.preset] ?? 'Demo Account',
      startingBalance: rules.startingBalance,
      finalEquity,
      profit,
      totalTrades:     closedTrades.length,
      winRate,
      profitFactor,
      bestTrade:       bestTrade?.pnl ?? 0,
      startDate,
      passedAt,
      certId,
    };
  }, [activeBroker, connections, positions, closedTrades, rules, session]);

  const handleDownload = async () => {
    if (!certRef.current) return;
    setIsExporting(true);
    try {
      const filename = `senzoukria-certificate-${certData.certId}.pdf`;
      await generateCertificatePDF(certRef.current, filename);
      toast.success('Certificate downloaded', { duration: 2000 });
    } catch (err) {
      console.error('[Certificate] Export failed:', err);
      toast.error('Failed to generate PDF — check console for details');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <button
        onClick={handleDownload}
        disabled={isExporting}
        className="px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all hover:brightness-110 active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
        style={{
          background: 'linear-gradient(135deg, #16a34a, #4ade80)',
          color:      '#fff',
          boxShadow:  '0 0 12px rgba(74,222,128,0.35)',
        }}
      >
        {isExporting ? (
          <>
            <span className="inline-block animate-spin rounded-full h-3 w-3 border-t-2 border-white/70" />
            Generating PDF…
          </>
        ) : (
          <>
            🏆 Download Certificate
          </>
        )}
      </button>

      {/* Offscreen render target — html2canvas needs the node in the DOM */}
      <div
        style={{
          position: 'absolute',
          left:     '-10000px',
          top:      '0',
          pointerEvents: 'none',
        }}
        aria-hidden="true"
      >
        <Certificate ref={certRef} data={certData} />
      </div>
    </>
  );
}
