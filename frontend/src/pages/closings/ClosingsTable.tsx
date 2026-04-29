// Saldos finales — tabla mensual de cierres por bóveda
import { useEffect, useMemo, useState, useCallback } from 'react';
import { Eye, EyeOff } from 'lucide-react';

import arqueoService, {
  type DailyClosingItem,
  type MonthlyClosingsResponse,
} from '@/services/arqueoService';
import vaultService, { type Vault } from '@/services/vaultService';
import ComboSelect from '@/components/ui/ComboSelect';
import { useAuthStore } from '@/store/authStore';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { DENOMINATIONS } from '@/utils/constants';
import { getErrorMessage } from '@/services/api';

type VaultOption = {
  id: number;
  vault_code: string;
  vault_name: string;
  is_active: boolean;
};

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function currentYearMonth() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export default function ClosingsTable() {
  const { user } = useAuthStore();
  const isEtv = user?.role === 'etv';

  // Universo completo de bóvedas (activas + inactivas) para roles internos.
  // Para ETV solo se cargan sus bóvedas asignadas (que ya son activas).
  const [allVaults, setAllVaults] = useState<VaultOption[]>([]);
  const [vaultId, setVaultId] = useState<number | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const initial = currentYearMonth();
  const [yearMonth, setYearMonth] = useState<string>(
    `${initial.year}-${pad2(initial.month)}`,
  );

  const [data, setData] = useState<MonthlyClosingsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [vaultsLoading, setVaultsLoading] = useState(false);
  const [error, setError] = useState('');

  // Cargar universo de bóvedas según rol
  useEffect(() => {
    let alive = true;
    setVaultsLoading(true);
    (async () => {
      try {
        if (isEtv) {
          const my = await arqueoService.getMyVaults();
          if (!alive) return;
          const opts: VaultOption[] = my.map((m) => ({
            id: m.vault.id,
            vault_code: m.vault.vault_code,
            vault_name: m.vault.vault_name,
            is_active: true,
          }));
          setAllVaults(opts);
          if (opts.length > 0) setVaultId(opts[0].id);
        } else {
          const res = await vaultService.listVaults({
            page: 1,
            page_size: 0,
            include_inactive: true,
          });
          if (!alive) return;
          const opts: VaultOption[] = res.items.map((v: Vault) => ({
            id: v.id,
            vault_code: v.vault_code,
            vault_name: v.vault_name,
            is_active: v.is_active,
          }));
          setAllVaults(opts);
          // Default: primera activa
          const firstActive = opts.find((o) => o.is_active);
          if (firstActive) setVaultId(firstActive.id);
        }
      } catch (err) {
        if (alive) setError(getErrorMessage(err));
      } finally {
        if (alive) setVaultsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [isEtv]);

  // Vista filtrada según el toggle activas/inactivas
  const visibleVaults = useMemo(
    () => allVaults.filter((v) => (showInactive ? !v.is_active : v.is_active)),
    [allVaults, showInactive],
  );

  // Si la bóveda seleccionada deja de pertenecer a la vista actual, mover
  // la selección a la primera de la vista (o limpiar si está vacía).
  useEffect(() => {
    if (!vaultId) {
      if (visibleVaults.length > 0) setVaultId(visibleVaults[0].id);
      return;
    }
    const stillVisible = visibleVaults.some((v) => v.id === vaultId);
    if (!stillVisible) {
      setVaultId(visibleVaults[0]?.id ?? null);
    }
  }, [visibleVaults, vaultId]);

  const comboOptions = useMemo(
    () =>
      visibleVaults.map((v) => ({
        value: v.id,
        label: `${v.vault_code} — ${v.vault_name}`,
      })),
    [visibleVaults],
  );

  const inactiveCount = useMemo(
    () => allVaults.filter((v) => !v.is_active).length,
    [allVaults],
  );

  const loadClosings = useCallback(async () => {
    if (!vaultId || !yearMonth) {
      setData(null);
      return;
    }
    const [yStr, mStr] = yearMonth.split('-');
    const year = Number(yStr);
    const month = Number(mStr);
    if (!Number.isFinite(year) || !Number.isFinite(month)) return;

    setLoading(true);
    setError('');
    try {
      const res = await arqueoService.getMonthlyClosings(vaultId, year, month);
      setData(res);
    } catch (err) {
      setError(getErrorMessage(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [vaultId, yearMonth]);

  useEffect(() => {
    loadClosings();
  }, [loadClosings]);

  const totals = useMemo(() => {
    if (!data || data.items.length === 0) return null;
    const sums: Record<string, number> = {};
    DENOMINATIONS.forEach((d) => (sums[d.key] = 0));
    let totalClosing = 0;
    for (const it of data.items) {
      DENOMINATIONS.forEach((d) => {
        sums[d.key] += parseFloat(it[d.key as keyof DailyClosingItem] as string) || 0;
      });
      totalClosing += parseFloat(it.closing_balance) || 0;
    }
    return { sums, totalClosing };
  }, [data]);

  const exportCsv = () => {
    if (!data || data.items.length === 0) return;
    const header = [
      'Fecha',
      'Estado',
      ...DENOMINATIONS.map((d) => d.label),
      'Total cierre',
    ];
    const rows = data.items.map((it) => [
      it.arqueo_date,
      it.status,
      ...DENOMINATIONS.map((d) =>
        String(it[d.key as keyof DailyClosingItem] ?? '0'),
      ),
      it.closing_balance,
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((cell) =>
            typeof cell === 'string' && /[",\n]/.test(cell)
              ? `"${cell.replace(/"/g, '""')}"`
              : cell,
          )
          .join(','),
      )
      .join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `saldos_finales_${data.vault_code}_${data.year}-${pad2(data.month)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedVault = visibleVaults.find((v) => v.id === vaultId);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-xl font-semibold text-text-primary">Saldos Finales</h1>
        <button
          onClick={exportCsv}
          disabled={!data || data.items.length === 0}
          className="btn-outline text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Exportar CSV
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-background rounded-xl border border-border p-4 mb-4 flex items-end gap-4 flex-wrap shadow-soft">
        <div className="min-w-[280px] flex-1 max-w-md">
          <label className="label">
            Bóveda{showInactive ? ' (inactivas)' : ''}
          </label>
          <ComboSelect
            options={comboOptions}
            value={vaultId}
            onChange={(v) => setVaultId(v)}
            placeholder={
              vaultsLoading
                ? 'Cargando bóvedas...'
                : visibleVaults.length === 0
                ? showInactive
                  ? 'No hay bóvedas inactivas'
                  : 'Sin bóvedas disponibles'
                : 'Buscar bóveda por código o nombre...'
            }
            emptyLabel="Sin coincidencias"
            disabled={vaultsLoading || visibleVaults.length === 0}
          />
        </div>

        <div>
          <label className="label">Mes</label>
          <input
            type="month"
            className="input"
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
            max={`${initial.year}-${pad2(initial.month)}`}
          />
        </div>

        {/* Toggle activas/inactivas — solo para roles internos */}
        {!isEtv && (
          <button
            type="button"
            onClick={() => setShowInactive((v) => !v)}
            className="btn-outline text-sm flex items-center gap-2 self-end"
            title={
              showInactive
                ? 'Volver a la lista de bóvedas activas'
                : 'Ver bóvedas inactivas'
            }
          >
            {showInactive ? (
              <>
                <Eye className="w-4 h-4" />
                Ver activas
              </>
            ) : (
              <>
                <EyeOff className="w-4 h-4" />
                Ver inactivas
                {inactiveCount > 0 && (
                  <span className="ml-1 text-[11px] bg-surface px-1.5 py-0.5 rounded-md text-text-muted">
                    {inactiveCount}
                  </span>
                )}
              </>
            )}
          </button>
        )}

        <div className="text-xs text-text-muted ml-auto">
          {data && (
            <>
              Bóveda{' '}
              <span className="font-mono text-primary font-semibold">
                {data.vault_code}
              </span>{' '}
              {selectedVault && !selectedVault.is_active && (
                <span className="badge-neutral ml-1">Inactiva</span>
              )}
              {' '}— {data.items.length} día{data.items.length === 1 ? '' : 's'} con
              cierre
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-status-error-light border border-status-error rounded p-3 text-sm text-status-error mb-4">
          {error}
        </div>
      )}

      {data?.unmigrated && (
        <div className="bg-status-warning-light border border-status-warning rounded p-3 text-xs text-status-warning mb-4">
          Esta bóveda está sin desglose por denominación al inicio del mes.
          Los importes mostrados reflejan únicamente los movimientos del período,
          no el stock real por denominación.
        </div>
      )}

      <div className="bg-background rounded-xl border border-border overflow-x-auto shadow-soft">
        {loading ? (
          <div className="p-10 text-center text-sm text-text-muted">
            Cargando saldos...
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="p-10 text-center text-sm text-text-muted">
            {visibleVaults.length === 0
              ? showInactive
                ? 'No hay bóvedas inactivas para mostrar.'
                : 'No hay bóvedas activas disponibles.'
              : 'No hay arqueos publicados en este mes para esta bóveda.'}
          </div>
        ) : (
          <table className="min-w-full text-xs">
            <thead className="bg-surface text-text-secondary uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left sticky left-0 bg-surface z-10">
                  Fecha
                </th>
                <th className="px-3 py-2 text-left">Estado</th>
                {DENOMINATIONS.map((d) => (
                  <th key={d.key} className="px-2 py-2 text-right whitespace-nowrap">
                    {d.label}
                  </th>
                ))}
                <th className="px-3 py-2 text-right bg-primary/5 font-semibold">
                  Total cierre
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.items.map((it) => (
                <tr
                  key={it.arqueo_date}
                  className="hover:bg-surface/50 transition-colors"
                >
                  <td className="px-3 py-2 font-mono whitespace-nowrap sticky left-0 bg-background">
                    {formatDate(it.arqueo_date)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        it.is_anchor
                          ? 'badge-info'
                          : it.status === 'locked'
                          ? 'badge-neutral'
                          : 'badge-success'
                      }
                    >
                      {it.is_anchor
                        ? 'Inicio'
                        : it.status === 'locked'
                        ? 'Bloqueado'
                        : 'Publicado'}
                    </span>
                  </td>
                  {DENOMINATIONS.map((d) => {
                    const v = parseFloat(
                      it[d.key as keyof DailyClosingItem] as string,
                    ) || 0;
                    return (
                      <td
                        key={d.key}
                        className={`px-2 py-2 text-right font-mono ${
                          v < 0 ? 'text-status-error' : ''
                        }`}
                      >
                        {v === 0 ? (
                          <span className="text-text-muted">—</span>
                        ) : (
                          formatCurrency(v)
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right font-mono font-semibold bg-primary/5 whitespace-nowrap">
                    {formatCurrency(it.closing_balance)}
                  </td>
                </tr>
              ))}
              {totals && (
                <tr className="bg-surface font-semibold">
                  <td
                    className="px-3 py-2 sticky left-0 bg-surface"
                    colSpan={2}
                  >
                    Suma del mes
                  </td>
                  {DENOMINATIONS.map((d) => (
                    <td
                      key={d.key}
                      className="px-2 py-2 text-right font-mono"
                    >
                      {totals.sums[d.key] === 0 ? (
                        <span className="text-text-muted">—</span>
                      ) : (
                        formatCurrency(totals.sums[d.key])
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-mono bg-primary/10 whitespace-nowrap">
                    {formatCurrency(totals.totalClosing)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
