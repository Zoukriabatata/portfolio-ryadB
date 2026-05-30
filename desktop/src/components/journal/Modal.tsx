// Minimal modal — portal'd to body, backdrop blur, Esc closes.
// Mirrors the website's `Modal` component shape with `size`, `title`,
// `footer` slots so the form modals port verbatim.

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  size?: "sm" | "md" | "lg" | "xl";
  footer?: ReactNode;
  children: ReactNode;
}

const SIZE_CLASSES: Record<NonNullable<Props["size"]>, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-3xl",
};

export default function Modal({
  open,
  onClose,
  title,
  size = "md",
  footer,
  children,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-black/65 backdrop-blur-sm animate-[fadeIn_180ms_ease]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`w-full ${SIZE_CLASSES[size]} rounded-2xl border border-white/10 bg-[#0a0a0a] shadow-[0_24px_60px_rgba(0,0,0,0.6)] flex flex-col max-h-[88vh] animate-[modalIn_240ms_cubic-bezier(0.16,1,0.3,1)]`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <header className="px-6 py-4 border-b border-white/8 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white tracking-tight">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-white/50 hover:text-white transition-colors w-7 h-7 inline-flex items-center justify-center rounded-md hover:bg-white/5"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M4 4L12 12M12 4L4 12"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </header>
        )}
        <div className="px-6 py-5 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <footer className="px-6 py-4 border-t border-white/8 flex items-center justify-end gap-2">
            {footer}
          </footer>
        )}
      </div>
      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>,
    document.body
  );
}
