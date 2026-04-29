// Directorio de bóvedas — CRUD completo para admin
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Power, PowerOff, Edit2, Upload } from 'lucide-react';
import { useForm, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ColumnDef } from '@tanstack/react-table';

import DataTable from '@/components/tables/DataTable';
import ComboSelect, { type ComboOption } from '@/components/ui/ComboSelect';
import DenominationGrid, { emptyDenominations } from '@/components/ui/DenominationGrid';
import BulkImportModal from '@/components/bulk/BulkImportModal';
import vaultService, { type Vault } from '@/services/vaultService';
import userService, { type Company, type Empresa, type UserResponse } from '@/services/userService';
import { formatCurrency } from '@/utils/formatters';
import { getErrorMessage } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { DENOMINATIONS } from '@/utils/constants';

const createSchema = z.object({
  vault_code: z.string().min(1, 'Código requerido.').max(20),
  vault_name: z.string().min(2, 'Nombre requerido.').max(150),
  company_id: z.number({ invalid_type_error: 'Selecciona ETV.' }).min(1),
  empresa_id: z.number({ invalid_type_error: 'Selecciona empresa.' }).min(1, 'Empresa requerida.'),
  manager_id: z.number().nullable().optional(),
  treasurer_id: z.number().nullable().optional(),
});

const sumDenominations = (d: Record<string, string>, prefix = ''): number =>
  DENOMINATIONS.reduce(
    (s, x) => s + (parseFloat(d[`${prefix}${x.key}`] || '0') || 0),
    0,
  );

const editSchema = z.object({
  vault_name: z.string().min(2, 'Nombre requerido.').max(150),
  company_id: z.number({ invalid_type_error: 'Selecciona ETV.' }).min(1, 'ETV requerida.'),
  empresa_id: z.number().nullable().optional(),
  manager_id: z.number().nullable().optional(),
  treasurer_id: z.number().nullable().optional(),
});

type CreateForm = z.infer<typeof createSchema>;
type EditForm = z.infer<typeof editSchema>;

export default function VaultDirectory() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const [vaults, setVaults] = useState<Vault[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [allEmpresas, setAllEmpresas] = useState<Empresa[]>([]);
  const [etvUsers, setEtvUsers] = useState<UserResponse[]>([]);

  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createDenoms, setCreateDenoms] = useState<Record<string, string>>(
    emptyDenominations('initial_'),
  );
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [editTarget, setEditTarget] = useState<Vault | null>(null);
  const [editError, setEditError] = useState('');
  const [editDenoms, setEditDenoms] = useState<Record<string, string>>(
    emptyDenominations('initial_'),
  );
  const [reactivateTarget, setReactivateTarget] = useState<Vault | null>(null);
  const [reactivateDenoms, setReactivateDenoms] = useState<Record<string, string>>(
    emptyDenominations('initial_'),
  );
  const [reactivateError, setReactivateError] = useState('');

  const createForm = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
  });
  const editForm = useForm<EditForm>({ resolver: zodResolver(editSchema) });

  // Opciones de personal para ComboSelect
  const userOptions = useMemo<ComboOption[]>(
    () => etvUsers.map(u => ({ value: u.id, label: u.puesto ? `${u.full_name} — ${u.puesto}` : u.full_name })),
    [etvUsers],
  );

  // Empresas filtradas según la ETV seleccionada en el form de creación
  const selectedCompanyId = useWatch({ control: createForm.control, name: 'company_id' });
  const createEmpresas = allEmpresas.filter(e => e.etv_id === selectedCompanyId && e.is_active);

  // Empresas filtradas según la ETV seleccionada actualmente en el form de edición
  // (no la ETV original de la bóveda, así el dropdown de empresa reacciona al cambio).
  const editSelectedCompanyId = useWatch({ control: editForm.control, name: 'company_id' });
  const editEmpresas = editSelectedCompanyId
    ? allEmpresas.filter(e => e.etv_id === editSelectedCompanyId && e.is_active)
    : [];

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await vaultService.listVaults({
        page, page_size: pageSize,
        search: search || undefined,
        include_inactive: includeInactive,
      });
      setVaults(data.items);
      setTotal(data.total);
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, search, includeInactive]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!isAdmin) return;
    Promise.all([
      userService.listCompanies(),
      userService.listEmpresas(),
      userService.listUsers({ page: 1, page_size: 0, role: 'etv', is_active: true }),
    ]).then(([c, e, u]) => {
      setCompanies(c);
      setAllEmpresas(e);
      setEtvUsers(u.items);
    }).catch(() => {});
  }, [isAdmin]);

  // Limpiar empresa al cambiar ETV en creación
  useEffect(() => {
    createForm.resetField('empresa_id');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId]);

  // Limpiar empresa al cambiar ETV en edición (solo si la empresa actual no
  // pertenece a la ETV nueva). Evita pisar la empresa al abrir el modal con
  // los datos originales.
  useEffect(() => {
    if (!editSelectedCompanyId || !editTarget) return;
    const currentEmpresa = editForm.getValues('empresa_id');
    if (currentEmpresa == null) return;
    const matches = allEmpresas.find(
      (e) => e.id === currentEmpresa && e.etv_id === editSelectedCompanyId,
    );
    if (!matches) editForm.setValue('empresa_id', null, { shouldValidate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editSelectedCompanyId]);

  const handleDeactivate = async (vault: Vault) => {
    if (!confirm(`¿Desactivar la bóveda ${vault.vault_code} — ${vault.vault_name}?`)) return;
    try { await vaultService.deactivateVault(vault.id); await load(); }
    catch (err) { alert(getErrorMessage(err)); }
  };

  const openReactivate = (vault: Vault) => {
    setReactivateTarget(vault);
    setReactivateDenoms(emptyDenominations('initial_'));
    setReactivateError('');
  };

  const handleReactivate = async () => {
    if (!reactivateTarget) return;
    setReactivateError('');
    try {
      await vaultService.reactivateVault(reactivateTarget.id, {
        initial_denominations: reactivateDenoms,
      });
      setReactivateTarget(null);
      await load();
    } catch (err) { setReactivateError(getErrorMessage(err)); }
  };

  const openEdit = (vault: Vault) => {
    setEditTarget(vault);
    setEditError('');
    // Cargar denominaciones existentes
    const denoms: Record<string, string> = {};
    DENOMINATIONS.forEach((d) => {
      const fld = `initial_${d.key}` as keyof Vault;
      denoms[`initial_${d.key}`] = String(vault[fld] ?? '0');
    });
    setEditDenoms(denoms);
    editForm.reset({
      vault_name: vault.vault_name,
      company_id: vault.company_id,
      empresa_id: vault.empresa_id ?? null,
      manager_id: vault.manager_id ?? null,
      treasurer_id: vault.treasurer_id ?? null,
    });
  };

  const onEditSubmit = async (data: EditForm) => {
    if (!editTarget) return;
    setEditError('');
    try {
      await vaultService.updateVault(editTarget.id, {
        vault_name: data.vault_name,
        company_id: data.company_id,
        empresa_id: data.empresa_id ?? null,
        manager_id: data.manager_id ?? null,
        treasurer_id: data.treasurer_id ?? null,
        initial_denominations: editDenoms,
      });
      setEditTarget(null);
      await load();
    } catch (err) { setEditError(getErrorMessage(err)); }
  };

  const onCreateSubmit = async (data: CreateForm) => {
    setCreateError('');
    try {
      await vaultService.createVault({
        vault_code: data.vault_code.toUpperCase(),
        vault_name: data.vault_name,
        company_id: data.company_id,
        empresa_id: data.empresa_id ?? null,
        manager_id: data.manager_id ?? null,
        treasurer_id: data.treasurer_id ?? null,
        initial_denominations: createDenoms,
      });
      setShowCreate(false);
      createForm.reset();
      setCreateDenoms(emptyDenominations('initial_'));
      await load();
    } catch (err) { setCreateError(getErrorMessage(err)); }
  };

  const getUserName = (id: number | null) => {
    if (!id) return '—';
    const u = etvUsers.find(u => u.id === id);
    return u ? u.full_name : `#${id}`;
  };

  const columns: ColumnDef<Vault>[] = [
    {
      accessorKey: 'vault_code',
      header: 'Código',
      cell: ({ getValue }) => (
        <span className="font-mono font-semibold text-primary">{String(getValue())}</span>
      ),
    },
    { accessorKey: 'vault_name', header: 'Nombre' },
    {
      accessorKey: 'current_balance',
      header: 'Saldo Actual',
      cell: ({ row }) => {
        const v = row.original;
        const balance = v.current_balance ?? v.initial_balance;
        const initialTotal = sumDenominations(v as unknown as Record<string, string>, 'initial_');
        const isUnmigrated = parseFloat(v.initial_balance) > 0 && initialTotal === 0;
        return (
          <div className="flex flex-col items-start gap-0.5">
            <span className="font-mono">{formatCurrency(String(balance))}</span>
            {isUnmigrated && (
              <span
                className="text-[10px] text-warning"
                title="Esta bóveda tiene saldo inicial pero no tiene desglose por denominación. Edítala para capturar el desglose y activar las validaciones."
              >
                ⚠ Sin migrar
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: 'manager',
      header: 'Gerente',
      cell: ({ row }) => (
        <span className="text-sm text-text-secondary">{getUserName(row.original.manager_id)}</span>
      ),
    },
    {
      id: 'treasurer',
      header: 'Tesorero',
      cell: ({ row }) => (
        <span className="text-sm text-text-secondary">{getUserName(row.original.treasurer_id)}</span>
      ),
    },
    {
      accessorKey: 'is_active',
      header: 'Estado',
      cell: ({ getValue }) => (
        <span className={getValue() ? 'badge-success' : 'badge-error'}>
          {getValue() ? 'Activa' : 'Inactiva'}
        </span>
      ),
    },
    ...(isAdmin
      ? [{
          id: 'actions',
          header: 'Acciones',
          cell: ({ row }: { row: { original: Vault } }) => {
            const vault = row.original;
            return (
              <div className="flex items-center gap-2">
                {vault.is_active && (
                  <button
                    onClick={() => openEdit(vault)}
                    className="flex items-center gap-1 text-xs text-primary hover:bg-primary/10 px-2 py-1 rounded"
                  >
                    <Edit2 className="w-3.5 h-3.5" /> Editar
                  </button>
                )}
                {vault.is_active ? (
                  <button
                    onClick={() => handleDeactivate(vault)}
                    className="flex items-center gap-1 text-xs text-status-error hover:bg-status-error-light px-2 py-1 rounded"
                  >
                    <PowerOff className="w-3.5 h-3.5" /> Desactivar
                  </button>
                ) : (
                  <button
                    onClick={() => openReactivate(vault)}
                    className="flex items-center gap-1 text-xs text-status-success hover:bg-status-success-light px-2 py-1 rounded"
                  >
                    <Power className="w-3.5 h-3.5" /> Reactivar
                  </button>
                )}
              </div>
            );
          },
        } as ColumnDef<Vault>]
      : []),
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-text-primary">Directorio de Bóvedas</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="rounded"
            />
            Mostrar inactivas
          </label>
          {isAdmin && (
            <>
              <button
                onClick={() => setShowBulkImport(true)}
                className="btn-outline flex items-center gap-2"
              >
                <Upload className="w-4 h-4" /> Carga masiva
              </button>
              <button
                onClick={() => {
                  setShowCreate(true);
                  setCreateError('');
                  createForm.reset();
                  setCreateDenoms(emptyDenominations('initial_'));
                }}
                className="btn-primary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Nueva bóveda
              </button>
            </>
          )}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={vaults}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        onSearch={(q) => { setSearch(q); setPage(1); }}
        searchPlaceholder="Buscar por código o nombre..."
        isLoading={isLoading}
      />

      {/* ─── Modal Crear ─────────────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-3xl shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-border flex-shrink-0">
              <h2 className="text-base font-semibold text-text-primary">Nueva Bóveda</h2>
              <button onClick={() => setShowCreate(false)} className="text-text-muted hover:text-text-primary text-lg leading-none">×</button>
            </div>
            <form
              onSubmit={createForm.handleSubmit(onCreateSubmit)}
              className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0"
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Código</label>
                  <input
                    type="text" placeholder="Ej. 9001"
                    className={createForm.formState.errors.vault_code ? 'input-error uppercase' : 'input uppercase'}
                    {...createForm.register('vault_code')}
                  />
                  {createForm.formState.errors.vault_code && (
                    <p className="text-status-error text-xs mt-1">{createForm.formState.errors.vault_code.message}</p>
                  )}
                </div>
                <div>
                  <label className="label">Saldo inicial total</label>
                  <input
                    type="text" disabled
                    className="input bg-surface text-text-muted"
                    value={`$${sumDenominations(createDenoms, 'initial_').toLocaleString('es-MX', { minimumFractionDigits: 2 })}`}
                  />
                  <p className="text-xs text-text-muted mt-1">
                    Se calcula desde el desglose por denominación.
                  </p>
                </div>
                <div className="col-span-2">
                  <label className="label">Nombre</label>
                  <input
                    type="text" placeholder="Nombre descriptivo de la bóveda"
                    className={createForm.formState.errors.vault_name ? 'input-error' : 'input'}
                    {...createForm.register('vault_name')}
                  />
                  {createForm.formState.errors.vault_name && (
                    <p className="text-status-error text-xs mt-1">{createForm.formState.errors.vault_name.message}</p>
                  )}
                </div>
                <div>
                  <label className="label">ETV</label>
                  <select
                    className={createForm.formState.errors.company_id ? 'input-error' : 'input'}
                    {...createForm.register('company_id', { valueAsNumber: true })}
                  >
                    <option value="">Seleccionar...</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {createForm.formState.errors.company_id && (
                    <p className="text-status-error text-xs mt-1">{createForm.formState.errors.company_id.message}</p>
                  )}
                </div>
                <div>
                  <label className="label">Empresa</label>
                  <select
                    className={createForm.formState.errors.empresa_id ? 'input-error' : 'input'}
                    {...createForm.register('empresa_id', { valueAsNumber: true })}
                    disabled={!selectedCompanyId || createEmpresas.length === 0}
                  >
                    <option value="">Seleccionar...</option>
                    {createEmpresas.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                  {createForm.formState.errors.empresa_id && (
                    <p className="text-status-error text-xs mt-1">{createForm.formState.errors.empresa_id.message}</p>
                  )}
                </div>
                <div>
                  <label className="label">Gerente (opcional)</label>
                  <Controller
                    control={createForm.control}
                    name="manager_id"
                    render={({ field }) => (
                      <ComboSelect
                        options={userOptions}
                        value={field.value ?? null}
                        onChange={field.onChange}
                        placeholder="Buscar gerente..."
                        emptyLabel="Ninguno"
                      />
                    )}
                  />
                </div>
                <div>
                  <label className="label">Tesorero (opcional)</label>
                  <Controller
                    control={createForm.control}
                    name="treasurer_id"
                    render={({ field }) => (
                      <ComboSelect
                        options={userOptions}
                        value={field.value ?? null}
                        onChange={field.onChange}
                        placeholder="Buscar tesorero..."
                        emptyLabel="Ninguno"
                      />
                    )}
                  />
                </div>
              </div>

              {/* Saldo inicial por denominación */}
              <div className="border-t border-border pt-4">
                <p className="text-sm font-medium text-text-primary mb-2">
                  Saldo inicial por denominación
                </p>
                <p className="text-xs text-text-muted mb-3">
                  Captura el efectivo físico que la bóveda contiene al darse de alta. El
                  total se usa como saldo inicial.
                </p>
                <DenominationGrid
                  prefix="initial_"
                  value={createDenoms}
                  onChange={setCreateDenoms}
                />
              </div>

              {createError && <p className="text-status-error text-sm">{createError}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" disabled={createForm.formState.isSubmitting} className="btn-primary flex-1">
                  {createForm.formState.isSubmitting ? 'Creando...' : 'Crear bóveda'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal Editar ─────────────────────────────────────────────── */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-3xl shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-border flex-shrink-0">
              <h2 className="text-base font-semibold text-text-primary">
                Editar Bóveda — <span className="font-mono text-primary">{editTarget.vault_code}</span>
              </h2>
              <button onClick={() => setEditTarget(null)} className="text-text-muted hover:text-text-primary text-lg leading-none">×</button>
            </div>
            <form
              onSubmit={editForm.handleSubmit(onEditSubmit)}
              className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="label">Nombre</label>
                  <input
                    type="text"
                    className={editForm.formState.errors.vault_name ? 'input-error' : 'input'}
                    {...editForm.register('vault_name')}
                  />
                  {editForm.formState.errors.vault_name && (
                    <p className="text-status-error text-xs mt-1">{editForm.formState.errors.vault_name.message}</p>
                  )}
                </div>
                <div>
                  <label className="label">ETV</label>
                  <select
                    className={editForm.formState.errors.company_id ? 'input-error' : 'input'}
                    {...editForm.register('company_id', { valueAsNumber: true })}
                  >
                    <option value="">Seleccionar...</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {editForm.formState.errors.company_id && (
                    <p className="text-status-error text-xs mt-1">{editForm.formState.errors.company_id.message}</p>
                  )}
                </div>
                <div>
                  <label className="label">Empresa (opcional)</label>
                  <select
                    className={editForm.formState.errors.empresa_id ? 'input-error' : 'input'}
                    {...editForm.register('empresa_id', { setValueAs: (v) => (v === '' || v == null ? null : Number(v)) })}
                    disabled={!editSelectedCompanyId || editEmpresas.length === 0}
                  >
                    <option value="">Ninguna</option>
                    {editEmpresas.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                  {editForm.formState.errors.empresa_id && (
                    <p className="text-status-error text-xs mt-1">{editForm.formState.errors.empresa_id.message}</p>
                  )}
                </div>
                <div>
                  <label className="label">Gerente</label>
                  <Controller
                    control={editForm.control}
                    name="manager_id"
                    render={({ field }) => (
                      <ComboSelect
                        options={userOptions}
                        value={field.value ?? null}
                        onChange={field.onChange}
                        placeholder="Buscar gerente..."
                        emptyLabel="Ninguno"
                      />
                    )}
                  />
                </div>
                <div>
                  <label className="label">Tesorero</label>
                  <Controller
                    control={editForm.control}
                    name="treasurer_id"
                    render={({ field }) => (
                      <ComboSelect
                        options={userOptions}
                        value={field.value ?? null}
                        onChange={field.onChange}
                        placeholder="Buscar tesorero..."
                        emptyLabel="Ninguno"
                      />
                    )}
                  />
                </div>
              </div>
              {/* Saldo inicial por denominación (editable también desde aquí) */}
              <div className="border-t border-border pt-4">
                <p className="text-sm font-medium text-text-primary mb-2">
                  Saldo inicial por denominación
                </p>
                <p className="text-xs text-text-muted mb-3">
                  Modificar afecta el saldo inicial total y el inventario disponible
                  para validaciones futuras.
                </p>
                <DenominationGrid
                  prefix="initial_"
                  value={editDenoms}
                  onChange={setEditDenoms}
                />
              </div>

              {editError && <p className="text-status-error text-sm">{editError}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditTarget(null)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" disabled={editForm.formState.isSubmitting} className="btn-primary flex-1">
                  {editForm.formState.isSubmitting ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal Reactivar ──────────────────────────────────────────── */}
      {reactivateTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl shadow-xl max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-base font-semibold text-text-primary">Reactivar Bóveda</h2>
              <button onClick={() => setReactivateTarget(null)} className="text-text-muted hover:text-text-primary text-lg leading-none">×</button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-text-secondary">
                Bóveda: <span className="font-mono text-primary font-semibold">{reactivateTarget.vault_code}</span> — {reactivateTarget.vault_name}
              </p>
              <div>
                <p className="text-sm font-medium text-text-primary mb-2">
                  Saldo inicial de reactivación
                </p>
                <p className="text-xs text-text-muted mb-3">
                  Captura el desglose del efectivo físico al momento de reactivar.
                </p>
                <DenominationGrid
                  prefix="initial_"
                  value={reactivateDenoms}
                  onChange={setReactivateDenoms}
                />
              </div>
              {reactivateError && <p className="text-status-error text-sm">{reactivateError}</p>}
              <div className="flex gap-3">
                <button onClick={() => setReactivateTarget(null)} className="btn-secondary flex-1">Cancelar</button>
                <button onClick={handleReactivate} className="btn-primary flex-1">Reactivar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showBulkImport && (
        <BulkImportModal
          title="Carga masiva de bóvedas"
          endpoint="/vaults/bulk-import"
          templateFilename="bovedas_template.csv"
          renderRowSummary={(item) => (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              <span className="font-mono font-medium">{String(item.vault_code ?? '')}</span>
              <span className="text-text-muted">{String(item.vault_name ?? '')}</span>
              {Boolean(item.company_name) && (
                <span className="text-text-muted text-[11px]">
                  ETV: {String(item.company_name)}
                </span>
              )}
              {Boolean(item.initial_balance) && (
                <span className="text-text-muted text-[11px]">
                  Saldo inicial: ${String(item.initial_balance)}
                </span>
              )}
            </div>
          )}
          onClose={() => setShowBulkImport(false)}
          onSuccess={load}
        />
      )}
    </div>
  );
}
