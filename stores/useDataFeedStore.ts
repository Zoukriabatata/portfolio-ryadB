import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DataFeedProvider = 'ib' | 'dxfeed' | 'rithmic' | 'amp';
export type DataFeedStatus = 'not_configured' | 'configured' | 'connected' | 'error';

export interface DataFeedConfig {
  provider: DataFeedProvider;
  status: DataFeedStatus;
  host?: string;
  port?: number;
  username?: string;
  apiKey?: string;
  lastConnected?: string;
  errorMessage?: string;
}

interface DataFeedStore {
  configs: Record<DataFeedProvider, DataFeedConfig>;
  setConfig: (provider: DataFeedProvider, config: Partial<DataFeedConfig>) => void;
  removeConfig: (provider: DataFeedProvider) => void;
  updateStatus: (provider: DataFeedProvider, status: DataFeedStatus, errorMessage?: string) => void;
}

const DEFAULT_CONFIGS: Record<DataFeedProvider, DataFeedConfig> = {
  ib: { provider: 'ib', status: 'not_configured' },
  dxfeed: { provider: 'dxfeed', status: 'not_configured' },
  rithmic: { provider: 'rithmic', status: 'not_configured' },
  amp: { provider: 'amp', status: 'not_configured' },
};

export const useDataFeedStore = create<DataFeedStore>()(
  persist(
    (set) => ({
      configs: { ...DEFAULT_CONFIGS },

      setConfig: (provider, config) =>
        set((state) => ({
          configs: {
            ...state.configs,
            [provider]: { ...state.configs[provider], ...config, provider },
          },
        })),

      removeConfig: (provider) =>
        set((state) => ({
          configs: {
            ...state.configs,
            [provider]: { ...DEFAULT_CONFIGS[provider] },
          },
        })),

      updateStatus: (provider, status, errorMessage) =>
        set((state) => ({
          configs: {
            ...state.configs,
            [provider]: {
              ...state.configs[provider],
              status,
              errorMessage,
              ...(status === 'connected' ? { lastConnected: new Date().toISOString() } : {}),
            },
          },
        })),
    }),
    {
      name: 'senzoukria-datafeeds',
      merge: (persistedState: any, currentState) => ({
        ...currentState,
        configs: {
          ...DEFAULT_CONFIGS,
          ...(persistedState?.configs || {}),
        },
      }),
    }
  )
);
