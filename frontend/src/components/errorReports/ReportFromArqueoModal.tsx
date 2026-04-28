// Modal para reportar un error desde el detalle de un arqueo (Operations / Admin)
import { useEffect, useState } from 'react';
import { X, AlertTriangle, Send } from 'lucide-react';

import errorReportService from '@/services/errorReportService';
import { getErrorMessage } from '@/services/api';

interface RecordInfo {
  id: number;
  voucher: string;
  reference: string;
  movement_type_name?: string | null;
}

interface Props {
  /** Header al que pertenecen los registros (asignación se autoresuelve desde aquí). */
  arqueoHeaderId: number;
  /** Registros disponibles del día. Si se pasa solo uno, queda preseleccionado. */
  records: RecordInfo[];
  /** IDs de registros pre-seleccionados al abrir. */
  initialSelected?: number[];
  /** Texto descriptivo del contexto (fecha, bóveda) que se muestra en el modal. */
  contextLabel: string;
  onClose: () => void;
  onCreated?: () => void;
}

interface AssigneePreview {
  vault_code: string | null;
  vault_name: string | null;
  assigned_user_id: number | null;
  assigned_user_name: string | null;
  assigned_via: 'manager' | 'treasurer' | 'vault_assignment' | null;
}

const VIA_LABELS: Record<string, string> = {
  manager: 'Gerente',
  treasurer: 'Tesorero',
  vault_assignment: 'Usuario asignado',
};

export default function ReportFromArqueoModal({
  arqueoHeaderId,
  records,
  initialSelected = [],
  contextLabel,
  onClose,
  onCreated,
}: Props) {
  const [description, setDescription] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    new Set(initialSelected),
  );
  const [preview, setPreview] = useState<AssigneePreview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    errorReportService
      .autoAssignPreview(arqueoHeaderId)
      .then((p) => {
        setPreview(p);
        if (!p.assigned_user_id) {
          setPreviewError(
            'La bóveda no tiene gerente, tesorero ni usuarios asignados. Asigna un usuario ETV antes de reportar.',
          );
        }
      })
      .catch(() => {
        setPreviewError('No se pudo determinar el destinatario del reporte.');
      });
  }, [arqueoHeaderId]);

  const toggle = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (description.trim().length < 10) {
      setError('La descripción debe tener al menos 10 caracteres.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await errorReportService.create({
        arqueo_header_id: arqueoHeaderId,
        description: description.trim(),
        record_ids: Array.from(selectedIds),
        // assigned_to se autoresuelve en backend
      });
      onCreated?.();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    !!preview?.assigned_user_id &&
    description.trim().length >= 10 &&
    !submitting;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-xl shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border flex-shrink-0">
          <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-warning" />
            Reportar error
          </h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
          {/* Contexto fijo */}
          <div className="bg-surface/60 rounded p-3 text-sm">
            <p className="text-text-muted text-xs mb-1">Contexto del reporte</p>
            <p className="text-text-primary">{contextLabel}</p>
            {preview && (
              <div className="mt-2 pt-2 border-t border-border/50">
                <p className="text-text-muted text-xs">Se notificará a:</p>
                {preview.assigned_user_id ? (
                  <p className="text-text-primary">
                    <span className="font-medium">{preview.assigned_user_name}</span>
                    {preview.assigned_via && (
                      <span className="text-xs text-text-muted ml-2">
                        ({VIA_LABELS[preview.assigned_via]})
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="text-error text-xs">Sin destinatario disponible</p>
                )}
              </div>
            )}
          </div>

          {previewError && (
            <div className="p-3 bg-error/10 border border-error rounded text-error text-sm">
              {previewError}
            </div>
          )}

          {/* Selección de registros (si hay más de uno) */}
          {records.length > 1 && (
            <div>
              <p className="label">Registros afectados (opcional)</p>
              <div className="space-y-1 max-h-40 overflow-y-auto border border-border rounded p-2">
                {records.map((r) => (
                  <label
                    key={r.id}
                    className="flex items-center gap-2 text-xs hover:bg-surface/40 rounded px-1 py-0.5 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(r.id)}
                      onChange={() => toggle(r.id)}
                    />
                    <span className="font-mono">{r.voucher}</span>
                    <span className="text-text-muted">{r.reference}</span>
                    {r.movement_type_name && (
                      <span className="text-text-muted text-[10px]">
                        ({r.movement_type_name})
                      </span>
                    )}
                  </label>
                ))}
              </div>
              <p className="text-text-muted text-xs mt-1">
                Si no marcas ninguno, el reporte se asocia al día completo.
              </p>
            </div>
          )}

          {records.length === 1 && (
            <div className="text-xs text-text-muted">
              Reporte sobre el registro:{' '}
              <span className="font-mono text-text-primary">{records[0].voucher}</span>
              {records[0].reference && (
                <span> — {records[0].reference}</span>
              )}
            </div>
          )}

          <div>
            <label className="label">
              Descripción del error <span className="text-error">*</span>
            </label>
            <textarea
              className={
                error && description.trim().length < 10 ? 'input-error' : 'input'
              }
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explica el error detectado..."
              maxLength={2000}
            />
            <p className="text-text-muted text-xs mt-1">
              Mínimo 10 caracteres. {description.length}/2000
            </p>
          </div>

          {error && (
            <div className="p-3 bg-error/10 border border-error rounded text-error text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-3 p-5 border-t border-border flex-shrink-0">
          <button onClick={onClose} className="btn btn-secondary flex-1">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="btn btn-primary flex-1 flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" />
            {submitting ? 'Enviando...' : 'Enviar reporte'}
          </button>
        </div>
      </div>
    </div>
  );
}
