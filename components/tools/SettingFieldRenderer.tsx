'use client';

import React from 'react';
import type { ToolSettingField } from '@/lib/tools/registry/ToolDefinition';
import type { Tool, LineStyle } from '@/lib/tools/types';
import { ColorPicker } from './ColorPicker';
import { LineStylePicker } from './LineStylePicker';
import { LineWidthSlider } from './LineWidthSlider';
import { GradientEditor } from './GradientEditor';
import type { GradientStop } from '@/lib/heatmap-webgl/themes/OrderflowTheme';

interface SettingFieldRendererProps {
  field: ToolSettingField;
  tool: Tool;
  onChange: (key: string, value: unknown) => void;
}

/** Read a dot-path value from a tool object */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function SettingFieldRenderer({ field, tool, onChange }: SettingFieldRendererProps) {
  const value = getNestedValue(tool as unknown as Record<string, unknown>, field.key);

  switch (field.type) {
    case 'color':
      return (
        <div className="flex items-center justify-between gap-2 py-1">
          <span className="text-[11px] text-[#8a8f98]">{field.label}</span>
          <ColorPicker
            value={typeof value === 'string' ? value : '#ffffff'}
            onChange={(c: string) => onChange(field.key, c)}
            compact
          />
        </div>
      );

    case 'lineWidth':
      return (
        <div className="py-1">
          <span className="text-[11px] text-[#8a8f98] block mb-1">{field.label}</span>
          <LineWidthSlider
            value={typeof value === 'number' ? value : 1}
            onChange={(v: number) => onChange(field.key, v)}
          />
        </div>
      );

    case 'lineStyle':
      return (
        <div className="flex items-center justify-between gap-2 py-1">
          <span className="text-[11px] text-[#8a8f98]">{field.label}</span>
          <LineStylePicker
            value={(value as LineStyle) || 'solid'}
            onChange={(v: LineStyle) => onChange(field.key, v)}
          />
        </div>
      );

    case 'boolean':
      return (
        <div className="flex items-center justify-between gap-2 py-1">
          <span className="text-[11px] text-[#8a8f98]">{field.label}</span>
          <button
            onClick={() => onChange(field.key, !value)}
            className={`w-8 h-[18px] rounded-full transition-colors ${
              value ? 'bg-blue-500' : 'bg-[#2a2d33]'
            }`}
          >
            <div
              className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                value ? 'translate-x-[16px]' : 'translate-x-[2px]'
              }`}
            />
          </button>
        </div>
      );

    case 'slider':
      return (
        <div className="py-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-[#8a8f98]">{field.label}</span>
            <span className="text-[10px] text-[#555] font-mono">
              {typeof value === 'number' ? (field.max && field.max <= 1 ? value.toFixed(2) : value.toFixed(field.step && field.step < 1 ? 1 : 0)) : '—'}
            </span>
          </div>
          <input
            type="range"
            min={field.min ?? 0}
            max={field.max ?? 100}
            step={field.step ?? 1}
            value={typeof value === 'number' ? value : field.min ?? 0}
            onChange={(e) => onChange(field.key, parseFloat(e.target.value))}
            className="w-full h-1 bg-[#2a2d33] rounded-full appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
          />
        </div>
      );

    case 'number':
      return (
        <div className="flex items-center justify-between gap-2 py-1">
          <span className="text-[11px] text-[#8a8f98]">{field.label}</span>
          <input
            type="number"
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            value={typeof value === 'number' ? value : ''}
            onChange={(e) => onChange(field.key, parseFloat(e.target.value))}
            className="w-20 h-6 text-[11px] text-white bg-[#1a1d21] border border-[#2a2d33] rounded px-2 text-right font-mono
              focus:border-blue-500 focus:outline-none"
          />
        </div>
      );

    case 'select':
      return (
        <div className="flex items-center justify-between gap-2 py-1">
          <span className="text-[11px] text-[#8a8f98]">{field.label}</span>
          <select
            value={typeof value === 'string' || typeof value === 'number' ? value : ''}
            onChange={(e) => onChange(field.key, e.target.value)}
            className="h-6 text-[11px] text-white bg-[#1a1d21] border border-[#2a2d33] rounded px-2
              focus:border-blue-500 focus:outline-none cursor-pointer"
          >
            {field.options?.map((opt) => (
              <option key={String(opt.value)} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      );

    case 'gradient':
      return (
        <div className="py-1">
          <GradientEditor
            stops={Array.isArray(value) ? (value as GradientStop[]) : [{ position: 0, color: '#000000' }, { position: 1, color: '#ffffff' }]}
            onChange={(stops) => onChange(field.key, stops)}
            label={field.label}
            compact
          />
        </div>
      );

    default:
      return null;
  }
}
