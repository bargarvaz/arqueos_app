// Lista de arqueos modificables para el ETV — con filtros y búsqueda
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, X } from 'lucide-react';
import modificationService, { ModifiableArqueo } from '@/services/modificationService';
import { ROUTES } from '@/utils/constants';

const formatMXN = (v: string | number) =>
  parseFloat(String(v)).toLocaleString('es-MX', { minimumFractionDigits: 2 });

export default function ModificationList() {
  const navigate = useNavigate();
  const [arqueos, setArqueos] = useState<ModifiableArqueo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filtros
  const [search, setSearch] = useState('');
  const [vaultFilter, setVaultFilter] = useState<number | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showBlank, setShowBlank] = useState<'all' | 'with' | 'blank'>('all');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    modificationService
      .getMyModifiableArqueos()
      .then(setArqueos)
      .catch(() => setError('No se pudieron cargar los arqueos modificables.'))
      .finally(() => setLoading(false));
  }, []);

  // Bóvedas únicas para el dropdown
  const vaults = useMemo(() => {
    const map = new Map<number, { id: number; code: string | null; name: string | null }>();
    arqueos.forEach((a) => {
      if (!map.has(a.vault_id)) {
        map.set(a.vault_id, { id: a.vault_id, code: a.vault_code, name: a.vault_name });
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      (a.code ?? '').localeCompare(b.code ?? ''),
    );
  }, [arqueos]);

  // Aplicar filtros
  const filtered = useMemo(() => {
    return arqueos.filter((a) => {
      if (vaultFilter !== '' && a.vault_id !== vaultFilter) return false;
      if (dateFrom && a.arqueo_date < dateFrom) return false;
      if (dateTo && a.arqueo_date > dateTo) return false;
      if (showBlank === 'blank' && !a.auto_published) return false;
      if (showBlank === 'with' && a.auto_published) return false;
      if (search) {
        const q = search.toLowerCase();
        const haystack = [
          a.vault_code ?? '',
          a.vault_name ?? '',
          a.arqueo_date,
          a.status,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [arqueos, search, vaultFilter, dateFrom, dateTo, showBlank]);

  const hasActiveFilters =
    !!search || vaultFilter !== '' || !!dateFrom || !!dateTo || showBlank !== 'all';

  const clearFilters = () => {
    setSearch('');
    setVaultFilter('');
    setDateFrom('');
    setDateTo('');
    setShowBlank('all');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-error/10 border border-error rounded-lg text-error text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Modificaciones</h1>
          <p className="text-sm text-text-muted mt-1">
            Arqueos publicados que puedes modificar dentro del periodo de gracia.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs text-text-muted hover:text-error flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              Limpiar filtros
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`btn text-xs flex items-center gap-1 ${
              showFilters ? 'btn-primary' : 'btn-outline'
            }`}
          >
            <Filter className="w-3 h-3" />
            Filtros
          </button>
        </div>
      </div>

      {/* Búsqueda siempre visible */}
      <div className="mb-3 relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          className="input pl-9 w-full"
          placeholder="Buscar por código de bóveda, nombre o fecha..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Panel de filtros */}
      {showFilters && (
        <div className="card p-4 mb-3 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="label text-xs">Bóveda</label>
            <select
              className="input"
              value={vaultFilter}
              onChange={(e) =>
                setVaultFilter(e.target.value === '' ? '' : Number(e.target.value))
              }
            >
              <option value="">Todas</option>
              {vaults.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.code ? `${v.code} — ${v.name}` : v.name ?? `#${v.id}`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label text-xs">Desde</label>
            <input
              type="date"
              className="input"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="label text-xs">Hasta</label>
            <input
              type="date"
              className="input"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          <div>
            <label className="label text-xs">Tipo</label>
            <select
              className="input"
              value={showBlank}
              onChange={(e) => setShowBlank(e.target.value as typeof showBlank)}
            >
              <option value="all">Todos</option>
              <option value="with">Con movimientos</option>
              <option value="blank">En blanco (auto)</option>
            </select>
          </div>
        </div>
      )}

      {/* Tabla */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-text-muted gap-2">
          <p className="text-sm">
            {arqueos.length === 0
              ? 'No hay arqueos disponibles para modificar.'
              : 'Ningún arqueo coincide con los filtros aplicados.'}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="px-4 py-2 text-xs text-text-muted border-b border-border bg-surface/40">
            Mostrando {filtered.length} de {arqueos.length} arqueos
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted border-b border-border bg-surface">
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2">Bóveda</th>
                <th className="px-4 py-2 text-right">Apertura</th>
                <th className="px-4 py-2 text-right">Cierre</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2">Vence gracia</th>
                <th className="px-4 py-2">Días</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr
                  key={a.header_id}
                  className="border-b border-border/50 hover:bg-surface/40"
                >
                  <td className="px-4 py-2 font-medium">
                    {new Date(a.arqueo_date + 'T12:00:00').toLocaleDateString('es-MX')}
                  </td>
                  <td className="px-4 py-2 text-text-muted">
                    {a.vault_name ?? `Bóveda #${a.vault_id}`}
                    {a.vault_code && (
                      <span className="text-xs text-text-muted/70 ml-1">({a.vault_code})</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    ${formatMXN(a.opening_balance)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    ${formatMXN(a.closing_balance)}
                  </td>
                  <td className="px-4 py-2">
                    {a.auto_published ? (
                      <span className="badge badge-warning text-xs">Auto (en blanco)</span>
                    ) : (
                      <span className="badge badge-success text-xs">Con movimientos</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-text-muted text-xs">
                    {new Date(a.grace_deadline + 'T12:00:00').toLocaleDateString('es-MX')}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`badge text-xs ${
                        (a.days_remaining ?? 0) <= 3
                          ? 'badge-error'
                          : (a.days_remaining ?? 0) <= 7
                            ? 'badge-warning'
                            : 'badge-success'
                      }`}
                    >
                      {a.days_remaining}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <button
                      className="btn btn-outline text-xs py-1"
                      onClick={() =>
                        navigate(ROUTES.ETV_MODIFICATIONS + `/${a.header_id}`)
                      }
                    >
                      Modificar →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
