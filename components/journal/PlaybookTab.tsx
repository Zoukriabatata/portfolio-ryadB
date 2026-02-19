'use client';

import { useState } from 'react';
import { usePlaybook } from '@/hooks/usePlaybook';
import PlaybookSetupCard from './PlaybookSetupCard';
import PlaybookSetupForm from './PlaybookSetupForm';
import PlaybookSetupDetail from './PlaybookSetupDetail';
import PlaybookRanking from './PlaybookRanking';
import type { PlaybookSetup } from '@/types/journal';

export default function PlaybookTab() {
  const { setups, loading, createSetup, updateSetup, deleteSetup } = usePlaybook();
  const [showForm, setShowForm] = useState(false);
  const [editSetup, setEditSetup] = useState<PlaybookSetup | null>(null);
  const [detailSetup, setDetailSetup] = useState<PlaybookSetup | null>(null);

  const handleSave = async (data: { name: string; description?: string; rules?: string[] }) => {
    if (editSetup) {
      return updateSetup(editSetup.id, data);
    }
    return createSetup(data);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this setup? Trades will be unlinked.')) return;
    await deleteSetup(id);
  };

  const handleEdit = (setup: PlaybookSetup) => {
    setEditSetup(setup);
    setShowForm(true);
    setDetailSetup(null);
  };

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Trading Playbook</h2>
          <p className="text-xs text-[var(--text-muted)]">Track your setups and their performance</p>
        </div>
        <button
          onClick={() => { setEditSetup(null); setShowForm(true); }}
          className="px-4 py-2 rounded-lg text-xs font-medium transition-all hover:-translate-y-0.5 active:scale-[0.97]"
          style={{ background: 'var(--primary)', color: 'var(--background)' }}
        >
          + New Setup
        </button>
      </div>

      {/* Ranking */}
      <PlaybookRanking setups={setups} />

      {/* Setup Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 h-40 animate-pulse" />
          ))}
        </div>
      ) : setups.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 rounded-xl border border-dashed border-[var(--border)]">
          <p className="text-sm text-[var(--text-muted)]">No setups yet</p>
          <p className="text-xs text-[var(--text-dimmed)] mt-1">Create your first setup to start tracking</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {setups.map((setup) => (
            <PlaybookSetupCard
              key={setup.id}
              setup={setup}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onClick={setDetailSetup}
            />
          ))}
        </div>
      )}

      {/* Form Modal */}
      <PlaybookSetupForm
        open={showForm}
        onClose={() => { setShowForm(false); setEditSetup(null); }}
        editSetup={editSetup}
        onSave={handleSave}
      />

      {/* Detail View */}
      {detailSetup && (
        <PlaybookSetupDetail
          setup={detailSetup}
          onClose={() => setDetailSetup(null)}
          onEdit={handleEdit}
        />
      )}
    </div>
  );
}
