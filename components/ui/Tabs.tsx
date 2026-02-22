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

  // Keyboard navigation: arrow keys cycle through tabs
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const enabledTabs = tabs.filter(t => !t.disabled);
    const currentIndex = enabledTabs.findIndex(t => t.id === activeTab);
    if (currentIndex === -1) return;

    let nextIndex = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = (currentIndex + 1) % enabledTabs.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = (currentIndex - 1 + enabledTabs.length) % enabledTabs.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = enabledTabs.length - 1;
    }

    if (nextIndex >= 0) {
      onChange(enabledTabs[nextIndex].id);
      // Focus the new active tab button
      const btn = containerRef.current?.querySelector(`[data-tab-id="${enabledTabs[nextIndex].id}"]`) as HTMLElement;
      btn?.focus();
    }
  }, [tabs, activeTab, onChange]);

  const sizeClass = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm';

  return (
    <div
      ref={containerRef}
      role="tablist"
      onKeyDown={handleKeyDown}
      className="relative inline-flex items-center bg-[var(--surface)] rounded-[var(--radius-lg,12px)] p-1 border border-[var(--border)]"
    >
      {/* Active indicator */}
      <div
        className="absolute top-1 h-[calc(100%-8px)] bg-[var(--surface-elevated)] rounded-[var(--radius-md,8px)] shadow-sm transition-all duration-200"
        style={{ left: indicatorStyle.left, width: indicatorStyle.width }}
        aria-hidden="true"
      />

      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            data-tab-id={tab.id}
            aria-selected={isActive}
            aria-disabled={tab.disabled || undefined}
            tabIndex={isActive ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
            className={`
              relative z-10 ${sizeClass} font-medium rounded-[var(--radius-md,8px)]
              transition-colors duration-200 flex items-center gap-2 outline-none
              focus-visible:ring-2 focus-visible:ring-[var(--primary)]/50
              ${tab.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
              ${isActive
                ? 'text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }
            `}
          >
            {tab.icon && <span className="flex-shrink-0" aria-hidden="true">{tab.icon}</span>}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
