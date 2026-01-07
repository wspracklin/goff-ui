import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ConnectionConfig, DiffCache } from './types';
import goffClient from './api';

interface AppState {
  // Connection config
  config: ConnectionConfig;
  isConnected: boolean;
  connectionError: string | null;

  // Dev mode
  isDevMode: boolean;
  setDevMode: (devMode: boolean) => void;

  // Project selection
  selectedProject: string | null;
  setSelectedProject: (project: string | null) => void;

  // Flagset selection
  selectedFlagSet: string | null;
  setSelectedFlagSet: (flagSetId: string | null) => void;

  // Actions
  setConfig: (config: ConnectionConfig) => void;
  setConnected: (connected: boolean) => void;
  setConnectionError: (error: string | null) => void;
  testConnection: () => Promise<boolean>;

  // Real-time updates
  flagUpdates: DiffCache[];
  addFlagUpdate: (update: DiffCache) => void;
  clearFlagUpdates: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      config: {
        proxyUrl: 'http://localhost:1031',
        apiKey: '',
        adminApiKey: '',
      },
      isConnected: false,
      connectionError: null,
      isDevMode: false,
      selectedProject: null,
      selectedFlagSet: null,
      flagUpdates: [],

      setDevMode: (devMode: boolean) => set({ isDevMode: devMode }),
      setSelectedProject: (project: string | null) => set({ selectedProject: project }),
      setSelectedFlagSet: (flagSetId: string | null) => set({ selectedFlagSet: flagSetId }),

      setConfig: (config: ConnectionConfig) => {
        goffClient.setConfig(config);
        set({ config, isConnected: false, connectionError: null });
      },

      setConnected: (connected: boolean) => set({ isConnected: connected }),

      setConnectionError: (error: string | null) =>
        set({ connectionError: error }),

      testConnection: async () => {
        const { config } = get();
        try {
          goffClient.setConfig(config);
          await goffClient.getHealth();
          set({ isConnected: true, connectionError: null });
          return true;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Connection failed';
          set({ isConnected: false, connectionError: message });
          return false;
        }
      },

      addFlagUpdate: (update: DiffCache) =>
        set((state) => ({
          flagUpdates: [update, ...state.flagUpdates].slice(0, 50),
        })),

      clearFlagUpdates: () => set({ flagUpdates: [] }),
    }),
    {
      name: 'goff-ui-storage',
      partialize: (state) => ({ config: state.config, selectedProject: state.selectedProject, isDevMode: state.isDevMode, selectedFlagSet: state.selectedFlagSet }),
      onRehydrateStorage: () => (state) => {
        if (state?.config) {
          goffClient.setConfig(state.config);
        }
      },
    }
  )
);

// Initialize client with stored config
if (typeof window !== 'undefined') {
  const stored = localStorage.getItem('goff-ui-storage');
  if (stored) {
    try {
      const { state } = JSON.parse(stored);
      if (state?.config) {
        goffClient.setConfig(state.config);
      }
    } catch {
      // Ignore parse errors
    }
  }
}
