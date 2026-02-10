'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ChartErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-[var(--background)]">
          <div className="text-center max-w-sm px-6">
            <div
              className="w-14 h-14 mx-auto mb-4 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
              {this.props.fallbackTitle || 'Chart Error'}
            </h3>
            <p className="text-xs text-[var(--text-muted)] mb-4 leading-relaxed">
              Something went wrong while rendering. This is usually temporary.
            </p>
            {this.state.error && (
              <p className="text-[10px] text-[var(--text-dimmed)] mb-4 font-mono bg-[var(--surface)] rounded px-3 py-2 break-all">
                {this.state.error.message}
              </p>
            )}
            <button
              onClick={this.handleRetry}
              className="px-4 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer"
              style={{
                background: 'var(--primary)',
                color: 'var(--background)',
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
