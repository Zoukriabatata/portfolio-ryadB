'use client';

import React, { useMemo, useCallback, useReducer, useEffect } from 'react';
import type { Tool } from '@/lib/tools/types';
import type { ToolSettingField } from '@/lib/tools/registry/ToolDefinition';
import { getToolsEngine } from '@/lib/tools/ToolsEngine';
import { toolRegistry } from '@/lib/tools/registry/ToolRegistry';
import { SettingFieldRenderer } from './SettingFieldRenderer';
import { usePreferencesStore } from '@/stores/usePreferencesStore';
import { InlineColorSwatch } from '@/components/tools/InlineColorSwatch';

interface DynamicToolSettingsPanelProps {
  tool: Tool;
  onUpdate?: () => void;
}

/** Set a dot-path value in an object, returning a shallow-merged update */
function buildNestedUpdate(path: string, value: unknown): Record<string, unknown> {
  const parts = path.split('.');
  if (parts.length === 1) {
    return { [parts[0]]: value };
  }
  // e.g. 'style.color' → { style: { ...existing, color: value } }
  // We'll let the caller merge at the top level
  const result: Record<string, unknown> = {};
  let current = result;
  for (let i = 0; i < parts.length - 1; i++) {
    const next: Record<string, unknown> = {};
    current[parts[i]] = next;
    current = next;
  }
  current[parts[parts.length - 1]] = value;
  return result;
}

/** Deep merge for nested style objects */
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      typeof source[key] === 'object' &&
      source[key] !== null &&
      !Array.isArray(source[key]) &&
      typeof result[key] === 'object' &&
      result[key] !== null
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>
      );
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

export function DynamicToolSettingsPanel({ tool, onUpdate }: DynamicToolSettingsPanelProps) {
  // Force re-render when the tool changes in the engine
  const [, forceRender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const engine = getToolsEngine();
    const unsub = engine.on('tool:update', (updatedTool) => {
      if (updatedTool && 'id' in updatedTool && (updatedTool as { id: string }).id === tool.id) {
        forceRender();
      }
    });
    return unsub;
  }, [tool.id]);

  // Read fresh tool from engine — single source of truth
  const freshTool = getToolsEngine().getTool(tool.id) ?? tool;

  const def = toolRegistry.get(freshTool.type);
  const schema = def?.settingsSchema;

  const groups = useMemo(() => {
    if (!schema) return new Map<string, ToolSettingField[]>();
    const map = new Map<string, ToolSettingField[]>();
    for (const field of schema) {
      if (field.condition && !field.condition(freshTool)) continue;
      const group = field.group || 'General';
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push(field);
    }
    return map;
  }, [schema, freshTool]);

  const handleChange = useCallback(
    (key: string, value: unknown) => {
      const engine = getToolsEngine();

      // Style paths (e.g. 'style.color') → update ALL selected tools via engine
      if (key.startsWith('style.')) {
        const styleKey = key.slice(6); // 'style.color' → 'color'
        engine.updateSelectedToolsStyle({ [styleKey]: value } as any);
      } else {
        // Non-style paths → update each selected tool individually
        const update = buildNestedUpdate(key, value);
        for (const selected of engine.getSelectedTools()) {
          const merged = deepMerge(selected as unknown as Record<string, unknown>, update);
          const topKey = key.split('.')[0];
          engine.updateTool(selected.id, { [topKey]: merged[topKey] } as Partial<Tool>);
        }
      }
      onUpdate?.();
    },
    [tool, onUpdate]
  );

  const isPosition = freshTool.type === 'longPosition' || freshTool.type === 'shortPosition';

  if ((!schema || schema.length === 0) && !isPosition) {
    return null;
  }

  return (
    <div
      className="absolute right-0 top-full mt-1 w-[280px] bg-[#111315] border border-[#1C1F23] rounded-[10px]
        shadow-xl z-50 overflow-hidden"
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#1C1F23]">
        <span className="text-[11px] font-medium text-[#8a8f98] uppercase tracking-wider">
          {freshTool.type.replace(/([A-Z])/g, ' $1').trim()}
        </span>
      </div>

      {/* Groups */}
      <div className="px-3 py-2 max-h-[400px] overflow-y-auto">
        {Array.from(groups.entries()).map(([groupName, fields]) => (
          <div key={groupName} className="mb-2 last:mb-0">
            {groups.size > 1 && (
              <div className="text-[10px] font-medium text-[#555] uppercase tracking-wider mb-1">
                {groupName}
              </div>
            )}
            {fields!.map((field) => (
              <SettingFieldRenderer
                key={field.key}
                field={field}
                tool={freshTool}
                onChange={handleChange}
              />
            ))}
          </div>
        ))}

        {/* Position-specific global settings */}
        {isPosition && <PositionGlobalSettings />}
      </div>
    </div>
  );
}

// ═══ Mini toggle ═══
function MiniToggle({ label, desc, value, onChange }: { label: string; desc?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div>
        <span className="text-[11px] font-medium text-[#c9cdd4]">{label}</span>
        {desc && <p className="text-[9px] text-[#555]">{desc}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`w-8 h-4 rounded-full transition-all flex items-center ${value ? 'bg-blue-500 justify-end' : 'bg-[#2a2e35] justify-start'}`}
      >
        <div className="w-3.5 h-3.5 rounded-full bg-white shadow-sm mx-px" />
      </button>
    </div>
  );
}

// ═══ Mini slider ═══
function MiniSlider({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] text-[#666]">{label}</span>
        <span className="text-[9px] font-mono text-[#888]">{value}{unit || ''}</span>
      </div>
      <input type="range" min={min} max={max} step={step || 1} value={value} onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 bg-[#2a2e35] rounded-full appearance-none cursor-pointer accent-blue-500" />
    </div>
  );
}

// ═══ Position Global Settings — colors, zones, arrow, opacity ═══
function PositionGlobalSettings() {
  const {
    posTpColor, posSlColor, posEntryColor,
    posZoneOpacity, posShowZoneFill, posShowLabels, posDefaultCompact,
    posSmartArrow, posDynamicOpacity, posOpacityCurve, posOpacityIntensity,
    posArrowExponent, posArrowIntensity, posArrowThickness,
    posProgressTrail, posTrailIntensity, posTimeWeight, posGradientMode,
    setVPSetting,
  } = usePreferencesStore();

  return (
    <div className="mt-2 pt-2 border-t border-[#1C1F23]">
      <div className="text-[10px] font-medium text-[#555] uppercase tracking-wider mb-1">
        Apparence
      </div>

      {/* Colors */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[#888]">Couleur TP</span>
          <InlineColorSwatch value={posTpColor} onChange={(c) => setVPSetting('posTpColor', c)} size={4} mini />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[#888]">Couleur SL</span>
          <InlineColorSwatch value={posSlColor} onChange={(c) => setVPSetting('posSlColor', c)} size={4} mini />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[#888]">Couleur Entry</span>
          <InlineColorSwatch value={posEntryColor} onChange={(c) => setVPSetting('posEntryColor', c)} size={4} mini />
        </div>
      </div>

      {/* Zone opacity */}
      <div className="mt-2">
        <MiniSlider label="Opacité zone" value={Math.round(posZoneOpacity * 100)} min={2} max={40} step={1} unit="%" onChange={(v) => setVPSetting('posZoneOpacity', v / 100)} />
      </div>

      {/* Toggles */}
      <MiniToggle label="Zones TP/SL" value={posShowZoneFill} onChange={(v) => setVPSetting('posShowZoneFill', v)} />
      <MiniToggle label="Labels" desc="Entry, TP, SL + R:R" value={posShowLabels} onChange={(v) => setVPSetting('posShowLabels', v)} />
      <MiniToggle label="Mode minimal" value={posDefaultCompact} onChange={(v) => setVPSetting('posDefaultCompact', v)} />

      {/* Smart Arrow */}
      <MiniToggle label="Smart Arrow" desc="Flèche suivant le prix" value={posSmartArrow} onChange={(v) => setVPSetting('posSmartArrow', v)} />
      {posSmartArrow && (
        <div className="space-y-1.5 pl-2 ml-1 border-l border-[#2a2e35]">
          <MiniSlider label="Exposant" value={posArrowExponent} min={1} max={3} step={0.1} onChange={(v) => setVPSetting('posArrowExponent', v)} />
          <MiniSlider label="Intensité" value={posArrowIntensity} min={0} max={100} step={5} unit="%" onChange={(v) => setVPSetting('posArrowIntensity', v)} />
          <MiniSlider label="Épaisseur" value={posArrowThickness} min={1} max={3} step={0.2} unit="px" onChange={(v) => setVPSetting('posArrowThickness', v)} />
          <MiniSlider label="Poids temps/prix" value={posTimeWeight} min={10} max={90} step={5} unit="%" onChange={(v) => setVPSetting('posTimeWeight', v)} />
          <MiniToggle label="Traînée" value={posProgressTrail} onChange={(v) => setVPSetting('posProgressTrail', v)} />
          {posProgressTrail && (
            <MiniSlider label="Intensité trail" value={posTrailIntensity} min={5} max={50} step={5} unit="%" onChange={(v) => setVPSetting('posTrailIntensity', v)} />
          )}
        </div>
      )}

      {/* Dynamic Opacity */}
      <MiniToggle label="Opacité dynamique" desc="Progression dans les zones" value={posDynamicOpacity} onChange={(v) => setVPSetting('posDynamicOpacity', v)} />
      {posDynamicOpacity && (
        <div className="space-y-1.5 pl-2 ml-1 border-l border-[#2a2e35]">
          {/* Gradient Mode */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#666]">Gradient</span>
            <div className="flex gap-0.5">
              {(['static', 'dynamic', 'heat'] as const).map(mode => (
                <button key={mode} onClick={() => setVPSetting('posGradientMode', mode)}
                  className="px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors"
                  style={{
                    backgroundColor: posGradientMode === mode ? '#3b82f6' : '#1C1F23',
                    color: posGradientMode === mode ? '#fff' : '#888',
                  }}>
                  {mode === 'static' ? 'Static' : mode === 'dynamic' ? 'Dynamic' : 'Heat'}
                </button>
              ))}
            </div>
          </div>
          {/* Curve */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#666]">Courbe</span>
            <div className="flex gap-0.5">
              {(['linear', 'exponential', 'aggressive'] as const).map(curve => (
                <button key={curve} onClick={() => setVPSetting('posOpacityCurve', curve)}
                  className="px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors"
                  style={{
                    backgroundColor: posOpacityCurve === curve ? '#3b82f6' : '#1C1F23',
                    color: posOpacityCurve === curve ? '#fff' : '#888',
                  }}>
                  {curve === 'linear' ? 'Linear' : curve === 'exponential' ? 'Expo' : 'Aggressif'}
                </button>
              ))}
            </div>
          </div>
          <MiniSlider label="Intensité" value={posOpacityIntensity} min={10} max={100} step={5} unit="%" onChange={(v) => setVPSetting('posOpacityIntensity', v)} />
        </div>
      )}
    </div>
  );
}
