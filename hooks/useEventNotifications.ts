'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { EconomicEvent } from '@/types/news';

const CHECK_INTERVAL = 30_000;
const NOTIFIED_KEY = 'senzoukria-notified';

function getNotifiedSet(): Set<string> {
  try {
    const s = localStorage.getItem(NOTIFIED_KEY);
    return new Set(s ? (JSON.parse(s) as string[]) : []);
  } catch { return new Set(); }
}

function saveNotifiedSet(set: Set<string>) {
  try { localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...set])); } catch {}
}

export function useEventNotifications(
  events: EconomicEvent[],
  enabled: boolean,
  leadMinutes: number,
) {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission);
      notifiedRef.current = getNotifiedSet();
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
    const perm = await Notification.requestPermission();
    setPermission(perm);
    return perm;
  }, []);

  useEffect(() => {
    if (!enabled || permission !== 'granted') return;

    const check = () => {
      const now = Date.now();
      for (const event of events) {
        if (event.impact !== 'high') continue;
        const diff = (new Date(event.time).getTime() - now) / 60000;
        if (diff < 0 || diff > leadMinutes + 0.5) continue;

        const key = `${event.id}@${leadMinutes}`;
        if (notifiedRef.current.has(key)) continue;

        notifiedRef.current.add(key);
        saveNotifiedSet(notifiedRef.current);

        new Notification(`🔴 ${event.currency}: ${event.event}`, {
          body: `Releases in ~${Math.round(diff)} min${event.forecast ? `  ·  Fcst: ${event.forecast}` : ''}`,
          icon: '/favicon.ico',
          tag: key,
          requireInteraction: false,
        });
      }
    };

    check();
    const id = setInterval(check, CHECK_INTERVAL);
    return () => clearInterval(id);
  }, [events, enabled, permission, leadMinutes]);

  return { permission, requestPermission };
}
