import { useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useChartTemplatesStore, type ChartTemplate } from '@/stores/useChartTemplatesStore';
import { usePreferencesStore } from '@/stores/usePreferencesStore';
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
  const handleBackgroundChange = useCallback((settings: Partial<BackgroundSettings>) => {
    setBackgroundSettings(prev => {
      const updated = { ...prev, ...settings };
      if (updated.showGrid !== undefined) {
        setShowGrid(updated.showGrid);
      }
      if (refs.chartEngine.current) {
        if (updated.color) {
          refs.chartEngine.current.setTheme({ background: updated.color });
        }
        if (updated.gridColor) {
          refs.chartEngine.current.setTheme({ gridLines: updated.gridColor });
        }
        if (updated.showGrid !== undefined) {
          refs.chartEngine.current.setShowGrid(updated.showGrid);
        }
      }
      if (updated.color) {
        setCustomColors(prevColors => ({ ...prevColors, background: updated.color }));
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
    saveTemplate({
      name,
      type: 'live',
      settings: {
        showGrid,
        timeframe: timeframe.toString(),
        colors: customColors as unknown as Record<string, string | number>,
      },
    });
  }, [saveTemplate, showGrid, timeframe, customColors]);

  /**
   * Load a template and apply settings
   */
  const handleLoadTemplate = useCallback((template: ChartTemplate) => {
    if (template.settings.showGrid !== undefined) {
      setShowGrid(template.settings.showGrid);
    }
    if (template.settings.timeframe) {
      handleTimeframeChange(parseInt(template.settings.timeframe) as TimeframeSeconds);
    }
    if (template.settings.colors) {
      setCustomColors(prev => ({ ...prev, ...template.settings.colors }));
    }
  }, [handleTimeframeChange, setCustomColors]);

  /**
   * Get available templates for this chart type
   */
  const availableTemplates = useMemo(() => {
    return getTemplatesByType('live');
  }, [getTemplatesByType, templates]);

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
