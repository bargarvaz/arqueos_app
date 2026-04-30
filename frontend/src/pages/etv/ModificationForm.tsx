// Formulario de modificación de un arqueo publicado (ETV)
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import arqueoService, { ArqueoHeaderWithRecords, ArqueoRecord } from '@/services/arqueoService';
import modificationService, { GracePeriod } from '@/services/modificationService';
import catalogService, { MovementType, Sucursal } from '@/services/catalogService';
import vaultService, { type DenominationInventory } from '@/services/vaultService';
import { ROUTES, DENOMINATIONS } from '@/utils/constants';
import CollapsibleInventoryPanel from '@/components/arqueo/CollapsibleInventoryPanel';

interface ModificationReason {
  id: number;
  name: string;
  is_active: boolean;
}

interface ActiveAction {
  type: 'cancel' | 'edit' | 'add';
  record?: ArqueoRecord;
}

const formatMXN = (v: string | number) =>
  parseFloat(String(v)).toLocaleString('es-MX', { minimumFractionDigits: 2 });

function calcDenomSum(data: Record<string, string>): number {
  return DENOMINATIONS.reduce((acc, d) => acc + (parseFloat(data[d.key] || '0') || 0), 0);
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function ModificationForm() {
  const { headerId } = useParams<{ headerId: string }>();
  const navigate = useNavigate();

  const [header, setHeader] = useState<ArqueoHeaderWithRecords | null>(null);
  const [inventory, setInventory] = useState<DenominationInventory | null>(null);
  const [gracePeriod, setGracePeriod] = useState<GracePeriod | null>(null);
  const [reasons, setReasons] = useState<ModificationReason[]>([]);
  const [movementTypes, setMovementTypes] = useState<MovementType[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [action, setAction] = useState<ActiveAction | null>(null);
  const [reasonId, setReasonId] = useState(0);
  const [reasonDetail, setReasonDetail] = useState('');
  const [editData, setEditData] = useState<Record<string, string>>({});
  const [expandedDenom, setExpandedDenom] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [actionError, setActionError] = useState('');

  const id = parseInt(headerId || '0');

  useEffect(() => {
    if (!id) return;
    Promise.all([
      arqueoService.getHeader(id),
      modificationService.getGracePeriod(id),
      catalogService.getModificationReasons() as Promise<ModificationReason[]>,
      catalogService.getMovementTypes(),
      catalogService.getSucursales(),
    ])
      .then(([h, gp, r, mt, suc]) => {
        setHeader(h);
        setGracePeriod(gp);
        setReasons(r.filter((x) => x.is_active));
        setMovementTypes(mt.filter((m) => m.is_active));
        setSucursales(suc.filter((s) => s.is_active));
      })
      .catch(() => setError('Error al cargar el arqueo.'))
      .finally(() => setLoading(false));
  }, [id]);

  const reloadHeader = async () => {
    const h = await arqueoService.getHeader(id);
    setHeader(h);
    // recargar inventario tras cambios
    try {
      const inv = await vaultService.getDenominationInventory(h.vault_id, h.arqueo_date);
      setInventory(inv);
    } catch {
      setInventory(null);
    }
  };

  // Cargar inventario una vez tengamos el header
  useEffect(() => {
    if (!header) return;
    vaultService
      .getDenominationInventory(header.vault_id, header.arqueo_date)
      .then(setInventory)
      .catch(() => setInventory(null));
  }, [header?.vault_id, header?.arqueo_date]);

  // Inventario en vivo: aplica los registros activos no contrapartida del header
  // y, si hay edición/cancelación/agregar pendiente, simula el efecto.
  const liveInventory = React.useMemo(() => {
    if (!inventory || !header) return null;
    const start: Record<string, number> = {};
    DENOMINATIONS.forEach((d) => {
      start[d.key] = parseFloat(inventory.inventory[d.key] || '0') || 0;
    });

    const applyRecord = (
      rec: Record<string, string | number | null | undefined>,
      sign: 1 | -1,
    ) => {
      const entries = parseFloat(String(rec.entries || '0')) || 0;
      const recSign = entries > 0 ? 1 : -1;
      DENOMINATIONS.forEach((d) => {
        const v = parseFloat(String(rec[d.key] || '0')) || 0;
        start[d.key] += sign * recSign * v;
      });
    };

    const activeRecords = header.records.filter(
      (r) => r.is_active && !r.is_counterpart,
    );

    activeRecords.forEach((r) => {
      // Si es la fila que se está editando o cancelando, la excluimos del estado base
      if (action?.record?.id === r.id) return;
      applyRecord(r as unknown as Record<string, string>, 1);
    });

    // Si hay add/edit con datos siendo capturados, sumarlos
    if (action?.type === 'add' || action?.type === 'edit') {
      applyRecord(editData, 1);
    }
    // Si es cancel, ya excluimos el original arriba

    return start;
  }, [inventory, header, action, editData]);

  // ─── Abrir / cerrar acción ────────────────────────────────────────────────────

  const openAction = (type: ActiveAction['type'], record?: ArqueoRecord) => {
    setAction({ type, record });
    setReasonId(0);
    setReasonDetail('');
    setExpandedDenom(false);
    setActionError('');

    if (type === 'edit' && record) {
      setEditData({
        voucher: record.voucher,
        reference: record.reference,
        sucursal_id: String(record.sucursal_id ?? '0'),
        movement_type_id: String(record.movement_type_id),
        entries: record.entries,
        withdrawals: record.withdrawals,
        record_date: record.record_date,
        ...DENOMINATIONS.reduce((acc, d) => {
          acc[d.key] = (record as unknown as Record<string, string>)[d.key] || '0';
          return acc;
        }, {} as Record<string, string>),
      });
    } else if (type === 'add') {
      // Defaults vacíos para que los placeholder "0" sean visibles. La
      // coerción a "0" se hace en el submit (handleAdd / handleEdit).
      setEditData({
        voucher: '',
        reference: '',
        sucursal_id: '0',
        movement_type_id: '0',
        entries: '',
        withdrawals: '',
        record_date: header?.arqueo_date || '',
        ...DENOMINATIONS.reduce((a, d) => ({ ...a, [d.key]: '' }), {}),
      });
    }
  };

  const closeAction = () => {
    setAction(null);
    setEditData({});
    setExpandedDenom(false);
  };

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleCancel = async () => {
    if (!action?.record || !reasonId) return;
    setProcessing(true);
    setActionError('');
    try {
      await modificationService.cancelRecord(action.record.record_uid, {
        reason_id: reasonId,
        reason_detail: reasonDetail || undefined,
      });
      closeAction();
      await reloadHeader();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setActionError(err?.response?.data?.detail || 'Error al cancelar el registro.');
    } finally {
      setProcessing(false);
    }
  };

  // Coerciona campos numéricos vacíos a "0" antes de enviar al backend
  // (entries, withdrawals y las 16 denominaciones). El backend exige Decimal.
  const coerceEditData = (
    data: Record<string, string>,
  ): Record<string, string> => {
    const numericKeys = ['entries', 'withdrawals', ...DENOMINATIONS.map((d) => d.key)];
    const out = { ...data };
    for (const k of numericKeys) {
      const v = out[k];
      if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
        out[k] = '0';
      }
    }
    return out;
  };

  const handleEdit = async () => {
    if (!action?.record || !reasonId) return;
    setProcessing(true);
    setActionError('');
    try {
      await modificationService.editRecord(action.record.record_uid, {
        reason_id: reasonId,
        reason_detail: reasonDetail || undefined,
        new_data: coerceEditData(editData),
      });
      closeAction();
      await reloadHeader();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setActionError(err?.response?.data?.detail || 'Error al editar el registro.');
    } finally {
      setProcessing(false);
    }
  };

  const handleAdd = async () => {
    if (!reasonId) return;
    setProcessing(true);
    setActionError('');
    try {
      await modificationService.addRecord(id, {
        record: coerceEditData(editData),
        reason_id: reasonId,
        reason_detail: reasonDetail || undefined,
      });
      closeAction();
      await reloadHeader();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setActionError(err?.response?.data?.detail || 'Error al agregar el registro.');
    } finally {
      setProcessing(false);
    }
  };

  // ─── Render helpers ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error || !header) {
    return (
      <div className="p-4 bg-error/10 border border-error rounded-lg text-error text-sm">
        {error || 'Arqueo no encontrado.'}
      </div>
    );
  }

  const activeRecords = header.records.filter((r) => r.is_active && !r.is_counterpart);
  const counterpartRecords = header.records.filter((r) => r.is_counterpart);
  const canAct = gracePeriod?.is_within_grace;

  // Número de columnas: # | Comprobante | Referencia | Sucursal | Tipo Mov | Entradas | Salidas | Denom | [Acciones]
  const colCount = canAct ? 9 : 8;

  const sucursalName = (id: number | null) =>
    sucursales.find((s) => s.id === id)?.name || '—';

  const movTypeName = (id: number) =>
    movementTypes.find((m) => m.id === id)?.name || '—';

  // ─── Panel de denominaciones + motivo (aparece debajo de la fila activa) ──────
  const renderActionPanel = (type: ActiveAction['type']) => {
    const isEditOrAdd = type === 'edit' || type === 'add';
    const denomSum = calcDenomSum(editData);
    const activeAmount =
      parseFloat(editData.entries || '0') > 0
        ? parseFloat(editData.entries || '0')
        : parseFloat(editData.withdrawals || '0');
    const denomError =
      isEditOrAdd && activeAmount > 0 && Math.abs(denomSum - activeAmount) > 0.001
        ? `Suma denominaciones: $${formatMXN(denomSum)} ≠ monto: $${formatMXN(activeAmount)}`
        : null;

    return (
      <tr className="bg-primary/5">
        <td colSpan={colCount} className="px-4 py-4">
          <div className="space-y-4">
            {/* Denominaciones — solo en edit/add */}
            {isEditOrAdd && (
              <div>
                <button
                  type="button"
                  onClick={() => setExpandedDenom((v) => !v)}
                  className={`text-xs px-3 py-1 rounded border mb-2 ${
                    denomError
                      ? 'border-error text-error bg-error/10'
                      : expandedDenom
                      ? 'border-primary text-primary bg-primary/10'
                      : 'border-border text-text-muted hover:border-primary hover:text-primary'
                  }`}
                >
                  {expandedDenom ? '▲' : '▼'} Desglose de denominaciones
                  {denomError && ' ⚠'}
                </button>

                {expandedDenom && (
                  <div className="flex flex-wrap gap-x-6 gap-y-2 mb-3 p-3 bg-surface/60 rounded-lg border border-border/40">
                    <div className="w-full text-xs font-medium text-text-muted mb-1">Billetes</div>
                    {DENOMINATIONS.filter((d) => d.type === 'bill').map((d) => (
                      <div key={d.key} className="flex items-center gap-1">
                        <label className="text-xs text-text-muted w-14 text-right">{d.label}</label>
                        <input
                          type="number"
                          step={d.multiplier}
                          min="0"
                          placeholder="0"
                          className="input w-24 text-right text-xs"
                          value={editData[d.key] ?? ''}
                          onChange={(e) => setEditData((p) => ({ ...p, [d.key]: e.target.value }))}
                        />
                      </div>
                    ))}
                    <div className="w-full text-xs font-medium text-text-muted mt-2 mb-1">Monedas</div>
                    {DENOMINATIONS.filter((d) => d.type === 'coin').map((d) => (
                      <div key={d.key} className="flex items-center gap-1">
                        <label className="text-xs text-text-muted w-14 text-right">{d.label}</label>
                        <input
                          type="number"
                          step={d.multiplier}
                          min="0"
                          placeholder="0"
                          className="input w-24 text-right text-xs"
                          value={editData[d.key] ?? ''}
                          onChange={(e) => setEditData((p) => ({ ...p, [d.key]: e.target.value }))}
                        />
                      </div>
                    ))}
                    {denomError && (
                      <p className="w-full text-error text-xs font-medium mt-1">{denomError}</p>
                    )}
                    <p className="w-full text-xs text-text-muted">
                      Suma denominaciones:{' '}
                      <span className="font-medium">${formatMXN(denomSum)}</span>
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Motivo de modificación + Detalle */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label text-xs">Motivo de modificación *</label>
                <select
                  className="input"
                  value={reasonId}
                  onChange={(e) => setReasonId(parseInt(e.target.value))}
                >
                  <option value={0}>— Seleccionar motivo —</option>
                  {reasons.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label text-xs">Detalle adicional (opcional)</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Descripción libre"
                  value={reasonDetail}
                  onChange={(e) => setReasonDetail(e.target.value)}
                  maxLength={500}
                />
              </div>
            </div>

            {actionError && <p className="text-error text-xs">{actionError}</p>}

            <div className="flex gap-3">
              <button type="button" className="btn btn-ghost text-sm" onClick={closeAction}>
                Cerrar
              </button>
              <button
                type="button"
                disabled={processing || !reasonId}
                onClick={
                  type === 'cancel' ? handleCancel : type === 'edit' ? handleEdit : handleAdd
                }
                className="btn btn-primary text-sm"
              >
                {processing
                  ? 'Procesando...'
                  : type === 'cancel'
                  ? 'Confirmar cancelación'
                  : type === 'edit'
                  ? 'Confirmar edición'
                  : 'Agregar registro'}
              </button>
            </div>
          </div>
        </td>
      </tr>
    );
  };

  // Fila editable (edit / add) — misma estructura que ArqueoForm
  const renderEditRow = (rowNum: number | string) => (
    <tr className="border-b border-primary/40 bg-primary/5">
      {/* # */}
      <td className="px-2 py-1.5 text-text-muted text-sm">{rowNum}</td>

      {/* Comprobante */}
      <td className="px-2 py-1.5">
        <input
          type="text"
          placeholder="Comprobante"
          className="input w-24"
          value={editData.voucher || ''}
          onChange={(e) => setEditData((p) => ({ ...p, voucher: e.target.value }))}
        />
      </td>

      {/* Referencia */}
      <td className="px-2 py-1.5">
        <input
          type="text"
          placeholder="Referencia"
          className="input w-24"
          value={editData.reference || ''}
          onChange={(e) => setEditData((p) => ({ ...p, reference: e.target.value }))}
        />
      </td>

      {/* Nombre Sucursal */}
      <td className="px-2 py-1.5">
        <select
          className="input w-28"
          value={editData.sucursal_id || '0'}
          onChange={(e) => setEditData((p) => ({ ...p, sucursal_id: e.target.value }))}
        >
          <option value="0">— Sucursal —</option>
          {sucursales.map((s) => (
            <option key={s.id} value={String(s.id)}>
              {s.name}
            </option>
          ))}
        </select>
      </td>

      {/* Tipo Movimiento */}
      <td className="px-2 py-1.5">
        <select
          className="input w-36"
          value={editData.movement_type_id || '0'}
          onChange={(e) => setEditData((p) => ({ ...p, movement_type_id: e.target.value }))}
        >
          <option value="0">— Tipo —</option>
          {movementTypes.map((mt) => (
            <option key={mt.id} value={String(mt.id)}>
              {mt.name}
            </option>
          ))}
        </select>
      </td>

      {/* Entradas (sin flechitas) */}
      <td className="px-2 py-1.5">
        <input
          type="text"
          inputMode="decimal"
          placeholder="0"
          className="input w-24 text-right"
          value={editData.entries ?? ''}
          onChange={(e) => setEditData((p) => ({ ...p, entries: e.target.value }))}
        />
      </td>

      {/* Salidas (sin flechitas) */}
      <td className="px-2 py-1.5">
        <input
          type="text"
          inputMode="decimal"
          placeholder="0"
          className="input w-24 text-right"
          value={editData.withdrawals ?? ''}
          onChange={(e) => setEditData((p) => ({ ...p, withdrawals: e.target.value }))}
        />
      </td>

      {/* Denom toggle */}
      <td className="px-2 py-1.5 text-center">
        <button
          type="button"
          onClick={() => setExpandedDenom((v) => !v)}
          className={`text-xs px-2 py-1 rounded border ${
            expandedDenom
              ? 'border-primary text-primary bg-primary/10'
              : 'border-border text-text-muted hover:border-primary hover:text-primary'
          }`}
          title="Desglose de denominaciones"
        >
          {expandedDenom ? '▲' : '▼'}
        </button>
      </td>

      {/* Acciones (vacío — el confirm está en el panel) */}
      {canAct && <td className="px-2 py-1.5" />}
    </tr>
  );

  // ─── Vista principal ──────────────────────────────────────────────────────────

  return (
    <div className="w-full">
      {/* Encabezado */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={() => navigate(ROUTES.ETV_MODIFICATIONS)}
            className="text-sm text-primary hover:underline mb-1"
          >
            ← Modificaciones
          </button>
          <h1 className="text-xl font-semibold text-text-primary">
            {header.vault_name ?? `Bóveda #${header.vault_id}`}
          </h1>
          <p className="text-sm text-text-muted">
            Arqueo del{' '}
            {new Date(header.arqueo_date + 'T12:00:00').toLocaleDateString('es-MX', {
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
              ${formatMXN(header.opening_balance)}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Saldo cierre</p>
            <p
              className={`font-semibold ${
                parseFloat(header.closing_balance) < 0 ? 'text-error' : 'text-text-primary'
              }`}
            >
              ${formatMXN(header.closing_balance)}
            </p>
          </div>
        </div>
      </div>

      {/* Banner de periodo de gracia */}
      {gracePeriod && (
        <div
          className={`mb-4 p-3 rounded-lg border text-sm ${
            gracePeriod.is_within_grace
              ? 'bg-success/10 border-success/30 text-success'
              : 'bg-error/10 border-error text-error'
          }`}
        >
          {gracePeriod.is_within_grace
            ? `Dentro del periodo de gracia — vence el ${new Date(
                gracePeriod.grace_deadline + 'T12:00:00'
              ).toLocaleDateString('es-MX')} (${gracePeriod.days_remaining} días)`
            : 'Fuera del periodo de gracia. No se pueden realizar modificaciones.'}
        </div>
      )}

      {/* Inventario por denominación tras la modificación propuesta */}
      {liveInventory && (
        <CollapsibleInventoryPanel
          title={
            action
              ? 'Inventario por denominación (con la modificación propuesta)'
              : 'Inventario por denominación'
          }
          inventory={liveInventory}
          unmigrated={inventory?.unmigrated ?? false}
          defaultOpen={true}
        />
      )}

      {/* Tabla de registros activos */}
      <div className="card overflow-x-auto mb-4">
        <div className="px-4 py-3 border-b border-border flex justify-between items-center">
          <h2 className="font-medium text-sm">Registros activos</h2>
          {canAct && !action && (
            <button
              type="button"
              className="btn btn-outline text-xs"
              onClick={() => openAction('add')}
            >
              + Agregar registro
            </button>
          )}
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-muted border-b border-border">
              <th className="px-2 py-2 w-6">#</th>
              <th className="px-2 py-2">Comprobante</th>
              <th className="px-2 py-2">Referencia</th>
              <th className="px-2 py-2">Nombre Sucursal</th>
              <th className="px-2 py-2">Tipo Movimiento</th>
              <th className="px-2 py-2">Entradas</th>
              <th className="px-2 py-2">Salidas</th>
              <th className="px-2 py-2 w-16">Denom.</th>
              {canAct && <th className="px-2 py-2 w-28" />}
            </tr>
          </thead>
          <tbody>
            {activeRecords.map((r, idx) => {
              const isActiveRow = action?.record?.id === r.id;
              const isEditRow = isActiveRow && action?.type === 'edit';
              const isCancelRow = isActiveRow && action?.type === 'cancel';

              return (
                <React.Fragment key={r.id}>
                  {/* Fila en modo edición */}
                  {isEditRow ? (
                    renderEditRow(idx + 1)
                  ) : (
                    /* Fila en modo lectura (o modo cancelación) */
                    <tr
                      className={`border-b border-border/50 ${
                        isCancelRow
                          ? 'bg-error/5'
                          : idx % 2 === 0
                          ? 'bg-white'
                          : 'bg-surface/40'
                      }`}
                    >
                      <td className="px-2 py-1.5 text-text-muted">{idx + 1}</td>
                      <td className="px-2 py-1.5">{r.voucher}</td>
                      <td className="px-2 py-1.5 text-text-muted">{r.reference}</td>
                      <td className="px-2 py-1.5 text-text-muted">
                        {sucursalName(r.sucursal_id)}
                      </td>
                      <td className="px-2 py-1.5 text-text-muted">{movTypeName(r.movement_type_id)}</td>
                      <td className="px-2 py-1.5 text-success">
                        {parseFloat(r.entries) > 0 ? `$${formatMXN(r.entries)}` : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-error">
                        {parseFloat(r.withdrawals) > 0 ? `$${formatMXN(r.withdrawals)}` : '—'}
                      </td>
                      {/* Denom (solo lectura, sin toggle funcional en read mode) */}
                      <td className="px-2 py-1.5 text-center">
                        <span className="text-xs text-text-muted/50">—</span>
                      </td>
                      {canAct && (
                        <td className="px-2 py-1.5">
                          {!action ? (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className="text-xs text-primary hover:underline"
                                onClick={() => openAction('edit', r)}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                className="text-xs text-error hover:underline"
                                onClick={() => openAction('cancel', r)}
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : null}
                        </td>
                      )}
                    </tr>
                  )}

                  {/* Panel de acción debajo de esta fila */}
                  {isActiveRow && renderActionPanel(action!.type)}
                </React.Fragment>
              );
            })}

            {/* Fila nueva (add) al final de la tabla */}
            {action?.type === 'add' && (
              <React.Fragment>
                {renderEditRow('+')}
                {renderActionPanel('add')}
              </React.Fragment>
            )}

            {activeRecords.length === 0 && !action && (
              <tr>
                <td colSpan={colCount} className="px-4 py-4 text-center text-text-muted text-xs">
                  Sin registros activos
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Totales */}
        <div className="px-4 py-3 border-t border-border flex gap-6 text-sm text-text-muted">
          <span>
            Total entradas:{' '}
            <span className="font-semibold text-success">
              ${formatMXN(
                activeRecords.reduce((s, r) => s + (parseFloat(r.entries) || 0), 0)
              )}
            </span>
          </span>
          <span>
            Total salidas:{' '}
            <span className="font-semibold text-error">
              ${formatMXN(
                activeRecords.reduce((s, r) => s + (parseFloat(r.withdrawals) || 0), 0)
              )}
            </span>
          </span>
        </div>
      </div>

      {/* Contrapartidas (histórico) */}
      {counterpartRecords.length > 0 && (
        <div className="card overflow-x-auto">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="font-medium text-sm text-text-muted">
              Registros de contrapartida (histórico)
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted border-b border-border bg-surface/40">
                <th className="px-4 py-2">UID</th>
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2">Original</th>
                <th className="px-4 py-2">Entradas</th>
                <th className="px-4 py-2">Salidas</th>
              </tr>
            </thead>
            <tbody>
              {counterpartRecords.map((r) => (
                <tr key={r.id} className="border-b border-border/40 opacity-70">
                  <td className="px-4 py-2 font-mono text-xs">{r.record_uid}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`badge text-xs ${
                        r.counterpart_type === 'cancellation' ? 'badge-error' : 'badge-warning'
                      }`}
                    >
                      {r.counterpart_type === 'cancellation' ? 'CANCELACIÓN' : 'MODIFICACIÓN'}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-text-muted">
                    {r.original_record_uid || '—'}
                  </td>
                  <td className="px-4 py-2 text-success">
                    {parseFloat(r.entries) > 0 ? `$${formatMXN(r.entries)}` : '—'}
                  </td>
                  <td className="px-4 py-2 text-error">
                    {parseFloat(r.withdrawals) > 0 ? `$${formatMXN(r.withdrawals)}` : '—'}
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
