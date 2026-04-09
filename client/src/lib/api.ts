import axios from 'axios';
import { createV1Client } from '@dnd-booker/sdk';

const api = axios.create({ baseURL: '/api', withCredentials: true });

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const requestUrl = String(error.config?.url ?? '');
    const isRefreshRequest = [
      '/auth/refresh',
      '/v1/auth/refresh',
      '/api/v1/auth/refresh',
    ].includes(requestUrl);
    if (error.response?.status === 401 && !error.config._retry && !isRefreshRequest) {
      error.config._retry = true;
      try {
        const { data } = await axios.post('/api/v1/auth/refresh', {}, { withCredentials: true });
        setAccessToken(data.accessToken);
        error.config.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(error.config);
      } catch {
        setAccessToken(null);
      }
    }
    return Promise.reject(error);
  }
);

export const v1Client = createV1Client(api);

export default api;
