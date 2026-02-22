'use client';

import { Component, type ReactNode } from 'react';
import * as Sentry from '@sentry/nextjs';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isRetrying: boolean;
  showDetails: boolean;
}

// Categorize errors for better UX feedback
function categorizeError(error: Error): {
  category: 'gpu' | 'network' | 'memory' | 'unknown';
  suggestion: string;
  icon: string;
} {
  const msg = error.message.toLowerCase();
  if (msg.includes('webgl') || msg.includes('context lost') || msg.includes('gpu') || msg.includes('canvas')) {
    return { category: 'gpu', suggestion: 'GPU context was lost. Reloading should fix this.', icon: '🖥' };
  }
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('timeout') || msg.includes('abort')) {
    return { category: 'network', suggestion: 'Network issue detected. Check your connection.', icon: '🌐' };
  }
  if (msg.includes('memory') || msg.includes('allocation') || msg.includes('oom')) {
    return { category: 'memory', suggestion: 'Too much data loaded. Try reducing the view range.', icon: '💾' };
  }
  return { category: 'unknown', suggestion: 'Something went wrong while rendering. This is usually temporary.', icon: '⚠' };
}

export default class ChartErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, isRetrying: false, showDetails: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    Sentry.captureException(error, {
      contexts: {
        react: {
          componentStack: errorInfo.componentStack,
        },
      },
      tags: {
        errorBoundary: this.props.fallbackTitle || 'ChartErrorBoundary',
      },
    });
  }

  handleRetry = () => {
    this.setState({ isRetrying: true });
    // Brief delay to show loading state
    setTimeout(() => {
      this.setState({ hasError: false, error: null, isRetrying: false, showDetails: false });
    }, 600);
  };

  render() {
    if (this.state.hasError) {
      const errorInfo = this.state.error ? categorizeError(this.state.error) : null;

      return (
        <div className="w-full h-full flex items-center justify-center bg-[var(--background)]">
          <div className="animate-error-enter text-center max-w-sm px-6">
            {/* Error icon with category-based styling */}
            <div className="w-14 h-14 mx-auto mb-4 rounded-xl flex items-center justify-center bg-[var(--error-bg)] border border-[var(--error)]/20">
              <svg
                className="animate-error-shake"
                width="24" height="24" viewBox="0 0 24 24" fill="none"
                stroke="var(--error)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>

            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
              {this.props.fallbackTitle || 'Chart Error'}
            </h3>

            <p className="text-xs text-[var(--text-muted)] mb-4 leading-relaxed">
              {errorInfo?.suggestion || 'Something went wrong while rendering.'}
            </p>

            {/* Expandable error details */}
            {this.state.error && (
              <div className="mb-4">
                <button
                  onClick={() => this.setState({ showDetails: !this.state.showDetails })}
                  className="text-[10px] text-[var(--text-dimmed)] hover:text-[var(--text-muted)] transition-colors flex items-center gap-1 mx-auto"
                >
                  <svg
                    width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    style={{
                      transform: this.state.showDetails ? 'rotate(90deg)' : 'rotate(0)',
                      transition: 'transform 0.2s ease',
                    }}
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                  {this.state.showDetails ? 'Hide details' : 'Show details'}
                </button>
                {this.state.showDetails && (
                  <div className="animate-tab-enter mt-2">
                    <p className="text-[10px] text-[var(--text-dimmed)] font-mono bg-[var(--surface)] rounded-lg px-3 py-2 break-all text-left max-h-24 overflow-auto custom-scrollbar">
                      {this.state.error.message}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Retry button with loading state */}
            <button
              onClick={this.handleRetry}
              disabled={this.state.isRetrying}
              className="px-5 py-2 text-xs font-medium rounded-lg transition-all duration-200 cursor-pointer
                bg-[var(--primary)] text-white hover:-translate-y-0.5 hover:shadow-md hover:shadow-[var(--primary-glow)]
                active:scale-[0.97] active:translate-y-0
                disabled:opacity-60 disabled:cursor-wait disabled:translate-y-0"
            >
              {this.state.isRetrying ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Retrying...
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M1 4v6h6" />
                    <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
                  </svg>
                  Try Again
                </span>
              )}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
