// Formulario de captura y publicación de arqueo diario (ETV)
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import arqueoService, {
  ArqueoHeader,
  ArqueoHeaderWithRecords,
  RecordCreatePayload,
} from '@/services/arqueoService';
import { useDraft } from '@/hooks/useDraft';
import { DENOMINATIONS, ROUTES, ARQUEO_STATUS } from '@/utils/constants';
import catalogService, { MovementType, Sucursal } from '@/services/catalogService';
import vaultService, { type DenominationInventory } from '@/services/vaultService';
import CertificateManager from '@/components/documents/CertificateManager';
import PreviousArqueosFeed from '@/components/arqueo/PreviousArqueosFeed';
import CollapsibleInventoryPanel from '@/components/arqueo/CollapsibleInventoryPanel';

// ─── Esquema de validación Zod ────────────────────────────────────────────────

const recordSchema = z
  .object({
    record_uid: z.string().optional(),
    voucher: z.string().max(100).default(''),
    reference: z.string().max(100).default(''),
    sucursal_id: z.number().default(0),
    movement_type_id: z.number().default(0),
    entries: z.string().default('0'),
    withdrawals: z.string().default('0'),
    bill_1000: z.string().default('0'),
    bill_500: z.string().default('0'),
    bill_200: z.string().default('0'),
    bill_100: z.string().default('0'),
    bill_50: z.string().default('0'),
    bill_20: z.string().default('0'),
    coin_100: z.string().default('0'),
    coin_50: z.string().default('0'),
    coin_20: z.string().default('0'),
    coin_10: z.string().default('0'),
    coin_5: z.string().default('0'),
    coin_2: z.string().default('0'),
    coin_1: z.string().default('0'),
    coin_050: z.string().default('0'),
    coin_020: z.string().default('0'),
    coin_010: z.string().default('0'),
    record_date: z.string().default(''),
  })
  .refine(
    (r) => {
      // Filas vacías no se validan — el backend las ignora
      if (!r.voucher.trim() && !r.sucursal_id && !r.movement_type_id) return true;
      const e = parseFloat(r.entries) || 0;
      const w = parseFloat(r.withdrawals) || 0;
      return !(e > 0 && w > 0);
    },
    { message: 'No puede tener entradas Y salidas a la vez', path: ['entries'] }
  );

const formSchema = z.object({
  records: z.array(recordSchema),
});

type FormValues = z.infer<typeof formSchema>;
type RecordValues = z.infer<typeof recordSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyRecord(date: string): RecordValues {
  const base: RecordValues = {
    voucher: '',
    reference: '',
    sucursal_id: 0,
    movement_type_id: 0,
    entries: '0',
    withdrawals: '0',
    record_date: date,
    record_uid: undefined,
  } as RecordValues;

  for (const d of DENOMINATIONS) {
    (base as unknown as Record<string, string>)[d.key] = '0';
  }
  return base;
}

function isRowEmpty(r: RecordValues): boolean {
  return (
    !r.voucher.trim() &&
    !r.reference.trim() &&
    !r.sucursal_id &&
    !r.movement_type_id &&
    (parseFloat(r.entries) || 0) === 0 &&
    (parseFloat(r.withdrawals) || 0) === 0
  );
}

function calcDenomSum(record: RecordValues): number {
  return DENOMINATIONS.reduce((acc, d) => {
    return acc + (parseFloat((record as unknown as Record<string, string>)[d.key] || '0') || 0);
  }, 0);
}

function formatMXN(value: number): string {
  return value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Componente ───────────────────────────────────────────────────────────────

interface LocationState {
  vault: { id: number; vault_code: string; vault_name: string };
  arqueo_date: string;
  header_id: number | null;
}

export default function ArqueoForm() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;

  const [header, setHeader] = useState<ArqueoHeader | null>(null);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [movementTypes, setMovementTypes] = useState<MovementType[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [serverError, setServerError] = useState('');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const [inventory, setInventory] = useState<DenominationInventory | null>(null);

  const draftKey = state ? `${state.vault.id}_${state.arqueo_date}` : '';

  const {
    register,
    control,
    watch,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { records: [] },
  });

  const { fields, append, remove, move } = useFieldArray({ control, name: 'records' });
  const records = watch('records');

  // Drag & drop state
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // ─── Draft ──────────────────────────────────────────────────────────────────

  const { clearDraft, lastSavedAt } = useDraft<RecordValues[]>({
    key: draftKey,
    data: records as RecordValues[],
    onRestore: (saved) => {
      if (!draftRestored) {
        reset({ records: saved });
        setDraftRestored(true);
      }
    },
  });

  // ─── Carga inicial ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!state) {
      navigate(ROUTES.ETV_VAULTS, { replace: true });
      return;
    }

    Promise.all([
      arqueoService.getOrCreateHeader(state.vault.id, state.arqueo_date),
      catalogService.getMovementTypes(),
      catalogService.getSucursales(),
    ])
      .then(async ([h, mt, suc]) => {
        setHeader(h);
        setMovementTypes(mt.filter((m) => m.is_active));
        setSucursales(suc.filter((s) => s.is_active));

        // SIEMPRE consultar el detalle del header. Si tiene registros publicados,
        // esos son la fuente de verdad y sobreescriben cualquier draft vacío
        // que el autosave inicial pudo haber creado.
        const hwr: ArqueoHeaderWithRecords = await arqueoService.getHeader(h.id);
        if (hwr.records.length > 0) {
          const mapped = hwr.records.map((r) => ({
            ...r,
            entries: r.entries,
            withdrawals: r.withdrawals,
            record_date: r.record_date,
          })) as unknown as RecordValues[];
          reset({ records: mapped });
          // Limpiar el draft local: ya tenemos los registros publicados frescos.
          localStorage.removeItem(`arqueo_draft_${draftKey}`);
        } else if (!localStorage.getItem(`arqueo_draft_${draftKey}`)) {
          // Sin records publicados y sin draft → arrancar con filas vacías.
          reset({ records: Array.from({ length: 5 }, () => emptyRecord(state.arqueo_date)) });
        }
        // Si no hay records publicados pero sí hay draft, el hook useDraft ya
        // lo restauró via onRestore — no tocamos.
      })
      .catch(() => setServerError('Error al cargar el formulario. Intenta de nuevo.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Inventario disponible por denominación ─────────────────────────────────

  useEffect(() => {
    if (!state) return;
    vaultService
      .getDenominationInventory(state.vault.id, state.arqueo_date)
      .then(setInventory)
      .catch(() => setInventory(null));
  }, [state]);

  // Saldo disponible neto por denom = inventario_inicio - Σ(salidas) + Σ(entradas) del día
  const liveInventory = React.useMemo(() => {
    if (!inventory) return null;
    const out: Record<string, number> = {};
    DENOMINATIONS.forEach((d) => {
      out[d.key] = parseFloat(inventory.inventory[d.key] || '0') || 0;
    });
    records.forEach((r) => {
      const entries = parseFloat(r.entries || '0') || 0;
      const sign = entries > 0 ? 1 : -1;
      const recAny = r as unknown as Record<string, string>;
      DENOMINATIONS.forEach((d) => {
        const v = parseFloat(recAny[d.key] || '0') || 0;
        out[d.key] += sign * v;
      });
    });
    return out;
  }, [inventory, records]);

  // (Auto-colapso eliminado: causaba que el panel se cerrara apenas cuadraba la
  // suma, lo que daba la sensación de que "no se podía abrir". Ahora el toggle
  // es totalmente manual.)

  // ─── Publicar ────────────────────────────────────────────────────────────────

  const onSubmit = async (values: FormValues) => {
    if (!header || !state) return;

    const nonEmpty = values.records.filter((r) => !isRowEmpty(r));
    if (nonEmpty.length === 0) {
      setServerError('Debes capturar al menos un registro antes de publicar.');
      return;
    }

    setPublishing(true);
    setServerError('');

    // Helper: cualquier campo numérico vacío o blanco se manda como "0"
    // (el backend exige Decimal válido). Aplica a entries, withdrawals y a
    // las 16 denominaciones.
    const numericKeys = [
      'entries',
      'withdrawals',
      ...DENOMINATIONS.map((d) => d.key),
    ] as const;
    const coerceNumeric = (rec: Record<string, unknown>): Record<string, unknown> => {
      const out = { ...rec };
      for (const k of numericKeys) {
        const v = out[k];
        if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
          out[k] = '0';
        }
      }
      return out;
    };

    try {
      await arqueoService.publishArqueo(state.vault.id, state.arqueo_date, {
        records: nonEmpty.map((r) =>
          coerceNumeric({
            ...r,
            record_date: state.arqueo_date,
          }),
        ) as unknown as RecordCreatePayload[],
        updated_at: header.updated_at,
      });
      clearDraft();
      navigate(ROUTES.ETV_VAULTS, { replace: true });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      setServerError(
        e?.response?.data?.detail || 'Error al publicar el arqueo. Verifica los datos.'
      );
    } finally {
      setPublishing(false);
    }
  };

  // ─── Cálculos de totales ─────────────────────────────────────────────────────

  const totalEntries = records.reduce((s, r) => s + (parseFloat(r.entries) || 0), 0);
  const totalWithdrawals = records.reduce((s, r) => s + (parseFloat(r.withdrawals) || 0), 0);
  const openingBalance = parseFloat(header?.opening_balance || '0');
  const projectedClosing = openingBalance + totalEntries - totalWithdrawals;

  // ─── Validación de denominaciones en tiempo real ──────────────────────────

  const getDenomError = (idx: number): string | null => {
    const record = records[idx];
    if (!record) return null;

    const entries = parseFloat(record.entries) || 0;
    const withdrawals = parseFloat(record.withdrawals) || 0;
    const activeAmount = entries > 0 ? entries : withdrawals;

    if (activeAmount === 0) return null;

    const denomSum = calcDenomSum(record);
    if (Math.abs(denomSum - activeAmount) > 0.001) {
      return `Suma denominaciones: $${formatMXN(denomSum)} ≠ monto: $${formatMXN(activeAmount)}`;
    }
    return null;
  };

  const isPublished = header?.status === ARQUEO_STATUS.PUBLISHED;
  const isLocked = header?.status === ARQUEO_STATUS.LOCKED;
  const isDraft = header?.status === ARQUEO_STATUS.DRAFT;

  // Cualquier arqueo de un día anterior es de solo lectura,
  // independientemente del estado. Cambios = módulo de Modificaciones.
  const todayCdmx = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  const isPastDay = !!state && state.arqueo_date < todayCdmx;
  const draftExpired = isDraft && isPastDay;

  const readOnly = isLocked || isPastDay;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Encabezado */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={() => navigate(ROUTES.ETV_VAULTS)}
            className="text-sm text-primary hover:underline mb-1"
          >
            ← Mis Bóvedas
          </button>
          <h1 className="text-xl font-semibold text-text-primary flex items-center gap-2 flex-wrap">
            <span>{state?.vault.vault_name}</span>
            {state?.vault.vault_code && (
              <span className="font-mono text-sm text-text-muted bg-surface px-2 py-0.5 rounded border border-border">
                {state.vault.vault_code}
              </span>
            )}
          </h1>
          <p className="text-sm text-text-muted">
            Arqueo del{' '}
            {state?.arqueo_date &&
              new Date(state.arqueo_date + 'T12:00:00').toLocaleDateString('es-MX', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            {header && (
              <span className="ml-2 text-text-muted/70">
                · Arqueo #{header.id}
              </span>
            )}
            {header?.vault_code && header.vault_name && header.vault_name !== state?.vault.vault_name && (
              <span className="ml-2 text-text-muted/70">· {header.vault_name}</span>
            )}
          </p>
        </div>

        {/* Saldos */}
        <div className="flex gap-4 text-right">
          <div>
            <p className="text-xs text-text-muted">Saldo apertura</p>
            <p className="font-semibold text-text-primary">
              ${formatMXN(openingBalance)}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Cierre proyectado</p>
            <p
              className={`font-semibold ${
                projectedClosing < 0 ? 'text-error' : 'text-text-primary'
              }`}
            >
              ${formatMXN(projectedClosing)}
            </p>
          </div>
        </div>
      </div>

      {isLocked && (
        <div className="mb-4 p-3 bg-info/10 border border-info rounded-lg text-sm">
          Este arqueo está <span className="font-medium">bloqueado</span>. Solo lectura.
        </div>
      )}

      {header?.auto_published && (
        <div className="mb-4 p-3 bg-warning/10 border border-warning rounded-lg text-sm">
          Este arqueo fue <span className="font-medium">publicado automáticamente en blanco</span> por no haber sido llenado en la fecha correspondiente. Para agregar o corregir movimientos usa el módulo de <span className="font-medium">Modificaciones</span>.
        </div>
      )}

      {draftExpired && !header?.auto_published && (
        <div className="mb-4 p-3 bg-warning/10 border border-warning rounded-lg text-sm">
          Este arqueo <span className="font-medium">no fue publicado</span> el día correspondiente. El borrador ha expirado. Para registrar movimientos usa el módulo de <span className="font-medium">Modificaciones</span>.
        </div>
      )}

      {isPublished && !isLocked && !isPastDay && !header?.auto_published && (
        <div className="mb-4 p-3 bg-success/10 border border-success rounded-lg text-sm">
          Arqueo publicado. Puedes corregirlo y volver a publicarlo durante el día de hoy.
        </div>
      )}

      {serverError && (
        <div className="mb-4 p-3 bg-error/10 border border-error rounded-lg text-error text-sm">
          {serverError}
        </div>
      )}

      {/* Panel inventario por denominación (en vivo) */}
      {liveInventory && (
        <CollapsibleInventoryPanel
          title="Inventario por denominación al cierre proyectado"
          inventory={liveInventory}
          unmigrated={inventory?.unmigrated ?? false}
          defaultOpen={true}
        />
      )}

      {/* Tabla de registros */}
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted border-b border-border">
                {!readOnly && <th className="px-1 py-2 w-6" title="Arrastra para reordenar"></th>}
                <th className="px-2 py-2 w-6">#</th>
                <th className="px-2 py-2">Comprobante</th>
                <th className="px-2 py-2">Referencia</th>
                <th className="px-2 py-2">Nombre Sucursal</th>
                <th className="px-2 py-2">Tipo Movimiento</th>
                <th className="px-2 py-2">Entradas</th>
                <th className="px-2 py-2">Salidas</th>
                <th className="px-2 py-2 w-16">Denom.</th>
                {!readOnly && <th className="px-2 py-2 w-8" />}
              </tr>
            </thead>
            <tbody>
              {fields.map((field, idx) => {
                const denomError = getDenomError(idx);
                const isExpanded = expandedRow === idx;
                const isDragging = draggingIdx === idx;
                const isDragOver = dragOverIdx === idx && draggingIdx !== null && draggingIdx !== idx;

                return (
                  <React.Fragment key={field.id}>
                    <tr
                      onDragOver={(e) => {
                        if (draggingIdx === null || readOnly) return;
                        e.preventDefault();
                        if (dragOverIdx !== idx) setDragOverIdx(idx);
                      }}
                      onDrop={(e) => {
                        if (draggingIdx === null || readOnly) return;
                        e.preventDefault();
                        if (draggingIdx !== idx) {
                          move(draggingIdx, idx);
                        }
                        setDraggingIdx(null);
                        setDragOverIdx(null);
                      }}
                      onDragLeave={() => {
                        if (dragOverIdx === idx) setDragOverIdx(null);
                      }}
                      className={`border-b border-border/50 ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-surface/40'
                      } ${denomError ? 'ring-1 ring-inset ring-error/50' : ''}
                      ${isDragging ? 'opacity-40' : ''}
                      ${isDragOver ? 'border-t-2 border-t-primary' : ''}`}
                    >
                      {!readOnly && (
                        <td
                          className="px-1 py-1.5 text-text-muted cursor-grab active:cursor-grabbing select-none text-center"
                          draggable
                          onDragStart={(e) => {
                            setDraggingIdx(idx);
                            e.dataTransfer.effectAllowed = 'move';
                            // Necesario para Firefox
                            e.dataTransfer.setData('text/plain', String(idx));
                          }}
                          onDragEnd={() => {
                            setDraggingIdx(null);
                            setDragOverIdx(null);
                          }}
                          title="Arrastra para reordenar"
                        >
                          ⠿
                        </td>
                      )}
                      <td className="px-2 py-1.5 text-text-muted">{idx + 1}</td>

                      {/* Hidden: record_uid (preserva el id original entre republicaciones) */}
                      <input type="hidden" {...register(`records.${idx}.record_uid`)} />
                      <input type="hidden" {...register(`records.${idx}.record_date`)} />

                      {/* Comprobante */}
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          {...register(`records.${idx}.voucher`)}
                          placeholder="Comprobante"
                          disabled={readOnly}
                          className={`input w-24 ${
                            errors.records?.[idx]?.voucher ? 'input-error' : ''
                          }`}
                        />
                      </td>

                      {/* Referencia */}
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          {...register(`records.${idx}.reference`)}
                          placeholder="Referencia"
                          disabled={readOnly}
                          className={`input w-24 ${
                            errors.records?.[idx]?.reference ? 'input-error' : ''
                          }`}
                        />
                      </td>

                      {/* Nombre Sucursal */}
                      <td className="px-2 py-1.5">
                        <Controller
                          control={control}
                          name={`records.${idx}.sucursal_id`}
                          render={({ field: f }) => (
                            <select
                              {...f}
                              onChange={(e) => f.onChange(parseInt(e.target.value))}
                              disabled={readOnly}
                              className={`input w-28 ${
                                errors.records?.[idx]?.sucursal_id ? 'input-error' : ''
                              }`}
                            >
                              <option value={0}>— Sucursal —</option>
                              {sucursales.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                            </select>
                          )}
                        />
                      </td>

                      {/* Tipo de movimiento */}
                      <td className="px-2 py-1.5">
                        <Controller
                          control={control}
                          name={`records.${idx}.movement_type_id`}
                          render={({ field: f }) => (
                            <select
                              {...f}
                              onChange={(e) => f.onChange(parseInt(e.target.value))}
                              disabled={readOnly}
                              className={`input w-36 ${
                                errors.records?.[idx]?.movement_type_id ? 'input-error' : ''
                              }`}
                            >
                              <option value={0}>— Tipo —</option>
                              {movementTypes.map((mt) => (
                                <option key={mt.id} value={mt.id}>
                                  {mt.name}
                                </option>
                              ))}
                            </select>
                          )}
                        />
                      </td>

                      {/* Entradas */}
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          {...register(`records.${idx}.entries`)}
                          disabled={readOnly}
                          placeholder=""
                          onClick={() => setExpandedRow(idx)}
                          className={`input w-24 text-right ${
                            errors.records?.[idx]?.entries ? 'input-error' : ''
                          }`}
                        />
                      </td>

                      {/* Salidas */}
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          {...register(`records.${idx}.withdrawals`)}
                          disabled={readOnly}
                          placeholder=""
                          onClick={() => setExpandedRow(idx)}
                          className="input w-24 text-right"
                        />
                      </td>

                      {/* Toggle denominaciones */}
                      <td className="px-2 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => setExpandedRow(isExpanded ? null : idx)}
                          className={`text-xs px-2 py-1 rounded border ${
                            denomError
                              ? 'border-error text-error bg-error/10'
                              : isExpanded
                              ? 'border-primary text-primary bg-primary/10'
                              : 'border-border text-text-muted hover:border-primary hover:text-primary'
                          }`}
                          title="Desglose de denominaciones"
                        >
                          {isExpanded ? '▲' : '▼'}
                        </button>
                      </td>

                      {!readOnly && (
                        <td className="px-2 py-1.5">
                          {fields.length > 1 && (
                            <button
                              type="button"
                              onClick={() => remove(idx)}
                              className="text-error hover:text-error/70 text-lg leading-none"
                              title="Eliminar fila"
                            >
                              ×
                            </button>
                          )}
                        </td>
                      )}
                    </tr>

                    {/* Denominaciones expandibles */}
                    {isExpanded && (
                      <tr className="bg-surface/60">
                        <td colSpan={readOnly ? 8 : 10} className="px-4 py-3">
                          <div className="flex flex-wrap gap-x-6 gap-y-2">
                            <div className="w-full text-xs font-medium text-text-muted mb-1">
                              Billetes
                            </div>
                            {DENOMINATIONS.filter((d) => d.type === 'bill').map((d) => (
                              <div key={d.key} className="flex items-center gap-1">
                                <label className="text-xs text-text-muted w-14 text-right">
                                  {d.label}
                                </label>
                                <input
                                  type="number"
                                  step={d.multiplier}
                                  min="0"
                                  {...register(`records.${idx}.${d.key}` as Parameters<typeof register>[0])}
                                  disabled={readOnly}
                                  className="input w-24 text-right text-xs"
                                />
                              </div>
                            ))}

                            <div className="w-full text-xs font-medium text-text-muted mt-2 mb-1">
                              Monedas
                            </div>
                            {DENOMINATIONS.filter((d) => d.type === 'coin').map((d) => (
                              <div key={d.key} className="flex items-center gap-1">
                                <label className="text-xs text-text-muted w-14 text-right">
                                  {d.label}
                                </label>
                                <input
                                  type="number"
                                  step={d.multiplier}
                                  min="0"
                                  {...register(`records.${idx}.${d.key}` as Parameters<typeof register>[0])}
                                  disabled={readOnly}
                                  className="input w-24 text-right text-xs"
                                />
                              </div>
                            ))}
                          </div>

                          {/* Error de cuadre */}
                          {denomError && (
                            <p className="mt-2 text-error text-xs font-medium">
                              {denomError}
                            </p>
                          )}

                          {/* Suma actual */}
                          <p className="mt-1 text-xs text-text-muted">
                            Suma denominaciones:{' '}
                            <span className="font-medium">
                              ${formatMXN(calcDenomSum(records[idx]))}
                            </span>
                          </p>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                );
              })}
            </tbody>
          </table>

          {/* Totales */}
          <div className="px-4 py-3 border-t border-border flex flex-wrap justify-between items-center gap-3 text-sm">
            <div className="flex gap-6 text-text-muted">
              <span>
                Total entradas:{' '}
                <span className="font-semibold text-success">
                  ${formatMXN(totalEntries)}
                </span>
              </span>
              <span>
                Total salidas:{' '}
                <span className="font-semibold text-error">
                  ${formatMXN(totalWithdrawals)}
                </span>
              </span>
            </div>

            {!readOnly && (
              <button
                type="button"
                onClick={() => append(emptyRecord(state?.arqueo_date || ''))}
                className="btn btn-ghost text-sm"
              >
                + Agregar fila
              </button>
            )}
          </div>
        </div>

        {/* Acciones */}
        {!readOnly && (
          <div className="mt-4 flex justify-between items-center flex-wrap gap-3">
            <span className="text-xs text-text-muted">
              {lastSavedAt
                ? `Borrador guardado automáticamente · ${lastSavedAt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                : 'El borrador se guarda automáticamente al escribir.'}
            </span>

            <button
              type="submit"
              disabled={publishing}
              className="btn btn-primary text-sm"
            >
              {publishing ? 'Publicando...' : 'Publicar Arqueo'}
            </button>
          </div>
        )}
      </form>

      {/* Certificados / papeletas — solo después de tener un header creado */}
      {header?.id && (
        <div className="mt-6 card p-4">
          <h2 className="text-base font-semibold text-text-primary mb-1">
            Papeletas / certificados PDF
          </h2>
          <p className="text-xs text-text-muted mb-3">
            Adjunta los certificados firmados de este arqueo. Solo PDF, máx 10 MB
            por archivo, hasta 10 archivos por día.
          </p>
          <CertificateManager headerId={header.id} readOnly={isLocked} />
        </div>
      )}

      {/* Días anteriores con lazy loading (solo lectura) */}
      {state?.vault.id && state?.arqueo_date && (
        <PreviousArqueosFeed
          vaultId={state.vault.id}
          currentDate={state.arqueo_date}
        />
      )}
    </div>
  );
}
