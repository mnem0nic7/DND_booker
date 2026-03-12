import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../lib/api';

export type ThemeName =
  | 'classic-parchment'
  | 'gilded-folio'
  | 'dark-tome'
  | 'clean-modern'
  | 'fey-wild'
  | 'infernal'
  | 'dmguild';

interface ThemeState {
  currentTheme: ThemeName;
  _projectId: string | null;
  setTheme: (theme: ThemeName) => void;
  loadProjectTheme: (projectId: string, settings: Record<string, unknown> | null) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      currentTheme: 'gilded-folio',
      _projectId: null,

      loadProjectTheme: (projectId, settings) => {
        const rawTheme = (settings?.theme as ThemeName | undefined) ?? 'gilded-folio';
        const theme = rawTheme === 'dmguild' ? 'gilded-folio' : rawTheme;
        set({ currentTheme: theme, _projectId: projectId });
      },

      setTheme: (theme) => {
        // Capture projectId before state update to avoid race with navigation
        const projectId = get()._projectId;
        const normalizedTheme = theme === 'dmguild' ? 'gilded-folio' : theme;
        set({ currentTheme: normalizedTheme });
        if (projectId) {
          api.put(`/projects/${projectId}`, { settings: { theme: normalizedTheme } }).catch((err) => {
            console.error('[Theme] Failed to persist theme to server:', err);
          });
        }
      },
    }),
    { name: 'dnd-booker-theme' },
  ),
);
