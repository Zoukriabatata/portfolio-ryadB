'use client';

import { useState } from 'react';

interface ExpandableSectionProps {
  title: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function ExpandableSection({
  title,
  defaultExpanded = false,
  children,
  className = '',
}: ExpandableSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className={`border-b border-white/10 ${className}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full px-3 py-2 hover:bg-white/5 transition-colors"
      >
        <span className="text-xs uppercase tracking-wide text-white/60 font-medium">
          {title}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transform transition-transform duration-200 text-white/40 ${
            expanded ? 'rotate-180' : ''
          }`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {expanded && (
        <div className="p-3 space-y-3 animate-slideDown">
          {children}
        </div>
      )}
    </div>
  );
}
