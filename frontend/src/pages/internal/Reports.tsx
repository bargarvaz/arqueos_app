// Reporte de saldos diarios por bóveda
import { useState, useEffect, useCallback } from 'react';
import { Download, Search } from 'lucide-react';
import api, { getErrorMessage } from '@/services/api';
import { formatCurrency, formatDate } from '@/utils/formatters';

interface DailyBalance {
  arqueo_date: string;
  vault_code: string;
  vault_name: string;
  company_name: string;
  opening_balance: string;
  closing_balance: string;
  total_entries: string;
  total_withdrawals: string;
  status: string;
}

interface PagedResponse {
  items: DailyBalance[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  published: 'Publicado',
  locked: 'Bloqueado',
};

export default function Reports() {
  const [rows, setRows] = useState<DailyBalance[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [pages, setPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState('');

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [vaultId, setVaultId] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const params: Record<string, unknown> = { page, page_size: pageSize };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (vaultId) params.vault_id = Number(vaultId);

      const { data } = await api.get<PagedResponse>('/reports/daily-balances', { params });
      setRows(data.items);
      setTotal(data.total);
      setPages(data.pages);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, dateFrom, dateTo, vaultId]);

  useEffect(() => { load(); }, [load]);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const params: Record<string, unknown> = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (vaultId) params.vault_id = Number(vaultId);

      const response = await api.get('/reports/daily-balances/download', {
        params,
        responseType: 'blob',
      });

      const url = URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      const from = dateFrom || 'inicio';
      const to = dateTo || 'hoy';
      a.download = `saldos_${from}_${to}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(getErrorMessage(err));
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-text-primary">Reporte de Saldos Diarios</h1>
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          className="btn-secondary flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          {isDownloading ? 'Descargando...' : 'Exportar XLSX'}
        </button>
      </div>

      {/* Filtros */}
      <div className="card mb-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="label">Fecha desde</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="input"
            />
          </div>
          <div>
            <label className="label">Fecha hasta</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="input"
            />
          </div>
          <div>
            <label className="label">ID Bóveda</label>
            <input
              type="number"
              placeholder="Todas"
              value={vaultId}
              onChange={(e) => { setVaultId(e.target.value); setPage(1); }}
              className="input w-28"
            />
          </div>
          <button
            onClick={() => { setDateFrom(''); setDateTo(''); setVaultId(''); setPage(1); }}
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
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-text-muted text-sm">Sin resultados para los filtros seleccionados.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 text-text-secondary font-medium">Fecha</th>
                  <th className="text-left px-4 py-3 text-text-secondary font-medium">Bóveda</th>
                  <th className="text-left px-4 py-3 text-text-secondary font-medium">Empresa</th>
                  <th className="text-right px-4 py-3 text-text-secondary font-medium">Apertura</th>
                  <th className="text-right px-4 py-3 text-text-secondary font-medium">Entradas</th>
                  <th className="text-right px-4 py-3 text-text-secondary font-medium">Salidas</th>
                  <th className="text-right px-4 py-3 text-text-secondary font-medium">Cierre</th>
                  <th className="text-center px-4 py-3 text-text-secondary font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row, i) => (
                  <tr key={i} className="hover:bg-surface/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs">{formatDate(row.arqueo_date)}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-primary font-semibold text-xs">{row.vault_code}</span>
                      <span className="text-text-secondary ml-2">{row.vault_name}</span>
                    </td>
                    <td className="px-4 py-3 text-text-secondary text-xs">{row.company_name}</td>
                    <td className="px-4 py-3 font-mono text-right">{formatCurrency(row.opening_balance)}</td>
                    <td className="px-4 py-3 font-mono text-right text-status-success">{formatCurrency(row.total_entries)}</td>
                    <td className="px-4 py-3 font-mono text-right text-status-error">{formatCurrency(row.total_withdrawals)}</td>
                    <td className="px-4 py-3 font-mono text-right font-semibold">{formatCurrency(row.closing_balance)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`badge-${row.status === 'locked' ? 'neutral' : row.status === 'published' ? 'success' : 'warning'} text-xs`}>
                        {STATUS_LABELS[row.status] ?? row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginación */}
      {pages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-text-secondary">
          <span>{total} registros</span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="btn-secondary py-1 px-3 text-xs disabled:opacity-40"
            >
              Anterior
            </button>
            <span>Pág. {page} de {pages}</span>
            <button
              disabled={page >= pages}
              onClick={() => setPage(p => p + 1)}
              className="btn-secondary py-1 px-3 text-xs disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
