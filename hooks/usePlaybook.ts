'use client';

import { useState, useEffect, useCallback } from 'react';
import type { PlaybookSetup } from '@/types/journal';

export function usePlaybook() {
  const [setups, setSetups] = useState<PlaybookSetup[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSetups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/journal/playbook');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setSetups(data.setups || []);
    } catch {
      setSetups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSetups();
  }, [fetchSetups]);

  const createSetup = async (data: { name: string; description?: string; rules?: string[]; exampleUrls?: string[] }) => {
    const res = await fetch('/api/journal/playbook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) fetchSetups();
    return res.ok;
  };

  const updateSetup = async (id: string, data: Partial<PlaybookSetup>) => {
    const res = await fetch(`/api/journal/playbook/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) fetchSetups();
    return res.ok;
  };

  const deleteSetup = async (id: string) => {
    const res = await fetch(`/api/journal/playbook/${id}`, { method: 'DELETE' });
    if (res.ok) fetchSetups();
    return res.ok;
  };

  return { setups, loading, createSetup, updateSetup, deleteSetup, refetch: fetchSetups };
}
