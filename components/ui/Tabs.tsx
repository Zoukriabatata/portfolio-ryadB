'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  size?: 'sm' | 'md';
}

export default function Tabs({ tabs, activeTab, onChange, size = 'md' }: TabsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  const updateIndicator = useCallback(() => {
    if (!containerRef.current) return;
    const activeEl = containerRef.current.querySelector(`[data-tab-id="${activeTab}"]`) as HTMLElement;
    if (activeEl) {
      setIndicatorStyle({
        left: activeEl.offsetLeft,
        width: activeEl.offsetWidth,
      });
    }
  }, [activeTab]);

  useEffect(() => {
    updateIndicator();
  }, [updateIndicator]);

  const sizeClass = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm';

  return (
    <div
      ref={containerRef}
      className="relative inline-flex items-center bg-[var(--surface)] rounded-[var(--radius-lg,12px)] p-1 border border-[var(--border)]"
    >
      {/* Active indicator */}
      <div
        className="absolute top-1 h-[calc(100%-8px)] bg-[var(--surface-elevated)] rounded-[var(--radius-md,8px)] shadow-sm transition-all duration-200"
        style={{ left: indicatorStyle.left, width: indicatorStyle.width }}
      />

      {tabs.map((tab) => (
        <button
          key={tab.id}
          data-tab-id={tab.id}
          disabled={tab.disabled}
          onClick={() => onChange(tab.id)}
          className={`
            relative z-10 ${sizeClass} font-medium rounded-[var(--radius-md,8px)]
            transition-colors duration-200 flex items-center gap-2
            ${tab.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
            ${activeTab === tab.id
              ? 'text-[var(--text-primary)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }
          `}
        >
          {tab.icon && <span className="flex-shrink-0">{tab.icon}</span>}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
