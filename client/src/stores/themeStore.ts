import { create } from 'zustand';

export type ThemeName =
  | 'classic-parchment'
  | 'dark-tome'
  | 'clean-modern'
  | 'fey-wild'
  | 'infernal';

interface ThemeState {
  currentTheme: ThemeName;
  setTheme: (theme: ThemeName) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  currentTheme: 'classic-parchment',
  setTheme: (theme) => set({ currentTheme: theme }),
}));
