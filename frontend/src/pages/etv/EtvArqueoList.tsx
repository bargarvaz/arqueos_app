// Historial de arqueos del ETV
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye } from 'lucide-react';
import api, { getErrorMessage } from '@/services/api';
import { formatDate, formatCurrency, formatArqueoStatus } from '@/utils/formatters';
import { ROUTES } from '@/utils/constants';

interface ArqueoHeader {
  id: number;
  vault_id: number;
  arqueo_date: string;
  opening_balance: string;
  closing_balance: string;
  status: string;
  published_at: string | null;
  locked_at: string | null;
  created_at: string;
}

interface PagedResponse {
  items: ArqueoHeader[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-warning',
  published: 'badge-success',
  locked: 'badge-neutral',
};

export default function EtvArqueoList() {
  const navigate = useNavigate();
  const [arqueos, setArqueos] = useState<ArqueoHeader[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const params: Record<string, unknown> = { page, page_size: 25 };
      if (statusFilter) params.status = statusFilter;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      const { data } = await api.get<PagedResponse>('/arqueos/my-history', { params });
      setArqueos(data.items);
      setTotal(data.total);
      setPages(data.pages);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-text-primary">Mis Arqueos</h1>
        <span className="text-sm text-text-muted">{total} registros</span>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="label">Estado</label>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="input w-40 text-sm"
          >
            <option value="">Todos</option>
            <option value="draft">Borrador</option>
            <option value="published">Publicado</option>
            <option value="locked">Bloqueado</option>
          </select>
        </div>
        <div>
          <label className="label">Desde</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="input"
          />
        </div>
        <div>
          <label className="label">Hasta</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="input"
          />
        </div>
        <button
          onClick={() => { setStatusFilter(''); setDateFrom(''); setDateTo(''); setPage(1); }}
          className="btn-secondary text-sm"
        >
          Limpiar
        </button>
      </div>

      {error && <p className="text-status-error text-sm mb-4">{error}</p>}

      {/* Tabla */}
      <div className="card overflow-hidden p-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-text-muted text-sm">Cargando...</div>
        ) : arqueos.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-text-muted text-sm">
            No hay arqueos registrados.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-text-secondary font-medium">Fecha</th>
                <th className="text-left px-4 py-3 text-text-secondary font-medium">Bóveda</th>
                <th className="text-right px-4 py-3 text-text-secondary font-medium">Apertura</th>
                <th className="text-right px-4 py-3 text-text-secondary font-medium">Cierre</th>
                <th className="text-center px-4 py-3 text-text-secondary font-medium">Estado</th>
                <th className="text-left px-4 py-3 text-text-secondary font-medium">Publicado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {arqueos.map((a) => (
                <tr key={a.id} className="hover:bg-surface/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs">{formatDate(a.arqueo_date)}</td>
                  <td className="px-4 py-3 font-mono text-primary font-semibold text-xs">#{a.vault_id}</td>
                  <td className="px-4 py-3 font-mono text-right text-xs">{formatCurrency(a.opening_balance)}</td>
                  <td className="px-4 py-3 font-mono text-right text-xs font-semibold">{formatCurrency(a.closing_balance)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs ${STATUS_BADGE[a.status] ?? 'badge-neutral'}`}>
                      {formatArqueoStatus(a.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-muted">
                    {a.published_at ? formatDate(a.published_at) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => navigate(`${ROUTES.ETV_ARQUEO_FORM}/${a.vault_id}/${a.arqueo_date}`)}
                      className="flex items-center gap-1 text-xs text-primary hover:bg-primary/10 px-2 py-1 rounded"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginación */}
      {pages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-text-secondary">
          <span>{total} arqueos</span>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary py-1 px-3 text-xs disabled:opacity-40">Anterior</button>
            <span>Pág. {page} de {pages}</span>
            <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="btn-secondary py-1 px-3 text-xs disabled:opacity-40">Siguiente</button>
          </div>
        </div>
      )}
    </div>
  );
}
