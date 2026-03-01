'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import { type Tool, type ToolType, type ToolStyle, getToolsEngine } from '@/lib/tools/ToolsEngine';
import { ExpandableSection } from './ExpandableSection';
import { NumberInput } from './NumberInput';
import { ColorPicker } from './ColorPicker';
import { LineWidthSlider } from './LineWidthSlider';
import { LineStylePicker } from './LineStylePicker';
import { OpacitySlider } from './OpacitySlider';

interface UnifiedToolPropertiesPanelProps {
  selectedTool: Tool | null;
  activeTool: ToolType;
  colors: {
    surface: string;
    background: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    gridColor: string;
  };
  onClose?: () => void;
  onUpdate?: () => void; // Callback to re-render chart after changes
}

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
  fibRetracement: 'Fibonacci Retracement',
  fibExtension: 'Fibonacci Extension',
  arrow: 'Arrow',
  brush: 'Brush',
  highlighter: 'Highlighter',
  measure: 'Measure',
  longPosition: 'Long Position',
  shortPosition: 'Short Position',
  text: 'Text',
  ellipse: 'Ellipse',
};

export function UnifiedToolPropertiesPanel({
  selectedTool,
  activeTool,
  colors,
  onClose,
  onUpdate,
}: UnifiedToolPropertiesPanelProps) {
  const [defaultToolType, setDefaultToolType] = useState<ToolType>('trendline');
  const [position, setPosition] = useState({ x: window.innerWidth - 300, y: 60 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const engine = getToolsEngine();

  // Close panel with Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Read style directly from tool or engine defaults — no local state copy
  const currentStyle: ToolStyle = selectedTool?.style ?? engine.getDefaultStyle(defaultToolType);

  // Read rectangle properties directly from selected tool
  const rectangleProps = useMemo(() => ({
    showPriceLabels: selectedTool?.type === 'rectangle' ? selectedTool.showPriceLabels !== false : true,
    showMedianLine: selectedTool?.type === 'rectangle' ? selectedTool.showMedianLine || false : false,
    showZones: selectedTool?.type === 'rectangle' ? selectedTool.showZones || false : false,
    extendLeft: selectedTool?.type === 'rectangle' ? selectedTool.extendLeft || false : false,
    extendRight: selectedTool?.type === 'rectangle' ? selectedTool.extendRight || false : false,
  }), [selectedTool]);

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, select')) return;
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Constrain position within viewport bounds (invisible walls)
      const panelWidth = 280; // Panel width
      const panelHeight = panelRef.current?.offsetHeight || 500;
      const maxX = window.innerWidth - panelWidth - 20; // 20px margin from right
      const maxY = window.innerHeight - panelHeight - 20; // 20px margin from bottom

      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;

      setPosition({
        x: Math.max(20, Math.min(newX, maxX)), // Clamp between 20px and maxX
        y: Math.max(20, Math.min(newY, maxY)), // Clamp between 20px and maxY
      });
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
  }, [isDragging, dragOffset]);

  // Style change handlers — multi-edit safe, undo-safe via engine
  const handleStyleChange = useCallback((updates: Partial<ToolStyle>) => {
    if (selectedTool) {
      // Update ALL selected tools' styles at once
      engine.updateSelectedToolsStyle(updates);
    } else {
      // No tool selected — update defaults
      engine.setDefaultStyle(defaultToolType, updates);
    }
    onUpdate?.();
  }, [selectedTool, defaultToolType, engine, onUpdate]);

  // Rectangle properties change handler — multi-edit for selected tools
  const handleRectanglePropsChange = useCallback((updates: Record<string, unknown>) => {
    if (!selectedTool || selectedTool.type !== 'rectangle') return;
    for (const tool of engine.getSelectedTools()) {
      engine.updateTool(tool.id, updates as Partial<Tool>);
    }
    onUpdate?.();
  }, [selectedTool, engine, onUpdate]);

  // Tool actions
  const handleToggleLock = useCallback(() => {
    if (!selectedTool) return;
    engine.updateTool(selectedTool.id, { locked: !selectedTool.locked });
  }, [selectedTool, engine]);

  const handleToggleVisibility = useCallback(() => {
    if (!selectedTool) return;
    engine.updateTool(selectedTool.id, { visible: !selectedTool.visible });
  }, [selectedTool, engine]);

  const handleDuplicate = useCallback(() => {
    if (!selectedTool) return;
    const { id, createdAt, updatedAt, selected, zIndex, ...toolData } = selectedTool;
    engine.addTool(toolData as any);
  }, [selectedTool, engine]);

  const handleDelete = useCallback(() => {
    if (!selectedTool) return;
    engine.deleteTool(selectedTool.id);
  }, [selectedTool, engine]);

  return (
    <div
      ref={panelRef}
      className="fixed z-[9998] rounded-xl shadow-2xl backdrop-blur-sm"
      style={{
        left: position.x,
        top: position.y,
        background: `linear-gradient(135deg, ${colors.surface}f5 0%, ${colors.surface}dd 100%)`,
        border: `1px solid ${colors.gridColor}`,
        maxHeight: 'calc(100vh - 120px)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        width: 280,
      }}
    >
      {/* Header with gradient */}
      <div
        onMouseDown={handleDragStart}
        className="cursor-move border-b px-3 py-2.5 flex items-center justify-between"
        style={{
          borderColor: colors.gridColor,
          background: `linear-gradient(90deg, rgba(41, 98, 255, 0.1) 0%, rgba(41, 98, 255, 0.05) 100%)`
        }}
      >
        <div className="flex items-center gap-2.5">
          {/* Professional icon */}
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(41, 98, 255, 0.15)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2962FF" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold leading-tight" style={{ color: colors.textPrimary }}>
              {selectedTool ? TOOL_LABELS[selectedTool.type] : 'Drawing Defaults'}
            </span>
            <span className="text-[10px] leading-tight" style={{ color: colors.textMuted }}>
              {selectedTool ? 'Properties' : 'Default Styles'}
            </span>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-all"
            title="Close (Esc)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        )}
      </div>

      {/* Content - scrollable */}
      <div className="flex-1 overflow-y-auto">
        {/* Tool Type Selector (when no selection) */}
        {!selectedTool && (
          <div className="p-3 border-b" style={{ borderColor: colors.gridColor }}>
            <label className="block text-xs mb-1.5" style={{ color: colors.textMuted }}>
              Tool Type
            </label>
            <select
              value={defaultToolType}
              onChange={(e) => setDefaultToolType(e.target.value as ToolType)}
              className="w-full px-2 py-1.5 bg-black/20 border border-white/10 rounded text-sm text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="trendline">Trend Line</option>
              <option value="horizontalLine">Horizontal Line</option>
              <option value="verticalLine">Vertical Line</option>
              <option value="rectangle">Rectangle</option>
              <option value="fibRetracement">Fibonacci Retracement</option>
              <option value="longPosition">Long Position</option>
              <option value="shortPosition">Short Position</option>
              <option value="text">Text</option>
            </select>
          </div>
        )}

        {/* Style Section */}
        <ExpandableSection title="Style" defaultExpanded>
          <ColorPicker
            label="Line Color"
            value={currentStyle.color}
            onChange={(color) => handleStyleChange({ color })}
            compact
          />

          {/* Fill Color for tools that support background */}
          {(selectedTool?.type === 'rectangle' ||
            selectedTool?.type === 'fibRetracement' ||
            selectedTool?.type === 'parallelChannel' ||
            selectedTool?.type === 'longPosition' ||
            selectedTool?.type === 'shortPosition' ||
            (selectedTool?.type as string) === 'highlighter' ||
            (!selectedTool && (defaultToolType === 'rectangle' ||
                              defaultToolType === 'fibRetracement' ||
                              defaultToolType === 'longPosition' ||
                              defaultToolType === 'shortPosition'))) && (
            <ColorPicker
              label="Background"
              value={currentStyle.fillColor || currentStyle.color}
              onChange={(fillColor) => handleStyleChange({ fillColor })}
              compact
              className="mt-2"
            />
          )}

          <LineWidthSlider
            value={currentStyle.lineWidth}
            onChange={(lineWidth) => handleStyleChange({ lineWidth })}
            className="mt-2"
          />

          <LineStylePicker
            value={currentStyle.lineStyle}
            onChange={(lineStyle) => handleStyleChange({ lineStyle })}
            className="mt-2"
          />

          {(currentStyle.opacity !== undefined || currentStyle.fillOpacity !== undefined) && (
            <OpacitySlider
              value={currentStyle.opacity || currentStyle.fillOpacity || 1}
              onChange={(opacity) => handleStyleChange({ opacity, fillOpacity: opacity })}
              className="mt-2"
            />
          )}

          {/* Apply as Default button (when no selection) */}
          {!selectedTool && (
            <button
              onClick={() => {
                // Already applied via handleStyleChange
                toast.success(`Default style saved for ${TOOL_LABELS[defaultToolType]}`);
              }}
              className="w-full mt-3 px-3 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg text-xs font-semibold transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
              </svg>
              <span>Save as Default</span>
            </button>
          )}
        </ExpandableSection>

        {/* Coordinates Section (tool selected only) */}
        {selectedTool && (
          <ExpandableSection title="Coordinates">
            {selectedTool.type === 'horizontalLine' && (
              <NumberInput
                label="Price"
                value={selectedTool.price}
                onChange={(price) => engine.updateTool(selectedTool.id, { price } as Partial<Tool>)}
              />
            )}

            {selectedTool.type === 'trendline' && (
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-white/60 mb-2">Start Point</div>
                  <NumberInput
                    label="Price"
                    value={selectedTool.startPoint.price}
                    onChange={(price) =>
                      engine.updateTool(selectedTool.id, {
                        startPoint: { ...selectedTool.startPoint, price },
                      } as Partial<Tool>)
                    }
                  />
                  <NumberInput
                    label="Time"
                    value={selectedTool.startPoint.time}
                    onChange={(time) =>
                      engine.updateTool(selectedTool.id, {
                        startPoint: { ...selectedTool.startPoint, time },
                      } as Partial<Tool>)
                    }
                    type="datetime"
                    className="mt-2"
                  />
                </div>
                <div>
                  <div className="text-xs text-white/60 mb-2">End Point</div>
                  <NumberInput
                    label="Price"
                    value={selectedTool.endPoint.price}
                    onChange={(price) =>
                      engine.updateTool(selectedTool.id, {
                        endPoint: { ...selectedTool.endPoint, price },
                      } as Partial<Tool>)
                    }
                  />
                  <NumberInput
                    label="Time"
                    value={selectedTool.endPoint.time}
                    onChange={(time) =>
                      engine.updateTool(selectedTool.id, {
                        endPoint: { ...selectedTool.endPoint, time },
                      } as Partial<Tool>)
                    }
                    type="datetime"
                    className="mt-2"
                  />
                </div>
              </div>
            )}

            {selectedTool.type === 'rectangle' && (
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-white/60 mb-2">Top Left</div>
                  <NumberInput
                    label="Price"
                    value={selectedTool.topLeft.price}
                    onChange={(price) =>
                      engine.updateTool(selectedTool.id, {
                        topLeft: { ...selectedTool.topLeft, price },
                      } as Partial<Tool>)
                    }
                  />
                  <NumberInput
                    label="Time"
                    value={selectedTool.topLeft.time}
                    onChange={(time) =>
                      engine.updateTool(selectedTool.id, {
                        topLeft: { ...selectedTool.topLeft, time },
                      } as Partial<Tool>)
                    }
                    type="datetime"
                    className="mt-2"
                  />
                </div>
                <div>
                  <div className="text-xs text-white/60 mb-2">Bottom Right</div>
                  <NumberInput
                    label="Price"
                    value={selectedTool.bottomRight.price}
                    onChange={(price) =>
                      engine.updateTool(selectedTool.id, {
                        bottomRight: { ...selectedTool.bottomRight, price },
                      } as Partial<Tool>)
                    }
                  />
                  <NumberInput
                    label="Time"
                    value={selectedTool.bottomRight.time}
                    onChange={(time) =>
                      engine.updateTool(selectedTool.id, {
                        bottomRight: { ...selectedTool.bottomRight, time },
                      } as Partial<Tool>)
                    }
                    type="datetime"
                    className="mt-2"
                  />
                </div>
              </div>
            )}
          </ExpandableSection>
        )}

        {/* Rectangle Options Section */}
        {selectedTool && selectedTool.type === 'rectangle' && (
          <ExpandableSection title="Rectangle Options">
            {/* Price Labels Toggle */}
            <div className="flex items-center justify-between py-2">
              <label className="text-xs" style={{ color: colors.textSecondary }}>
                Show Price Labels
              </label>
              <button
                onClick={() => handleRectanglePropsChange({ showPriceLabels: !rectangleProps.showPriceLabels })}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  rectangleProps.showPriceLabels ? 'bg-blue-500' : 'bg-white/20'
                }`}
              >
                <div
                  className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    rectangleProps.showPriceLabels ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>

            {/* Median Line Toggle */}
            <div className="flex items-center justify-between py-2">
              <label className="text-xs" style={{ color: colors.textSecondary }}>
                Show Median Line (50%)
              </label>
              <button
                onClick={() => handleRectanglePropsChange({ showMedianLine: !rectangleProps.showMedianLine })}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  rectangleProps.showMedianLine ? 'bg-blue-500' : 'bg-white/20'
                }`}
              >
                <div
                  className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    rectangleProps.showMedianLine ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>

            {/* Show Zones Toggle */}
            <div className="flex items-center justify-between py-2">
              <label className="text-xs" style={{ color: colors.textSecondary }}>
                Show Zones
              </label>
              <button
                onClick={() => handleRectanglePropsChange({ showZones: !rectangleProps.showZones })}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  rectangleProps.showZones ? 'bg-blue-500' : 'bg-white/20'
                }`}
              >
                <div
                  className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    rectangleProps.showZones ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>

            {/* Zone Configuration */}
            {rectangleProps.showZones && (
              <div className="mt-3 space-y-2">
                <div className="text-[10px] text-white/60 mb-2">Quick Zones</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      const standardZones = [
                        { level: 0.25, label: '25%', showLabel: true, showPrice: false },
                        { level: 0.5, label: '50%', showLabel: true, showPrice: false },
                        { level: 0.75, label: '75%', showLabel: true, showPrice: false },
                      ];
                      engine.updateTool(selectedTool.id, {
                        zones: standardZones,
                      } as Partial<Tool>);
                      onUpdate?.();
                    }}
                    className="px-2 py-1.5 bg-white/5 hover:bg-white/10 rounded text-[10px] text-white transition-all border border-white/5 hover:border-blue-500"
                  >
                    25-50-75%
                  </button>
                  <button
                    onClick={() => {
                      const thirdZones = [
                        { level: 0.33, label: '33%', showLabel: true, showPrice: false },
                        { level: 0.66, label: '66%', showLabel: true, showPrice: false },
                      ];
                      engine.updateTool(selectedTool.id, {
                        zones: thirdZones,
                      } as Partial<Tool>);
                      onUpdate?.();
                    }}
                    className="px-2 py-1.5 bg-white/5 hover:bg-white/10 rounded text-[10px] text-white transition-all border border-white/5 hover:border-blue-500"
                  >
                    33-66%
                  </button>
                  <button
                    onClick={() => {
                      const quarterZones = [
                        { level: 0.25, label: '25%', showLabel: true, showPrice: false },
                        { level: 0.5, label: '50%', showLabel: true, showPrice: false },
                      ];
                      engine.updateTool(selectedTool.id, {
                        zones: quarterZones,
                      } as Partial<Tool>);
                      onUpdate?.();
                    }}
                    className="px-2 py-1.5 bg-white/5 hover:bg-white/10 rounded text-[10px] text-white transition-all border border-white/5 hover:border-blue-500"
                  >
                    25-50%
                  </button>
                  <button
                    onClick={() => {
                      engine.updateTool(selectedTool.id, {
                        zones: [],
                      } as Partial<Tool>);
                      onUpdate?.();
                    }}
                    className="px-2 py-1.5 bg-red-500/10 hover:bg-red-500/20 rounded text-[10px] text-red-400 transition-all border border-red-500/20 hover:border-red-500"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            {/* Extend Options */}
            <div className="flex items-center justify-between py-2 mt-2">
              <label className="text-xs" style={{ color: colors.textSecondary }}>
                Extend Left
              </label>
              <button
                onClick={() => handleRectanglePropsChange({ extendLeft: !rectangleProps.extendLeft })}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  rectangleProps.extendLeft ? 'bg-blue-500' : 'bg-white/20'
                }`}
              >
                <div
                  className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    rectangleProps.extendLeft ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between py-2">
              <label className="text-xs" style={{ color: colors.textSecondary }}>
                Extend Right
              </label>
              <button
                onClick={() => handleRectanglePropsChange({ extendRight: !rectangleProps.extendRight })}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  rectangleProps.extendRight ? 'bg-blue-500' : 'bg-white/20'
                }`}
              >
                <div
                  className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    rectangleProps.extendRight ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>
          </ExpandableSection>
        )}

        {/* Actions Section (tool selected only) */}
        {selectedTool && (
          <div className="p-3 border-t" style={{ borderColor: colors.gridColor }}>
            <div className="grid grid-cols-2 gap-2">
              {/* Lock/Unlock */}
              <button
                onClick={handleToggleLock}
                className="group px-3 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-white text-xs font-medium transition-all flex items-center justify-center gap-2 border border-white/5 hover:border-white/10"
                title={selectedTool.locked ? 'Unlock tool' : 'Lock tool'}
              >
                {selectedTool.locked ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0110 0v4"/>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 019.9-1"/>
                  </svg>
                )}
                <span>{selectedTool.locked ? 'Unlock' : 'Lock'}</span>
              </button>

              {/* Show/Hide */}
              <button
                onClick={handleToggleVisibility}
                className="group px-3 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-white text-xs font-medium transition-all flex items-center justify-center gap-2 border border-white/5 hover:border-white/10"
                title={selectedTool.visible ? 'Hide tool' : 'Show tool'}
              >
                {selectedTool.visible ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                )}
                <span>{selectedTool.visible ? 'Hide' : 'Show'}</span>
              </button>

              {/* Duplicate */}
              <button
                onClick={handleDuplicate}
                className="group px-3 py-2.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-medium transition-all flex items-center justify-center gap-2 border border-blue-500/20 hover:border-blue-500/30"
                title="Duplicate tool (Ctrl+D)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                </svg>
                <span>Duplicate</span>
              </button>

              {/* Delete */}
              <button
                onClick={handleDelete}
                className="group px-3 py-2.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium transition-all flex items-center justify-center gap-2 border border-red-500/20 hover:border-red-500/30"
                title="Delete tool (Del)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                  <line x1="10" y1="11" x2="10" y2="17"/>
                  <line x1="14" y1="11" x2="14" y2="17"/>
                </svg>
                <span>Delete</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
