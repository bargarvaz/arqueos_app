// Root de la aplicación
import { useEffect } from 'react';
import AppRouter from '@/routes';
import { useAuthStore } from '@/store/authStore';
import authService from '@/services/authService';
import { getAccessToken } from '@/services/api';

export default function App() {
  const { setUser, clearAuth } = useAuthStore();

  // Al montar, verificar si hay un token guardado y cargar el usuario
  useEffect(() => {
    if (!getAccessToken()) return;

    authService
      .getMe()
      .then(setUser)
      .catch(() => {
        clearAuth();
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <AppRouter />;
}
