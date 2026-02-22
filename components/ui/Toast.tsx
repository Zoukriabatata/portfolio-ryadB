'use client';

import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  variant: ToastVariant;
  message: string;
  duration: number;
}

interface ToastContextValue {
  toast: (variant: ToastVariant, message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const variantConfig: Record<ToastVariant, { icon: string; color: string; bg: string }> = {
  success: { icon: 'M5 13l4 4L19 7', color: 'var(--success)', bg: 'var(--success-bg)' },
  error: { icon: 'M6 18L18 6M6 6l12 12', color: 'var(--error)', bg: 'var(--error-bg)' },
  warning: { icon: 'M12 9v4m0 4h.01M12 3L2 21h20L12 3z', color: 'var(--warning)', bg: 'var(--warning-bg)' },
  info: { icon: 'M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z', color: 'var(--info)', bg: 'var(--info-bg)' },
};

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const config = variantConfig[toast.variant];
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setExiting(true);
    }, toast.duration - 300); // Start exit 300ms before removal
    return () => clearTimeout(timerRef.current);
  }, [toast.duration]);

  useEffect(() => {
    if (exiting) {
      const exitTimer = setTimeout(() => onRemove(toast.id), 300);
      return () => clearTimeout(exitTimer);
    }
  }, [exiting, toast.id, onRemove]);

  const handleDismiss = () => {
    setExiting(true);
  };

  const ariaRole = toast.variant === 'error' || toast.variant === 'warning' ? 'alert' : 'status';

  return (
    <div
      role={ariaRole}
      aria-live={toast.variant === 'error' ? 'assertive' : 'polite'}
      className={`flex items-center gap-3 px-4 py-3 rounded-[var(--radius-lg,12px)] border shadow-lg min-w-[300px] max-w-[420px] ${
        exiting ? 'animate-slideOutRight' : 'animate-slideInRight'
      }`}
      style={{
        background: 'var(--surface-elevated)',
        borderColor: config.color + '33',
      }}
    >
      <div
        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
        style={{ background: config.bg }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={config.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={config.icon} />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--text-primary)]">{toast.message}</p>
        {/* Progress bar */}
        <div className="mt-1.5 h-0.5 rounded-full overflow-hidden" style={{ background: config.color + '1a' }}>
          <div
            className="h-full rounded-full"
            style={{
              background: config.color,
              animation: `toast-progress ${toast.duration}ms linear forwards`,
            }}
          />
        </div>
      </div>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss notification"
        className="flex-shrink-0 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const addToast = useCallback((variant: ToastVariant, message: string, duration?: number) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    setToasts((prev) => [...prev.slice(-4), { id, variant, message, duration: duration || 4000 }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      {mounted && createPortal(
        <div
          className="fixed top-4 right-4 flex flex-col gap-2"
          style={{ zIndex: 'var(--z-toast, 500)' }}
          aria-label="Notifications"
        >
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onRemove={removeToast} />
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}
