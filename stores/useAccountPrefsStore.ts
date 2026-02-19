import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SupportedLanguage = 'en' | 'fr' | 'es' | 'de' | 'ar';
export type AlertSoundType = 'beep' | 'voice_male' | 'voice_female' | 'none';

interface AccountPrefsState {
  // General
  language: SupportedLanguage;
  timezone: string;
  compactMode: boolean;
  soundEnabled: boolean;
  alertSound: AlertSoundType;

  // Charts
  defaultSymbol: string;
  defaultTimeframe: string;
  autoConnect: boolean;

  // Notifications
  notifyTrades: boolean;
  notifyAlerts: boolean;
  notifyNews: boolean;
  notifyUpdates: boolean;
  notifyEmail: boolean;
  notifyPush: boolean;

  // Security
  twoFA: boolean;

  // Actions
  setLanguage: (lang: SupportedLanguage) => void;
  setTimezone: (tz: string) => void;
  setCompactMode: (v: boolean) => void;
  setSoundEnabled: (v: boolean) => void;
  setAlertSound: (v: AlertSoundType) => void;
  setDefaultSymbol: (s: string) => void;
  setDefaultTimeframe: (tf: string) => void;
  setAutoConnect: (v: boolean) => void;
  setNotifyTrades: (v: boolean) => void;
  setNotifyAlerts: (v: boolean) => void;
  setNotifyNews: (v: boolean) => void;
  setNotifyUpdates: (v: boolean) => void;
  setNotifyEmail: (v: boolean) => void;
  setNotifyPush: (v: boolean) => void;
  setTwoFA: (v: boolean) => void;
}

export const useAccountPrefsStore = create<AccountPrefsState>()(
  persist(
    (set) => ({
      language: 'en',
      timezone: 'Europe/Paris',
      compactMode: false,
      soundEnabled: false,
      alertSound: 'beep',
      defaultSymbol: 'BTCUSDT',
      defaultTimeframe: '5m',
      autoConnect: true,
      notifyTrades: true,
      notifyAlerts: true,
      notifyNews: false,
      notifyUpdates: true,
      notifyEmail: false,
      notifyPush: true,
      twoFA: false,

      setLanguage: (lang) => set({ language: lang }),
      setTimezone: (tz) => set({ timezone: tz }),
      setCompactMode: (v) => set({ compactMode: v }),
      setSoundEnabled: (v) => set({ soundEnabled: v }),
      setAlertSound: (v) => set({ alertSound: v }),
      setDefaultSymbol: (s) => set({ defaultSymbol: s }),
      setDefaultTimeframe: (tf) => set({ defaultTimeframe: tf }),
      setAutoConnect: (v) => set({ autoConnect: v }),
      setNotifyTrades: (v) => set({ notifyTrades: v }),
      setNotifyAlerts: (v) => set({ notifyAlerts: v }),
      setNotifyNews: (v) => set({ notifyNews: v }),
      setNotifyUpdates: (v) => set({ notifyUpdates: v }),
      setNotifyEmail: (v) => set({ notifyEmail: v }),
      setNotifyPush: (v) => set({ notifyPush: v }),
      setTwoFA: (v) => set({ twoFA: v }),
    }),
    {
      name: 'senzoukria-account-prefs',
    }
  )
);
