'use client';

import { useReplayUIStore } from '@/stores/useReplayUIStore';
import Modal from '@/components/ui/Modal';

const SHORTCUTS = [
  { key: 'Space', desc: 'Play / Pause' },
  { key: '←', desc: 'Seek back 5s' },
  { key: '→', desc: 'Seek forward 5s' },
  { key: 'Shift + ←', desc: 'Seek back 30s' },
  { key: 'Shift + →', desc: 'Seek forward 30s' },
  { key: '+  /  =', desc: 'Increase speed' },
  { key: '-', desc: 'Decrease speed' },
  { key: 'Escape', desc: 'Stop playback' },
  { key: 'B', desc: 'Add bookmark' },
  { key: '[', desc: 'Toggle sidebar' },
  { key: '?', desc: 'Show this help' },
];

export default function KeyboardShortcutsHelp() {
  const { shortcutsVisible, setShortcutsVisible } = useReplayUIStore();

  return (
    <Modal
      open={shortcutsVisible}
      onClose={() => setShortcutsVisible(false)}
      size="sm"
      title="Keyboard Shortcuts"
    >
      <div className="space-y-1">
        {SHORTCUTS.map((s) => (
          <div key={s.key} className="flex items-center justify-between py-1.5">
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {s.desc}
            </span>
            <kbd
              className="px-2 py-0.5 rounded text-xs font-mono"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border-light)',
                color: 'var(--text-primary)',
              }}
            >
              {s.key}
            </kbd>
          </div>
        ))}
      </div>
    </Modal>
  );
}
