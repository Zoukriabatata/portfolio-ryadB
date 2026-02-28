'use client';

/**
 * VERTICAL TOOLBAR — TradingView-Style
 *
 * Fixed vertical bar on the left edge of any chart.
 * - Groups stacked vertically with thin separators
 * - Each group shows one primary tool + flyout submenu arrow
 * - Last-used tool in each group becomes the primary
 * - Cursor at top, trash + lock at bottom
 * - Unified across /live, /footprint, /replay
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { type ToolType } from '@/lib/tools/ToolsEngine';
import { getInteractionController } from '@/lib/tools/InteractionController';
import {
  MousePointer2,
  Crosshair,
  TrendingUp,
  MoveRight,
  Minus,
  ArrowRight,
  SeparatorVertical,
  Square,
  Columns2,
  Circle,
  GitBranch,
  GitFork,
  ArrowUpRight,
  Pen,
  Highlighter,
  Ruler,
  Type,
  Magnet,
  Lock,
  Unlock,
  Trash2,
  ChevronRight,
  Heart,
  type LucideIcon,
} from 'lucide-react';
import { useFavoritesToolbarStore } from '@/stores/useFavoritesToolbarStore';

// ============ TOOL ICON MAPPING ============

const TOOL_ICONS: Record<ToolType, LucideIcon> = {
  cursor: MousePointer2,
  crosshair: Crosshair,
  trendline: TrendingUp,
  ray: MoveRight,
  horizontalLine: Minus,
  horizontalRay: ArrowRight,
  verticalLine: SeparatorVertical,
  rectangle: Square,
  parallelChannel: Columns2,
  ellipse: Circle,
  fibRetracement: GitBranch,
  fibExtension: GitFork,
  longPosition: ArrowUpRight,
  shortPosition: ArrowUpRight, // rotated via CSS
  arrow: ArrowUpRight,
  brush: Pen,
  highlighter: Highlighter,
  measure: Ruler,
  text: Type,
};

const TOOL_LABELS: Record<ToolType, string> = {
  cursor: 'Cursor',
  crosshair: 'Crosshair',
  trendline: 'Trend Line',
  ray: 'Ray',
  horizontalLine: 'Horizontal Line',
  horizontalRay: 'Horizontal Ray',
  verticalLine: 'Vertical Line',
  rectangle: 'Rectangle',
  parallelChannel: 'Parallel Channel',
  ellipse: 'Ellipse',
  fibRetracement: 'Fib Retracement',
  fibExtension: 'Fib Extension',
  longPosition: 'Long Position',
  shortPosition: 'Short Position',
  arrow: 'Arrow',
  brush: 'Brush',
  highlighter: 'Highlighter',
  measure: 'Measure',
  text: 'Text',
};

const TOOL_SHORTCUTS: Partial<Record<ToolType, string>> = {
  cursor: 'V',
  crosshair: 'C',
  trendline: 'T',
  horizontalLine: 'H',
  verticalLine: 'I',
  rectangle: 'R',
  fibRetracement: 'F',
  longPosition: 'L',
  shortPosition: 'S',
  measure: 'M',
  text: 'N',
};

// ============ TOOL GROUPS (TradingView order) ============

interface ToolGroup {
  id: string;
  tools: ToolType[];
}

const TOOL_GROUPS: ToolGroup[] = [
  { id: 'pointer', tools: ['cursor', 'crosshair'] },
  { id: 'lines', tools: ['trendline', 'ray', 'horizontalLine', 'horizontalRay', 'verticalLine'] },
  { id: 'shapes', tools: ['rectangle', 'parallelChannel', 'ellipse'] },
  { id: 'fib', tools: ['fibRetracement', 'fibExtension'] },
  { id: 'positions', tools: ['longPosition', 'shortPosition'] },
  { id: 'annotations', tools: ['arrow', 'brush', 'highlighter', 'text'] },
  { id: 'measure', tools: ['measure'] },
];

// ============ FLYOUT MENU WITH FAVORITES ============

function FlyoutMenu({
  tools,
  groupId,
  activeTool,
  onToolSelect,
}: {
  tools: ToolType[];
  groupId: string;
  activeTool: ToolType;
  onToolSelect: (tool: ToolType, groupId: string) => void;
}) {
  const customTools = useFavoritesToolbarStore(s => s.presets.custom.tools);
  const addToFavorites = useFavoritesToolbarStore(s => s.addToolToPreset);
  const removeFromFavorites = useFavoritesToolbarStore(s => s.removeToolFromPreset);

  return (
    <div className="flex flex-col p-1 rounded-lg border border-[var(--border)] bg-[var(--background)] shadow-xl min-w-[180px]">
      {tools.map(tool => {
        const ToolIcon = TOOL_ICONS[tool];
        const isActive = activeTool === tool;
        const shortcut = TOOL_SHORTCUTS[tool];
        const isFavorite = customTools.includes(tool);

        return (
          <div key={tool} className="group/fav flex items-center">
            <button
              onClick={() => onToolSelect(tool, groupId)}
              className={`
                flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left transition-colors duration-75 flex-1
                ${isActive
                  ? 'bg-[var(--primary)]/15 text-[var(--primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface)]'
                }
              `}
            >
              <ToolIcon
                size={14}
                strokeWidth={1.5}
                className={`flex-shrink-0 ${tool === 'shortPosition' ? 'rotate-90' : ''}`}
              />
              <span className="text-[11px] font-medium flex-1">
                {TOOL_LABELS[tool]}
              </span>
              {shortcut && (
                <span className="text-[10px] font-mono text-[var(--text-dimmed)]">
                  {shortcut}
                </span>
              )}
            </button>
            {/* Favorite heart toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isFavorite) {
                  removeFromFavorites('custom', tool);
                } else {
                  addToFavorites('custom', tool);
                }
              }}
              className={`
                flex items-center justify-center w-6 h-6 rounded transition-colors mx-0.5
                ${isFavorite
                  ? 'text-pink-400 hover:text-pink-300'
                  : 'text-[var(--text-dimmed)] hover:text-pink-400 opacity-0 group-hover/fav:opacity-100'
                }
              `}
              title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Heart
                size={12}
                strokeWidth={1.5}
                fill={isFavorite ? 'currentColor' : 'none'}
              />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ============ COMPONENT ============

interface VerticalToolbarProps {
  activeTool: ToolType;
  onToolSelect: (tool: ToolType) => void;
  onDeleteSelected?: () => void;
  hasSelectedTool?: boolean;
}

export default function VerticalToolbar({
  activeTool,
  onToolSelect,
  onDeleteSelected,
  hasSelectedTool = false,
}: VerticalToolbarProps) {
  // Track last-used tool per group
  const [lastUsedPerGroup, setLastUsedPerGroup] = useState<Record<string, ToolType>>(() => {
    const defaults: Record<string, ToolType> = {};
    for (const group of TOOL_GROUPS) {
      defaults[group.id] = group.tools[0];
    }
    return defaults;
  });

  // Flyout open state
  const [openFlyout, setOpenFlyout] = useState<string | null>(null);
  const flyoutTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Lock drawing mode
  const [lockMode, setLockMode] = useState(false);

  // Close flyout on outside click
  useEffect(() => {
    if (!openFlyout) return;
    const handleClick = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setOpenFlyout(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [openFlyout]);

  // Find which group the active tool belongs to
  const activeGroupId = TOOL_GROUPS.find(g => g.tools.includes(activeTool))?.id;

  const handleToolSelect = useCallback((tool: ToolType, groupId: string) => {
    setLastUsedPerGroup(prev => ({ ...prev, [groupId]: tool }));
    setOpenFlyout(null);
    onToolSelect(tool);
  }, [onToolSelect]);

  const handleGroupMouseEnter = useCallback((groupId: string) => {
    if (flyoutTimeoutRef.current) {
      clearTimeout(flyoutTimeoutRef.current);
      flyoutTimeoutRef.current = null;
    }
    // Only show flyout for groups with more than 1 tool
    const group = TOOL_GROUPS.find(g => g.id === groupId);
    if (group && group.tools.length > 1) {
      setOpenFlyout(groupId);
    }
  }, []);

  const handleGroupMouseLeave = useCallback(() => {
    flyoutTimeoutRef.current = setTimeout(() => {
      setOpenFlyout(null);
    }, 200);
  }, []);

  const handleFlyoutMouseEnter = useCallback(() => {
    if (flyoutTimeoutRef.current) {
      clearTimeout(flyoutTimeoutRef.current);
      flyoutTimeoutRef.current = null;
    }
  }, []);

  const handleLockToggle = useCallback(() => {
    const newMode = !lockMode;
    setLockMode(newMode);
    const controller = getInteractionController();
    if (controller) {
      controller.setStayInDrawingMode(newMode);
    }
  }, [lockMode]);

  return (
    <div
      ref={toolbarRef}
      className="flex flex-col items-center py-1 w-[38px] flex-shrink-0 border-r border-[var(--border)] bg-[var(--background)] select-none z-20"
    >
      {/* Tool Groups */}
      <div className="flex flex-col items-center gap-0 flex-1">
        {TOOL_GROUPS.map((group, gi) => {
          const primaryTool = lastUsedPerGroup[group.id] || group.tools[0];
          const isGroupActive = activeGroupId === group.id;
          const Icon = TOOL_ICONS[primaryTool];
          const hasSubmenu = group.tools.length > 1;
          const isFlyoutOpen = openFlyout === group.id;

          return (
            <div key={group.id}>
              {/* Separator between groups */}
              {gi > 0 && (
                <div className="w-5 h-px bg-[var(--border)] mx-auto my-0.5" />
              )}

              {/* Primary tool button */}
              <div
                className="relative"
                onMouseEnter={() => handleGroupMouseEnter(group.id)}
                onMouseLeave={handleGroupMouseLeave}
              >
                <button
                  onClick={() => handleToolSelect(primaryTool, group.id)}
                  className={`
                    relative flex items-center justify-center w-[34px] h-[34px] rounded-md transition-colors duration-100
                    ${isGroupActive
                      ? 'bg-[var(--primary)]/15 text-[var(--primary)]'
                      : 'text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text-secondary)]'
                    }
                  `}
                  title={`${TOOL_LABELS[primaryTool]}${TOOL_SHORTCUTS[primaryTool] ? ` (${TOOL_SHORTCUTS[primaryTool]})` : ''}`}
                >
                  <Icon
                    size={16}
                    strokeWidth={1.5}
                    className={primaryTool === 'shortPosition' ? 'rotate-90' : ''}
                  />

                  {/* Submenu indicator — small triangle */}
                  {hasSubmenu && (
                    <span className="absolute bottom-0.5 right-0.5">
                      <ChevronRight size={7} strokeWidth={2} className="text-[var(--text-dimmed)]" />
                    </span>
                  )}
                </button>

                {/* Flyout submenu */}
                {isFlyoutOpen && hasSubmenu && (
                  <div
                    className="absolute left-full top-0 ml-0.5 z-50"
                    onMouseEnter={handleFlyoutMouseEnter}
                    onMouseLeave={handleGroupMouseLeave}
                  >
                    <FlyoutMenu
                      tools={group.tools}
                      groupId={group.id}
                      activeTool={activeTool}
                      onToolSelect={handleToolSelect}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom actions — Lock + Delete */}
      <div className="flex flex-col items-center gap-0 mt-auto pt-1 border-t border-[var(--border)]">
        {/* Magnet/snap — reserved for future */}

        {/* Lock drawing mode */}
        <button
          onClick={handleLockToggle}
          className={`
            flex items-center justify-center w-[34px] h-[34px] rounded-md transition-colors duration-100
            ${lockMode
              ? 'bg-[var(--primary)]/15 text-[var(--primary)]'
              : 'text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text-secondary)]'
            }
          `}
          title={lockMode ? 'Lock: ON (stay in drawing mode)' : 'Lock: OFF (auto return to cursor)'}
        >
          {lockMode ? <Lock size={14} strokeWidth={1.5} /> : <Unlock size={14} strokeWidth={1.5} />}
        </button>

        {/* Delete selected */}
        <button
          onClick={() => hasSelectedTool && onDeleteSelected?.()}
          disabled={!hasSelectedTool}
          className={`
            flex items-center justify-center w-[34px] h-[34px] rounded-md transition-colors duration-100
            ${hasSelectedTool
              ? 'text-[var(--text-muted)] hover:bg-red-500/15 hover:text-red-500'
              : 'text-[var(--text-dimmed)] opacity-30 cursor-not-allowed'
            }
          `}
          title={hasSelectedTool ? 'Delete selected (Del)' : 'No tool selected'}
        >
          <Trash2 size={14} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
