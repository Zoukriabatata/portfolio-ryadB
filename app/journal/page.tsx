'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useJournalStore } from '@/stores/useJournalStore';
import JournalHeader from '@/components/journal/JournalHeader';

// Lazy-load heavy tab components — only the active tab is ever rendered,
// so there's no reason to bundle all 5 tabs on initial page load.
const TabSkeleton = () => (
  <div className="p-6 space-y-4 animate-pulse">
    <div className="h-6 w-48 rounded bg-[var(--surface-elevated)]" />
    <div className="h-32 rounded-xl bg-[var(--surface-elevated)]" />
    <div className="h-32 rounded-xl bg-[var(--surface-elevated)]" />
  </div>
);

const DashboardTab  = dynamic(() => import('@/components/journal/DashboardTab'),  { loading: () => <TabSkeleton /> });
const TradesTab     = dynamic(() => import('@/components/journal/TradesTab'),     { loading: () => <TabSkeleton /> });
const CalendarTab   = dynamic(() => import('@/components/journal/CalendarTab'),   { loading: () => <TabSkeleton /> });
const PlaybookTab   = dynamic(() => import('@/components/journal/PlaybookTab'),   { loading: () => <TabSkeleton /> });
const DailyNotesTab = dynamic(() => import('@/components/journal/DailyNotesTab'), { loading: () => <TabSkeleton /> });
const TradeFormModal = dynamic(() => import('@/components/journal/TradeFormModal'), { ssr: false });

export default function JournalPage() {
  const { activeTab, setActiveTab } = useJournalStore();
  const [showGlobalForm, setShowGlobalForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleNewTrade = useCallback(() => {
    // If not on trades tab, switch to it
    if (activeTab !== 'trades') {
      setActiveTab('trades');
    }
    setShowGlobalForm(true);
  }, [activeTab, setActiveTab]);

  const handleTradeSuccess = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  return (
    <div className="h-full flex flex-col bg-[var(--background)] animate-fadeIn">
      <JournalHeader onNewTrade={handleNewTrade} />

      <div className="flex-1 overflow-auto" key={refreshKey}>
        <div className="animate-tab-enter h-full" key={activeTab}>
          {activeTab === 'dashboard' && <DashboardTab />}
          {activeTab === 'trades' && <TradesTab />}
          {activeTab === 'calendar' && <CalendarTab />}
          {activeTab === 'playbook' && <PlaybookTab />}
          {activeTab === 'notes' && <DailyNotesTab />}
        </div>
      </div>

      {/* Global trade form (from header button) */}
      <TradeFormModal
        open={showGlobalForm}
        onClose={() => setShowGlobalForm(false)}
        onSuccess={handleTradeSuccess}
      />
    </div>
  );
}
