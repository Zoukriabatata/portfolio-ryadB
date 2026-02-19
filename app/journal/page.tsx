'use client';

import { useState, useCallback } from 'react';
import { useJournalStore } from '@/stores/useJournalStore';
import JournalHeader from '@/components/journal/JournalHeader';
import DashboardTab from '@/components/journal/DashboardTab';
import TradesTab from '@/components/journal/TradesTab';
import CalendarTab from '@/components/journal/CalendarTab';
import PlaybookTab from '@/components/journal/PlaybookTab';
import DailyNotesTab from '@/components/journal/DailyNotesTab';
import TradeFormModal from '@/components/journal/TradeFormModal';

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
    <div className="h-full flex flex-col bg-[var(--background)]">
      <JournalHeader onNewTrade={handleNewTrade} />

      <div className="flex-1 overflow-auto" key={refreshKey}>
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'trades' && <TradesTab />}
        {activeTab === 'calendar' && <CalendarTab />}
        {activeTab === 'playbook' && <PlaybookTab />}
        {activeTab === 'notes' && <DailyNotesTab />}
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
