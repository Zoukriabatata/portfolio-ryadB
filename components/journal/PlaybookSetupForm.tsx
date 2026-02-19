'use client';

import { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import type { PlaybookSetup } from '@/types/journal';

interface PlaybookSetupFormProps {
  open: boolean;
  onClose: () => void;
  editSetup?: PlaybookSetup | null;
  onSave: (data: { name: string; description?: string; rules?: string[] }) => Promise<boolean>;
}

export default function PlaybookSetupForm({ open, onClose, editSetup, onSave }: PlaybookSetupFormProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState<string[]>([]);
  const [newRule, setNewRule] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editSetup) {
      setName(editSetup.name);
      setDescription(editSetup.description || '');
      setRules(editSetup.rules);
    } else {
      setName('');
      setDescription('');
      setRules([]);
    }
    setNewRule('');
  }, [editSetup, open]);

  const addRule = () => {
    if (newRule.trim()) {
      setRules([...rules, newRule.trim()]);
      setNewRule('');
    }
  };

  const removeRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    const success = await onSave({ name: name.trim(), description: description.trim() || undefined, rules });
    setSubmitting(false);
    if (success) onClose();
  };

  const inputStyle = 'w-full px-3 py-2 rounded-lg text-sm bg-[var(--surface)] border border-[var(--border-light)] text-[var(--text-primary)] focus:border-[var(--border-focus)] focus:outline-none transition-colors';

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editSetup ? 'Edit Setup' : 'New Setup'}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !name.trim()}
            className="px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-all hover:-translate-y-0.5 active:scale-[0.97]"
            style={{ background: 'var(--primary)', color: 'var(--background)' }}
          >
            {submitting ? 'Saving...' : 'Save'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium mb-1.5 text-[var(--text-muted)]">Name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputStyle}
            placeholder="e.g., Breakout Pullback"
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5 text-[var(--text-muted)]">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className={`${inputStyle} resize-none`}
            placeholder="Describe this setup, when to use it, what to look for..."
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5 text-[var(--text-muted)]">Rules / Checklist</label>
          <div className="space-y-1.5 mb-2">
            {rules.map((rule, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-[var(--surface-elevated)]">
                <span className="text-xs text-[var(--text-primary)] flex-1">{rule}</span>
                <button
                  onClick={() => removeRule(i)}
                  className="text-xs text-[var(--text-dimmed)] hover:text-[var(--error)] transition-colors shrink-0"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newRule}
              onChange={(e) => setNewRule(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addRule())}
              className={`${inputStyle} flex-1`}
              placeholder="Add a rule..."
            />
            <button
              onClick={addRule}
              disabled={!newRule.trim()}
              className="px-3 py-2 rounded-lg text-xs font-medium text-[var(--primary)] hover:bg-[var(--surface-elevated)] disabled:opacity-30 transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
