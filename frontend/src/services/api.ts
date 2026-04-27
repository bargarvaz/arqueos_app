// Instancia base de Axios con interceptors de auth y manejo de errores

import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1';

// ─── Storage por pestaña (sessionStorage) ────────────────────────────────────
// Usamos sessionStorage para que cada pestaña tenga su propia sesión, lo que
// permite estar logueado como admin en una pestaña y ETV en otra al mismo tiempo.

export const ACCESS_TOKEN_KEY = 'access_token';
export const SESSION_ID_KEY = 'session_id';

export function getAccessToken(): string | null {
  return sessionStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getSessionId(): string | null {
  return sessionStorage.getItem(SESSION_ID_KEY);
}

export function setAuthSession(access_token: string, session_id: string): void {
  sessionStorage.setItem(ACCESS_TOKEN_KEY, access_token);
  sessionStorage.setItem(SESSION_ID_KEY, session_id);
}

export function clearAuthSession(): void {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(SESSION_ID_KEY);
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Necesario para enviar/recibir cookie HttpOnly de refresh
});

// ─── Interceptor de request: agrega el access token + X-Session-Id ──────────

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  const sessionId = getSessionId();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (sessionId && config.headers) {
    config.headers['X-Session-Id'] = sessionId;
  }
  return config;
});

// ─── Interceptor de response: maneja 401 (token expirado) ────────────────────

let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else if (token) {
      resolve(token);
    }
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      // Si el endpoint es /auth/refresh, no reintentar (rompemos el loop).
      const url = originalRequest.url ?? '';
      if (url.includes('/auth/refresh')) {
        clearAuthSession();
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Sin session_id no tiene sentido intentar refresh.
        if (!getSessionId()) {
          throw error;
        }
        const { data } = await api.post<{ access_token: string; session_id: string }>(
          '/auth/refresh',
        );
        setAuthSession(data.access_token, data.session_id);
        processQueue(null, data.access_token);
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
        }
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearAuthSession();
        // Redirigir al login según el path actual
        const path = window.location.pathname;
        const loginPath = path.startsWith('/etv') ? '/external/login' : '/internal/login';
        window.location.href = loginPath;
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

/** Extrae el mensaje de error de una respuesta Axios. */
export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (data?.detail && typeof data.detail === 'string') return data.detail;
    if (data?.message) return data.message;
    if (error.message) return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Error desconocido.';
}

export default api;
