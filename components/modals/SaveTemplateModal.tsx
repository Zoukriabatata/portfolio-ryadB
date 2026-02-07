'use client';

import { useState, useRef, useEffect } from 'react';
import { SaveIcon } from '@/components/ui/Icons';

interface SaveTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  defaultName?: string;
}

export function SaveTemplateModal({
  isOpen,
  onClose,
  onSave,
  defaultName = '',
}: SaveTemplateModalProps) {
  const [name, setName] = useState(defaultName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setName(defaultName || `Template ${new Date().toLocaleDateString()}`);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, defaultName]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSave(name.trim());
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={handleKeyDown}
    >
      <div className="w-full max-w-md mx-4 bg-[#0a0f0a] border border-green-900/40 rounded-xl shadow-2xl shadow-black/50 animate-fadeIn">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-green-900/30">
          <div className="w-8 h-8 rounded-lg bg-green-600/20 flex items-center justify-center">
            <SaveIcon size={16} color="#22c55e" />
          </div>
          <h2 className="text-lg font-semibold text-green-100">Save Template</h2>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5">
          <div className="mb-5">
            <label
              htmlFor="template-name"
              className="block text-sm font-medium text-green-400/80 mb-2"
            >
              Template Name
            </label>
            <input
              ref={inputRef}
              id="template-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter template name..."
              className="w-full px-4 py-2.5 bg-[#050505] border border-green-900/40 rounded-lg text-green-100 placeholder-green-800 focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600/30 transition-all"
            />
          </div>

          <p className="text-xs text-green-500/50 mb-5">
            This will save your current chart settings including display options, colors, and timeframe.
          </p>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-green-400/80 hover:text-green-100 hover:bg-green-900/20 rounded-lg transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              <SaveIcon size={14} color="#fff" />
              Save Template
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
