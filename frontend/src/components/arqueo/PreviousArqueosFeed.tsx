// Feed con lazy loading de arqueos previos (read-only) para el formulario ETV
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Edit } from 'lucide-react';
import arqueoService, { ArqueoHeader, ArqueoRecord, ArqueoHeaderWithRecords } from '@/services/arqueoService';
import { ROUTES } from '@/utils/constants';

const formatMXN = (v: string | number) =>
  parseFloat(String(v)).toLocaleString('es-MX', { minimumFractionDigits: 2 });

const PAGE_SIZE = 25; // PaginationParams solo acepta {0,25,50,100}

interface Props {
  vaultId: number;
  currentDate: string; // YYYY-MM-DD del día que se está editando arriba
}

interface DayState {
  header: ArqueoHeader;
  expanded: boolean;
  records: ArqueoRecord[] | null; // null = aún no cargado
  loadingRecords: boolean;
}

export default function PreviousArqueosFeed({ vaultId, currentDate }: Props) {
  const navigate = useNavigate();
  const [days, setDays] = useState<DayState[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState('');
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Carga inicial: últimos 3 días previos a `currentDate`
  const loadOlder = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    setError('');
    try {
      const oldest = days.length > 0 ? days[days.length - 1].header.arqueo_date : currentDate;
      // date_to = día anterior al más antiguo cargado (o al currentDate)
      const dateTo = new Date(new Date(oldest + 'T12:00:00').getTime() - 86400000)
        .toISOString()
        .split('T')[0];

      const page = await arqueoService.listMyHistory({
        vault_id: vaultId,
        date_to: dateTo,
        page: 1,
        page_size: PAGE_SIZE,
      });

      // De los items recibidos, tomamos los siguientes 3 más recientes que aún no tenemos
      const known = new Set(days.map((d) => d.header.id));
      const fresh = page.items
        .filter((h) => !known.has(h.id))
        .slice(0, 3)
        .map((h): DayState => ({ header: h, expanded: false, records: null, loadingRecords: false }));

      if (fresh.length === 0) {
        setHasMore(false);
      } else {
        setDays((prev) => [...prev, ...fresh]);
        // Si lo que devolvió el backend ya no tiene más después de los 3 que tomamos, no hay más
        if (page.items.length < PAGE_SIZE) {
          setHasMore(false);
        }
      }
    } catch {
      setError('No se pudieron cargar arqueos anteriores.');
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [vaultId, currentDate, days, loading, hasMore]);

  // Primer batch al montar
  useEffect(() => {
    loadOlder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultId]);

  // IntersectionObserver — auto-carga al hacer scroll hasta el final
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const el = sentinelRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadOlder();
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadOlder]);

  const toggleExpand = async (idx: number) => {
    const day = days[idx];
    if (day.records !== null) {
      setDays((prev) =>
        prev.map((d, i) => (i === idx ? { ...d, expanded: !d.expanded } : d)),
      );
      return;
    }
    // Cargar registros la primera vez
    setDays((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, loadingRecords: true } : d)),
    );
    try {
      const detail: ArqueoHeaderWithRecords = await arqueoService.getHeader(day.header.id);
      setDays((prev) =>
        prev.map((d, i) =>
          i === idx
            ? {
                ...d,
                expanded: true,
                records: detail.records.filter((r) => r.is_active && !r.is_counterpart),
                loadingRecords: false,
              }
            : d,
        ),
      );
    } catch {
      setDays((prev) =>
        prev.map((d, i) => (i === idx ? { ...d, loadingRecords: false } : d)),
      );
    }
  };

  if (days.length === 0 && !loading && !hasMore) {
    return null; // sin historial, no mostramos nada
  }

  return (
    <div className="mt-6">
      <h2 className="text-base font-semibold text-text-muted mb-3">
        Días anteriores (solo lectura)
      </h2>

      <div className="space-y-2 opacity-90">
        {days.map((d, idx) => {
          const isAuto = d.header.auto_published;
          const fechaLarga = new Date(d.header.arqueo_date + 'T12:00:00').toLocaleDateString(
            'es-MX',
            { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' },
          );
          return (
            <div key={d.header.id} className="card p-0 overflow-hidden bg-surface/40">
              <div className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface gap-3">
                <button
                  type="button"
                  onClick={() => toggleExpand(idx)}
                  className="flex-1 flex items-center gap-3 text-left min-w-0"
                >
                  {d.expanded ? (
                    <ChevronDown className="w-4 h-4 text-text-muted flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-text-muted flex-shrink-0" />
                  )}
                  <span className="text-sm font-medium capitalize truncate">{fechaLarga}</span>
                  {isAuto && (
                    <span className="badge badge-warning text-xs">Auto (en blanco)</span>
                  )}
                </button>
                <div className="flex items-center gap-4 text-xs text-text-muted flex-shrink-0">
                  <span>
                    Apertura{' '}
                    <span className="font-mono text-text-primary">
                      ${formatMXN(d.header.opening_balance)}
                    </span>
                  </span>
                  <span>
                    Cierre{' '}
                    <span
                      className={`font-mono ${
                        parseFloat(d.header.closing_balance) < 0 ? 'text-error' : 'text-text-primary'
                      }`}
                    >
                      ${formatMXN(d.header.closing_balance)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => navigate(`${ROUTES.ETV_MODIFICATIONS}/${d.header.id}`)}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                    title="Modificar este arqueo"
                  >
                    <Edit className="w-3 h-3" />
                    Modificar
                  </button>
                </div>
              </div>

              {d.expanded && (
                <div className="border-t border-border bg-white">
                  {d.loadingRecords ? (
                    <div className="px-4 py-3 text-xs text-text-muted">Cargando...</div>
                  ) : d.records && d.records.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-text-muted">
                      Sin movimientos en este día.
                    </div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-text-muted border-b border-border">
                          <th className="px-3 py-1.5">UID</th>
                          <th className="px-3 py-1.5">Comprobante</th>
                          <th className="px-3 py-1.5">Referencia</th>
                          <th className="px-3 py-1.5 text-right">Entradas</th>
                          <th className="px-3 py-1.5 text-right">Salidas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(d.records ?? []).map((r) => (
                          <tr key={r.id} className="border-b border-border/30">
                            <td className="px-3 py-1.5 font-mono text-text-muted">{r.record_uid}</td>
                            <td className="px-3 py-1.5">{r.voucher}</td>
                            <td className="px-3 py-1.5 text-text-muted">{r.reference}</td>
                            <td className="px-3 py-1.5 text-right text-success font-mono">
                              {parseFloat(r.entries) > 0 ? `$${formatMXN(r.entries)}` : '—'}
                            </td>
                            <td className="px-3 py-1.5 text-right text-error font-mono">
                              {parseFloat(r.withdrawals) > 0 ? `$${formatMXN(r.withdrawals)}` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="mt-3 p-2 text-xs text-error bg-error/10 border border-error/30 rounded">
          {error}
        </div>
      )}

      {/* Sentinel para auto-cargar más */}
      {hasMore && (
        <div ref={sentinelRef} className="py-4 text-center text-xs text-text-muted">
          {loading ? 'Cargando arqueos anteriores...' : 'Desplázate para cargar más'}
        </div>
      )}
      {!hasMore && days.length > 0 && (
        <div className="py-4 text-center text-xs text-text-muted/60">
          No hay más arqueos previos.
        </div>
      )}
    </div>
  );
}
