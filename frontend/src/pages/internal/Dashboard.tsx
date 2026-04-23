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

  const load = () => {
    setLoading(true);
    Promise.all([
      reportService.getSummary(),
      reportService.getMissingVaults(),
      reportService.getWeeklyTrend(),
      reportService.getDenominationDistribution(),
    ])
      .then(([s, m, t, d]) => {
        setSummary(s);
        setMissing(m);
        setTrend(t);
        setDenomDist(d);
      })
      .catch(() => setError('Error al cargar el dashboard.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

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
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Dashboard</h1>
          <p className="text-sm text-text-muted">
            {new Date().toLocaleDateString('es-MX', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            })}
          </p>
        </div>
        <button onClick={load} className="btn btn-outline text-sm">
          Actualizar
        </button>
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
