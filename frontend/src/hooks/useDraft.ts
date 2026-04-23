// Hook para manejo de borradores de arqueo en localStorage con autosave
import { useEffect, useCallback, useRef } from 'react';
import { DRAFT_AUTOSAVE_MS } from '@/utils/constants';

const DRAFT_PREFIX = 'arqueo_draft_';

interface DraftHookOptions<T> {
  key: string;           // Identificador único (vault_id + date)
  data: T;               // Datos actuales del formulario
  onRestore: (data: T) => void;  // Callback al restaurar un draft
}

interface DraftHookReturn {
  saveDraft: () => void;
  clearDraft: () => void;
  hasDraft: boolean;
}

export function useDraft<T>({ key, data, onRestore }: DraftHookOptions<T>): DraftHookReturn {
  const storageKey = `${DRAFT_PREFIX}${key}`;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dataRef = useRef(data);

  // Mantener ref actualizado sin re-render
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const saveDraft = useCallback(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        data: dataRef.current,
        savedAt: new Date().toISOString(),
      }));
    } catch {
      // localStorage puede fallar en modo privado o storage lleno
    }
  }, [storageKey]);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  const hasDraft = !!localStorage.getItem(storageKey);

  // Restaurar draft al montar
  useEffect(() => {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.data) {
          onRestore(parsed.data as T);
        }
      } catch {
        localStorage.removeItem(storageKey);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Autosave periódico
  useEffect(() => {
    timerRef.current = setInterval(saveDraft, DRAFT_AUTOSAVE_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [saveDraft]);

  return { saveDraft, clearDraft, hasDraft };
}
