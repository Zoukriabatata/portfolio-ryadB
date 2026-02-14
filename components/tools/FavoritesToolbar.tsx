'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { type ToolType } from '@/lib/tools/ToolsEngine';
import { getInteractionController } from '@/lib/tools/InteractionController';
import {
  useFavoritesToolbarStore,
  type ToolbarPreset,
} from '@/stores/useFavoritesToolbarStore';
import {
  CursorIcon,
  CrosshairIcon,
  TrendlineIcon,
  HLineIcon,
  RectangleIcon,
  LongPositionIcon,
  ShortPositionIcon,
  VLineIcon,
  RayIcon,
  ChannelIcon,
  FibonacciIcon,
  ArrowIcon,
  BrushIcon,
  HighlighterIcon,
  MeasureIcon,
  TextIcon,
} from '@/components/ui/Icons';

// CSS for tool button animations
const toolAnimationStyles = `
  @keyframes toolClick {
    0% { transform: scale(1); filter: brightness(1); }
    40% { transform: scale(0.88); filter: brightness(1.3); }
    100% { transform: scale(1); filter: brightness(1); }
  }

  @keyframes toolActivate {
    0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(126, 211, 33, 0.5); }
    40% { transform: scale(1.15); box-shadow: 0 0 0 10px rgba(126, 211, 33, 0); }
    100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(126, 211, 33, 0); }
  }

  @keyframes toolDrag {
    0% { transform: scale(1.08) rotate(0deg); opacity: 0.7; }
    33% { transform: scale(1.08) rotate(-3deg); }
    66% { transform: scale(1.08) rotate(3deg); }
    100% { transform: scale(1.08) rotate(0deg); opacity: 0.7; }
  }

  @keyframes toolHoverGlow {
    0% { box-shadow: 0 0 0 0 rgba(126, 211, 33, 0); }
    100% { box-shadow: 0 0 8px 2px rgba(126, 211, 33, 0.15); }
  }

  @keyframes dropdownSlide {
    from { opacity: 0; transform: scale(0.92) translateY(-10px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }

  @keyframes dropdownItemHighlight {
    0% { background-color: transparent; }
    50% { background-color: rgba(126, 211, 33, 0.2); }
    100% { background-color: transparent; }
  }

  @keyframes selectedPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(126, 211, 33, 0.3); }
    50% { box-shadow: 0 0 0 5px rgba(126, 211, 33, 0.1); }
  }

  @keyframes floatIn {
    from { opacity: 0; transform: scale(0.9) translateY(10px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }

  @keyframes removeX {
    from { opacity: 0; transform: scale(0.5); }
    to { opacity: 1; transform: scale(1); }
  }

  .tool-click { animation: toolClick 0.18s cubic-bezier(0.4, 0, 0.2, 1); }
  .tool-activate { animation: toolActivate 0.5s cubic-bezier(0.4, 0, 0.2, 1); }
  .tool-dragging { animation: toolDrag 0.4s ease-in-out infinite; }
  .dropdown-enter { animation: dropdownSlide 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
  .dropdown-item-selected { animation: dropdownItemHighlight 0.6s ease-out; }
  .tool-selected-pulse { animation: selectedPulse 2.5s ease-in-out infinite; }
  .toolbar-float-in { animation: floatIn 0.3s cubic-bezier(0.4, 0, 0.2, 1); }

  .tool-btn { transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1); }
  .tool-btn:hover { transform: scale(1.08); }
  .tool-btn:active { transform: scale(0.92); }

  .tool-remove-x {
    animation: removeX 0.15s ease-out;
  }

  /* Tooltips: using global CSS from globals.css */
`;

/**
 * FAVORITES TOOLBAR
 *
 * Compact horizontal toolbar for favorite drawing tools.
 * - Draggable when floating
 * - Clean horizontal row with group separators
 * - Right-click or hover X to remove tools
 * - Drag-and-drop reordering
 */

interface FavoritesToolbarProps {
  activeTool: ToolType;
  onToolSelect: (tool: ToolType) => void;
  onDeleteSelected?: () => void;
  hasSelectedTool?: boolean;
  colors: {
    surface: string;
    background: string;
    gridColor: string;
    textPrimary: string;
    textMuted: string;
    deltaPositive: string;
    deltaNegative?: string;
  };
  preset?: ToolbarPreset;
}

// Tool icon mapping - Professional SVG icons
const TOOL_ICONS: Record<ToolType, React.FC<{ size?: number; color?: string }>> = {
  cursor: CursorIcon,
  crosshair: CrosshairIcon,
  trendline: TrendlineIcon,
  ray: RayIcon,
  horizontalLine: HLineIcon,
  horizontalRay: RayIcon,
  verticalLine: VLineIcon,
  rectangle: RectangleIcon,
  parallelChannel: ChannelIcon,
  fibRetracement: FibonacciIcon,
  fibExtension: FibonacciIcon,
  arrow: ArrowIcon,
  brush: BrushIcon,
  highlighter: HighlighterIcon,
  measure: MeasureIcon,
  ellipse: RectangleIcon, // Circle-ish icon placeholder
  longPosition: LongPositionIcon,
  shortPosition: ShortPositionIcon,
  text: TextIcon,
};

const TOOL_LABELS: Record<ToolType, string> = {
  cursor: 'Cursor',
  crosshair: 'Crosshair',
  trendline: 'Trend Line',
  ray: 'Ray',
  horizontalLine: 'H-Line',
  horizontalRay: 'H-Ray',
  verticalLine: 'V-Line',
  rectangle: 'Rectangle',
  parallelChannel: 'Channel',
  fibRetracement: 'Fib Retracement',
  fibExtension: 'Fib Extension',
  arrow: 'Arrow',
  brush: 'Brush',
  highlighter: 'Highlighter',
  measure: 'Measure',
  ellipse: 'Ellipse',
  longPosition: 'Long',
  shortPosition: 'Short',
  text: 'Text',
};

const TOOL_SHORTCUTS: Partial<Record<ToolType, string>> = {
  cursor: 'V',
  crosshair: 'C',
  trendline: 'T',
  horizontalLine: 'H',
  rectangle: 'R',
  longPosition: 'L',
  shortPosition: 'S',
};

// Tool groups for thin separator lines
const TOOL_GROUPS: ToolType[][] = [
  ['cursor', 'crosshair'],
  ['trendline', 'ray', 'horizontalLine', 'horizontalRay', 'verticalLine'],
  ['rectangle', 'parallelChannel', 'ellipse'],
  ['fibRetracement', 'fibExtension'],
  ['longPosition', 'shortPosition'],
  ['arrow', 'brush', 'highlighter', 'measure', 'text'],
];

function getToolGroup(tool: ToolType): number {
  for (let i = 0; i < TOOL_GROUPS.length; i++) {
    if (TOOL_GROUPS[i].includes(tool)) return i;
  }
  return -1;
}

export default function FavoritesToolbar({
  activeTool,
  onToolSelect,
  onDeleteSelected,
  hasSelectedTool = false,
  colors,
  preset = 'default',
}: FavoritesToolbarProps) {
  const {
    presets,
    activePreset,
    reorderTools,
    setFloatingPosition,
    toggleCollapsed,
    removeToolFromPreset,
  } = useFavoritesToolbarStore();

  const currentPreset = presets[preset] || presets[activePreset];
  const { tools, position, floatingPosition, collapsed } = currentPreset;

  // Dragging state for floating toolbar
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Drag-and-drop reordering
  const [draggedTool, setDraggedTool] = useState<ToolType | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  // Animation states
  const [clickedTool, setClickedTool] = useState<ToolType | null>(null);
  const [justActivatedTool, setJustActivatedTool] = useState<ToolType | null>(null);

  // Hover state for showing remove X
  const [hoveredTool, setHoveredTool] = useState<ToolType | null>(null);

  // Stay-in-drawing-mode toggle (professional style)
  const [stayInDrawingMode, setStayInDrawingMode] = useState(false);

  // Inject animation styles
  useEffect(() => {
    const styleId = 'favorites-toolbar-animations';
    if (!document.getElementById(styleId)) {
      const styleEl = document.createElement('style');
      styleEl.id = styleId;
      styleEl.textContent = toolAnimationStyles;
      document.head.appendChild(styleEl);
    }
  }, []);

  // Handle floating toolbar dragging
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (position !== 'floating') return;
      if ((e.target as HTMLElement).closest('button')) return;

      setIsDragging(true);
      setDragOffset({
        x: e.clientX - (floatingPosition?.x || 0),
        y: e.clientY - (floatingPosition?.y || 0),
      });
    },
    [position, floatingPosition]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setFloatingPosition(
        preset,
        e.clientX - dragOffset.x,
        e.clientY - dragOffset.y
      );
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, preset, setFloatingPosition]);

  // Handle tool reordering
  const handleToolDragStart = useCallback((tool: ToolType) => {
    setDraggedTool(tool);
  }, []);

  const handleToolDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      setDropIndex(index);
    },
    []
  );

  const handleToolDrop = useCallback(
    (index: number) => {
      if (!draggedTool) return;

      const newTools = [...tools];
      const oldIndex = newTools.indexOf(draggedTool);
      if (oldIndex === -1) return;

      newTools.splice(oldIndex, 1);
      newTools.splice(index, 0, draggedTool);
      reorderTools(preset, newTools);

      setDraggedTool(null);
      setDropIndex(null);
    },
    [draggedTool, tools, preset, reorderTools]
  );

  const handleToolDragEnd = useCallback(() => {
    setDraggedTool(null);
    setDropIndex(null);
  }, []);

  // Handle right-click removal
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, tool: ToolType) => {
      e.preventDefault();
      if (tool === 'cursor') return; // cursor always stays
      removeToolFromPreset(preset, tool);
    },
    [preset, removeToolFromPreset]
  );

  // Handle X button removal
  const handleRemoveTool = useCallback(
    (e: React.MouseEvent, tool: ToolType) => {
      e.stopPropagation();
      e.preventDefault();
      if (tool === 'cursor') return;
      removeToolFromPreset(preset, tool);
    },
    [preset, removeToolFromPreset]
  );

  // Calculate position styles
  const getPositionStyles = (): React.CSSProperties => {
    if (position === 'floating') {
      return {
        position: 'fixed',
        left: floatingPosition?.x || 100,
        top: floatingPosition?.y || 200,
        zIndex: 9999,
      };
    }

    // Docked positions are handled by parent layout
    return {};
  };

  const isHorizontal = position === 'top' || position === 'floating';
  const isFloating = position === 'floating';

  // Determine if a separator should be placed after tool at given index
  const shouldShowSeparator = (index: number): boolean => {
    if (index >= tools.length - 1) return false;
    const currentGroup = getToolGroup(tools[index]);
    const nextGroup = getToolGroup(tools[index + 1]);
    return currentGroup !== nextGroup && currentGroup !== -1 && nextGroup !== -1;
  };

  if (collapsed) {
    return (
      <div
        ref={toolbarRef}
        className={`flex items-center justify-center ${
          isFloating ? 'fixed z-[25]' : ''
        }`}
        style={{
          ...getPositionStyles(),
          backgroundColor: colors.surface,
          border: `1px solid ${colors.gridColor}`,
          borderRadius: 8,
          padding: 4,
        }}
      >
        <button
          onClick={() => toggleCollapsed(preset)}
          className="p-2 hover:bg-white/10 rounded transition-colors"
          style={{ color: colors.textMuted }}
          data-tooltip="Expand toolbar"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 8h16M4 16h16" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={toolbarRef}
      className={`select-none ${isFloating ? 'fixed z-[25] cursor-move toolbar-float-in' : ''}`}
      style={{
        ...getPositionStyles(),
        backgroundColor: isFloating ? 'color-mix(in srgb, var(--background) 92%, transparent)' : colors.surface,
        border: `1px solid ${colors.gridColor}`,
        borderRadius: 8,
        backdropFilter: isFloating ? 'blur(12px)' : undefined,
        boxShadow: isFloating ? '0 4px 24px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.2)' : undefined,
      }}
      onMouseDown={handleDragStart}
    >
      {/* Single horizontal row: tools + separators + actions + collapse */}
      <div className="flex flex-row items-center gap-0 px-1 py-0.5">
        {tools.map((tool, index) => {
          const IconComponent = TOOL_ICONS[tool];
          const isActive = activeTool === tool;
          const isDragOver = dropIndex === index;
          const isClicked = clickedTool === tool;
          const isJustActivated = justActivatedTool === tool;
          const isBeingDragged = draggedTool === tool;
          const isHovered = hoveredTool === tool;
          const canRemove = tool !== 'cursor';

          return (
            <div key={tool} className="flex flex-row items-center">
              <div
                draggable
                onDragStart={() => handleToolDragStart(tool)}
                onDragOver={(e) => handleToolDragOver(e, index)}
                onDrop={() => handleToolDrop(index)}
                onDragEnd={handleToolDragEnd}
                onMouseEnter={() => setHoveredTool(tool)}
                onMouseLeave={() => setHoveredTool(null)}
                className={`relative ${isDragOver ? 'scale-105' : ''} transition-transform ${
                  isBeingDragged ? 'tool-dragging opacity-60' : ''
                }`}
              >
                <button
                  onClick={() => {
                    setClickedTool(tool);
                    setTimeout(() => setClickedTool(null), 150);

                    if (activeTool !== tool) {
                      setJustActivatedTool(tool);
                      setTimeout(() => setJustActivatedTool(null), 400);
                    }

                    onToolSelect(tool);
                  }}
                  onContextMenu={(e) => handleContextMenu(e, tool)}
                  className={`tool-btn relative flex items-center justify-center rounded-md ${
                    isActive ? 'tool-selected-pulse' : ''
                  } ${isClicked ? 'tool-click' : ''} ${isJustActivated ? 'tool-activate' : ''}`}
                  style={{
                    width: 30,
                    height: 30,
                    color: isActive ? colors.deltaPositive : colors.textMuted,
                    backgroundColor: isActive ? 'rgba(126, 211, 33, 0.15)' : undefined,
                    boxShadow: isActive ? '0 0 0 1px rgba(126, 211, 33, 0.4), inset 0 0 8px rgba(126, 211, 33, 0.1)' : undefined,
                  }}
                  data-tooltip={`${TOOL_LABELS[tool]}${TOOL_SHORTCUTS[tool] ? `  [${TOOL_SHORTCUTS[tool]}]` : ''}`}
                >
                  {IconComponent && <IconComponent size={16} color="currentColor" />}

                  {/* Keyboard shortcut badge */}
                  {TOOL_SHORTCUTS[tool] && (
                    <span
                      className="absolute bottom-0 right-0.5 text-[7px] font-mono leading-none"
                      style={{ color: colors.textMuted, opacity: 0.4 }}
                    >
                      {TOOL_SHORTCUTS[tool]}
                    </span>
                  )}
                </button>

                {/* Remove X icon on hover */}
                {isHovered && canRemove && !isBeingDragged && (
                  <button
                    onClick={(e) => handleRemoveTool(e, tool)}
                    className="tool-remove-x absolute flex items-center justify-center rounded-full hover:brightness-125 transition-all"
                    style={{
                      width: 12,
                      height: 12,
                      top: -2,
                      right: -2,
                      backgroundColor: 'rgba(100, 100, 100, 0.8)',
                      zIndex: 10,
                    }}
                    data-tooltip={`Remove ${TOOL_LABELS[tool]}`}
                  >
                    <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                      <line x1="3" y1="3" x2="9" y2="9" />
                      <line x1="9" y1="3" x2="3" y2="9" />
                    </svg>
                  </button>
                )}

                {/* Drop indicator */}
                {isDragOver && draggedTool && draggedTool !== tool && (
                  <div
                    className="absolute left-0 top-0 w-0.5 h-full"
                    style={{ backgroundColor: colors.deltaPositive }}
                  />
                )}
              </div>

              {/* Thin group separator */}
              {shouldShowSeparator(index) && (
                <div
                  className="mx-0.5 self-center"
                  style={{
                    width: 1,
                    height: 16,
                    backgroundColor: colors.gridColor,
                    opacity: 0.6,
                  }}
                />
              )}
            </div>
          );
        })}

        {/* Separator before action buttons */}
        <div
          className="mx-0.5 self-center"
          style={{
            width: 1,
            height: 16,
            backgroundColor: colors.gridColor,
            opacity: 0.6,
          }}
        />

        {/* Lock Drawing Mode Button (professional style) */}
        <button
          onClick={() => {
            const newMode = !stayInDrawingMode;
            setStayInDrawingMode(newMode);
            const controller = getInteractionController();
            if (controller) {
              controller.setStayInDrawingMode(newMode);
            }
          }}
          className={`relative flex items-center justify-center rounded-md transition-all ${
            stayInDrawingMode
              ? 'bg-green-500/20 hover:bg-green-500/30 hover:scale-105 active:scale-95'
              : 'hover:bg-white/10 hover:scale-105 active:scale-95'
          }`}
          style={{
            width: 30,
            height: 30,
            color: stayInDrawingMode ? colors.deltaPositive : colors.textMuted,
          }}
          data-tooltip={stayInDrawingMode ? 'Lock: ON (stay active)' : 'Lock: OFF (auto cursor)'}
        >
          {stayInDrawingMode ? (
            // Locked icon
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          ) : (
            // Unlocked icon
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 9.9-1" />
            </svg>
          )}
        </button>

        {/* Delete Tool Button */}
        <button
          onClick={() => {
            if (hasSelectedTool && onDeleteSelected) {
              onDeleteSelected();
            }
          }}
          className={`relative flex items-center justify-center rounded-md transition-all ${
            hasSelectedTool
              ? 'hover:bg-red-500/20 hover:scale-105 active:scale-95 cursor-pointer'
              : 'opacity-30 cursor-not-allowed'
          }`}
          style={{
            width: 30,
            height: 30,
            color: hasSelectedTool ? (colors.deltaNegative || '#ef4444') : colors.textMuted,
          }}
          data-tooltip={hasSelectedTool ? 'Delete  [Del]' : 'No tool selected'}
          disabled={!hasSelectedTool}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
        </button>

        {/* Add tool button */}
        <AddToolButton
          colors={colors}
          existingTools={tools}
          onAddTool={(tool) => {
            const store = useFavoritesToolbarStore.getState();
            store.addToolToPreset(preset, tool);
          }}
          isHorizontal={isHorizontal}
        />

        {/* Separator before collapse */}
        <div
          className="mx-0.5 self-center"
          style={{
            width: 1,
            height: 16,
            backgroundColor: colors.gridColor,
            opacity: 0.6,
          }}
        />

        {/* Collapse button at far right */}
        <button
          onClick={() => toggleCollapsed(preset)}
          className="flex items-center justify-center rounded-md hover:bg-white/10 transition-colors"
          style={{
            width: 22,
            height: 22,
            color: colors.textMuted,
          }}
          data-tooltip="Collapse"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 15l-6-6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// Add tool dropdown button (More Tools)
function AddToolButton({
  colors,
  existingTools,
  onAddTool,
  isHorizontal,
}: {
  colors: { surface: string; gridColor: string; textMuted: string; textPrimary: string };
  existingTools: ToolType[];
  onAddTool: (tool: ToolType) => void;
  isHorizontal: boolean;
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [clickedItem, setClickedItem] = useState<ToolType | null>(null);
  const [selectedItem, setSelectedItem] = useState<ToolType | null>(null);
  const [isRotating, setIsRotating] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);

  const allTools: ToolType[] = [
    'cursor',
    'crosshair',
    'trendline',
    'horizontalLine',
    'horizontalRay',
    'verticalLine',
    'rectangle',
    'fibRetracement',
    'longPosition',
    'shortPosition',
    'text',
  ];

  const availableTools = allTools.filter((t) => !existingTools.includes(t));

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  if (availableTools.length === 0) return null;

  const handleToggleDropdown = () => {
    setIsRotating(true);
    setTimeout(() => setIsRotating(false), 200);
    setShowDropdown(!showDropdown);
  };

  return (
    <div ref={buttonRef} className="relative">
      <button
        onClick={handleToggleDropdown}
        className={`flex items-center justify-center rounded-md hover:bg-white/10 hover:scale-105 active:scale-95 transition-all ${
          showDropdown ? 'bg-white/10' : ''
        }`}
        style={{
          width: 30,
          height: 30,
          color: colors.textMuted,
        }}
        data-tooltip="Add tool"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{
            transition: 'transform 0.2s ease-out',
            transform: isRotating ? 'rotate(90deg)' : (showDropdown ? 'rotate(45deg)' : 'rotate(0deg)'),
          }}
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {showDropdown && (
        <div
          className={`absolute z-50 p-1 rounded-lg shadow-2xl dropdown-enter ${
            isHorizontal ? 'top-full left-0 mt-1' : 'left-full top-0 ml-1'
          }`}
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.gridColor}`,
            minWidth: 160,
            backdropFilter: 'blur(8px)',
          }}
        >
          <div
            className="text-[10px] px-2 py-1 mb-1 border-b"
            style={{ color: colors.textMuted, borderColor: colors.gridColor }}
          >
            More Tools
          </div>
          {availableTools.map((tool, index) => {
            const IconComponent = TOOL_ICONS[tool];
            const isClicked = clickedItem === tool;
            const isSelected = selectedItem === tool;
            return (
              <button
                key={tool}
                onClick={() => {
                  // Click animation
                  setClickedItem(tool);
                  setSelectedItem(tool);

                  // Delay closing to show selection animation
                  setTimeout(() => {
                    onAddTool(tool);
                    setShowDropdown(false);
                    setClickedItem(null);
                    setSelectedItem(null);
                  }, 300);
                }}
                className={`flex items-center gap-2 w-full px-2 py-1.5 rounded transition-all ${
                  isClicked ? 'scale-95' : 'hover:scale-102'
                } ${isSelected ? 'dropdown-item-selected bg-green-500/20' : 'hover:bg-white/10'}`}
                style={{
                  animationDelay: `${index * 30}ms`,
                  opacity: 0,
                  animation: `dropdownSlide 0.2s ease-out ${index * 30}ms forwards`,
                }}
              >
                <span
                  className="transition-transform"
                  style={{
                    color: isSelected ? colors.textPrimary : colors.textMuted,
                    transform: isSelected ? 'scale(1.2)' : 'scale(1)',
                  }}
                >
                  {IconComponent && <IconComponent size={14} color="currentColor" />}
                </span>
                <span
                  className="text-xs transition-colors"
                  style={{ color: isSelected ? '#22c55e' : colors.textPrimary }}
                >
                  {TOOL_LABELS[tool]}
                </span>
                {isSelected && (
                  <span className="ml-auto text-green-400 text-xs">+</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
