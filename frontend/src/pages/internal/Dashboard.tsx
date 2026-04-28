// Dashboard operativo para usuarios internos
import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import reportService, {
  DashboardSummary,
  MissingVault,
  WeeklyTrendPoint,
  DenominationPoint,
} from '@/services/reportService';
import userService, { type Company } from '@/services/userService';
import vaultService, { type Vault } from '@/services/vaultService';
import { POLLING_INTERVAL_MS } from '@/utils/constants';

type FilterMode = 'day' | 'month';

function monthBounds(yearMonth: string): { date_from: string; date_to: string } {
  // yearMonth = "2026-04"
  const [y, m] = yearMonth.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    date_from: `${y}-${String(m).padStart(2, '0')}-01`,
    date_to: `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

const formatMXN = (v: string | number) =>
  parseFloat(String(v)).toLocaleString('es-MX', { minimumFractionDigits: 2 });

// ─── Card de métrica ─────────────────────────────────────────────────────────

function MetricCard({
  title,
  value,
  subtitle,
  accent,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  accent?: 'success' | 'error' | 'warning' | 'info' | 'neutral';
}) {
  const accentClass = {
    success: 'border-l-success',
    error: 'border-l-error',
    warning: 'border-l-warning',
    info: 'border-l-info',
    neutral: 'border-l-border',
  }[accent || 'neutral'];

  return (
    <div className={`card p-4 border-l-4 ${accentClass}`}>
      <p className="text-xs text-text-muted">{title}</p>
      <p className="text-2xl font-bold text-text-primary mt-1">{value}</p>
      {subtitle && <p className="text-xs text-text-muted mt-1">{subtitle}</p>}
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [missing, setMissing] = useState<MissingVault[]>([]);
  const [trend, setTrend] = useState<WeeklyTrendPoint[]>([]);
  const [denomDist, setDenomDist] = useState<DenominationPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ─── Filtros que afectan TODOS los charts ─────────────────────────────────
  const [companies, setCompanies] = useState<Company[]>([]);
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [filterMode, setFilterMode] = useState<FilterMode>('day');
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  const [filterDate, setFilterDate] = useState<string>(today);
  const [filterMonth, setFilterMonth] = useState<string>(today.slice(0, 7));
  const [filterCompanyId, setFilterCompanyId] = useState<number | ''>('');
  const [filterVaultId, setFilterVaultId] = useState<number | ''>('');

  // Cargar catálogos una vez
  useEffect(() => {
    userService.listCompanies()
      .then((cs) => setCompanies(cs.filter((c) => c.is_active)))
      .catch(() => {});
    vaultService.listVaults({ page: 1, page_size: 0 })
      .then((p) => setVaults(p.items))
      .catch(() => {});
  }, []);

  // Cuando cambia ETV, limpiar bóveda si no pertenece a esa ETV
  useEffect(() => {
    if (filterCompanyId === '' || filterVaultId === '') return;
    const v = vaults.find((x) => x.id === filterVaultId);
    if (v && v.company_id !== filterCompanyId) setFilterVaultId('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCompanyId]);

  const filteredVaults = filterCompanyId === ''
    ? vaults
    : vaults.filter((v) => v.company_id === filterCompanyId);

  const buildFilters = (): {
    target_date?: string;
    date_from?: string;
    date_to?: string;
    company_id?: number;
    vault_id?: number;
  } => {
    const base: Record<string, string | number | undefined> = {
      company_id: filterCompanyId === '' ? undefined : filterCompanyId,
      vault_id: filterVaultId === '' ? undefined : filterVaultId,
    };
    if (filterMode === 'month') {
      const { date_from, date_to } = monthBounds(filterMonth);
      base.date_from = date_from;
      base.date_to = date_to;
    } else {
      base.target_date = filterDate || undefined;
    }
    return base;
  };

  const load = (silent = false) => {
    if (!silent) setLoading(true);
    const baseFilters = buildFilters();
    const trendFilters = {
      company_id: filterCompanyId === '' ? undefined : filterCompanyId,
      vault_id: filterVaultId === '' ? undefined : filterVaultId,
      end_date:
        filterMode === 'month'
          ? monthBounds(filterMonth).date_to
          : filterDate || undefined,
    };
    Promise.all([
      reportService.getSummary(baseFilters),
      reportService.getMissingVaults(baseFilters),
      reportService.getWeeklyTrend(trendFilters),
      reportService.getDenominationDistribution(baseFilters),
    ])
      .then(([s, m, t, d]) => {
        setSummary(s);
        setMissing(m);
        setTrend(t);
        setDenomDist(d);
        setError('');
      })
      .catch(() => setError('Error al cargar el dashboard.'))
      .finally(() => {
        if (!silent) setLoading(false);
      });
  };

  // Recargar cuando cambia algún filtro
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterMode, filterDate, filterMonth, filterCompanyId, filterVaultId]);

  useEffect(() => {
    // Refresco silencioso cada 30 minutos respetando los filtros actuales
    const interval = setInterval(() => load(true), POLLING_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterMode, filterDate, filterMonth, filterCompanyId, filterVaultId]);

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

  // Datos de tendencia formateados para Recharts
  const trendData = trend.map((p) => ({
    date: new Date(p.date + 'T12:00:00').toLocaleDateString('es-MX', { month: 'short', day: 'numeric' }),
    Publicados: p.published_count,
    Entradas: parseFloat(p.total_entries) / 1000, // en miles
    Salidas: parseFloat(p.total_withdrawals) / 1000,
  }));

  const denomData = denomDist
    .filter((d) => parseFloat(d.total) > 0)
    .map((d) => ({
      name: d.denomination,
      Total: parseFloat(d.total) / 1000,
    }));

  return (
    <div className="space-y-6">
      {/* Header con filtros */}
      <div className="space-y-3">
        <div className="flex flex-wrap justify-between items-end gap-3">
          <div>
            <h1 className="text-xl font-semibold text-text-primary">Dashboard</h1>
            <p className="text-sm text-text-muted">
              {filterMode === 'day'
                ? filterDate
                  ? new Date(filterDate + 'T12:00:00').toLocaleDateString('es-MX', {
                      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                    })
                  : 'Selecciona una fecha'
                : new Date(filterMonth + '-15T12:00:00').toLocaleDateString('es-MX', {
                    month: 'long', year: 'numeric',
                  })}
            </p>
          </div>
          <button onClick={() => load()} className="btn btn-outline text-sm">
            Actualizar
          </button>
        </div>

        <div className="card p-3 flex flex-wrap items-end gap-2">
          {/* Toggle día/mes */}
          <div className="inline-flex rounded border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setFilterMode('day')}
              className={`px-3 py-1.5 text-xs ${
                filterMode === 'day'
                  ? 'bg-primary text-white'
                  : 'bg-white text-text-secondary hover:bg-surface'
              }`}
            >
              Día
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('month')}
              className={`px-3 py-1.5 text-xs ${
                filterMode === 'month'
                  ? 'bg-primary text-white'
                  : 'bg-white text-text-secondary hover:bg-surface'
              }`}
            >
              Mes
            </button>
          </div>

          {filterMode === 'day' ? (
            <div>
              <label className="text-xs text-text-muted block mb-1">Fecha</label>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="input text-sm w-40"
              />
            </div>
          ) : (
            <div>
              <label className="text-xs text-text-muted block mb-1">Mes</label>
              <input
                type="month"
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="input text-sm w-40"
              />
            </div>
          )}

          <div>
            <label className="text-xs text-text-muted block mb-1">ETV</label>
            <select
              value={filterCompanyId}
              onChange={(e) =>
                setFilterCompanyId(e.target.value === '' ? '' : Number(e.target.value))
              }
              className="input text-sm w-44"
            >
              <option value="">Todas</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-text-muted block mb-1">Bóveda</label>
            <select
              value={filterVaultId}
              onChange={(e) =>
                setFilterVaultId(e.target.value === '' ? '' : Number(e.target.value))
              }
              className="input text-sm w-52"
              disabled={filteredVaults.length === 0}
            >
              <option value="">Todas</option>
              {filteredVaults.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.vault_code} — {v.vault_name}
                </option>
              ))}
            </select>
          </div>

          {(filterCompanyId !== '' ||
            filterVaultId !== '' ||
            filterMode !== 'day' ||
            filterDate !== today) && (
            <button
              onClick={() => {
                setFilterCompanyId('');
                setFilterVaultId('');
                setFilterMode('day');
                setFilterDate(today);
                setFilterMonth(today.slice(0, 7));
              }}
              className="btn btn-ghost text-xs"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Cards de métricas */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <MetricCard
            title="Bóvedas activas"
            value={summary.total_vaults}
            accent="neutral"
          />
          <MetricCard
            title="Arqueos publicados"
            value={summary.published_count}
            accent="success"
          />
          <MetricCard
            title="Bóvedas faltantes"
            value={summary.missing_count}
            accent={summary.missing_count > 0 ? 'error' : 'success'}
          />
          <MetricCard
            title="Saldo negativo"
            value={summary.negative_balance_count}
            accent={summary.negative_balance_count > 0 ? 'warning' : 'success'}
          />
          <MetricCard
            title="Total entradas"
            value={`$${formatMXN(summary.total_entries)}`}
            accent="info"
          />
          <MetricCard
            title="Total salidas"
            value={`$${formatMXN(summary.total_withdrawals)}`}
            accent="neutral"
          />
        </div>
      )}

      {/* Gráficas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tendencia semanal */}
        <div className="card p-4">
          <h2 className="font-medium text-sm text-text-primary mb-4">
            Tendencia semanal (últimos 7 días)
          </h2>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value, name) =>
                    name === 'Publicados' ? value : `$${Number(value).toLocaleString('es-MX')}K`
                  }
                />
                <Legend />
                <Bar dataKey="Publicados" fill="#4A5D23" />
                <Bar dataKey="Entradas" fill="#388E3C" />
                <Bar dataKey="Salidas" fill="#D32F2F" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-text-muted text-xs text-center py-8">Sin datos</p>
          )}
        </div>

        {/* Distribución por denominación */}
        <div className="card p-4">
          <h2 className="font-medium text-sm text-text-primary mb-4">
            Distribución por denominación (hoy, en miles)
          </h2>
          {denomData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={denomData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="name" type="category" width={55} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => `$${Number(v).toLocaleString('es-MX')}K`} />
                <Bar dataKey="Total" fill="#B8860B" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-text-muted text-xs text-center py-8">Sin datos hoy</p>
          )}
        </div>
      </div>

      {/* Bóvedas faltantes */}
      {missing.length > 0 && (
        <div className="card p-4">
          <h2 className="font-medium text-sm text-text-primary mb-3">
            Bóvedas sin arqueo hoy
            <span className="ml-2 badge badge-error text-xs">{missing.length}</span>
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {missing.map((v) => (
              <div
                key={v.vault_id}
                className="px-3 py-2 bg-error/5 border border-error/20 rounded text-xs"
              >
                <p className="font-semibold text-text-primary">{v.vault_code}</p>
                <p className="text-text-muted truncate">{v.vault_name}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
