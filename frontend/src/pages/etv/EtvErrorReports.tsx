// Reportes de error — vista ETV (solo responder)
import { useState, useEffect, useCallback } from 'react';
import { Send, ChevronDown, ChevronRight, Vault as VaultIcon, Calendar, User as UserIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import errorReportService, { type ErrorReport } from '@/services/errorReportService';
import { formatDatetime } from '@/utils/formatters';
import { getErrorMessage } from '@/services/api';

const respondSchema = z.object({
  response: z.string().min(5, 'Mínimo 5 caracteres.').max(2000),
});
type RespondForm = z.infer<typeof respondSchema>;

const STATUS_LABELS: Record<string, string> = {
  open: 'Abierto',
  acknowledged: 'Visto',
  resolved: 'Resuelto',
  closed: 'Cerrado',
};

const STATUS_BADGE: Record<string, string> = {
  open: 'badge-error',
  acknowledged: 'badge-warning',
  resolved: 'badge-success',
  closed: 'badge-neutral',
};

function RespondModal({ report, onClose, onSent }: { report: ErrorReport; onClose: () => void; onSent: () => void }) {
  const [serverError, setServerError] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RespondForm>({
    resolver: zodResolver(respondSchema),
  });

  const onSubmit = async (data: RespondForm) => {
    setServerError('');
    try {
      await errorReportService.respond(report.id, data.response);
      onSent();
      onClose();
    } catch (err) {
      setServerError(getErrorMessage(err));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-base font-semibold text-text-primary">Responder Reporte #{report.id}</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary text-lg leading-none">×</button>
        </div>
        <div className="p-5">
          <div className="bg-surface rounded p-3 mb-4 border border-border">
            <p className="text-xs font-semibold text-text-secondary mb-1">Descripción del error</p>
            <p className="text-sm text-text-primary">{report.description}</p>
          </div>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">Tu respuesta</label>
              <textarea
                rows={4}
                className={errors.response ? 'input-error resize-none' : 'input resize-none'}
                placeholder="Explica la situación y las acciones que tomaste..."
                {...register('response')}
              />
              {errors.response && <p className="text-status-error text-xs mt-1">{errors.response.message}</p>}
            </div>
            {serverError && <p className="text-status-error text-sm">{serverError}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
              <button type="submit" disabled={isSubmitting} className="btn-primary flex-1 flex items-center justify-center gap-2">
                <Send className="w-4 h-4" />
                {isSubmitting ? 'Enviando...' : 'Enviar respuesta'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function EtvErrorReports() {
  const [reports, setReports] = useState<ErrorReport[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [respondingTo, setRespondingTo] = useState<ErrorReport | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const formatMXN = (v: string | number) =>
    parseFloat(String(v) || '0').toLocaleString('es-MX', { minimumFractionDigits: 2 });

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await errorReportService.list({
        status: statusFilter || undefined,
        page,
        page_size: 25,
      });
      setReports(data.items);
      setTotal(data.total);
      setPages(data.pages);
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const canRespond = (r: ErrorReport) => r.status === 'open' || r.status === 'acknowledged';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-text-primary">Reportes de Error</h1>
        <span className="text-sm text-text-muted">{total} reportes</span>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="input w-44 text-sm"
        >
          <option value="">Todos los estados</option>
          <option value="open">Abiertos</option>
          <option value="acknowledged">Vistos</option>
          <option value="resolved">Resueltos</option>
          <option value="closed">Cerrados</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-32 text-text-muted text-sm">Cargando...</div>
      ) : reports.length === 0 ? (
        <div className="card flex items-center justify-center h-32 text-text-muted text-sm">
          No tienes reportes de error asignados.
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => {
            const expanded = expandedIds.has(r.id);
            return (
              <div key={r.id} className="card p-0 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleExpand(r.id)}
                  className="w-full text-left p-4 hover:bg-surface/40 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-text-muted">
                      {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap mb-1">
                        <span className="text-xs font-mono text-text-muted">#{r.id}</span>
                        <span className={`text-xs ${STATUS_BADGE[r.status] ?? 'badge-neutral'}`}>
                          {STATUS_LABELS[r.status] ?? r.status}
                        </span>
                        {r.error_type_name && (
                          <span className="badge-warning text-xs">
                            {r.error_type_name}
                          </span>
                        )}
                        {r.vault_code && (
                          <span className="text-xs flex items-center gap-1 text-text-secondary">
                            <VaultIcon className="w-3 h-3" />
                            <span className="font-mono">{r.vault_code}</span>
                            {r.vault_name && <span className="text-text-muted">— {r.vault_name}</span>}
                          </span>
                        )}
                        {r.arqueo_date && (
                          <span className="text-xs flex items-center gap-1 text-text-muted">
                            <Calendar className="w-3 h-3" />
                            {new Date(r.arqueo_date + 'T12:00:00').toLocaleDateString('es-MX')}
                          </span>
                        )}
                        <span className="text-xs text-text-muted ml-auto">{formatDatetime(r.created_at)}</span>
                      </div>
                      <p className="text-sm text-text-primary line-clamp-2">{r.description}</p>
                    </div>
                  </div>
                </button>

                {expanded && (
                  <div className="px-5 pb-5 space-y-3 border-t border-border/50 bg-surface/20">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                      <div className="text-xs">
                        <p className="text-text-muted mb-0.5 flex items-center gap-1">
                          <UserIcon className="w-3 h-3" /> Reportado por
                        </p>
                        <p className="text-text-primary font-medium">
                          {r.reported_by_name ?? `Usuario #${r.reported_by}`}
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs text-text-muted mb-1">Descripción del error</p>
                      <p className="text-sm text-text-primary whitespace-pre-wrap">{r.description}</p>
                    </div>

                    {r.records.length > 0 && (
                      <div>
                        <p className="text-xs text-text-muted mb-2">
                          Registros que debes corregir ({r.records.length})
                        </p>
                        <div className="border border-border rounded overflow-hidden">
                          <table className="w-full text-xs">
                            <thead className="bg-surface">
                              <tr className="text-left text-text-muted">
                                <th className="px-3 py-1.5">UID</th>
                                <th className="px-3 py-1.5">Comprobante</th>
                                <th className="px-3 py-1.5">Referencia</th>
                                <th className="px-3 py-1.5">Sucursal</th>
                                <th className="px-3 py-1.5">Tipo</th>
                                <th className="px-3 py-1.5 text-right">Entradas</th>
                                <th className="px-3 py-1.5 text-right">Salidas</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.records.map((rec) => (
                                <tr key={rec.id} className="border-t border-border/40 bg-white">
                                  <td className="px-3 py-1.5 font-mono text-text-muted">{rec.record_uid}</td>
                                  <td className="px-3 py-1.5">{rec.voucher}</td>
                                  <td className="px-3 py-1.5 text-text-muted">{rec.reference}</td>
                                  <td className="px-3 py-1.5 text-text-muted">{rec.sucursal_name ?? '—'}</td>
                                  <td className="px-3 py-1.5 text-text-muted">{rec.movement_type_name ?? '—'}</td>
                                  <td className="px-3 py-1.5 text-right font-mono text-success">
                                    {parseFloat(rec.entries) > 0 ? `$${formatMXN(rec.entries)}` : '—'}
                                  </td>
                                  <td className="px-3 py-1.5 text-right font-mono text-error">
                                    {parseFloat(rec.withdrawals) > 0 ? `$${formatMXN(rec.withdrawals)}` : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="text-[11px] text-text-muted mt-1">
                          Usa el módulo <span className="font-medium">Modificaciones</span> para corregir estos registros.
                        </p>
                      </div>
                    )}

                    {r.response && (
                      <div className="bg-primary/5 rounded p-3 border border-primary/20">
                        <p className="text-xs font-semibold text-primary mb-1">Tu respuesta</p>
                        <p className="text-sm text-text-primary whitespace-pre-wrap">{r.response}</p>
                        {r.resolved_at && (
                          <p className="text-xs text-text-muted mt-1">Resuelto: {formatDatetime(r.resolved_at)}</p>
                        )}
                      </div>
                    )}

                    {canRespond(r) && !r.response && (
                      <div className="flex justify-end">
                        <button
                          onClick={() => setRespondingTo(r)}
                          className="btn btn-primary text-xs flex items-center gap-1"
                        >
                          <Send className="w-3.5 h-3.5" />
                          Responder reporte
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-text-secondary">
          <span>{total} reportes</span>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary py-1 px-3 text-xs disabled:opacity-40">Anterior</button>
            <span>Pág. {page} de {pages}</span>
            <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="btn-secondary py-1 px-3 text-xs disabled:opacity-40">Siguiente</button>
          </div>
        </div>
      )}

      {respondingTo && (
        <RespondModal
          report={respondingTo}
          onClose={() => setRespondingTo(null)}
          onSent={load}
        />
      )}
    </div>
  );
}
