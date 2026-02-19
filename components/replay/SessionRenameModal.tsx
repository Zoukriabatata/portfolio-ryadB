'use client';

import { useState, useEffect } from 'react';
import { useReplay } from '@/hooks/useReplay';
import { useReplayUIStore } from '@/stores/useReplayUIStore';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

export default function SessionRenameModal() {
  const { sessions, updateSession } = useReplay();
  const { sessionRenameId, closeSessionRename } = useReplayUIStore();

  const session = sessions.find((s) => s.id === sessionRenameId);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // Pre-fill when session changes
  useEffect(() => {
    if (session) {
      setDescription(session.metadata?.description || '');
    }
  }, [session]);

  const handleSave = async () => {
    if (!sessionRenameId) return;
    setSaving(true);
    try {
      await updateSession(sessionRenameId, { description: description.trim() || undefined });
      closeSessionRename();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!sessionRenameId && !!session}
      onClose={closeSessionRename}
      size="sm"
      title="Rename Session"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={closeSessionRename}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} loading={saving}>
            Save
          </Button>
        </>
      }
    >
      {session && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
              {session.symbol}
            </span>
          </div>
          <Input
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Morning session, FOMC day..."
          />
        </div>
      )}
    </Modal>
  );
}
