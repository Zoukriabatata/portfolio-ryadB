'use client';

import React, { useMemo, useCallback } from 'react';
import type { Tool } from '@/lib/tools/types';
import type { ToolSettingField } from '@/lib/tools/registry/ToolDefinition';
import { getToolsEngine } from '@/lib/tools/ToolsEngine';
import { toolRegistry } from '@/lib/tools/registry/ToolRegistry';
import { SettingFieldRenderer } from './SettingFieldRenderer';

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
  const def = toolRegistry.get(tool.type);
  const schema = def?.settingsSchema;

  const groups = useMemo(() => {
    if (!schema) return new Map<string, ToolSettingField[]>();
    const map = new Map<string, ToolSettingField[]>();
    for (const field of schema) {
      if (field.condition && !field.condition(tool)) continue;
      const group = field.group || 'General';
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push(field);
    }
    return map;
  }, [schema, tool]);

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

  if (!schema || schema.length === 0) {
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
          {tool.type.replace(/([A-Z])/g, ' $1').trim()}
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
                tool={tool}
                onChange={handleChange}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
