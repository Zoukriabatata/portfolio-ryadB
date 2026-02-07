'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * INLINE TEXT EDITOR
 *
 * Floating text input that appears on the chart for editing text tools.
 * - Positions itself at the text tool location
 * - Auto-focuses on open
 * - Saves on Enter or blur
 * - Cancels on Escape
 */

interface InlineTextEditorProps {
  isOpen: boolean;
  initialContent: string;
  position: { x: number; y: number };
  onSave: (content: string) => void;
  onCancel: () => void;
  style?: {
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: 'normal' | 'bold';
    color?: string;
    backgroundColor?: string;
  };
}

export default function InlineTextEditor({
  isOpen,
  initialContent,
  position,
  onSave,
  onCancel,
  style = {},
}: InlineTextEditorProps) {
  const [content, setContent] = useState(initialContent);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Update content when initialContent changes
  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  // Auto-focus and select all on open
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isOpen]);

  // Handle keyboard events
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSave(content);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  }, [content, onSave, onCancel]);

  // Handle blur - save on click outside
  const handleBlur = useCallback(() => {
    // Small delay to allow click events to register first
    setTimeout(() => {
      if (content.trim()) {
        onSave(content);
      } else {
        onCancel();
      }
    }, 100);
  }, [content, onSave, onCancel]);

  if (!isOpen) return null;

  const fontSize = style.fontSize || 14;
  const fontFamily = style.fontFamily || 'system-ui, sans-serif';
  const fontWeight = style.fontWeight || 'normal';
  const textColor = style.color || '#ffffff';
  const bgColor = style.backgroundColor || 'rgba(0, 0, 0, 0.85)';

  return (
    <div
      className="fixed z-[100] pointer-events-auto"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-4px, -100%)',
      }}
    >
      <div
        className="relative rounded-lg shadow-2xl overflow-hidden"
        style={{
          backgroundColor: bgColor,
          border: '1px solid rgba(59, 130, 246, 0.5)',
          boxShadow: '0 0 20px rgba(59, 130, 246, 0.3), 0 4px 20px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Header hint */}
        <div
          className="px-2 py-1 text-[9px] flex items-center justify-between"
          style={{
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            borderBottom: '1px solid rgba(59, 130, 246, 0.2)',
            color: 'rgba(147, 197, 253, 0.8)',
          }}
        >
          <span>Enter = Save | Esc = Cancel | Shift+Enter = New line</span>
        </div>

        {/* Text input */}
        <textarea
          ref={inputRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          rows={Math.max(1, content.split('\n').length)}
          className="block w-full resize-none outline-none"
          style={{
            fontSize: `${fontSize}px`,
            fontFamily,
            fontWeight,
            color: textColor,
            backgroundColor: 'transparent',
            padding: '8px 12px',
            minWidth: '200px',
            maxWidth: '400px',
            minHeight: `${fontSize + 16}px`,
            lineHeight: 1.4,
          }}
          placeholder="Enter text..."
        />

        {/* Action buttons */}
        <div
          className="flex items-center justify-end gap-2 px-2 py-1.5"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <button
            onClick={onCancel}
            className="px-3 py-1 text-[10px] rounded transition-colors hover:bg-[var(--surface-elevated)]"
            style={{ color: '#a1a1aa' }}
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(content)}
            className="px-3 py-1 text-[10px] rounded transition-colors"
            style={{
              backgroundColor: 'rgba(59, 130, 246, 0.8)',
              color: '#ffffff',
            }}
          >
            Save
          </button>
        </div>
      </div>

      {/* Connection line to text position */}
      <div
        className="absolute w-0.5 h-3"
        style={{
          left: '10px',
          top: '100%',
          backgroundColor: 'rgba(59, 130, 246, 0.5)',
        }}
      />
      <div
        className="absolute w-2 h-2 rounded-full"
        style={{
          left: '7px',
          top: 'calc(100% + 12px)',
          backgroundColor: 'rgba(59, 130, 246, 0.8)',
          border: '2px solid rgba(59, 130, 246, 0.5)',
        }}
      />
    </div>
  );
}
