'use client';

import { useEffect, useRef, useState } from 'react';
import {
  SettingsIcon,
  TrashIcon,
  SaveIcon,
  LayoutIcon,
  RefreshIcon,
} from '@/components/ui/Icons';

/**
 * CONTEXT MENU - Right-click menu for charts
 * Provides quick access to settings, templates, and actions
 */

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  divider?: boolean;
  disabled?: boolean;
  danger?: boolean;
  children?: ContextMenuItem[];
  onClick?: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
  theme?: 'senzoukria' | 'dark';
}

export function ContextMenu({ x, y, items, onClose, theme = 'senzoukria' }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [submenuId, setSubmenuId] = useState<string | null>(null);
  const [position, setPosition] = useState({ x, y });
  const submenuTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (submenuTimeoutRef.current) {
        clearTimeout(submenuTimeoutRef.current);
      }
    };
  }, []);

  // Handle submenu hover with delay to prevent flickering
  const handleSubmenuEnter = (itemId: string) => {
    if (submenuTimeoutRef.current) {
      clearTimeout(submenuTimeoutRef.current);
      submenuTimeoutRef.current = null;
    }
    setSubmenuId(itemId);
  };

  const handleSubmenuLeave = () => {
    // Delay closing to allow mouse to move to submenu
    submenuTimeoutRef.current = setTimeout(() => {
      setSubmenuId(null);
    }, 150);
  };

  const handleSubmenuMouseEnter = () => {
    // Cancel close timeout when entering submenu
    if (submenuTimeoutRef.current) {
      clearTimeout(submenuTimeoutRef.current);
      submenuTimeoutRef.current = null;
    }
  };

  // Adjust position if menu would overflow viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let newX = x;
      let newY = y;

      if (x + rect.width > viewportWidth) {
        newX = viewportWidth - rect.width - 10;
      }
      if (y + rect.height > viewportHeight) {
        newY = viewportHeight - rect.height - 10;
      }

      setPosition({ x: newX, y: newY });
    }
  }, [x, y]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const colors = theme === 'senzoukria'
    ? {
        bg: 'bg-[#0a0f0a]',
        border: 'border-green-900/40',
        hover: 'hover:bg-green-900/30',
        text: 'text-green-100',
        textMuted: 'text-green-400/60',
        divider: 'border-green-900/30',
        danger: 'text-red-400 hover:bg-red-900/30',
      }
    : {
        bg: 'bg-zinc-900',
        border: 'border-zinc-700',
        hover: 'hover:bg-zinc-800',
        text: 'text-zinc-100',
        textMuted: 'text-zinc-500',
        divider: 'border-zinc-700',
        danger: 'text-red-400 hover:bg-red-900/30',
      };

  return (
    <div
      ref={menuRef}
      className={`fixed z-[100] min-w-[200px] ${colors.bg} border ${colors.border} rounded-lg shadow-2xl shadow-black/50 py-1 backdrop-blur-sm animate-context-menu`}
      style={{
        left: position.x,
        top: position.y,
        transformOrigin: 'top left',
      }}
    >
      {items.map((item, index) => {
        if (item.divider) {
          return <div key={index} className={`my-1 border-t ${colors.divider}`} />;
        }

        const hasChildren = item.children && item.children.length > 0;

        return (
          <div
            key={item.id}
            className="relative"
            onMouseEnter={() => hasChildren && handleSubmenuEnter(item.id)}
            onMouseLeave={() => hasChildren && handleSubmenuLeave()}
          >
            <button
              onClick={() => {
                if (!hasChildren && !item.disabled) {
                  item.onClick?.();
                  onClose();
                }
              }}
              disabled={item.disabled}
              className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between gap-3 transition-colors
                ${item.disabled ? 'opacity-40 cursor-not-allowed' : ''}
                ${item.danger ? colors.danger : `${colors.text} ${colors.hover}`}
              `}
            >
              <div className="flex items-center gap-2">
                {item.icon && <span className="w-4 h-4 flex items-center justify-center">{item.icon}</span>}
                <span>{item.label}</span>
              </div>
              <div className="flex items-center gap-2">
                {item.shortcut && (
                  <span className={`text-xs ${colors.textMuted}`}>{item.shortcut}</span>
                )}
                {hasChildren && (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            </button>

            {/* Submenu */}
            {hasChildren && submenuId === item.id && (
              <div
                className={`absolute left-full top-0 ml-1 min-w-[180px] ${colors.bg} border ${colors.border} rounded-lg shadow-xl py-1`}
                onMouseEnter={handleSubmenuMouseEnter}
                onMouseLeave={handleSubmenuLeave}
              >
                {item.children!.map((child, childIndex) => {
                  if (child.divider) {
                    return <div key={childIndex} className={`my-1 border-t ${colors.divider}`} />;
                  }

                  return (
                    <button
                      key={child.id}
                      onClick={() => {
                        if (!child.disabled) {
                          child.onClick?.();
                          onClose();
                        }
                      }}
                      disabled={child.disabled}
                      className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors
                        ${child.disabled ? 'opacity-40 cursor-not-allowed' : ''}
                        ${child.danger ? colors.danger : `${colors.text} ${colors.hover}`}
                      `}
                    >
                      {child.icon && <span className="w-4 h-4">{child.icon}</span>}
                      <span>{child.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Icon components for context menu
export function CopyIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

export function GridIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  );
}

export function PaletteIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="8" r="2" fill={color} />
      <circle cx="8" cy="14" r="2" fill={color} />
      <circle cx="16" cy="14" r="2" fill={color} />
    </svg>
  );
}

export function ResetIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

export function ThemeIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

// Trading order icons
export function BuyIcon({ size = 14, color = '#22c55e' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

export function SellIcon({ size = 14, color = '#ef4444' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <path d="M12 5v14M5 12l7 7 7-7" />
    </svg>
  );
}

export function LimitOrderIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <path d="M4 12h16M8 6h8M8 18h8" />
    </svg>
  );
}

export function StopOrderIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M15 9l-6 6M9 9l6 6" />
    </svg>
  );
}

export function CameraIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

export function AlertIcon({ size = 14, color = '#eab308' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export function ClockIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

// Helper to create standard chart context menu items
export function createChartContextMenuItems(options: {
  onCopyPrice?: () => void;
  onToggleGrid?: () => void;
  onOpenSettings?: () => void;
  onOpenThemes?: () => void;
  onResetView?: () => void;
  onSaveTemplate?: () => void;
  onLoadTemplate?: () => void;
  onClearDrawings?: () => void;
  onScreenshot?: () => void;
  onSetAlert?: (price: number) => void;
  onTimeframeChange?: (tf: number) => void;
  currentTimeframe?: number;
  templates?: { id: string; name: string; onLoad: () => void }[];
  showGrid?: boolean;
  // Trading options
  clickPrice?: number;
  currentPrice?: number;
  onLimitBuy?: (price: number) => void;
  onLimitSell?: (price: number) => void;
  onStopBuy?: (price: number) => void;
  onStopSell?: (price: number) => void;
  isBrokerConnected?: boolean;
}): ContextMenuItem[] {
  const items: ContextMenuItem[] = [];

  // Trading orders section (if price is provided)
  if (options.clickPrice !== undefined && options.currentPrice !== undefined) {
    const isAbovePrice = options.clickPrice > options.currentPrice;
    const priceStr = options.clickPrice.toFixed(2);

    if (isAbovePrice) {
      // Above current price: Limit Sell, Stop Buy
      if (options.onLimitSell) {
        items.push({
          id: 'limit-sell',
          label: `Limit Sell @ ${priceStr}`,
          icon: <SellIcon size={14} />,
          onClick: () => options.onLimitSell!(options.clickPrice!),
          disabled: !options.isBrokerConnected,
        });
      }
      if (options.onStopBuy) {
        items.push({
          id: 'stop-buy',
          label: `Stop Buy @ ${priceStr}`,
          icon: <BuyIcon size={14} />,
          onClick: () => options.onStopBuy!(options.clickPrice!),
          disabled: !options.isBrokerConnected,
        });
      }
    } else {
      // Below current price: Limit Buy, Stop Sell
      if (options.onLimitBuy) {
        items.push({
          id: 'limit-buy',
          label: `Limit Buy @ ${priceStr}`,
          icon: <BuyIcon size={14} />,
          onClick: () => options.onLimitBuy!(options.clickPrice!),
          disabled: !options.isBrokerConnected,
        });
      }
      if (options.onStopSell) {
        items.push({
          id: 'stop-sell',
          label: `Stop Sell @ ${priceStr}`,
          icon: <SellIcon size={14} />,
          onClick: () => options.onStopSell!(options.clickPrice!),
          disabled: !options.isBrokerConnected,
        });
      }
    }

    if (items.length > 0) {
      items.push({ id: 'divider-orders', label: '', divider: true });
    }
  }

  // Alert at price
  if (options.onSetAlert && options.clickPrice !== undefined) {
    items.push({
      id: 'set-alert',
      label: `Alert @ ${options.clickPrice.toFixed(2)}`,
      icon: <AlertIcon />,
      onClick: () => options.onSetAlert!(options.clickPrice!),
    });
    items.push({ id: 'divider-alert', label: '', divider: true });
  }

  if (options.onCopyPrice) {
    items.push({
      id: 'copy-price',
      label: 'Copy Price',
      icon: <CopyIcon />,
      shortcut: 'Ctrl+C',
      onClick: options.onCopyPrice,
    });
  }

  if (options.onScreenshot) {
    items.push({
      id: 'screenshot',
      label: 'Screenshot',
      icon: <CameraIcon />,
      shortcut: 'Ctrl+Shift+S',
      onClick: options.onScreenshot,
    });
  }

  items.push({ id: 'divider-1', label: '', divider: true });

  // Quick Timeframe submenu
  if (options.onTimeframeChange) {
    const TF_OPTIONS = [
      { label: '1m', value: 60 },
      { label: '5m', value: 300 },
      { label: '15m', value: 900 },
      { label: '1h', value: 3600 },
      { label: '4h', value: 14400 },
      { label: '1D', value: 86400 },
    ];
    items.push({
      id: 'timeframes',
      label: 'Timeframe',
      icon: <ClockIcon />,
      children: TF_OPTIONS.map(tf => ({
        id: `tf-${tf.value}`,
        label: tf.label,
        onClick: () => options.onTimeframeChange!(tf.value),
        disabled: options.currentTimeframe === tf.value,
      })),
    });
  }

  if (options.onToggleGrid !== undefined) {
    items.push({
      id: 'toggle-grid',
      label: options.showGrid ? 'Hide Grid' : 'Show Grid',
      icon: <GridIcon />,
      onClick: options.onToggleGrid,
    });
  }

  if (options.onOpenThemes) {
    items.push({
      id: 'themes',
      label: 'Themes',
      icon: <ThemeIcon />,
      onClick: options.onOpenThemes,
    });
  }

  if (options.onOpenSettings) {
    items.push({
      id: 'settings',
      label: 'Chart Settings',
      icon: <SettingsIcon size={14} />,
      onClick: options.onOpenSettings,
    });
  }

  items.push({ id: 'divider-2', label: '', divider: true });

  if (options.onSaveTemplate || options.templates) {
    const templateChildren: ContextMenuItem[] = [];

    if (options.onSaveTemplate) {
      templateChildren.push({
        id: 'save-template',
        label: 'Save Current',
        icon: <SaveIcon size={14} />,
        onClick: options.onSaveTemplate,
      });
    }

    if (options.templates && options.templates.length > 0) {
      templateChildren.push({ id: 'template-divider', label: '', divider: true });
      options.templates.forEach(t => {
        templateChildren.push({
          id: `template-${t.id}`,
          label: t.name,
          icon: <LayoutIcon size={14} />,
          onClick: t.onLoad,
        });
      });
    }

    if (templateChildren.length > 0) {
      items.push({
        id: 'templates',
        label: 'Templates',
        icon: <LayoutIcon size={14} />,
        children: templateChildren,
      });
    }
  }

  if (options.onResetView) {
    items.push({
      id: 'reset-view',
      label: 'Reset View',
      icon: <ResetIcon />,
      onClick: options.onResetView,
    });
  }

  if (options.onClearDrawings) {
    items.push({ id: 'divider-3', label: '', divider: true });
    items.push({
      id: 'clear-drawings',
      label: 'Clear All Drawings',
      icon: <TrashIcon size={14} />,
      danger: true,
      onClick: options.onClearDrawings,
    });
  }

  return items;
}
