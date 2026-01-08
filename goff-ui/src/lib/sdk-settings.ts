import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SDKLanguage, DEFAULT_ENABLED_SDKS } from './sdk-snippets';

export type CodeTheme = 'dark' | 'light' | 'github' | 'monokai' | 'dracula' | 'synthwave' | 'bumblebee' | 'terminal' | 'vampire';

export interface CodeThemeColors {
  background: string;
  text: string;
  comment: string;
  keyword: string;
  string: string;
}

export const CODE_THEMES: Record<CodeTheme, { name: string; colors: CodeThemeColors }> = {
  dark: {
    name: 'Dark',
    colors: {
      background: '#1e1e1e',
      text: '#d4d4d4',
      comment: '#6a9955',
      keyword: '#569cd6',
      string: '#ce9178',
    },
  },
  light: {
    name: 'Light',
    colors: {
      background: '#ffffff',
      text: '#1f2937',
      comment: '#6b7280',
      keyword: '#7c3aed',
      string: '#059669',
    },
  },
  github: {
    name: 'GitHub',
    colors: {
      background: '#0d1117',
      text: '#c9d1d9',
      comment: '#8b949e',
      keyword: '#ff7b72',
      string: '#a5d6ff',
    },
  },
  monokai: {
    name: 'Monokai',
    colors: {
      background: '#272822',
      text: '#f8f8f2',
      comment: '#75715e',
      keyword: '#f92672',
      string: '#e6db74',
    },
  },
  dracula: {
    name: 'Dracula',
    colors: {
      background: '#282a36',
      text: '#f8f8f2',
      comment: '#6272a4',
      keyword: '#ff79c6',
      string: '#f1fa8c',
    },
  },
  synthwave: {
    name: 'Synthwave',
    colors: {
      background: '#1a1a2e',
      text: '#ff71ce',
      comment: '#8b5cf6',
      keyword: '#01cdfe',
      string: '#05ffa1',
    },
  },
  bumblebee: {
    name: 'Bumble Bee',
    colors: {
      background: '#1a1a1a',
      text: '#fbbf24',
      comment: '#78716c',
      keyword: '#fcd34d',
      string: '#fef3c7',
    },
  },
  terminal: {
    name: 'Terminal',
    colors: {
      background: '#0a0a0a',
      text: '#22c55e',
      comment: '#166534',
      keyword: '#4ade80',
      string: '#86efac',
    },
  },
  vampire: {
    name: 'Vampire',
    colors: {
      background: '#0d0d0d',
      text: '#ef4444',
      comment: '#7f1d1d',
      keyword: '#f87171',
      string: '#fca5a5',
    },
  },
};

interface SDKSettingsState {
  enabledSDKs: SDKLanguage[];
  codeTheme: CodeTheme;
  setEnabledSDKs: (sdks: SDKLanguage[]) => void;
  toggleSDK: (sdk: SDKLanguage) => void;
  setCodeTheme: (theme: CodeTheme) => void;
  resetToDefaults: () => void;
}

export const useSDKSettings = create<SDKSettingsState>()(
  persist(
    (set, get) => ({
      enabledSDKs: DEFAULT_ENABLED_SDKS,
      codeTheme: 'dark',

      setEnabledSDKs: (sdks: SDKLanguage[]) => set({ enabledSDKs: sdks }),

      toggleSDK: (sdk: SDKLanguage) => {
        const { enabledSDKs } = get();
        if (enabledSDKs.includes(sdk)) {
          set({ enabledSDKs: enabledSDKs.filter((s) => s !== sdk) });
        } else {
          set({ enabledSDKs: [...enabledSDKs, sdk] });
        }
      },

      setCodeTheme: (theme: CodeTheme) => set({ codeTheme: theme }),

      resetToDefaults: () => set({ enabledSDKs: DEFAULT_ENABLED_SDKS, codeTheme: 'dark' }),
    }),
    {
      name: 'goff-sdk-settings',
    }
  )
);
