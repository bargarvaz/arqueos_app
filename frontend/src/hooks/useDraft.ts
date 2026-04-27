// Hook para manejo de borradores de arqueo en localStorage con autosave
import { useEffect, useCallback, useRef, useState } from 'react';
import { DRAFT_AUTOSAVE_MS } from '@/utils/constants';

const DRAFT_PREFIX = 'arqueo_draft_';

interface DraftHookOptions<T> {
  key: string;           // Identificador único (vault_id + date). Vacío = no autosave.
  data: T;               // Datos actuales del formulario
  onRestore: (data: T) => void;  // Callback al restaurar un draft
}

interface DraftHookReturn {
  saveDraft: () => void;
  clearDraft: () => void;
  hasDraft: boolean;
  lastSavedAt: Date | null;
}

export function useDraft<T>({ key, data, onRestore }: DraftHookOptions<T>): DraftHookReturn {
  const storageKey = key ? `${DRAFT_PREFIX}${key}` : '';
  const dataRef = useRef(data);
  const periodicTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const restoringRef = useRef(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Mantener ref actualizado sin re-render
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const saveDraft = useCallback(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          data: dataRef.current,
          savedAt: new Date().toISOString(),
        }),
      );
      setLastSavedAt(new Date());
    } catch {
      // localStorage puede fallar en modo privado o storage lleno
    }
  }, [storageKey]);

  const clearDraft = useCallback(() => {
    if (!storageKey) return;
    localStorage.removeItem(storageKey);
    setLastSavedAt(null);
  }, [storageKey]);

  const hasDraft = !!storageKey && !!localStorage.getItem(storageKey);

  // Restaurar draft al montar
  useEffect(() => {
    if (!storageKey) return;
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.data) {
          // Marca para que el siguiente render (que viene del onRestore) NO
          // dispare un save innecesario sobre los mismos datos
          restoringRef.current = true;
          onRestore(parsed.data as T);
          if (parsed.savedAt) setLastSavedAt(new Date(parsed.savedAt));
        }
      } catch {
        localStorage.removeItem(storageKey);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Autosave periódico cada 30s como red de seguridad
  useEffect(() => {
    if (!storageKey) return;
    periodicTimerRef.current = setInterval(saveDraft, DRAFT_AUTOSAVE_MS);
    return () => {
      if (periodicTimerRef.current) clearInterval(periodicTimerRef.current);
    };
  }, [saveDraft, storageKey]);

  // Autosave inmediato en cada cambio de `data`
  useEffect(() => {
    if (!storageKey) return;
    // El primer disparo ocurre con los datos restaurados — no es una edición real.
    if (restoringRef.current) {
      restoringRef.current = false;
      return;
    }
    saveDraft();
  }, [data, saveDraft, storageKey]);

  return { saveDraft, clearDraft, hasDraft, lastSavedAt };
}
