import { useState, useCallback, useMemo, useRef } from 'react';
import { createChartContextMenuItems, type ContextMenuItem } from '@/components/ui/ContextMenu';
import { useAlertsStore } from '@/stores/useAlertsStore';
import { useTradingStore } from '@/stores/useTradingStore';
import type { ChartTemplate } from '@/stores/useChartTemplatesStore';
import type { TimeframeSeconds } from '@/lib/live/HierarchicalAggregator';
import type { SharedRefs } from './types';

interface UseContextMenuParams {
  refs: SharedRefs;
  symbol: string;
  timeframe: TimeframeSeconds;
  showGrid: boolean;
  availableTemplates: ChartTemplate[];
  handleLoadTemplate: (template: ChartTemplate) => void;
  toggleGrid: () => void;
  resetView: () => void;
  handleScreenshot: () => void;
  copyPrice: () => void;
  setAdvancedSettingsPosition: (pos: { x: number; y: number }) => void;
  setShowAdvancedSettings: (show: boolean) => void;
  setShowSaveTemplateModal: (show: boolean) => void;
}

export function useContextMenu({
  refs,
  symbol,
  timeframe,
  showGrid,
  availableTemplates,
  handleLoadTemplate,
  toggleGrid,
  resetView,
  handleScreenshot,
  copyPrice,
  setAdvancedSettingsPosition,
  setShowAdvancedSettings,
  setShowSaveTemplateModal,
}: UseContextMenuParams) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; price?: number } | null>(null);

  const { addAlert } = useAlertsStore();
  const { activeBroker, connections, placeOrder, closePosition, contractQuantity } = useTradingStore();

  // Trading ref to avoid stale closures
  const tradingRef = useRef({ activeBroker, connections, placeOrder, closePosition, contractQuantity, symbol });
  tradingRef.current = { activeBroker, connections, placeOrder, closePosition, contractQuantity, symbol };

  /**
   * Handle right-click context menu
   */
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    let clickPrice: number | undefined;
    if (refs.chartEngine.current && refs.chartContainer.current) {
      const rect = refs.chartContainer.current.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const vp = refs.chartEngine.current.getViewport();
      const priceRange = vp.priceMax - vp.priceMin;
      clickPrice = vp.priceMax - (y / vp.chartHeight) * priceRange;
    }
    setContextMenu({ x: e.clientX, y: e.clientY, price: clickPrice });
  }, [refs]);

  /**
   * Close context menu
   */
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  /**
   * Get context menu items
   */
  const contextMenuItems = useMemo((): ContextMenuItem[] => {
    const t = tradingRef.current;
    const isBrokerConnected = !!(t.activeBroker && t.connections[t.activeBroker]?.connected);

    const handlePlaceLimitOrder = (side: 'buy' | 'sell', price: number) => {
      const tr = tradingRef.current;
      if (!tr.activeBroker) return;
      tr.placeOrder({
        broker: tr.activeBroker,
        symbol: tr.symbol.toUpperCase(),
        side,
        type: 'limit',
        quantity: tr.contractQuantity,
        price,
        marketPrice: refs.currentPrice.current,
      });
    };

    return createChartContextMenuItems({
      onCopyPrice: copyPrice,
      onToggleGrid: toggleGrid,
      onOpenSettings: () => {
        if (contextMenu) {
          setAdvancedSettingsPosition({ x: contextMenu.x, y: contextMenu.y });
        }
        setShowAdvancedSettings(true);
        closeContextMenu();
      },
      onResetView: resetView,
      onScreenshot: handleScreenshot,
      onClearDrawings: () => refs.toolsEngine.current.clearAll(),
      onSaveTemplate: () => setShowSaveTemplateModal(true),
      currentTimeframe: timeframe,
      onTimeframeChange: (tf: number) => refs.handleTimeframeChange.current(tf as TimeframeSeconds),
      clickPrice: contextMenu?.price,
      currentPrice: refs.currentPrice.current,
      onSetAlert: (price: number) => {
        addAlert(symbol, price, refs.currentPrice.current);
      },
      onLimitBuy: (price: number) => handlePlaceLimitOrder('buy', price),
      onLimitSell: (price: number) => handlePlaceLimitOrder('sell', price),
      onStopBuy: (price: number) => {
        const tr = tradingRef.current;
        if (!tr.activeBroker) return;
        tr.placeOrder({ broker: tr.activeBroker, symbol: tr.symbol.toUpperCase(), side: 'buy', type: 'stop', quantity: tr.contractQuantity, price, stopPrice: price, marketPrice: refs.currentPrice.current });
      },
      onStopSell: (price: number) => {
        const tr = tradingRef.current;
        if (!tr.activeBroker) return;
        tr.placeOrder({ broker: tr.activeBroker, symbol: tr.symbol.toUpperCase(), side: 'sell', type: 'stop', quantity: tr.contractQuantity, price, stopPrice: price, marketPrice: refs.currentPrice.current });
      },
      isBrokerConnected,
      templates: availableTemplates.map(t => ({
        id: t.id,
        name: t.name,
        onLoad: () => handleLoadTemplate(t),
      })),
      showGrid,
    });
  }, [refs, copyPrice, toggleGrid, resetView, handleScreenshot, showGrid, availableTemplates, handleLoadTemplate, timeframe, contextMenu, addAlert, symbol, closeContextMenu, setAdvancedSettingsPosition, setShowAdvancedSettings, setShowSaveTemplateModal]);

  return {
    contextMenu,
    handleContextMenu,
    closeContextMenu,
    contextMenuItems,
  };
}
