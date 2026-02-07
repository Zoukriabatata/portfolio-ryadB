'use client';

import { useEffect, useCallback, HTMLAttributes } from 'react';
import { createPortal } from 'react-dom';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  size?: ModalSize;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
}

const sizeStyles: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-[90vw] max-h-[90vh]',
};

export default function Modal({
  open,
  onClose,
  size = 'md',
  title,
  children,
  footer,
  closeOnBackdrop = true,
  closeOnEsc = true,
}: ModalProps) {
  const handleEsc = useCallback(
    (e: KeyboardEvent) => {
      if (closeOnEsc && e.key === 'Escape') onClose();
    },
    [closeOnEsc, onClose]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', handleEsc);
        document.body.style.overflow = '';
      };
    }
  }, [open, handleEsc]);

  if (!open) return null;

  const content = (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 'var(--z-modal, 400)' }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fadeIn"
        onClick={closeOnBackdrop ? onClose : undefined}
      />

      {/* Panel */}
      <div
        className={`
          relative w-full ${sizeStyles[size]}
          bg-[var(--surface-elevated)] border border-[var(--border-light)]
          rounded-[var(--radius-xl,16px)] shadow-xl
          animate-scaleIn
          flex flex-col max-h-[85vh]
        `}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h3>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-[var(--border)] flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }
  return null;
}
