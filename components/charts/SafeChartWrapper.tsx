'use client';

import React, { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Error boundary that catches and suppresses DOM manipulation errors
 * that occur during React 19 strict mode unmounting.
 * These errors are harmless - they happen when Lightweight Charts
 * tries to clean up DOM nodes that React has already removed.
 */
export class SafeChartWrapper extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: false }; // Don't show error state, just suppress
  }

  componentDidCatch(error: Error): void {
    // Suppress removeChild errors - they're harmless during unmount
    if (error.message?.includes('removeChild') ||
        error.message?.includes('insertBefore') ||
        error.name === 'NotFoundError') {
      // Silently ignore these errors
      return;
    }
    // Non-DOM errors are silently ignored here; use ChartErrorBoundary for reporting
  }

  render(): ReactNode {
    return this.props.children;
  }
}

export default SafeChartWrapper;
