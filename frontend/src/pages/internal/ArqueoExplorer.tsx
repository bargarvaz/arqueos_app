// Explorador de arqueos — drill-down: Bóvedas → Vista mensual
import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronRight, ChevronLeft, AlertTriangle } from 'lucide-react';
import vaultService, { Vault } from '@/services/vaultService';
import explorerService, { ExplorerRecord, ExplorerFilters, VaultDayBalance } from '@/services/explorerService';
import { DENOMINATIONS } from '@/utils/constants';
import { useAuthStore } from '@/store/authStore';
import ReportFromArqueoModal from '@/components/errorReports/ReportFromArqueoModal';

const fmt = (v: number | string) =>
  parseFloat(String(v)).toLocaleString('es-MX', { minimumFractionDigits: 2 });

const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-warning',
  published: 'badge-success',
  locked: 'badge-info',
};
const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador', published: 'Publicado', locked: 'Bloqueado',
};

function monthBounds(year: number, month: number): { dateFrom: string; dateTo: string } {
  const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`;
  const last = new Date(year, month, 0).getDate();
  const dateTo = `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  return { dateFrom, dateTo };
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
}

// ─── Nivel 1: lista de bóvedas ────────────────────────────────────────────────

function VaultList({ onSelect }: { onSelect: (v: Vault) => void }) {
  const [balances, setBalances] = useState<VaultDayBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    explorerService.getVaultBalances(today)
      .then(setBalances)
      .catch(() => setBalances([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = balances.filter(
    (b) =>
      !search ||
      b.vault_code.toLowerCase().includes(search.toLowerCase()) ||
      b.vault_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text-primary">Explorador de Arqueos</h1>
        <input
          type="text"
          className="input w-64 text-sm"
          placeholder="Buscar bóveda..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card overflow-hidden p-0">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-text-muted text-sm py-12">Sin bóvedas activas.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface border-b border-border">
              <tr className="text-left text-text-muted">
                <th className="px-4 py-2">Código</th>
                <th className="px-4 py-2">Nombre</th>
                <th className="px-4 py-2 text-right">Saldo apertura hoy</th>
                <th className="px-4 py-2 text-right">Saldo actual</th>
                <th className="px-4 py-2 text-center">Estado hoy</th>
                <th className="px-4 py-2 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((b) => (
                <tr
                  key={b.vault_id}
                  className="hover:bg-surface/60 cursor-pointer"
                  onClick={() => onSelect({ id: b.vault_id, vault_code: b.vault_code, vault_name: b.vault_name } as Vault)}
                >
                  <td className="px-4 py-2 font-mono font-semibold text-primary text-xs">{b.vault_code}</td>
                  <td className="px-4 py-2">{b.vault_name}</td>
                  <td className="px-4 py-2 font-mono text-right text-xs">${fmt(b.opening_balance)}</td>
                  <td className="px-4 py-2 font-mono text-right text-xs font-semibold">${fmt(b.closing_balance)}</td>
                  <td className="px-4 py-2 text-center">
                    {b.status ? (
                      <span className={`badge text-xs ${STATUS_BADGE[b.status] ?? 'badge-neutral'}`}>
                        {STATUS_LABEL[b.status] ?? b.status}
                      </span>
                    ) : (
                      <span className="text-text-muted text-xs">Sin arqueo</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-text-muted">
                    <ChevronRight className="w-4 h-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Nivel 2: vista mensual de una bóveda ────────────────────────────────────

function MonthView({ vault }: { vault: Vault }) {
  const now = new Date();
  const { user } = useAuthStore();
  const canReport = user?.role === 'admin' || user?.role === 'operations';
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [records, setRecords] = useState<ExplorerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [includeCounterparts, setIncludeCounterparts] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [reportContext, setReportContext] = useState<{
    headerId: number;
    contextLabel: string;
    records: { id: number; voucher: string; reference: string; movement_type_name?: string | null }[];
    initialSelected: number[];
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { dateFrom, dateTo } = monthBounds(year, month);
    const filters: ExplorerFilters = {
      vault_id: vault.id,
      date_from: dateFrom,
      date_to: dateTo,
      include_counterparts: includeCounterparts,
      page_size: 0,
    };
    try {
      const data = await explorerService.getRecords(filters);
      setRecords(data.items ?? data);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [vault.id, year, month, includeCounterparts]);

  useEffect(() => { load(); }, [load]);

  const prevMonth = () => {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    const nowDate = new Date();
    if (year > nowDate.getFullYear() || (year === nowDate.getFullYear() && month >= nowDate.getMonth() + 1)) return;
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
  };

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  // Agrupar por fecha
  const byDate = records.reduce<Record<string, ExplorerRecord[]>>((acc, r) => {
    (acc[r.arqueo_date] ??= []).push(r);
    return acc;
  }, {});
  const dates = Object.keys(byDate).sort();

  // Totales del mes (sin contrapartidas)
  const main = records.filter((r) => !r.is_counterpart);
  const totalEntries = main.reduce((s, r) => s + r.entries, 0);
  const totalWithdrawals = main.reduce((s, r) => s + r.withdrawals, 0);

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError('');
    const { dateFrom, dateTo } = monthBounds(year, month);
    try {
      await explorerService.downloadXlsx({
        vault_id: vault.id,
        date_from: dateFrom,
        date_to: dateTo,
        include_counterparts: includeCounterparts,
      });
    } catch {
      setDownloadError('Error al exportar. Verifica tu conexión e intenta de nuevo.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Controles de mes */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="btn btn-ghost p-1.5"
            title="Mes anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-base font-semibold text-text-primary capitalize w-48 text-center">
            {monthLabel(year, month)}
          </span>
          <button
            onClick={nextMonth}
            disabled={isCurrentMonth}
            className="btn btn-ghost p-1.5 disabled:opacity-30"
            title="Mes siguiente"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={includeCounterparts}
              onChange={(e) => setIncludeCounterparts(e.target.checked)}
              className="w-4 h-4"
            />
            Incluir contrapartidas
          </label>
          <div className="flex flex-col items-end gap-1">
            <button
              className="btn btn-outline text-xs"
              onClick={handleDownload}
              disabled={downloading || records.length === 0}
            >
              {downloading ? 'Descargando...' : '↓ Exportar XLSX'}
            </button>
            {downloadError && (
              <p className="text-xs text-status-error">{downloadError}</p>
            )}
          </div>
        </div>
      </div>

      {/* Resumen del mes */}
      {!loading && records.length > 0 && (
        <div className="card p-3 flex flex-wrap gap-6 text-sm">
          <div>
            <p className="text-xs text-text-muted">Días con arqueo</p>
            <p className="font-semibold">{dates.length}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Total entradas</p>
            <p className="font-semibold font-mono text-success">${fmt(totalEntries)}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Total salidas</p>
            <p className="font-semibold font-mono text-error">${fmt(totalWithdrawals)}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Neto del mes</p>
            <p className={`font-semibold font-mono ${totalEntries - totalWithdrawals < 0 ? 'text-error' : 'text-text-primary'}`}>
              ${fmt(totalEntries - totalWithdrawals)}
            </p>
          </div>
        </div>
      )}

      {/* Tabla por día */}
      <div className="card overflow-x-auto p-0">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : dates.length === 0 ? (
          <p className="text-center text-text-muted text-sm py-12">
            Sin registros para {monthLabel(year, month)}.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface border-b border-border sticky top-0 z-10">
              <tr className="text-left text-text-muted">
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Comprobante</th>
                <th className="px-3 py-2">Referencia</th>
                <th className="px-3 py-2">Sucursal</th>
                <th className="px-3 py-2">Tipo movimiento</th>
                <th className="px-3 py-2 text-right">Entradas</th>
                <th className="px-3 py-2 text-right">Salidas</th>
                <th className="px-3 py-2 text-right w-24">{canReport ? 'Reportar' : ''}</th>
              </tr>
            </thead>
            <tbody>
              {dates.map((d) => {
                const dayRecords = byDate[d];
                const dayMain = dayRecords.filter((r) => !r.is_counterpart);
                const dayEntries = dayMain.reduce((s, r) => s + r.entries, 0);
                const dayWithdrawals = dayMain.reduce((s, r) => s + r.withdrawals, 0);
                const dayStatus = dayRecords[0]?.header_status;

                const dayHeaderId = dayRecords[0]?.arqueo_header_id;
                const dayDateLabel = new Date(d + 'T12:00:00').toLocaleDateString('es-MX', {
                  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                });

                return [
                  // Sub-encabezado del día
                  <tr key={`hd-${d}`} className="bg-surface/60 border-y border-border/60">
                    <td
                      colSpan={5}
                      className="px-3 py-1.5 text-xs font-semibold text-text-secondary"
                    >
                      {new Date(d + 'T12:00:00').toLocaleDateString('es-MX', {
                        weekday: 'long', day: 'numeric', month: 'long',
                      })}
                      {dayStatus && (
                        <span className={`badge text-xs ml-2 ${STATUS_BADGE[dayStatus] ?? 'badge-neutral'}`}>
                          {STATUS_LABEL[dayStatus] ?? dayStatus}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right text-xs font-semibold text-success font-mono">
                      {dayEntries > 0 ? `$${fmt(dayEntries)}` : ''}
                    </td>
                    <td className="px-3 py-1.5 text-right text-xs font-semibold text-error font-mono">
                      {dayWithdrawals > 0 ? `$${fmt(dayWithdrawals)}` : ''}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {canReport && dayHeaderId && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setReportContext({
                              headerId: dayHeaderId,
                              contextLabel: `${vault.vault_code} — ${vault.vault_name} · ${dayDateLabel}`,
                              records: dayMain.map((r) => ({
                                id: r.record_id,
                                voucher: r.voucher,
                                reference: r.reference,
                                movement_type_name: r.movement_type_name,
                              })),
                              initialSelected: [],
                            });
                          }}
                          className="text-[11px] text-warning hover:underline flex items-center gap-1 ml-auto"
                          title="Reportar error en este arqueo"
                        >
                          <AlertTriangle className="w-3 h-3" />
                          Reportar
                        </button>
                      )}
                    </td>
                  </tr>,

                  // Filas de registros del día
                  ...dayRecords.flatMap((rec) => {
                    const isExpanded = expandedId === rec.record_id;
                    const activeAmount = rec.entries > 0 ? rec.entries : rec.withdrawals;
                    const bills = DENOMINATIONS.filter((d) => d.type === 'bill');
                    const coins = DENOMINATIONS.filter((d) => d.type === 'coin');

                    return [
                      <tr
                        key={rec.record_id}
                        onClick={() => setExpandedId(isExpanded ? null : rec.record_id)}
                        className={`border-b border-border/30 cursor-pointer select-none ${
                          isExpanded ? 'bg-primary/5' :
                          rec.is_counterpart ? 'opacity-60 italic bg-surface/20 hover:bg-surface/30' :
                          'hover:bg-surface/30'
                        }`}
                      >
                        <td className="px-3 py-1.5 text-xs text-text-muted">
                          <span className="text-primary/60">{isExpanded ? '▲' : '▼'}</span>
                        </td>
                        <td className="px-3 py-1.5 text-xs">
                          {rec.is_counterpart && (
                            <span className={`badge text-xs mr-1 ${rec.counterpart_type === 'cancellation' ? 'badge-error' : 'badge-warning'}`}>
                              {rec.counterpart_type === 'cancellation' ? 'CANC.' : 'MOD.'}
                            </span>
                          )}
                          {rec.voucher}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-text-muted">{rec.reference}</td>
                        <td className="px-3 py-1.5 text-xs">{rec.branch_name || '—'}</td>
                        <td className="px-3 py-1.5 text-xs">{rec.movement_type_name}</td>
                        <td className="px-3 py-1.5 text-right text-success font-mono text-xs">
                          {rec.entries > 0 ? `$${fmt(rec.entries)}` : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-right text-error font-mono text-xs">
                          {rec.withdrawals > 0 ? `$${fmt(rec.withdrawals)}` : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          {canReport && !rec.is_counterpart && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setReportContext({
                                  headerId: rec.arqueo_header_id,
                                  contextLabel: `${vault.vault_code} — ${vault.vault_name} · ${dayDateLabel} · Comprobante ${rec.voucher}`,
                                  records: dayMain.map((r) => ({
                                    id: r.record_id,
                                    voucher: r.voucher,
                                    reference: r.reference,
                                    movement_type_name: r.movement_type_name,
                                  })),
                                  initialSelected: [rec.record_id],
                                });
                              }}
                              className="text-warning hover:text-warning/80"
                              title="Reportar error en este registro"
                            >
                              <AlertTriangle className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>,

                      // Panel de denominaciones
                      isExpanded && (
                        <tr key={`denom-${rec.record_id}`} className="bg-primary/5 border-b border-border/30">
                          <td colSpan={8} className="px-6 py-3">
                            <div className="space-y-2">
                              <p className="text-xs font-semibold text-text-secondary mb-2">
                                Desglose de denominaciones — monto: <span className="font-mono">${fmt(activeAmount)}</span>
                              </p>

                              {/* Billetes */}
                              <div>
                                <p className="text-xs text-text-muted mb-1 font-medium">Billetes</p>
                                <div className="flex flex-wrap gap-x-5 gap-y-1">
                                  {bills.map((d) => {
                                    const val = (rec as unknown as Record<string, number>)[d.key] ?? 0;
                                    return val > 0 ? (
                                      <span key={d.key} className="text-xs font-mono">
                                        <span className="text-text-muted">{d.label}:</span>{' '}
                                        <span className="font-semibold">${fmt(val)}</span>
                                      </span>
                                    ) : null;
                                  })}
                                  {bills.every((d) => !((rec as unknown as Record<string, number>)[d.key] ?? 0)) && (
                                    <span className="text-xs text-text-muted italic">Sin billetes</span>
                                  )}
                                </div>
                              </div>

                              {/* Monedas */}
                              <div>
                                <p className="text-xs text-text-muted mb-1 font-medium">Monedas</p>
                                <div className="flex flex-wrap gap-x-5 gap-y-1">
                                  {coins.map((d) => {
                                    const val = (rec as unknown as Record<string, number>)[d.key] ?? 0;
                                    return val > 0 ? (
                                      <span key={d.key} className="text-xs font-mono">
                                        <span className="text-text-muted">{d.label}:</span>{' '}
                                        <span className="font-semibold">${fmt(val)}</span>
                                      </span>
                                    ) : null;
                                  })}
                                  {coins.every((d) => !((rec as unknown as Record<string, number>)[d.key] ?? 0)) && (
                                    <span className="text-xs text-text-muted italic">Sin monedas</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ),
                    ].filter(Boolean);
                  }),
                ];
              })}
            </tbody>

            {/* Total del mes */}
            <tfoot className="border-t-2 border-border bg-surface/60">
              <tr>
                <td colSpan={5} className="px-3 py-2 text-xs font-semibold text-text-secondary text-right">
                  Total del mes
                </td>
                <td className="px-3 py-2 text-right text-success font-semibold font-mono text-xs">
                  ${fmt(totalEntries)}
                </td>
                <td className="px-3 py-2 text-right text-error font-semibold font-mono text-xs">
                  ${fmt(totalWithdrawals)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {reportContext && (
        <ReportFromArqueoModal
          arqueoHeaderId={reportContext.headerId}
          contextLabel={reportContext.contextLabel}
          records={reportContext.records}
          initialSelected={reportContext.initialSelected}
          onClose={() => setReportContext(null)}
        />
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ArqueoExplorer() {
  // El vault seleccionado vive en la URL (?vault=ID) para que back/forward del
  // navegador funcione naturalmente en el drill-down.
  const [searchParams, setSearchParams] = useSearchParams();
  const vaultIdParam = searchParams.get('vault');
  const [selectedVault, setSelectedVault] = useState<Vault | null>(null);
  const [resolving, setResolving] = useState(false);

  const handleSelectVault = (v: Vault | null) => {
    if (v) {
      setSelectedVault(v);
      setSearchParams({ vault: String(v.id) });
    } else {
      setSelectedVault(null);
      setSearchParams({});
    }
  };

  // Si llega ?vault= pero no tenemos el vault aún (hard-reload o forward),
  // resolverlo desde el backend.
  useEffect(() => {
    if (!vaultIdParam) {
      setSelectedVault(null);
      return;
    }
    const id = Number(vaultIdParam);
    if (selectedVault?.id === id) return;
    setResolving(true);
    vaultService
      .getVault(id)
      .then(setSelectedVault)
      .catch(() => {
        setSelectedVault(null);
        setSearchParams({});
      })
      .finally(() => setResolving(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultIdParam]);

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-text-muted">
        <button
          onClick={() => handleSelectVault(null)}
          className={`hover:text-primary ${!selectedVault ? 'text-text-primary font-medium' : ''}`}
        >
          Explorador
        </button>
        {selectedVault && (
          <>
            <ChevronRight className="w-4 h-4 shrink-0" />
            <span className="text-text-primary font-medium">
              <span className="font-mono">{selectedVault.vault_code}</span>
              <span className="ml-1 text-text-muted hidden sm:inline">— {selectedVault.vault_name}</span>
            </span>
          </>
        )}
      </nav>

      {resolving ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      ) : !selectedVault ? (
        <VaultList onSelect={handleSelectVault} />
      ) : (
        <MonthView vault={selectedVault} />
      )}
    </div>
  );
}
