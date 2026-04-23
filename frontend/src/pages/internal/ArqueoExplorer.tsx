// Explorador de arqueos para usuarios internos
import { useEffect, useState, useCallback } from 'react';
import explorerService, { ExplorerRecord, ExplorerFilters } from '@/services/explorerService';
import catalogService, { MovementType } from '@/services/catalogService';
import { ARQUEO_STATUS, PAGE_SIZE_OPTIONS } from '@/utils/constants';

const formatMXN = (v: number) =>
  v.toLocaleString('es-MX', { minimumFractionDigits: 2 });

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  published: 'Publicado',
  locked: 'Bloqueado',
};

export default function ArqueoExplorer() {
  const [records, setRecords] = useState<ExplorerRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [movementTypes, setMovementTypes] = useState<MovementType[]>([]);
  const [downloading, setDownloading] = useState(false);

  const [filters, setFilters] = useState<ExplorerFilters>({
    page: 1,
    page_size: 25,
    include_counterparts: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await explorerService.getRecords(filters);
      setRecords(data.items);
      setTotal(data.total);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    catalogService.getMovementTypes().then(setMovementTypes).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const setFilter = (key: keyof ExplorerFilters, value: unknown) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await explorerService.downloadXlsx(filters);
    } catch {
      // Error silencioso — el archivo no se descargó
    } finally {
      setDownloading(false);
    }
  };

  const pages = Math.max(1, Math.ceil(total / (filters.page_size || 25)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-xl font-semibold text-text-primary">
          Explorador de Arqueos
        </h1>
        <button
          className="btn btn-outline text-sm"
          onClick={handleDownload}
          disabled={downloading || total === 0}
        >
          {downloading ? 'Descargando...' : '↓ Exportar XLSX'}
        </button>
      </div>

      {/* Filtros */}
      <div className="card p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        <div>
          <label className="label text-xs">Desde</label>
          <input
            type="date"
            className="input"
            value={filters.date_from || ''}
            onChange={(e) => setFilter('date_from', e.target.value || undefined)}
          />
        </div>
        <div>
          <label className="label text-xs">Hasta</label>
          <input
            type="date"
            className="input"
            value={filters.date_to || ''}
            onChange={(e) => setFilter('date_to', e.target.value || undefined)}
          />
        </div>
        <div>
          <label className="label text-xs">Estado</label>
          <select
            className="input"
            value={filters.status || ''}
            onChange={(e) => setFilter('status', e.target.value || undefined)}
          >
            <option value="">Todos</option>
            <option value={ARQUEO_STATUS.PUBLISHED}>Publicado</option>
            <option value={ARQUEO_STATUS.LOCKED}>Bloqueado</option>
            <option value={ARQUEO_STATUS.DRAFT}>Borrador</option>
          </select>
        </div>
        <div>
          <label className="label text-xs">Tipo movimiento</label>
          <select
            className="input"
            value={filters.movement_type_id || ''}
            onChange={(e) => setFilter('movement_type_id', e.target.value ? parseInt(e.target.value) : undefined)}
          >
            <option value="">Todos</option>
            {movementTypes.map((mt) => (
              <option key={mt.id} value={mt.id}>{mt.name}</option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className="label text-xs">Buscar (bóveda / comprobante / referencia)</label>
          <input
            type="text"
            className="input"
            placeholder="Buscar..."
            value={filters.search || ''}
            onChange={(e) => setFilter('search', e.target.value || undefined)}
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={filters.include_counterparts ?? true}
              onChange={(e) => setFilter('include_counterparts', e.target.checked)}
              className="w-4 h-4"
            />
            Incluir contrapartidas
          </label>
        </div>
      </div>

      {/* Tabla */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-muted border-b border-border bg-surface/40">
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Empresa</th>
              <th className="px-3 py-2">Bóveda</th>
              <th className="px-3 py-2">Comprobante</th>
              <th className="px-3 py-2">Referencia</th>
              <th className="px-3 py-2">Sucursal</th>
              <th className="px-3 py-2">Tipo Mov.</th>
              <th className="px-3 py-2 text-right">Entradas</th>
              <th className="px-3 py-2 text-right">Salidas</th>
              <th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="py-8 text-center">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-8 text-center text-text-muted text-xs">
                  Sin resultados con los filtros actuales
                </td>
              </tr>
            ) : (
              records.map((rec) => (
                <tr
                  key={rec.record_id}
                  className={`border-b border-border/40 hover:bg-surface/30 ${
                    rec.is_counterpart ? 'opacity-60 italic' : ''
                  }`}
                >
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {new Date(rec.arqueo_date + 'T12:00:00').toLocaleDateString('es-MX')}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-text-muted">{rec.company_name}</td>
                  <td className="px-3 py-1.5">
                    <span className="font-mono text-xs">{rec.vault_code}</span>
                  </td>
                  <td className="px-3 py-1.5">
                    {rec.is_counterpart && (
                      <span className={`badge text-xs mr-1 ${
                        rec.counterpart_type === 'cancellation' ? 'badge-error' : 'badge-warning'
                      }`}>
                        {rec.counterpart_type === 'cancellation' ? 'CANC.' : 'MOD.'}
                      </span>
                    )}
                    {rec.voucher}
                  </td>
                  <td className="px-3 py-1.5 text-text-muted text-xs">{rec.reference}</td>
                  <td className="px-3 py-1.5 text-xs">{rec.branch_name}</td>
                  <td className="px-3 py-1.5 text-xs">{rec.movement_type_name}</td>
                  <td className="px-3 py-1.5 text-right text-success">
                    {rec.entries > 0 ? `$${formatMXN(rec.entries)}` : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-right text-error">
                    {rec.withdrawals > 0 ? `$${formatMXN(rec.withdrawals)}` : '—'}
                  </td>
                  <td className="px-3 py-1.5">
                    <span className={`badge text-xs ${
                      rec.header_status === 'published' ? 'badge-success' :
                      rec.header_status === 'locked' ? 'badge-info' : 'badge-neutral'
                    }`}>
                      {STATUS_LABELS[rec.header_status] || rec.header_status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Paginación */}
        <div className="px-4 py-3 border-t border-border flex flex-wrap justify-between items-center gap-3 text-sm">
          <span className="text-text-muted text-xs">
            {total.toLocaleString('es-MX')} registros
          </span>

          <div className="flex items-center gap-2">
            <select
              className="input text-xs w-20"
              value={filters.page_size}
              onChange={(e) => setFilter('page_size', parseInt(e.target.value))}
            >
              {PAGE_SIZE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s} / pág.</option>
              ))}
            </select>

            <button
              className="btn btn-ghost text-xs py-1 px-2"
              disabled={filters.page === 1}
              onClick={() => setFilter('page', (filters.page || 1) - 1)}
            >
              ‹ Prev
            </button>
            <span className="text-xs text-text-muted">
              {filters.page} / {pages}
            </span>
            <button
              className="btn btn-ghost text-xs py-1 px-2"
              disabled={filters.page === pages}
              onClick={() => setFilter('page', (filters.page || 1) + 1)}
            >
              Sig ›
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
