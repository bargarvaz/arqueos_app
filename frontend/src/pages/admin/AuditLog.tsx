// Log de auditoría — solo Admin
import { useState, useEffect, useCallback } from 'react';
import { Search } from 'lucide-react';
import api, { getErrorMessage } from '@/services/api';
import { formatDatetime } from '@/utils/formatters';

interface AuditEntry {
  id: number;
  user_id: number | null;
  user_email: string | null;
  user_name: string | null;
  action: string;
  entity_type: string;
  entity_id: number | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

interface PagedResponse {
  items: AuditEntry[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

const ACTION_COLORS: Record<string, string> = {
  login: 'badge-neutral',
  create: 'badge-success',
  update: 'badge-warning',
  delete: 'badge-error',
  publish: 'badge-success',
  lock: 'badge-neutral',
  password_reset: 'badge-warning',
};

export default function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [userId, setUserId] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const params: Record<string, unknown> = { page, page_size: 25 };
      if (userId) params.user_id = Number(userId);
      if (action) params.action = action;
      if (entityType) params.entity_type = entityType;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      const { data } = await api.get<PagedResponse>('/audit-log', { params });
      setEntries(data.items);
      setTotal(data.total);
      setPages(data.pages);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [page, userId, action, entityType, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-text-primary">Log de Auditoría</h1>
        <span className="text-sm text-text-muted">{total} eventos</span>
      </div>

      {/* Filtros */}
      <div className="card mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Usuario ID</label>
            <input
              type="number"
              placeholder="Todos"
              value={userId}
              onChange={(e) => { setUserId(e.target.value); setPage(1); }}
              className="input w-24"
            />
          </div>
          <div>
            <label className="label">Acción</label>
            <select
              value={action}
              onChange={(e) => { setAction(e.target.value); setPage(1); }}
              className="input w-36"
            >
              <option value="">Todas</option>
              <option value="login">login</option>
              <option value="create">create</option>
              <option value="update">update</option>
              <option value="delete">delete</option>
              <option value="publish">publish</option>
              <option value="lock">lock</option>
              <option value="password_reset">password_reset</option>
            </select>
          </div>
          <div>
            <label className="label">Entidad</label>
            <select
              value={entityType}
              onChange={(e) => { setEntityType(e.target.value); setPage(1); }}
              className="input w-36"
            >
              <option value="">Todas</option>
              <option value="user">user</option>
              <option value="vault">vault</option>
              <option value="arqueo">arqueo</option>
              <option value="record">record</option>
              <option value="certificate">certificate</option>
            </select>
          </div>
          <div>
            <label className="label">Desde</label>
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="input" />
          </div>
          <div>
            <label className="label">Hasta</label>
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="input" />
          </div>
          <button
            onClick={() => { setUserId(''); setAction(''); setEntityType(''); setDateFrom(''); setDateTo(''); setPage(1); }}
            className="btn-secondary text-sm"
          >
            Limpiar
          </button>
          <button onClick={() => { setPage(1); load(); }} className="btn-primary flex items-center gap-2 text-sm">
            <Search className="w-4 h-4" />
            Buscar
          </button>
        </div>
      </div>

      {error && <p className="text-status-error text-sm mb-4">{error}</p>}

      {/* Tabla */}
      <div className="card overflow-hidden p-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-text-muted text-sm">Cargando...</div>
        ) : entries.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-text-muted text-sm">Sin eventos para los filtros seleccionados.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-text-secondary font-medium">Fecha</th>
                <th className="text-left px-4 py-3 text-text-secondary font-medium">Usuario</th>
                <th className="text-left px-4 py-3 text-text-secondary font-medium">Acción</th>
                <th className="text-left px-4 py-3 text-text-secondary font-medium">Entidad</th>
                <th className="text-left px-4 py-3 text-text-secondary font-medium">IP</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((e) => (
                <>
                  <tr
                    key={e.id}
                    className="hover:bg-surface/50 transition-colors cursor-pointer"
                    onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-text-muted">{formatDatetime(e.created_at)}</td>
                    <td className="px-4 py-3 text-xs">
                      {e.user_email ? (
                        <span title={`ID: ${e.user_id}`}>
                          <span className="font-medium text-text-primary">{e.user_email}</span>
                          {e.user_name && <span className="block text-text-muted">{e.user_name}</span>}
                        </span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs ${ACTION_COLORS[e.action] ?? 'badge-neutral'}`}>
                        {e.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className="text-text-secondary">{e.entity_type}</span>
                      {e.entity_id && <span className="text-text-muted ml-1">#{e.entity_id}</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-text-muted">{e.ip_address ?? '—'}</td>
                    <td className="px-4 py-3 text-text-muted text-xs">{expandedId === e.id ? '▲' : '▼'}</td>
                  </tr>
                  {expandedId === e.id && (
                    <tr key={`${e.id}-detail`} className="bg-surface">
                      <td colSpan={6} className="px-6 py-3">
                        <div className="grid grid-cols-2 gap-4 text-xs">
                          {e.old_values && (
                            <div>
                              <p className="font-semibold text-text-secondary mb-1">Antes</p>
                              <pre className="bg-white border border-border rounded p-2 overflow-x-auto text-text-primary">
                                {JSON.stringify(e.old_values, null, 2)}
                              </pre>
                            </div>
                          )}
                          {e.new_values && (
                            <div>
                              <p className="font-semibold text-text-secondary mb-1">Después</p>
                              <pre className="bg-white border border-border rounded p-2 overflow-x-auto text-text-primary">
                                {JSON.stringify(e.new_values, null, 2)}
                              </pre>
                            </div>
                          )}
                          {e.user_agent && (
                            <div className="col-span-2">
                              <p className="font-semibold text-text-secondary mb-1">User Agent</p>
                              <p className="text-text-muted break-all">{e.user_agent}</p>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginación */}
      {pages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-text-secondary">
          <span>{total} eventos</span>
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
