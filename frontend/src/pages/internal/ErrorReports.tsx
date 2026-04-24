// Reportes de error — vista interna (admin / operations)
import { useState, useEffect, useCallback } from 'react';
import { Plus, CheckCircle, MessageSquare } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import errorReportService, { type ErrorReport } from '@/services/errorReportService';
import userService, { type UserResponse } from '@/services/userService';
import { formatDatetime } from '@/utils/formatters';
import { getErrorMessage } from '@/services/api';
import { useAuthStore } from '@/store/authStore';

const createSchema = z.object({
  assigned_to: z.number({ invalid_type_error: 'Selecciona un ETV.' }).min(1, 'Requerido.'),
  description: z.string().min(10, 'Mínimo 10 caracteres.').max(2000),
  arqueo_header_id: z.number().nullable().optional(),
});

type CreateForm = z.infer<typeof createSchema>;

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

export default function ErrorReports() {
  const { user } = useAuthStore();
  const canCreate = user?.role === 'admin' || user?.role === 'operations';

  const [reports, setReports] = useState<ErrorReport[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [etvUsers, setEtvUsers] = useState<UserResponse[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState('');

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
  });

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await errorReportService.list({
        status: statusFilter || undefined,
        page,
        page_size: 20,
      });
      setReports(data.items);
      setTotal(data.total);
      setPages(data.pages);
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (canCreate) {
      userService.listUsers({ role: 'etv', is_active: true, page_size: 0 })
        .then(d => setEtvUsers(d.items))
        .catch(() => {});
    }
  }, [canCreate]);

  const onCreateSubmit = async (data: CreateForm) => {
    setCreateError('');
    try {
      await errorReportService.create({
        assigned_to: data.assigned_to,
        description: data.description,
        arqueo_header_id: data.arqueo_header_id ?? null,
      });
      setShowCreate(false);
      reset();
      await load();
    } catch (err) {
      setCreateError(getErrorMessage(err));
    }
  };

  const handleResolve = async (report: ErrorReport) => {
    if (!confirm('¿Marcar este reporte como resuelto?')) return;
    try {
      await errorReportService.resolve(report.id);
      await load();
    } catch (err) {
      alert(getErrorMessage(err));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-text-primary">Reportes de Error</h1>
        {canCreate && (
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Nuevo reporte
          </button>
        )}
      </div>

      {/* Filtro estado */}
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

      {/* Lista */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32 text-text-muted text-sm">Cargando...</div>
      ) : reports.length === 0 ? (
        <div className="card flex items-center justify-center h-32 text-text-muted text-sm">
          Sin reportes de error.
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <div key={r.id} className="card">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-xs font-mono text-text-muted">#{r.id}</span>
                    <span className={`text-xs ${STATUS_BADGE[r.status] ?? 'badge-neutral'}`}>
                      {STATUS_LABELS[r.status] ?? r.status}
                    </span>
                    {r.arqueo_header_id && (
                      <span className="text-xs text-text-muted">Arqueo #{r.arqueo_header_id}</span>
                    )}
                    <span className="text-xs text-text-muted ml-auto">{formatDatetime(r.created_at)}</span>
                  </div>
                  <p className="text-sm text-text-primary">{r.description}</p>

                  {r.response && (
                    <div className="mt-2 bg-surface rounded p-3 border-l-2 border-primary">
                      <p className="text-xs font-semibold text-text-secondary mb-1 flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        Respuesta del ETV
                      </p>
                      <p className="text-sm text-text-primary">{r.response}</p>
                    </div>
                  )}
                </div>

                {canCreate && r.status !== 'resolved' && r.status !== 'closed' && r.response && (
                  <button
                    onClick={() => handleResolve(r)}
                    className="flex items-center gap-1 text-xs text-status-success hover:bg-status-success-light px-2 py-1 rounded flex-shrink-0"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    Resolver
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Paginación */}
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

      {/* Modal crear reporte */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-lg shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-base font-semibold text-text-primary">Nuevo Reporte de Error</h2>
              <button onClick={() => { setShowCreate(false); reset(); setCreateError(''); }} className="text-text-muted hover:text-text-primary text-lg leading-none">×</button>
            </div>
            <form onSubmit={handleSubmit(onCreateSubmit)} className="p-5 space-y-4">
              <div>
                <label className="label">Asignar a (ETV)</label>
                <select
                  className={errors.assigned_to ? 'input-error' : 'input'}
                  {...register('assigned_to', { valueAsNumber: true })}
                >
                  <option value="">Seleccionar ETV...</option>
                  {etvUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.full_name} — {u.email}</option>
                  ))}
                </select>
                {errors.assigned_to && <p className="text-status-error text-xs mt-1">{errors.assigned_to.message}</p>}
              </div>
              <div>
                <label className="label">ID de Arqueo (opcional)</label>
                <input
                  type="number"
                  placeholder="Ej. 42"
                  className="input"
                  {...register('arqueo_header_id', { valueAsNumber: true })}
                />
              </div>
              <div>
                <label className="label">Descripción del error</label>
                <textarea
                  rows={4}
                  className={errors.description ? 'input-error resize-none' : 'input resize-none'}
                  placeholder="Describe el error detectado..."
                  {...register('description')}
                />
                {errors.description && <p className="text-status-error text-xs mt-1">{errors.description.message}</p>}
              </div>
              {createError && <p className="text-status-error text-sm">{createError}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowCreate(false); reset(); setCreateError(''); }} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" disabled={isSubmitting} className="btn-primary flex-1">
                  {isSubmitting ? 'Enviando...' : 'Crear reporte'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
