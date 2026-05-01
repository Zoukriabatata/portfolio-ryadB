import { useEffect, useCallback, useMemo } from 'react';
import { CanvasChartEngine } from '@/lib/rendering/CanvasChartEngine';
import { usePreferencesStore } from '@/stores/usePreferencesStore';
import { useUIThemeStore } from '@/stores/useUIThemeStore';
import { hexToRgba } from '@/lib/utils/colorUtils';
import type { ChartTheme } from '@/lib/themes/ThemeSystem';
import type { SharedRefs, CustomColors, EffectiveColors } from './types';

/**
 * Read chart colors from CSS custom properties set by the global UI theme.
 * Falls back to sensible defaults if a variable is not yet applied.
 */
function getThemeFromCSS() {
  const cs = getComputedStyle(document.documentElement);
  const get = (v: string, fallback: string) =>
    cs.getPropertyValue(v).trim() || fallback;

  return {
    background: get('--chart-bg', get('--background', '#0a0a0a')),
    gridLines: get('--chart-grid', '#1a1a1a'),
    text: get('--text-secondary', '#888888'),
    textMuted: get('--text-muted', '#555555'),
    candleUp: get('--candle-up', get('--bull', '#22c55e')),
    candleDown: get('--candle-down', get('--bear', '#ef4444')),
    wickUp: get('--wick-up', get('--candle-up', '#22c55e')),
    wickDown: get('--wick-down', get('--candle-down', '#ef4444')),
    volumeUp: `${get('--candle-up', get('--bull', '#22c55e'))}66`,
    volumeDown: `${get('--candle-down', get('--bear', '#ef4444'))}66`,
    crosshair: get('--text-muted', '#6b7280'),
    crosshairLabel: '#ffffff',
    crosshairLabelBg: get('--surface-elevated', '#374151'),
    priceLineColor: get('--accent', '#3b82f6'),
  };
}

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
  // Re-read CSS vars whenever the global UI theme changes
  const uiThemeId = useUIThemeStore((s) => s.activeTheme);

  /**
   * Get effective colors (custom > CSS variables from UI theme)
   */
  const effectiveColors = useMemo<EffectiveColors>(() => {
    const css = typeof document !== 'undefined' ? getThemeFromCSS() : null;
    return {
      background: customColors.background || css?.background || theme.colors.background,
      candleUp: customColors.candleUp || css?.candleUp || theme.colors.candleUp,
      candleDown: customColors.candleDown || css?.candleDown || theme.colors.candleDown,
      wickUp: customColors.wickUp || css?.wickUp || theme.colors.wickUp,
      wickDown: customColors.wickDown || css?.wickDown || theme.colors.wickDown,
      priceLineColor: customColors.priceLineColor || css?.priceLineColor || theme.colors.toolActive || '#7ed321',
    };
  }, [customColors, theme.colors, uiThemeId]);

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

    const cssTheme = getThemeFromCSS();
    const engine = new CanvasChartEngine(canvas, {
      background: cssTheme.background,
      gridLines: cssTheme.gridLines,
      text: cssTheme.text,
      textMuted: cssTheme.textMuted,
      candleUp: cssTheme.candleUp,
      candleDown: cssTheme.candleDown,
      wickUp: cssTheme.wickUp,
      wickDown: cssTheme.wickDown,
      volumeUp: cssTheme.volumeUp,
      volumeDown: cssTheme.volumeDown,
      crosshair: cssTheme.crosshair,
      crosshairLabel: cssTheme.crosshairLabel,
      crosshairLabelBg: cssTheme.crosshairLabelBg,
      priceLineColor: customColors.priceLineColor || cssTheme.priceLineColor,
    });

    engine.resize(rect.width, rect.height);

    // Apply preferences immediately at creation time (before any render)
    const prefs = usePreferencesStore.getState();
    engine.setShowVolume(prefs.showVolume);
    engine.setShowGrid(prefs.showGrid);
    engine.setShowVolumeBubbles(prefs.showVolumeBubbles);
    engine.setVolumeBubbleConfig({
      mode: prefs.volumeBubbleMode, scaling: prefs.volumeBubbleScaling,
      maxSize: prefs.volumeBubbleMaxSize, minFilter: prefs.volumeBubbleMinFilter,
      opacity: prefs.volumeBubbleOpacity, positiveColor: prefs.volumeBubblePositiveColor,
      negativeColor: prefs.volumeBubbleNegativeColor, normalization: prefs.volumeBubbleNormalization,
      showPieChart: prefs.volumeBubbleShowPieChart,
    });

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
  }, []);

  /**
   * Apply theme and custom colors — reads from CSS variables set by the UI theme
   */
  useEffect(() => {
    if (!refs.chartEngine.current) return;

    const cssTheme = getThemeFromCSS();
    const prefs = usePreferencesStore.getState();
    refs.chartEngine.current.setTheme({
      background: effectiveColors.background,
      gridLines: cssTheme.gridLines,
      text: cssTheme.text,
      textMuted: cssTheme.textMuted,
      candleUp: effectiveColors.candleUp,
      candleDown: effectiveColors.candleDown,
      wickUp: effectiveColors.wickUp,
      wickDown: effectiveColors.wickDown,
      volumeUp: hexToRgba(prefs.volumeBarBullColor, prefs.volumeBarOpacity),
      volumeDown: hexToRgba(prefs.volumeBarBearColor, prefs.volumeBarOpacity),
      crosshair: cssTheme.crosshair,
      priceLineColor: effectiveColors.priceLineColor,
    });
  }, [refs, theme, effectiveColors, uiThemeId]);

  // Sync volume bar colors
  const volBarBull = usePreferencesStore(s => s.volumeBarBullColor);
  const volBarBear = usePreferencesStore(s => s.volumeBarBearColor);
  const volBarOpacity = usePreferencesStore(s => s.volumeBarOpacity);
  useEffect(() => {
    if (!refs.chartEngine.current) return;
    refs.chartEngine.current.setTheme({
      volumeUp: hexToRgba(volBarBull, volBarOpacity),
      volumeDown: hexToRgba(volBarBear, volBarOpacity),
    });
  }, [refs, volBarBull, volBarBear, volBarOpacity]);

  // Force chart redraw when ANY Long/Short position setting changes — the
  // ToolsRenderer reads usePreferencesStore.getState() at render time, but
  // without an explicit redraw trigger, settings changes wait for the next
  // tick (or never apply on a static chart).
  useEffect(() => {
    const unsub = usePreferencesStore.subscribe((state, prevState) => {
      const posKeys = [
        'posTpColor', 'posSlColor', 'posEntryColor', 'posLineWidth',
        'posZoneOpacity', 'posShowZoneFill', 'posShowLabels', 'posDefaultCompact',
        'posSmartArrow', 'posDynamicOpacity', 'posOpacityCurve', 'posOpacityIntensity',
        'posArrowExponent', 'posArrowIntensity', 'posArrowThickness', 'posArrowFill',
        'posProgressTrail', 'posTrailIntensity', 'posHeatFill', 'posHeatIntensity',
        'posTimeWeight', 'posGradientMode',
      ] as const;
      const changed = posKeys.some(k => state[k] !== prevState[k]);
      if (changed) refs.chartEngine.current?.requestRedraw();
    });
    return unsub;
  }, [refs]);

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

  // Sync volume bubble advanced config
  const bubbleMode = usePreferencesStore(s => s.volumeBubbleMode);
  const bubbleScaling = usePreferencesStore(s => s.volumeBubbleScaling);
  const bubbleMaxSize = usePreferencesStore(s => s.volumeBubbleMaxSize);
  const bubbleMinFilter = usePreferencesStore(s => s.volumeBubbleMinFilter);
  const bubbleOpacity = usePreferencesStore(s => s.volumeBubbleOpacity);
  const bubblePositiveColor = usePreferencesStore(s => s.volumeBubblePositiveColor);
  const bubbleNegativeColor = usePreferencesStore(s => s.volumeBubbleNegativeColor);
  const bubbleNormalization = usePreferencesStore(s => s.volumeBubbleNormalization);
  const bubbleShowPieChart = usePreferencesStore(s => s.volumeBubbleShowPieChart);

  useEffect(() => {
    if (!refs.chartEngine.current) return;
    refs.chartEngine.current.setVolumeBubbleConfig({
      mode: bubbleMode, scaling: bubbleScaling, maxSize: bubbleMaxSize,
      minFilter: bubbleMinFilter, opacity: bubbleOpacity,
      positiveColor: bubblePositiveColor, negativeColor: bubbleNegativeColor,
      normalization: bubbleNormalization, showPieChart: bubbleShowPieChart,
    });
  }, [refs, bubbleMode, bubbleScaling, bubbleMaxSize, bubbleMinFilter, bubbleOpacity,
      bubblePositiveColor, bubbleNegativeColor, bubbleNormalization, bubbleShowPieChart]);

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
  const prefPriceLineOpacity = usePreferencesStore((s) => s.priceLineOpacity);
  const prefPriceLabelBgColor = usePreferencesStore((s) => s.priceLabelBgColor);
  const prefPriceLabelTextColor = usePreferencesStore((s) => s.priceLabelTextColor);
  const prefPriceLabelOpacity = usePreferencesStore((s) => s.priceLabelOpacity);
  const prefPriceLabelBorderRadius = usePreferencesStore((s) => s.priceLabelBorderRadius);

  useEffect(() => {
    if (!refs.chartEngine.current) return;
    refs.chartEngine.current.setPriceLineConfig({
      visible: prefShowPriceLine,
      style: prefPriceLineStyle,
      width: prefPriceLineWidth,
      color: prefPriceLineColor,
      lineOpacity: prefPriceLineOpacity,
      labelBgColor: prefPriceLabelBgColor,
      labelTextColor: prefPriceLabelTextColor,
      labelOpacity: prefPriceLabelOpacity,
      labelBorderRadius: prefPriceLabelBorderRadius,
    });
  }, [refs, prefShowPriceLine, prefPriceLineStyle, prefPriceLineWidth, prefPriceLineColor, prefPriceLineOpacity, prefPriceLabelBgColor, prefPriceLabelTextColor, prefPriceLabelOpacity, prefPriceLabelBorderRadius]);

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
