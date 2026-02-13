'use client';

import { useState, useEffect, useRef } from 'react';
import { type Tool, getToolsEngine } from '@/lib/tools/ToolsEngine';

interface TextEditorProps {
  tool: Tool;
  position: { x: number; y: number };
  onClose: () => void;
  onSave: (content: string) => void;
}

export function TextEditor({ tool, position, onClose, onSave }: TextEditorProps) {
  const [content, setContent] = useState((tool as any).content || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus on mount
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSave(content);
      onClose();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div
      className="fixed z-50"
      style={{ left: position.x, top: position.y }}
    >
      <input
        ref={inputRef}
        type="text"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          onSave(content);
          onClose();
        }}
        className="px-2 py-1 bg-black/90 border border-blue-500 rounded text-white text-sm focus:outline-none shadow-lg"
        style={{
          minWidth: 150,
          fontFamily: (tool as any).fontFamily || 'system-ui',
          fontSize: (tool as any).fontSize || 14,
        }}
      />
    </div>
  );
}
