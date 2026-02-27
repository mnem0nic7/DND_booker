import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../lib/api';

export type ThemeName =
  | 'classic-parchment'
  | 'dark-tome'
  | 'clean-modern'
  | 'fey-wild'
  | 'infernal';

interface ThemeState {
  currentTheme: ThemeName;
  _projectId: string | null;
  setTheme: (theme: ThemeName) => void;
  loadProjectTheme: (projectId: string, settings: Record<string, unknown> | null) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      currentTheme: 'classic-parchment',
      _projectId: null,

      loadProjectTheme: (projectId, settings) => {
        const theme = (settings?.theme as ThemeName) || 'classic-parchment';
        set({ currentTheme: theme, _projectId: projectId });
      },

      setTheme: (theme) => {
        set({ currentTheme: theme });
        // Persist to server if we have a project context
        const projectId = get()._projectId;
        if (projectId) {
          api.put(`/projects/${projectId}`, { settings: { theme } }).catch((err) => {
            console.error('[Theme] Failed to persist theme to server:', err);
          });
        }
      },
    }),
    { name: 'dnd-booker-theme' },
  ),
);
