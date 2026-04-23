// Hook de autenticación con detección de inactividad
import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import authService from '@/services/authService';
import { SESSION_INACTIVITY_MS, ROUTES } from '@/utils/constants';

export function useAuth() {
  const { user, isAuthenticated, isLoading, setUser, clearAuth, setLoading } = useAuthStore();
  const navigate = useNavigate();
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Cierre de sesión por inactividad ─────────────────────────────────────

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => {
      logout();
    }, SESSION_INACTIVITY_MS);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isAuthenticated) return;

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, resetInactivityTimer, { passive: true }));
    resetInactivityTimer();

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, resetInactivityTimer));
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [isAuthenticated, resetInactivityTimer]);

  // ─── Funciones de auth ────────────────────────────────────────────────────

  const loadUser = useCallback(async () => {
    if (!localStorage.getItem('access_token')) return;
    try {
      setLoading(true);
      const me = await authService.getMe();
      setUser(me);
    } catch {
      clearAuth();
    } finally {
      setLoading(false);
    }
  }, [setUser, clearAuth, setLoading]);

  const logout = useCallback(async () => {
    await authService.logout();
    clearAuth();
    const path = window.location.pathname;
    const loginPath = path.startsWith('/etv') ? ROUTES.EXTERNAL_LOGIN : ROUTES.INTERNAL_LOGIN;
    navigate(loginPath, { replace: true });
  }, [clearAuth, navigate]);

  const isAdmin = user?.role === 'admin';
  const isInternal = ['admin', 'operations', 'data_science'].includes(user?.role ?? '');
  const isEtv = user?.role === 'etv';

  return {
    user,
    isAuthenticated,
    isLoading,
    isAdmin,
    isInternal,
    isEtv,
    loadUser,
    logout,
  };
}
