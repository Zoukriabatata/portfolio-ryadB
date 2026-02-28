import { useEffect, useCallback, useMemo } from 'react';
import { CanvasChartEngine } from '@/lib/rendering/CanvasChartEngine';
import { usePreferencesStore } from '@/stores/usePreferencesStore';
import type { ChartTheme } from '@/lib/themes/ThemeSystem';
import type { SharedRefs, CustomColors, EffectiveColors } from './types';

interface UseChartEngineParams {
  refs: SharedRefs;
  theme: ChartTheme;
  customColors: CustomColors;
  symbol: string;
}

interface UseChartEngineReturn {
  effectiveColors: EffectiveColors;
  smartZoom: (zoomIn: boolean) => void;
  resetView: () => void;
  handleScreenshot: () => void;
  updatePricePositionIndicator: () => void;
}

export function useChartEngine({ refs, theme, customColors, symbol }: UseChartEngineParams): UseChartEngineReturn {
  /**
   * Get effective colors (custom > theme)
   */
  const effectiveColors = useMemo<EffectiveColors>(() => ({
    background: customColors.background || theme.colors.background,
    candleUp: customColors.candleUp || theme.colors.candleUp,
    candleDown: customColors.candleDown || theme.colors.candleDown,
    wickUp: customColors.wickUp || theme.colors.wickUp,
    wickDown: customColors.wickDown || theme.colors.wickDown,
    priceLineColor: customColors.priceLineColor || theme.colors.toolActive || '#7ed321',
  }), [customColors, theme.colors]);

  /**
   * Update price position indicator (shows where current price is in the session range)
   */
  const updatePricePositionIndicator = useCallback(() => {
    const price = refs.currentPrice.current;
    const high = refs.sessionHigh.current;
    const low = refs.sessionLow.current;

    if (!refs.pricePosition.current || !refs.pricePositionBar.current || high <= low) return;

    const position = ((price - low) / (high - low)) * 100;
    const clampedPosition = Math.max(0, Math.min(100, position));

    let color: string;
    if (clampedPosition >= 66) {
      color = '#22c55e';
    } else if (clampedPosition >= 33) {
      color = '#eab308';
    } else {
      color = '#ef4444';
    }

    refs.pricePositionBar.current.style.height = `${clampedPosition}%`;
    refs.pricePositionBar.current.style.background = `linear-gradient(to top, ${color}60, ${color}20)`;

    const positionLine = refs.pricePosition.current.querySelector('.position-line') as HTMLElement;
    if (positionLine) {
      positionLine.style.bottom = `${clampedPosition}%`;
      positionLine.style.backgroundColor = color;
      positionLine.style.boxShadow = `0 0 4px ${color}`;
    }
  }, [refs]);

  /**
   * Create chart engine
   */
  useEffect(() => {
    const container = refs.chartContainer.current;
    const canvas = refs.chartCanvas.current;
    if (!container || !canvas || refs.chartEngine.current) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const engine = new CanvasChartEngine(canvas, {
      background: theme.colors.background,
      gridLines: theme.colors.gridLines,
      text: theme.colors.text,
      textMuted: theme.colors.textMuted,
      candleUp: theme.colors.candleUp,
      candleDown: theme.colors.candleDown,
      wickUp: theme.colors.wickUp,
      wickDown: theme.colors.wickDown,
      volumeUp: theme.colors.volumeUp,
      volumeDown: theme.colors.volumeDown,
      crosshair: theme.colors.crosshair,
      crosshairLabel: '#ffffff',
      crosshairLabelBg: '#374151',
      priceLineColor: customColors.priceLineColor || theme.colors.toolActive || '#7ed321',
    });

    engine.resize(rect.width, rect.height);
    refs.chartEngine.current = engine;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          engine.resize(width, height);
        }
      }
    });
    resizeObserver.observe(container);

    // DPR change detection (browser zoom without resize)
    let currentDpr = window.devicePixelRatio || 1;
    let dprQuery = window.matchMedia(`(resolution: ${currentDpr}dppx)`);
    const handleDprChange = () => {
      const newDpr = window.devicePixelRatio || 1;
      if (newDpr !== currentDpr) {
        currentDpr = newDpr;
        const r = container.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          engine.resize(r.width, r.height);
        }
      }
      // Re-subscribe with updated query
      dprQuery = window.matchMedia(`(resolution: ${currentDpr}dppx)`);
      dprQuery.addEventListener('change', handleDprChange, { once: true });
    };
    dprQuery.addEventListener('change', handleDprChange, { once: true });

    return () => {
      resizeObserver.disconnect();
      dprQuery.removeEventListener('change', handleDprChange);
      engine.destroy();
      refs.chartEngine.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Apply theme and custom colors
   */
  useEffect(() => {
    if (!refs.chartEngine.current) return;

    refs.chartEngine.current.setTheme({
      background: effectiveColors.background,
      gridLines: theme.colors.gridLines,
      text: theme.colors.text,
      textMuted: theme.colors.textMuted,
      candleUp: effectiveColors.candleUp,
      candleDown: effectiveColors.candleDown,
      wickUp: effectiveColors.wickUp,
      wickDown: effectiveColors.wickDown,
      volumeUp: theme.colors.volumeUp,
      volumeDown: theme.colors.volumeDown,
      crosshair: theme.colors.crosshair,
      priceLineColor: effectiveColors.priceLineColor,
    });
  }, [refs, theme, effectiveColors]);

  // Sync preferences store → chart engine
  const prefShowVolume = usePreferencesStore((s) => s.showVolume);
  const prefShowVolumeBubbles = usePreferencesStore((s) => s.showVolumeBubbles);
  const prefShowGrid = usePreferencesStore((s) => s.showGrid);

  useEffect(() => {
    if (!refs.chartEngine.current) return;
    refs.chartEngine.current.setShowVolume(prefShowVolume);
    refs.chartEngine.current.setShowGrid(prefShowGrid);
    refs.chartEngine.current.setShowVolumeBubbles(prefShowVolumeBubbles);
  }, [refs, prefShowVolume, prefShowGrid, prefShowVolumeBubbles]);

  // Sync crosshair tooltip preference → chart engine
  const prefShowCrosshairTooltip = usePreferencesStore((s) => s.showCrosshairTooltip);

  useEffect(() => {
    if (!refs.chartEngine.current) return;
    refs.chartEngine.current.setShowCrosshairTooltip(prefShowCrosshairTooltip);
  }, [refs, prefShowCrosshairTooltip]);

  // Sync price line preferences → chart engine
  const prefShowPriceLine = usePreferencesStore((s) => s.showCurrentPriceLine);
  const prefPriceLineStyle = usePreferencesStore((s) => s.priceLineStyle);
  const prefPriceLineWidth = usePreferencesStore((s) => s.priceLineWidth);
  const prefPriceLineColor = usePreferencesStore((s) => s.priceLineColor);
  const prefPriceLabelBgColor = usePreferencesStore((s) => s.priceLabelBgColor);
  const prefPriceLabelTextColor = usePreferencesStore((s) => s.priceLabelTextColor);
  const prefPriceLabelOpacity = usePreferencesStore((s) => s.priceLabelOpacity);

  useEffect(() => {
    if (!refs.chartEngine.current) return;
    refs.chartEngine.current.setPriceLineConfig({
      visible: prefShowPriceLine,
      style: prefPriceLineStyle,
      width: prefPriceLineWidth,
      color: prefPriceLineColor,
      labelBgColor: prefPriceLabelBgColor,
      labelTextColor: prefPriceLabelTextColor,
      labelOpacity: prefPriceLabelOpacity,
    });
  }, [refs, prefShowPriceLine, prefPriceLineStyle, prefPriceLineWidth, prefPriceLineColor, prefPriceLabelBgColor, prefPriceLabelTextColor, prefPriceLabelOpacity]);

  /**
   * Smart Zoom
   */
  const smartZoom = useCallback((zoomIn: boolean) => {
    const engine = refs.chartEngine.current;
    if (!engine) return;
    if (zoomIn) {
      engine.zoomIn();
    } else {
      engine.zoomOut();
    }
  }, [refs]);

  /**
   * Reset chart view
   */
  const resetView = useCallback(() => {
    if (refs.chartEngine.current) {
      refs.chartEngine.current.fitToData();
    }
  }, [refs]);

  /**
   * Screenshot export
   */
  const handleScreenshot = useCallback(() => {
    const chartCanvas = refs.chartCanvas.current;
    const drawingCanvas = refs.drawingCanvas.current;
    if (!chartCanvas) return;

    const w = chartCanvas.width;
    const h = chartCanvas.height;

    const offscreen = document.createElement('canvas');
    offscreen.width = w;
    offscreen.height = h;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(chartCanvas, 0, 0);

    if (drawingCanvas && drawingCanvas.width > 0) {
      ctx.drawImage(drawingCanvas, 0, 0);
    }

    ctx.save();
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Senzoukria', w - 10, h - 8);
    ctx.restore();

    offscreen.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.download = `chart-${symbol.toUpperCase()}-${ts}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }, [refs, symbol]);

  return {
    effectiveColors,
    smartZoom,
    resetView,
    handleScreenshot,
    updatePricePositionIndicator,
  };
}
