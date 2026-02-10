'use client';

import { useState } from 'react';
import { useCrosshairStore } from '@/stores/useCrosshairStore';
import { MagnetIcon } from '@/components/ui/Icons';

interface MagnetToggleProps {
  theme: {
    colors: {
      toolActive: string;
      textSecondary: string;
      surface: string;
      border: string;
      text: string;
      textMuted: string;
    };
  };
}

const MODES = [
  { value: 'none' as const, label: 'Off', desc: 'Free movement' },
  { value: 'ohlc' as const, label: 'OHLC', desc: 'Snap to Open/High/Low/Close' },
  { value: 'close' as const, label: 'Close', desc: 'Snap to Close price' },
];

export default function MagnetToggle({ theme }: MagnetToggleProps) {
  const { magnetMode, setMagnetMode } = useCrosshairStore();
  const [showMenu, setShowMenu] = useState(false);

  const isActive = magnetMode !== 'none';

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        data-tooltip={`Magnet: ${magnetMode === 'none' ? 'Off' : magnetMode.toUpperCase()}`}
        className="w-9 h-9 flex items-center justify-center rounded text-sm transition-all duration-200 hover:scale-105 active:scale-95"
        style={{
          backgroundColor: isActive ? theme.colors.toolActive : 'transparent',
          color: isActive ? '#fff' : theme.colors.textSecondary,
          boxShadow: isActive ? `0 0 15px ${theme.colors.toolActive}60` : 'none',
        }}
      >
        <MagnetIcon size={18} color={isActive ? '#fff' : theme.colors.textSecondary} />
      </button>

      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowMenu(false)}
          />
          <div
            className="absolute left-full top-0 ml-1 w-44 rounded-lg shadow-xl z-50 py-1"
            style={{ backgroundColor: theme.colors.surface, border: `1px solid ${theme.colors.border}` }}
          >
            <div className="px-2 py-1 text-[10px] font-semibold uppercase" style={{ color: theme.colors.textMuted }}>
              Magnet Mode
            </div>
            {MODES.map(mode => (
              <button
                key={mode.value}
                onClick={() => {
                  setMagnetMode(mode.value);
                  setShowMenu(false);
                }}
                className="w-full text-left px-3 py-1.5 text-xs flex flex-col gap-0.5 transition-colors hover:bg-zinc-800/50"
                style={{
                  backgroundColor: magnetMode === mode.value ? theme.colors.toolActive : 'transparent',
                  color: magnetMode === mode.value ? '#fff' : theme.colors.text,
                }}
              >
                <span className="font-medium">{mode.label}</span>
                <span className="text-[10px]" style={{ color: magnetMode === mode.value ? '#fff' : theme.colors.textMuted }}>
                  {mode.desc}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
