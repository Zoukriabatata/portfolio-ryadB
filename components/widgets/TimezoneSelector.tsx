'use client';

import { useState, useRef, useEffect } from 'react';
import { useTimezoneStore, TIMEZONES, type TimezoneId } from '@/stores/useTimezoneStore';

interface TimezoneSelectorProps {
  className?: string;
  compact?: boolean;
}

export function TimezoneSelector({ className = '', compact = false }: TimezoneSelectorProps) {
  const { timezone, setTimezone, getTimezoneLabel } = useTimezoneStore();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const timezoneOptions = Object.entries(TIMEZONES).map(([key, value]) => ({
    id: key as TimezoneId,
    label: value.label,
    offset: value.offset,
  }));

  const formatOffset = (offset: number | null) => {
    if (offset === null) return '';
    if (offset === 0) return 'UTC';
    const sign = offset > 0 ? '+' : '';
    return `UTC${sign}${offset}`;
  };

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-all
          bg-green-900/20 hover:bg-green-900/30 text-green-400/80 hover:text-green-300
          border border-green-900/30 hover:border-green-700/40`}
      >
        <ClockIcon size={12} />
        {compact ? (
          <span>{timezone}</span>
        ) : (
          <span>{getTimezoneLabel()}</span>
        )}
        <ChevronIcon size={10} isOpen={isOpen} />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 min-w-[160px] bg-[#0a0f0a] border border-green-900/40 rounded-lg shadow-xl shadow-black/50 py-1 z-50 animate-fadeIn">
          {timezoneOptions.map((tz) => (
            <button
              key={tz.id}
              onClick={() => {
                setTimezone(tz.id);
                setIsOpen(false);
              }}
              className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between gap-4 transition-colors
                ${timezone === tz.id
                  ? 'bg-green-600/20 text-green-300'
                  : 'text-green-400/70 hover:bg-green-900/30 hover:text-green-300'
                }`}
            >
              <span>{tz.label}</span>
              <span className="text-green-500/50 font-mono">{formatOffset(tz.offset)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ClockIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ size = 12, isOpen }: { size?: number; isOpen: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
