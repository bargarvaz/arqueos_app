// Store del tema (light / dark / system) con persistencia
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const STORAGE_KEY = 'arqueos-theme';

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

/** Aplica el modo al `<html>` (agrega/quita la clase `dark`). */
export function applyTheme(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  const isDark = mode === 'dark' || (mode === 'system' && systemPrefersDark());
  const root = document.documentElement;
  root.classList.toggle('dark', isDark);
  // Pista para inputs nativos / scrollbars del navegador
  root.style.colorScheme = isDark ? 'dark' : 'light';
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'system',
      setMode: (mode) => {
        set({ mode });
        applyTheme(mode);
      },
      toggle: () => {
        const current = get().mode;
        // light → dark → system → light
        const next: ThemeMode =
          current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light';
        set({ mode: next });
        applyTheme(next);
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        // Aplicar al rehidratar para evitar parpadeo de tema incorrecto
        if (state) applyTheme(state.mode);
      },
    },
  ),
);

/** Inicialización temprana (antes de React mount). Debe llamarse en main.tsx. */
export function initTheme(): void {
  if (typeof window === 'undefined') return;
  let mode: ThemeMode = 'system';
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { state?: { mode?: ThemeMode } };
      if (parsed?.state?.mode) mode = parsed.state.mode;
    }
  } catch {
    // localStorage corrupto / inaccesible — usar 'system'
  }
  applyTheme(mode);

  // Re-aplicar si el modo es 'system' y cambia la preferencia del SO
  const mql = window.matchMedia?.('(prefers-color-scheme: dark)');
  if (mql) {
    const handler = () => {
      const current = useThemeStore.getState().mode;
      if (current === 'system') applyTheme('system');
    };
    if (mql.addEventListener) mql.addEventListener('change', handler);
    else mql.addListener?.(handler);
  }
}
