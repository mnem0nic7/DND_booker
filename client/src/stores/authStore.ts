import { create } from 'zustand';
import { setAccessToken, v1Client } from '../lib/api';

interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,

  login: async (email, password) => {
    const data = await v1Client.auth.login({ email, password });
    setAccessToken(data.accessToken);
    set({ user: data.user });
  },

  register: async (email, password, displayName) => {
    const data = await v1Client.auth.register({ email, password, displayName });
    setAccessToken(data.accessToken);
    set({ user: data.user });
  },

  logout: async () => {
    await v1Client.auth.logout();
    setAccessToken(null);
    set({ user: null });
  },

  refresh: async () => {
    try {
      const data = await v1Client.auth.refresh();
      setAccessToken(data.accessToken);
      set({ user: data.user, isLoading: false });
    } catch {
      set({ user: null, isLoading: false });
    }
  },
}));
