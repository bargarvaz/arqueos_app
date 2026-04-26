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
import catalogService, { MovementType } from '@/services/catalogService';
import vaultService, { Branch } from '@/services/vaultService';

// ─── Esquema de validación Zod ────────────────────────────────────────────────

const recordSchema = z
  .object({
    record_uid: z.string().optional(),
    voucher: z.string().min(1, 'Obligatorio').max(100),
    reference: z.string().min(1, 'Obligatorio').max(100),
    branch_id: z.number({ invalid_type_error: 'Selecciona sucursal' }).min(1),
    movement_type_id: z.number({ invalid_type_error: 'Selecciona tipo' }).min(1),
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
    record_date: z.string().min(1, 'Obligatorio'),
  })
  .refine(
    (r) => {
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
    branch_id: 0,
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
  const [branches, setBranches] = useState<Branch[]>([]);
  const [movementTypes, setMovementTypes] = useState<MovementType[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [serverError, setServerError] = useState('');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);

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

  const { fields, append, remove } = useFieldArray({ control, name: 'records' });
  const records = watch('records');

  // ─── Draft ──────────────────────────────────────────────────────────────────

  const { saveDraft, clearDraft, hasDraft } = useDraft<RecordValues[]>({
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
      vaultService.listBranches(),
    ])
      .then(([h, mt, br]) => {
        setHeader(h);
        setMovementTypes(mt.filter((m) => m.is_active));
        setBranches(br.filter((b) => b.is_active));

        // Si el header ya tiene registros (revisita), cargarlos — solo si no hay draft
        if (!localStorage.getItem(`arqueo_draft_${draftKey}`)) {
          if (state.header_id) {
            return arqueoService.getHeader(state.header_id).then((hwr: ArqueoHeaderWithRecords) => {
              if (hwr.records.length > 0) {
                const mapped = hwr.records.map((r) => ({
                  ...r,
                  entries: r.entries,
                  withdrawals: r.withdrawals,
                  record_date: r.record_date,
                })) as unknown as RecordValues[];
                reset({ records: mapped });
              } else {
                reset({ records: [emptyRecord(state.arqueo_date)] });
              }
            });
          } else {
            reset({ records: [emptyRecord(state.arqueo_date)] });
          }
        }
      })
      .catch(() => setServerError('Error al cargar el formulario. Intenta de nuevo.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Publicar ────────────────────────────────────────────────────────────────

  const onSubmit = async (values: FormValues) => {
    if (!header || !state) return;
    setPublishing(true);
    setServerError('');

    try {
      await arqueoService.publishArqueo(state.vault.id, state.arqueo_date, {
        records: values.records as RecordCreatePayload[],
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
  const readOnly = isPublished || isLocked;

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
          <h1 className="text-xl font-semibold text-text-primary">
            {state?.vault.vault_name}
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

      {/* Draft banner */}
      {hasDraft && !draftRestored && (
        <div className="mb-4 p-3 bg-warning/10 border border-warning rounded-lg flex justify-between items-center text-sm">
          <span>Hay un borrador guardado. Fue restaurado automáticamente.</span>
          <button
            type="button"
            onClick={clearDraft}
            className="text-error hover:underline ml-4 shrink-0"
          >
            Descartar
          </button>
        </div>
      )}

      {readOnly && (
        <div className="mb-4 p-3 bg-info/10 border border-info rounded-lg text-sm">
          Este arqueo fue{' '}
          <span className="font-medium">
            {isLocked ? 'bloqueado' : 'publicado'}
          </span>
          . Solo lectura.
        </div>
      )}

      {serverError && (
        <div className="mb-4 p-3 bg-error/10 border border-error rounded-lg text-error text-sm">
          {serverError}
        </div>
      )}

      {/* Tabla de registros */}
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted border-b border-border">
                <th className="px-2 py-2 w-6">#</th>
                <th className="px-2 py-2">Fecha</th>
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

                return (
                  <React.Fragment key={field.id}>
                    <tr
                      className={`border-b border-border/50 ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-surface/40'
                      } ${denomError ? 'ring-1 ring-inset ring-error/50' : ''}`}
                    >
                      <td className="px-2 py-1.5 text-text-muted">{idx + 1}</td>

                      {/* Fecha */}
                      <td className="px-2 py-1.5">
                        <input
                          type="date"
                          {...register(`records.${idx}.record_date`)}
                          disabled={readOnly}
                          className="input w-32"
                        />
                      </td>

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
                          name={`records.${idx}.branch_id`}
                          render={({ field: f }) => (
                            <select
                              {...f}
                              onChange={(e) => f.onChange(parseInt(e.target.value))}
                              disabled={readOnly}
                              className={`input w-28 ${
                                errors.records?.[idx]?.branch_id ? 'input-error' : ''
                              }`}
                            >
                              <option value={0}>— Sucursal —</option>
                              {branches.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.name}
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
                          placeholder="0.00"
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
                          placeholder="0.00"
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
                        <td colSpan={readOnly ? 9 : 10} className="px-4 py-3">
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
            <button
              type="button"
              onClick={saveDraft}
              className="btn btn-outline text-sm"
            >
              Guardar borrador
            </button>

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
    </div>
  );
}
