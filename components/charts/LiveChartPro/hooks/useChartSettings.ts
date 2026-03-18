import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { useChartTemplatesStore, type ChartTemplate } from '@/stores/useChartTemplatesStore';
import { usePreferencesStore } from '@/stores/usePreferencesStore';
import { useIndicatorStore } from '@/stores/useIndicatorStore';
import type { TimeframeSeconds } from '@/lib/live/HierarchicalAggregator';
import type { SharedRefs, CustomColors, CrosshairSettings, CandleSettings, BackgroundSettings } from './types';
import {
  DEFAULT_CROSSHAIR_SETTINGS,
  DEFAULT_CANDLE_SETTINGS,
  DEFAULT_BACKGROUND_SETTINGS,
} from './types';

interface UseChartSettingsParams {
  refs: SharedRefs;
  timeframe: TimeframeSeconds;
  handleTimeframeChange: (tf: TimeframeSeconds) => void;
  customColors: CustomColors;
  setCustomColors: React.Dispatch<React.SetStateAction<CustomColors>>;
}

export function useChartSettings({ refs, timeframe, handleTimeframeChange, customColors, setCustomColors }: UseChartSettingsParams) {
  const isBroadcastingRef = useRef(false);
  const [crosshairSettings, setCrosshairSettings] = useState<CrosshairSettings>(DEFAULT_CROSSHAIR_SETTINGS);
  const [candleSettings, setCandleSettings] = useState<CandleSettings>(DEFAULT_CANDLE_SETTINGS);
  const [backgroundSettings, setBackgroundSettings] = useState<BackgroundSettings>(DEFAULT_BACKGROUND_SETTINGS);

  const [showGrid, setShowGrid] = useState(true);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [advancedSettingsPosition, setAdvancedSettingsPosition] = useState({ x: 100, y: 100 });
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [showCustomizePanel, setShowCustomizePanel] = useState(false);
  const [showGlobalSettings, setShowGlobalSettings] = useState(false);

  const { templates, saveTemplate, getTemplatesByType } = useChartTemplatesStore();

  /**
   * Toggle grid visibility
   */
  const toggleGrid = useCallback(() => {
    setShowGrid(prev => {
      const newValue = !prev;
      if (refs.chartEngine.current) {
        refs.chartEngine.current.setShowGrid(newValue);
      }
      usePreferencesStore.getState().setShowGrid(newValue);
      // Keep backgroundSettings in sync so AdvancedChartSettings shows correct state
      setBackgroundSettings(bs => ({ ...bs, showGrid: newValue }));
      return newValue;
    });
  }, [refs]);

  /**
   * Copy current price to clipboard
   */
  const copyPrice = useCallback(() => {
    if (refs.currentPrice.current) {
      navigator.clipboard.writeText(refs.currentPrice.current.toString());
      toast.success('Price copied');
    }
  }, [refs]);

  /**
   * Handle crosshair settings change
   */
  const handleCrosshairChange = useCallback((settings: Partial<CrosshairSettings>) => {
    setCrosshairSettings(prev => {
      const updated = { ...prev, ...settings };
      if (refs.chartEngine.current) {
        refs.chartEngine.current.setCrosshairStyle({
          color: updated.color,
          lineWidth: updated.width,
          dashPattern: updated.style === 'solid' ? [] :
                       updated.style === 'dashed' ? [6, 4] : [2, 2],
        });
      }
      return updated;
    });
  }, [refs]);

  /**
   * Handle candle settings change
   */
  const handleCandleChange = useCallback((settings: Partial<CandleSettings>) => {
    setCandleSettings(prev => {
      const updated = { ...prev, ...settings };
      if (refs.chartEngine.current) {
        refs.chartEngine.current.setTheme({
          candleUp: updated.upColor,
          candleDown: updated.downColor,
          wickUp: updated.wickUp,
          wickDown: updated.wickDown,
          candleBorderUp: updated.borderUp,
          candleBorderDown: updated.borderDown,
        });
      }
      setCustomColors(prevColors => ({
        ...prevColors,
        candleUp: updated.upColor,
        candleDown: updated.downColor,
        wickUp: updated.wickUp,
        wickDown: updated.wickDown,
      }));
      return updated;
    });
  }, [refs, setCustomColors]);

  /**
   * Handle background settings change
   */
  const handleBackgroundChange = useCallback((incoming: Partial<BackgroundSettings>) => {
    setBackgroundSettings(prev => {
      const updated = { ...prev, ...incoming };
      // Only sync grid state when explicitly changed
      if (incoming.showGrid !== undefined) {
        setShowGrid(incoming.showGrid);
        usePreferencesStore.getState().setShowGrid(incoming.showGrid);
      }
      if (refs.chartEngine.current) {
        if (incoming.color) {
          refs.chartEngine.current.setTheme({ background: incoming.color });
        }
        if (incoming.gridColor) {
          refs.chartEngine.current.setTheme({ gridLines: incoming.gridColor });
        }
        if (incoming.showGrid !== undefined) {
          refs.chartEngine.current.setShowGrid(incoming.showGrid);
        }
      }
      if (incoming.color) {
        setCustomColors(prevColors => ({ ...prevColors, background: incoming.color! }));
      }
      return updated;
    });
  }, [refs, setCustomColors]);

  /**
   * Open advanced settings modal
   */
  const openAdvancedSettings = useCallback(() => {
    const container = refs.chartContainer.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      setAdvancedSettingsPosition({
        x: rect.right - 350,
        y: rect.top + 50,
      });
    }
    setShowAdvancedSettings(true);
  }, [refs]);

  /**
   * Save current chart settings as a template
   */
  const handleSaveTemplate = useCallback((name: string) => {
    const prefs = usePreferencesStore.getState();
    const indicatorState = useIndicatorStore.getState();
    saveTemplate({
      name,
      type: 'live',
      settings: {
        showGrid,
        timeframe: timeframe.toString(),
        colors: customColors as unknown as Record<string, string | number>,
        crosshair: {
          color: crosshairSettings.color,
          width: crosshairSettings.width,
          style: crosshairSettings.style,
        },
        background: {
          color: backgroundSettings.color,
          gridColor: backgroundSettings.gridColor,
        },
        candles: {
          upColor: candleSettings.upColor,
          downColor: candleSettings.downColor,
          wickUp: candleSettings.wickUp,
          wickDown: candleSettings.wickDown,
          borderUp: candleSettings.borderUp,
          borderDown: candleSettings.borderDown,
        },
        showVolume: prefs.showVolume,
        showCrosshairTooltip: prefs.showCrosshairTooltip,
        indicators: indicatorState.indicators.map(ind => ({
          id: ind.id,
          type: ind.type,
          enabled: ind.enabled,
          params: ind.params as Record<string, unknown>,
          style: ind.style as Record<string, unknown>,
        })),
        vpSettings: {
          showVolumeProfile: prefs.showVolumeProfile,
          vpProfileMode: prefs.vpProfileMode,
          vpHistoryDepth: prefs.vpHistoryDepth,
          vpPanelSide: prefs.vpPanelSide,
        },
      },
    });
  }, [saveTemplate, showGrid, timeframe, customColors, crosshairSettings, backgroundSettings, candleSettings]);

  /**
   * Load a template and apply ALL settings
   */
  const handleLoadTemplate = useCallback((template: ChartTemplate) => {
    const s = template.settings;

    if (s.showGrid !== undefined) {
      setShowGrid(s.showGrid);
      setBackgroundSettings(prev => ({ ...prev, showGrid: s.showGrid! }));
      usePreferencesStore.getState().setShowGrid(s.showGrid);
      if (refs.chartEngine.current) refs.chartEngine.current.setShowGrid(s.showGrid);
    }
    if (s.timeframe) {
      handleTimeframeChange(parseInt(s.timeframe) as TimeframeSeconds);
    }
    if (s.colors) {
      setCustomColors(prev => ({ ...prev, ...s.colors }));
    }

    // Crosshair
    if (s.crosshair) {
      setCrosshairSettings(prev => ({ ...prev, ...s.crosshair }));
      if (refs.chartEngine.current) {
        refs.chartEngine.current.setCrosshairStyle({
          color: s.crosshair.color,
          lineWidth: s.crosshair.width,
          dashPattern: s.crosshair.style === 'dashed' ? [6, 4] : s.crosshair.style === 'dotted' ? [2, 2] : [],
        });
      }
    }

    // Background
    if (s.background) {
      setBackgroundSettings(prev => ({ ...prev, ...s.background }));
      if (refs.chartEngine.current) {
        if (s.background.color) refs.chartEngine.current.setTheme({ background: s.background.color });
        if (s.background.gridColor) refs.chartEngine.current.setTheme({ gridLines: s.background.gridColor });
      }
      if (s.background.color) {
        setCustomColors(prev => ({ ...prev, background: s.background!.color! }));
      }
    }

    // Candles
    if (s.candles) {
      setCandleSettings(prev => ({ ...prev, ...s.candles }));
      if (refs.chartEngine.current) {
        const theme: Record<string, string> = {};
        if (s.candles.upColor) theme.candleUp = s.candles.upColor;
        if (s.candles.downColor) theme.candleDown = s.candles.downColor;
        if (s.candles.wickUp) theme.wickUp = s.candles.wickUp;
        if (s.candles.wickDown) theme.wickDown = s.candles.wickDown;
        refs.chartEngine.current.setTheme(theme);
      }
      setCustomColors(prev => ({
        ...prev,
        ...(s.candles!.upColor && { candleUp: s.candles!.upColor }),
        ...(s.candles!.downColor && { candleDown: s.candles!.downColor }),
        ...(s.candles!.wickUp && { wickUp: s.candles!.wickUp }),
        ...(s.candles!.wickDown && { wickDown: s.candles!.wickDown }),
      }));
    }

    // Display preferences
    const prefs = usePreferencesStore.getState();
    if (s.showVolume !== undefined) {
      prefs.setShowVolume(s.showVolume);
    }
    if (s.showCrosshairTooltip !== undefined) {
      prefs.setShowCrosshairTooltip(s.showCrosshairTooltip);
    }

    // Indicators
    if (s.indicators && Array.isArray(s.indicators)) {
      const indStore = useIndicatorStore.getState();
      // Reset to saved indicators
      s.indicators.forEach(saved => {
        const existing = indStore.indicators.find(i => i.type === saved.type);
        if (existing) {
          indStore.updateIndicator(existing.id, {
            enabled: saved.enabled,
            params: saved.params as Record<string, number>,
          });
        }
      });
    }

    // Volume profile settings
    if (s.vpSettings) {
      const vp = s.vpSettings;
      if (vp.showVolumeProfile !== undefined) prefs.setShowVolumeProfile(vp.showVolumeProfile);
      if (vp.vpProfileMode !== undefined) prefs.setVPSetting('vpProfileMode', vp.vpProfileMode as 'session' | 'daily' | 'visible' | 'custom');
      if (vp.vpHistoryDepth !== undefined) prefs.setVPSetting('vpHistoryDepth', vp.vpHistoryDepth);
      if (vp.vpPanelSide !== undefined) prefs.setVPSetting('vpPanelSide', vp.vpPanelSide);
    }

    // Broadcast to all other chart instances (only if not already handling a broadcast)
    if (!isBroadcastingRef.current && typeof window !== 'undefined') {
      isBroadcastingRef.current = true;
      window.dispatchEvent(new CustomEvent('chart:loadTemplate', { detail: template }));
      isBroadcastingRef.current = false;
    }
  }, [refs, handleTimeframeChange, setCustomColors]);

  /**
   * Get available templates for this chart type
   */
  const availableTemplates = useMemo(() => {
    return getTemplatesByType('live');
  }, [getTemplatesByType, templates]);

  // Listen for template broadcasts from other chart instances
  useEffect(() => {
    const handler = (e: Event) => {
      if (isBroadcastingRef.current) return; // Skip if we dispatched this
      const template = (e as CustomEvent<ChartTemplate>).detail;
      if (!template) return;
      isBroadcastingRef.current = true;
      handleLoadTemplate(template);
      isBroadcastingRef.current = false;
    };
    window.addEventListener('chart:loadTemplate', handler);
    return () => window.removeEventListener('chart:loadTemplate', handler);
  }, [handleLoadTemplate]);

  return {
    crosshairSettings,
    candleSettings,
    backgroundSettings,
    showGrid,
    toggleGrid,
    showAdvancedSettings,
    setShowAdvancedSettings,
    advancedSettingsPosition,
    setAdvancedSettingsPosition,
    showSaveTemplateModal,
    setShowSaveTemplateModal,
    showCustomizePanel,
    setShowCustomizePanel,
    showGlobalSettings,
    setShowGlobalSettings,
    handleCrosshairChange,
    handleCandleChange,
    handleBackgroundChange,
    openAdvancedSettings,
    handleSaveTemplate,
    handleLoadTemplate,
    availableTemplates,
    copyPrice,
  };
}
