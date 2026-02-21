'use client';

import { useEffect } from 'react';

// DOM manipulation errors to suppress (common with real-time updates + HMR)
const SUPPRESSED_ERRORS = [
  'removeChild',
  'insertBefore',
  'appendChild',
  'not a child of this node',
];

function shouldSuppressError(message: unknown): boolean {
  if (typeof message === 'string') {
    return SUPPRESSED_ERRORS.some(err => message.includes(err));
  }
  if (typeof message === 'object' && message !== null && 'message' in message) {
    const msg = (message as { message: unknown }).message;
    if (typeof msg === 'string') {
      return SUPPRESSED_ERRORS.some(err => msg.includes(err));
    }
  }
  return false;
}

/**
 * Suppresses DOM manipulation errors that occur with real-time data updates
 * and Next.js Turbopack during Fast Refresh / Hot Module Replacement.
 * Also hides the Next.js error overlay for these specific errors.
 */
export default function ErrorSuppressor() {
  useEffect(() => {
    const originalError = console.error;

    console.error = (...args: unknown[]) => {
      if (shouldSuppressError(args[0])) {
        return;
      }
      originalError.apply(console, args);
    };

    // Suppress unhandled errors
    const handleError = (event: ErrorEvent) => {
      if (shouldSuppressError(event.message)) {
        event.preventDefault();
        event.stopPropagation();
        return false;
      }
    };

    // Suppress unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (shouldSuppressError(event.reason?.message || event.reason)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener('error', handleError, true);
    window.addEventListener('unhandledrejection', handleUnhandledRejection, true);

    // Hide Next.js error overlay when it appears with these errors
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            // Check for Next.js error overlay
            if (node.tagName === 'NEXTJS-PORTAL' ||
                node.id?.includes('nextjs') ||
                node.className?.includes('nextjs')) {
              const text = node.textContent || '';
              if (SUPPRESSED_ERRORS.some(err => text.includes(err))) {
                node.remove();
              }
            }
          }
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Also periodically check and remove error overlays
    const interval = setInterval(() => {
      const overlays = document.querySelectorAll('nextjs-portal, [data-nextjs-dialog], [data-nextjs-dialog-overlay]');
      overlays.forEach((overlay) => {
        const text = overlay.textContent || '';
        if (SUPPRESSED_ERRORS.some(err => text.includes(err))) {
          overlay.remove();
        }
      });
    }, 2000);

    return () => {
      console.error = originalError;
      window.removeEventListener('error', handleError, true);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection, true);
      observer.disconnect();
      clearInterval(interval);
    };
  }, []);

  return null;
}
