// Formulario de modificación de un arqueo publicado (ETV)
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import arqueoService, { ArqueoHeaderWithRecords, ArqueoRecord } from '@/services/arqueoService';
import modificationService, { GracePeriod } from '@/services/modificationService';
import catalogService, { MovementType } from '@/services/catalogService';
import { ROUTES, DENOMINATIONS } from '@/utils/constants';

interface ModificationReason {
  id: number;
  name: string;
  is_active: boolean;
}

interface ActionState {
  type: 'cancel' | 'edit' | 'add' | null;
  record?: ArqueoRecord;
}

const formatMXN = (v: string | number) =>
  parseFloat(String(v)).toLocaleString('es-MX', { minimumFractionDigits: 2 });

export default function ModificationForm() {
  const { headerId } = useParams<{ headerId: string }>();
  const navigate = useNavigate();

  const [header, setHeader] = useState<ArqueoHeaderWithRecords | null>(null);
  const [gracePeriod, setGracePeriod] = useState<GracePeriod | null>(null);
  const [reasons, setReasons] = useState<ModificationReason[]>([]);
  const [movementTypes, setMovementTypes] = useState<MovementType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [action, setAction] = useState<ActionState>({ type: null });
  const [reasonId, setReasonId] = useState(0);
  const [reasonDetail, setReasonDetail] = useState('');
  const [editData, setEditData] = useState<Record<string, string>>({});
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
    ])
      .then(([h, gp, r, mt]) => {
        setHeader(h);
        setGracePeriod(gp);
        setReasons(r.filter((x) => x.is_active));
        setMovementTypes(mt.filter((m) => m.is_active));
      })
      .catch(() => setError('Error al cargar el arqueo.'))
      .finally(() => setLoading(false));
  }, [id]);

  const reloadHeader = async () => {
    const h = await arqueoService.getHeader(id);
    setHeader(h);
  };

  const handleCancel = async () => {
    if (!action.record || !reasonId) return;
    setProcessing(true);
    setActionError('');
    try {
      await modificationService.cancelRecord(action.record.record_uid, {
        reason_id: reasonId,
        reason_detail: reasonDetail || undefined,
      });
      setAction({ type: null });
      await reloadHeader();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setActionError(err?.response?.data?.detail || 'Error al cancelar el registro.');
    } finally {
      setProcessing(false);
    }
  };

  const handleEdit = async () => {
    if (!action.record || !reasonId) return;
    setProcessing(true);
    setActionError('');
    try {
      await modificationService.editRecord(action.record.record_uid, {
        reason_id: reasonId,
        reason_detail: reasonDetail || undefined,
        new_data: editData,
      });
      setAction({ type: null });
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
        record: editData,
        reason_id: reasonId,
        reason_detail: reasonDetail || undefined,
      });
      setAction({ type: null });
      setEditData({});
      await reloadHeader();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setActionError(err?.response?.data?.detail || 'Error al agregar el registro.');
    } finally {
      setProcessing(false);
    }
  };

  const openEdit = (record: ArqueoRecord) => {
    setAction({ type: 'edit', record });
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
    setReasonId(0);
    setReasonDetail('');
    setActionError('');
  };

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

  const activeRecords = header.records.filter(
    (r) => r.is_active && !r.is_counterpart
  );
  const counterpartRecords = header.records.filter((r) => r.is_counterpart);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Encabezado */}
      <div className="mb-6">
        <button
          type="button"
          onClick={() => navigate(ROUTES.ETV_MODIFICATIONS)}
          className="text-sm text-primary hover:underline mb-1"
        >
          ← Modificaciones
        </button>
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div>
            <h1 className="text-xl font-semibold">
              Arqueo:{' '}
              {new Date(header.arqueo_date + 'T12:00:00').toLocaleDateString('es-MX', {
                year: 'numeric', month: 'long', day: 'numeric',
              })}
            </h1>
            <p className="text-sm text-text-muted">Bóveda #{header.vault_id}</p>
          </div>
          <div className="text-right text-sm">
            <p className="text-text-muted">
              Apertura: <span className="font-medium">${formatMXN(header.opening_balance)}</span>
            </p>
            <p className="text-text-muted">
              Cierre:{' '}
              <span
                className={`font-medium ${
                  parseFloat(header.closing_balance) < 0 ? 'text-error' : ''
                }`}
              >
                ${formatMXN(header.closing_balance)}
              </span>
            </p>
          </div>
        </div>

        {/* Banner de periodo de gracia */}
        {gracePeriod && (
          <div
            className={`mt-3 p-3 rounded-lg border text-sm flex justify-between items-center ${
              gracePeriod.is_within_grace
                ? 'bg-success/10 border-success/30 text-success'
                : 'bg-error/10 border-error text-error'
            }`}
          >
            <span>
              {gracePeriod.is_within_grace
                ? `Dentro del periodo de gracia — vence el ${new Date(
                    gracePeriod.grace_deadline + 'T12:00:00'
                  ).toLocaleDateString('es-MX')} (${gracePeriod.days_remaining} días)`
                : 'Fuera del periodo de gracia. No se pueden realizar modificaciones.'}
            </span>
          </div>
        )}
      </div>

      {/* Registros activos */}
      <div className="card mb-4">
        <div className="px-4 py-3 border-b border-border flex justify-between items-center">
          <h2 className="font-medium text-sm">Registros activos</h2>
          {gracePeriod?.is_within_grace && (
            <button
              className="btn btn-outline text-xs"
              onClick={() => {
                setAction({ type: 'add' });
                setEditData({
                  voucher: '', reference: '',
                  sucursal_id: '0', movement_type_id: '0',
                  entries: '0', withdrawals: '0',
                  record_date: header.arqueo_date,
                  ...DENOMINATIONS.reduce((a, d) => ({ ...a, [d.key]: '0' }), {}),
                });
                setReasonId(0);
                setReasonDetail('');
                setActionError('');
              }}
            >
              + Agregar registro
            </button>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-muted border-b border-border bg-surface/40">
              <th className="px-4 py-2">UID</th>
              <th className="px-4 py-2">Comprobante</th>
              <th className="px-4 py-2">Referencia</th>
              <th className="px-4 py-2">Entradas</th>
              <th className="px-4 py-2">Salidas</th>
              {gracePeriod?.is_within_grace && <th className="px-4 py-2" />}
            </tr>
          </thead>
          <tbody>
            {activeRecords.map((r) => (
              <tr key={r.id} className="border-b border-border/40">
                <td className="px-4 py-2 font-mono text-xs text-text-muted">{r.record_uid}</td>
                <td className="px-4 py-2">{r.voucher}</td>
                <td className="px-4 py-2 text-text-muted">{r.reference}</td>
                <td className="px-4 py-2 text-success">
                  {parseFloat(r.entries) > 0 ? `$${formatMXN(r.entries)}` : '—'}
                </td>
                <td className="px-4 py-2 text-error">
                  {parseFloat(r.withdrawals) > 0 ? `$${formatMXN(r.withdrawals)}` : '—'}
                </td>
                {gracePeriod?.is_within_grace && (
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <button
                        className="text-xs text-primary hover:underline"
                        onClick={() => openEdit(r)}
                      >
                        Editar
                      </button>
                      <button
                        className="text-xs text-error hover:underline"
                        onClick={() => {
                          setAction({ type: 'cancel', record: r });
                          setReasonId(0);
                          setReasonDetail('');
                          setActionError('');
                        }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {activeRecords.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-center text-text-muted text-xs">
                  Sin registros activos
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Contrapartidas */}
      {counterpartRecords.length > 0 && (
        <div className="card mb-4">
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
                    <span className={`badge text-xs ${
                      r.counterpart_type === 'cancellation' ? 'badge-error' : 'badge-warning'
                    }`}>
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

      {/* Panel de acción */}
      {action.type && (
        <div className="card p-5 border-t-4 border-primary">
          <h3 className="font-semibold text-sm mb-4">
            {action.type === 'cancel' && `Cancelar registro: ${action.record?.record_uid}`}
            {action.type === 'edit' && `Editar registro: ${action.record?.record_uid}`}
            {action.type === 'add' && 'Agregar nuevo registro'}
          </h3>

          {/* Campos del registro (edit y add) */}
          {(action.type === 'edit' || action.type === 'add') && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="label text-xs">Comprobante</label>
                <input
                  type="text"
                  className="input"
                  value={editData.voucher || ''}
                  onChange={(e) => setEditData((p) => ({ ...p, voucher: e.target.value }))}
                />
              </div>
              <div>
                <label className="label text-xs">Referencia</label>
                <input
                  type="text"
                  className="input"
                  value={editData.reference || ''}
                  onChange={(e) => setEditData((p) => ({ ...p, reference: e.target.value }))}
                />
              </div>
              <div>
                <label className="label text-xs">Entradas</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input text-right"
                  value={editData.entries || '0'}
                  onChange={(e) => setEditData((p) => ({ ...p, entries: e.target.value }))}
                />
              </div>
              <div>
                <label className="label text-xs">Salidas</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input text-right"
                  value={editData.withdrawals || '0'}
                  onChange={(e) => setEditData((p) => ({ ...p, withdrawals: e.target.value }))}
                />
              </div>
              <div>
                <label className="label text-xs">Fecha</label>
                <input
                  type="date"
                  className="input"
                  value={editData.record_date || ''}
                  onChange={(e) => setEditData((p) => ({ ...p, record_date: e.target.value }))}
                />
              </div>
              <div>
                <label className="label text-xs">Tipo de movimiento</label>
                <select
                  className="input"
                  value={editData.movement_type_id || '0'}
                  onChange={(e) => setEditData((p) => ({ ...p, movement_type_id: e.target.value }))}
                >
                  <option value="0">— Seleccionar —</option>
                  {movementTypes.map((mt) => (
                    <option key={mt.id} value={String(mt.id)}>
                      {mt.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Motivo */}
          <div className="grid grid-cols-2 gap-3 mb-4">
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

          {actionError && (
            <p className="text-error text-xs mb-3">{actionError}</p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              className="btn btn-ghost text-sm"
              onClick={() => setAction({ type: null })}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={processing || !reasonId}
              onClick={
                action.type === 'cancel'
                  ? handleCancel
                  : action.type === 'edit'
                  ? handleEdit
                  : handleAdd
              }
              className="btn btn-primary text-sm"
            >
              {processing
                ? 'Procesando...'
                : action.type === 'cancel'
                ? 'Confirmar cancelación'
                : action.type === 'edit'
                ? 'Confirmar edición'
                : 'Agregar registro'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
