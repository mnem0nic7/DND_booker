import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      currentTheme: 'classic-parchment',
      setTheme: (theme) => set({ currentTheme: theme }),
    }),
    { name: 'dnd-booker-theme' },
  ),
);
