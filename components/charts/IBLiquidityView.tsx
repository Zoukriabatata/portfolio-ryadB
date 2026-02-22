'use client';

/**
 * IB LIQUIDITY VIEW
 *
 * Dedicated component for rendering CME futures orderbook heatmap
 * using data from IB Gateway via IBConnectionManager.
 *
 * Uses the same WebGL HybridRenderer as StaircaseHeatmap but gets
 * RenderData directly from IBHeatmapAdapter instead of MarketState.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { HybridRenderer, type RenderData } from '@/lib/heatmap-webgl/HybridRenderer';
import { getIBConnectionManager } from '@/lib/ib/ConnectionManager';
import { useHeatmapSettingsStore } from '@/stores/useHeatmapSettingsStore';
import { useIBConnection } from '@/hooks/useIBConnection';
import { CME_CONTRACTS } from '@/types/ib-protocol';
import type { GatewayConnectionStatus } from '@/types/ib-protocol';
import dynamic from 'next/dynamic';
const LiquidityAdvancedSettings = dynamic(() => import('@/components/settings/LiquidityAdvancedSettings'), { ssr: false });

interface IBLiquidityViewProps {
  height?: number;
  ibSymbol: string;
  onSymbolChange?: (symbol: string) => void;
}

const STATUS_COLORS: Record<GatewayConnectionStatus, string> = {
  disconnected: '#71717a',
  authenticating: '#eab308',
  connecting_ib: '#eab308',
  connected: '#22c55e',
  error: '#ef4444',
};

const STATUS_LABELS: Record<GatewayConnectionStatus, string> = {
  disconnected: 'Disconnected',
  authenticating: 'Authenticating...',
  connecting_ib: 'Connecting to IB...',
  connected: 'Live',
  error: 'Error',
};

export function IBLiquidityView({ height = 600, ibSymbol, onSymbolChange }: IBLiquidityViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const webglContainerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<HybridRenderer | null>(null);
  const animationRef = useRef<number>(0);

  const [isReady, setIsReady] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // IB connection
  const { status, connect, changeSymbol, isConnected, currentPrice, stats } = useIBConnection(ibSymbol);

  // Settings from store
  const settings = useHeatmapSettingsStore();

  const contrast = settings.contrast ?? 1.5;
  const upperCutoffPercent = settings.upperCutoffPercent ?? 95;
  const staircaseLine = settings.displayFeatures?.staircaseLine;
  const gridSettings = settings.displayFeatures?.grid;
  const passiveOrderSettings = settings.displayFeatures?.passiveOrders;
  const tradeFlowSettings = settings.tradeFlow ?? {};

  const bestBidColor = settings.bestBidColor ?? '#22c55e';
  const bestAskColor = settings.bestAskColor ?? '#ef4444';

  const contract = CME_CONTRACTS[ibSymbol];

  // Initialize WebGL renderer
  useEffect(() => {
    if (!containerRef.current || !canvasRef.current || !webglContainerRef.current) return;

    try {
      const rect = containerRef.current.getBoundingClientRect();
      if (!rendererRef.current) {
        rendererRef.current = new HybridRenderer({
          canvas: canvasRef.current,
          container: webglContainerRef.current,
          width: rect.width,
          height: rect.height,
          priceAxisWidth: 80,
        });
      }
      setIsReady(true);
    } catch (err) {
      console.error('[IBLiquidityView] WebGL initialization failed:', err);
    }

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, []);

  // Render loop
  useEffect(() => {
    if (!isReady || !rendererRef.current) return;

    const render = () => {
      if (rendererRef.current) {
        const mgr = getIBConnectionManager();
        const rect = containerRef.current?.getBoundingClientRect();
        const w = rect?.width || 800;
        const h = rect?.height || 600;

        // Get RenderData directly from IB adapter
        const renderData = mgr.getHeatmapRenderData(w, h);

        // Apply contrast and cutoff
        renderData.contrast = contrast;
        renderData.upperCutoff = upperCutoffPercent / 100;

        // Apply colors
        renderData.colors = {
          bidColor: bestBidColor,
          askColor: bestAskColor,
          buyColor: tradeFlowSettings.buyColor ?? '#00ff88',
          sellColor: tradeFlowSettings.sellColor ?? '#ff4444',
          gridColor: 'rgba(255, 255, 255, 0.05)',
        };

        // Apply staircase settings
        if (staircaseLine) {
          renderData.staircaseSettings = staircaseLine;
        }

        // Apply grid settings
        if (gridSettings) {
          renderData.gridSettings = gridSettings;
        }

        // Apply passive order settings
        if (passiveOrderSettings) {
          renderData.passiveOrderSettings = passiveOrderSettings;
        }

        // Apply trade bubble settings
        renderData.tradeBubbleSettings = {
          showBorder: (tradeFlowSettings.bubbleBorderWidth ?? 1.5) > 0,
          borderWidth: (tradeFlowSettings.bubbleBorderWidth ?? 1.5) / 100,
          borderColor: tradeFlowSettings.bubbleBorderColor === 'auto'
            ? 'rgba(255, 255, 255, 0.5)'
            : (tradeFlowSettings.bubbleBorderColor ?? 'rgba(255, 255, 255, 0.5)'),
          glowEnabled: tradeFlowSettings.glowEnabled ?? true,
          glowIntensity: tradeFlowSettings.glowIntensity ?? 0.6,
          showGradient: tradeFlowSettings.showGradient ?? true,
          rippleEnabled: tradeFlowSettings.rippleEnabled ?? true,
          largeTradeThreshold: tradeFlowSettings.largeTradeThreshold ?? 2.0,
          sizeScaling: tradeFlowSettings.sizeScaling ?? 'sqrt',
          popInAnimation: tradeFlowSettings.popInAnimation ?? true,
          bubbleOpacity: tradeFlowSettings.bubbleOpacity ?? 0.7,
          maxSize: (tradeFlowSettings.bubbleSize ?? 0.6) * 80,
          minSize: 8,
        };

        rendererRef.current.render(renderData);
      }

      animationRef.current = requestAnimationFrame(render);
    };

    animationRef.current = requestAnimationFrame(render);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isReady, contrast, upperCutoffPercent, bestBidColor, bestAskColor, staircaseLine, gridSettings, passiveOrderSettings, tradeFlowSettings]);

  // Handle symbol change
  const handleSymbolChange = useCallback((sym: string) => {
    changeSymbol(sym);
    onSymbolChange?.(sym);
  }, [changeSymbol, onSymbolChange]);

  // Handle connect
  const handleConnect = useCallback(() => {
    connect(ibSymbol);
  }, [connect, ibSymbol]);

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-[#0a0a0a] overflow-hidden"
      style={{ height }}
    >
      {/* WebGL Canvas */}
      <div
        ref={webglContainerRef}
        className="absolute inset-0"
        style={{ zIndex: 1 }}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ display: 'block' }}
        />
      </div>

      {/* Top Controls Overlay */}
      <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          {/* Symbol Selector */}
          <select
            value={ibSymbol}
            onChange={(e) => handleSymbolChange(e.target.value)}
            className="px-2 py-1 rounded text-xs font-mono backdrop-blur-sm"
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          >
            {Object.entries(CME_CONTRACTS).map(([sym, spec]) => (
              <option key={sym} value={sym}>
                {sym} - {spec.description}
              </option>
            ))}
          </select>

          {/* Connection Status */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded backdrop-blur-sm" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div
              className={`w-2 h-2 rounded-full ${status === 'authenticating' || status === 'connecting_ib' ? 'animate-pulse' : ''}`}
              style={{ backgroundColor: STATUS_COLORS[status] }}
            />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{STATUS_LABELS[status]}</span>
          </div>

          {/* Connect Button (when disconnected) */}
          {status === 'disconnected' && (
            <button
              onClick={handleConnect}
              className="px-3 py-1 text-xs rounded transition-colors backdrop-blur-sm"
              style={{ backgroundColor: 'var(--bull)', color: '#fff' }}
            >
              Connect
            </button>
          )}

          {/* Price */}
          {isConnected && currentPrice > 0 && (
            <div className="px-2 py-1 rounded backdrop-blur-sm" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
              <span className="text-sm font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
                {currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Stats */}
          {isConnected && (
            <div className="flex items-center gap-2 text-[10px] font-mono" style={{ color: 'var(--text-dimmed)' }}>
              <span>Trades: {stats.tradeCount}</span>
              <span>Snapshots: {stats.heatmapSnapshots}</span>
            </div>
          )}

          {/* Settings Button */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-1.5 rounded transition-colors backdrop-blur-sm"
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
            title="Settings"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          </button>

          {/* CME Badge */}
          <div className="px-2 py-1 rounded text-[10px] font-bold backdrop-blur-sm" style={{ backgroundColor: 'var(--primary-glow)', color: 'var(--primary)', border: '1px solid var(--primary-dark)' }}>
            CME {ibSymbol}
          </div>
        </div>
      </div>

      {/* Waiting for connection overlay */}
      {!isConnected && (
        <div className="absolute inset-0 flex items-center justify-center z-5">
          <div className="text-center rounded-xl p-6 backdrop-blur-sm" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>
              {status === 'disconnected' ? 'IB Gateway Not Connected' :
               status === 'error' ? 'Connection Error' :
               'Connecting to IB Gateway...'}
            </div>
            <div className="text-xs mb-4" style={{ color: 'var(--text-dimmed)' }}>
              {contract?.description || ibSymbol} via Interactive Brokers
            </div>
            {status === 'disconnected' && (
              <button
                onClick={handleConnect}
                className="px-4 py-2 text-sm rounded-lg transition-colors"
                style={{ backgroundColor: 'var(--bull)', color: '#fff' }}
              >
                Connect to IB Gateway
              </button>
            )}
            {(status === 'authenticating' || status === 'connecting_ib') && (
              <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: 'var(--bull)', borderTopColor: 'transparent' }} />
            )}
          </div>
        </div>
      )}

      {/* Settings Panel */}
      <LiquidityAdvancedSettings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        initialPosition={{ x: 100, y: 100 }}
      />
    </div>
  );
}
