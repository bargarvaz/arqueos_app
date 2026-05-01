// Gestión de usuarios — solo Admin
import { useState, useEffect, useCallback } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { UserPlus, KeyRound, Vault, Edit2, Copy, Check, Eye, EyeOff, Users as UsersIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import DataTable from '@/components/tables/DataTable';
import userService, {
  type UserResponse,
  type UserDetailResponse,
  type Company,
  type Empresa,
} from '@/services/userService';
import vaultService, { type Vault as VaultType } from '@/services/vaultService';
import { formatUserRole } from '@/utils/formatters';
import { getErrorMessage } from '@/services/api';
import BulkImportModal from '@/components/bulk/BulkImportModal';
import { Upload } from 'lucide-react';
import VaultAssignmentsModal from '@/components/users/VaultAssignmentsModal';

const createSchema = z
  .object({
    email: z.string().email('Email inválido.'),
    full_name: z.string().min(2, 'Nombre requerido.'),
    role: z.enum(['admin', 'operations', 'data_science', 'etv'], {
      errorMap: () => ({ message: 'Selecciona un rol.' }),
    }),
    etv_subrole: z.enum(['gerente', 'tesorero']).optional(),
    puesto: z.string().min(2, 'Puesto requerido.'),
    company_id: z.number().nullable().optional(),
    empresa_id: z.number().nullable().optional(),
  })
  .refine(
    (d) => d.role !== 'etv' || !!d.etv_subrole,
    { message: 'Selecciona Gerente o Tesorero.', path: ['etv_subrole'] },
  )
  .refine(
    (d) => d.role !== 'etv' || !!d.company_id,
    { message: 'ETV requerida.', path: ['company_id'] },
  );

type CreateForm = z.infer<typeof createSchema>;

const editSchema = z
  .object({
    full_name: z.string().min(2, 'Nombre requerido.'),
    puesto: z.string().optional().nullable(),
    role: z.enum(['admin', 'operations', 'data_science', 'etv']),
    etv_subrole: z.enum(['gerente', 'tesorero']).optional().nullable(),
    company_id: z.number().nullable().optional(),
    empresa_id: z.number().nullable().optional(),
  })
  .refine(
    (d) => d.role !== 'etv' || !!d.etv_subrole,
    { message: 'Selecciona Gerente o Tesorero.', path: ['etv_subrole'] },
  )
  .refine(
    (d) => d.role !== 'etv' || !!d.company_id,
    { message: 'ETV requerida.', path: ['company_id'] },
  );

type EditForm = z.infer<typeof editSchema>;

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Administrador' },
  { value: 'operations', label: 'Operaciones' },
  { value: 'data_science', label: 'Ciencia de Datos' },
  { value: 'etv', label: 'ETV' },
];

function getUserTypeLabel(role: string) {
  return role === 'etv' ? 'Externo' : 'Interno';
}

export default function UserManagement() {
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  // Por defecto solo activos. El toggle "Ver inactivos" lo cambia a `false`.
  const [showActive, setShowActive] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [counts, setCounts] = useState<{
    admin: number;
    operations: number;
    data_science: number;
    etv: number;
    total: number;
  } | null>(null);

  // Crear usuario
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createError, setCreateError] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [tempPasswordCopied, setTempPasswordCopied] = useState(false);
  const [tempPasswordReason, setTempPasswordReason] =
    useState<'created' | 'reset'>('created');
  const [createVaults, setCreateVaults] = useState<number[]>([]);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showVaultAssignments, setShowVaultAssignments] = useState(false);

  // Auto-copia la contraseña temporal al portapapeles cuando se genera
  useEffect(() => {
    if (!tempPassword) return;
    let cancelled = false;
    (async () => {
      try {
        await navigator.clipboard.writeText(tempPassword);
        if (!cancelled) setTempPasswordCopied(true);
      } catch {
        if (!cancelled) setTempPasswordCopied(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tempPassword]);

  const copyTempPassword = async () => {
    try {
      await navigator.clipboard.writeText(tempPassword);
      setTempPasswordCopied(true);
    } catch {
      setTempPasswordCopied(false);
    }
  };

  // Editar bóvedas
  const [vaultModalUser, setVaultModalUser] = useState<UserDetailResponse | null>(null);
  const [editingVaults, setEditingVaults] = useState<number[]>([]);
  const [vaultSaving, setVaultSaving] = useState(false);
  const [vaultError, setVaultError] = useState('');

  // Editar usuario (datos)
  const [editTarget, setEditTarget] = useState<UserResponse | null>(null);
  const [editError, setEditError] = useState('');
  const [editEmpresas, setEditEmpresas] = useState<Empresa[]>([]);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [allVaults, setAllVaults] = useState<VaultType[]>([]);
  const [vaultsLoading, setVaultsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateForm>({ resolver: zodResolver(createSchema) });

  const editForm = useForm<EditForm>({ resolver: zodResolver(editSchema) });
  const editRole = editForm.watch('role');
  const editCompanyId = editForm.watch('company_id');

  const watchRole = watch('role');
  const watchCompanyId = watch('company_id');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [data, counts] = await Promise.all([
        userService.listUsers({
          page,
          page_size: pageSize,
          search: search || undefined,
          role: roleFilter || undefined,
          is_active: showActive,
        }),
        userService.getUserCounts({ is_active: showActive }),
      ]);
      setCounts(counts);
      setUsers(data.items);
      setTotal(data.total);
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, search, roleFilter, showActive]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    userService.listCompanies().then(setCompanies).catch(() => {});
  }, []);

  const loadVaults = useCallback(async () => {
    if (allVaults.length > 0) return;
    setVaultsLoading(true);
    try {
      const d = await vaultService.listVaults({ page: 1, page_size: 0, include_inactive: false });
      setAllVaults(d.items);
    } catch {
      // error silencioso — se mostrará "sin bóvedas" en la UI
    } finally {
      setVaultsLoading(false);
    }
  }, [allVaults.length]);

  useEffect(() => {
    if (watchRole === 'etv' && watchCompanyId) {
      userService.listEmpresas({ etv_id: watchCompanyId }).then(setEmpresas).catch(() => {});
    } else {
      setEmpresas([]);
    }
  }, [watchRole, watchCompanyId]);

  // Empresas filtradas por la ETV elegida en el form de edición
  useEffect(() => {
    if (editRole === 'etv' && editCompanyId) {
      userService
        .listEmpresas({ etv_id: editCompanyId })
        .then(setEditEmpresas)
        .catch(() => setEditEmpresas([]));
    } else {
      setEditEmpresas([]);
    }
  }, [editRole, editCompanyId]);

  // Si cambia la ETV en edición, limpiar empresa si ya no pertenece
  useEffect(() => {
    if (!editTarget || editRole !== 'etv') return;
    const current = editForm.getValues('empresa_id');
    if (current == null) return;
    const stillValid = editEmpresas.find((e) => e.id === current);
    if (!stillValid) editForm.setValue('empresa_id', null, { shouldValidate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editEmpresas]);

  // ─── Acciones de tabla ───────────────────────────────────────────────────────

  const handleToggleActive = async (user: UserResponse) => {
    const action = user.is_active ? 'desactivar' : 'activar';
    if (!confirm(`¿${action.charAt(0).toUpperCase() + action.slice(1)} al usuario ${user.email}?`)) return;
    try {
      await userService.updateUser(user.id, { is_active: !user.is_active });
      await load();
    } catch (err) {
      alert(getErrorMessage(err));
    }
  };

  const handleResetPassword = async (user: UserResponse) => {
    if (!confirm(`¿Resetear contraseña de ${user.email}? Se generará una temporal.`)) return;
    try {
      const result = await userService.resetPassword(user.id);
      // Reusa el modal con auto-copia y feedback.
      setTempPasswordReason('reset');
      setTempPassword(result.temp_password);
      setShowCreateModal(true);
    } catch (err) {
      alert(getErrorMessage(err));
    }
  };

  const openEdit = (u: UserResponse) => {
    setEditTarget(u);
    setEditError('');
    editForm.reset({
      full_name: u.full_name,
      puesto: u.puesto ?? '',
      role: u.role as EditForm['role'],
      etv_subrole: u.etv_subrole ?? null,
      company_id: u.company_id ?? null,
      empresa_id: u.empresa_id ?? null,
    });
  };

  const onEditSubmit = async (data: EditForm) => {
    if (!editTarget) return;
    setEditError('');
    try {
      const isEtv = data.role === 'etv';
      await userService.updateUser(editTarget.id, {
        full_name: data.full_name,
        puesto: data.puesto?.toString().trim() || null,
        etv_subrole: isEtv ? data.etv_subrole ?? null : null,
        company_id: isEtv ? data.company_id ?? null : null,
        empresa_id: isEtv ? data.empresa_id ?? null : null,
      });
      setEditTarget(null);
      await load();
    } catch (err) {
      setEditError(getErrorMessage(err));
    }
  };

  const openVaultModal = async (user: UserResponse) => {
    await loadVaults();
    try {
      const detail = await userService.getUser(user.id);
      setVaultModalUser(detail);
      setEditingVaults(detail.assigned_vault_ids);
      setVaultError('');
    } catch (err) {
      alert(getErrorMessage(err));
    }
  };

  const saveVaults = async () => {
    if (!vaultModalUser) return;
    setVaultSaving(true);
    setVaultError('');
    try {
      await userService.assignVaults(vaultModalUser.id, editingVaults);
      setVaultModalUser(null);
      await load();
    } catch (err) {
      setVaultError(getErrorMessage(err));
    } finally {
      setVaultSaving(false);
    }
  };

  // ─── Crear usuario ───────────────────────────────────────────────────────────

  const onCreateSubmit = async (data: CreateForm) => {
    setCreateError('');
    // Validación condicional: si el ETV tiene sub-empresas configuradas,
    // hay que elegir una. Si no tiene, el campo no se renderiza y no aplica.
    if (
      data.role === 'etv' &&
      empresas.length > 0 &&
      (data.empresa_id == null || Number.isNaN(data.empresa_id))
    ) {
      setError('empresa_id', {
        type: 'manual',
        message: 'Empresa requerida.',
      });
      return;
    }
    try {
      const { tempPassword: tp } = await userService.createUser({
        email: data.email,
        full_name: data.full_name,
        role: data.role,
        etv_subrole: data.role === 'etv' ? data.etv_subrole ?? null : null,
        puesto: data.puesto || null,
        company_id: data.role === 'etv' ? data.company_id ?? null : null,
        empresa_id: data.role === 'etv' ? data.empresa_id ?? null : null,
        vault_ids: data.role === 'etv' ? createVaults : [],
      });
      setTempPasswordReason('created');
      setTempPassword(tp);
      reset();
      setCreateVaults([]);
      await load();
      if (!tp) setShowCreateModal(false);
    } catch (err) {
      setCreateError(getErrorMessage(err));
    }
  };

  const closeCreate = () => {
    setShowCreateModal(false);
    setTempPassword('');
    setTempPasswordCopied(false);
    setTempPasswordReason('created');
    setCreateError('');
    reset();
    setCreateVaults([]);
    setEmpresas([]);
  };

  // ─── Columnas ────────────────────────────────────────────────────────────────

  const columns: ColumnDef<UserResponse>[] = [
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ getValue }) => <span className="font-mono text-sm">{String(getValue())}</span>,
    },
    { accessorKey: 'full_name', header: 'Nombre' },
    {
      accessorKey: 'puesto',
      header: 'Puesto',
      cell: ({ getValue }) => (
        <span className="text-xs text-text-secondary">{String(getValue() ?? '—')}</span>
      ),
    },
    {
      accessorKey: 'role',
      header: 'Rol',
      cell: ({ row }) => {
        const u = row.original;
        return (
          <div className="flex flex-col items-start gap-0.5">
            <span className="badge-neutral">{formatUserRole(u.role)}</span>
            {u.etv_subrole && (
              <span className="text-[10px] text-text-muted capitalize">
                {u.etv_subrole}
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'is_active',
      header: 'Estado',
      cell: ({ getValue }) => (
        <span className={getValue() ? 'badge-success' : 'badge-error'}>
          {getValue() ? 'Activo' : 'Inactivo'}
        </span>
      ),
    },
    {
      accessorKey: 'must_change_password',
      header: 'Contraseña',
      cell: ({ getValue }) => (
        <span className={getValue() ? 'badge-warning text-xs' : 'text-text-muted text-xs'}>
          {getValue() ? 'Pendiente' : 'OK'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Acciones',
      cell: ({ row }) => {
        const u = row.original;
        return (
          <div className="flex items-center gap-2">
            <button
              onClick={() => openEdit(u)}
              className="flex items-center gap-1 text-xs text-primary hover:bg-primary/10 px-2 py-1 rounded"
              title="Editar usuario"
            >
              <Edit2 className="w-3.5 h-3.5" />
              Editar
            </button>
            {u.role === 'etv' && (
              <button
                onClick={() => openVaultModal(u)}
                className="flex items-center gap-1 text-xs text-secondary hover:bg-secondary/10 px-2 py-1 rounded"
                title="Gestionar bóvedas asignadas"
              >
                <Vault className="w-3.5 h-3.5" />
                Bóvedas
              </button>
            )}
            <button
              onClick={() => handleResetPassword(u)}
              className="flex items-center gap-1 text-xs text-primary hover:bg-primary/10 px-2 py-1 rounded"
              title="Resetear contraseña"
            >
              <KeyRound className="w-3.5 h-3.5" />
              Reset
            </button>
            {u.is_primary_admin ? (
              <span
                className="flex items-center gap-1 text-xs text-text-muted px-2 py-1"
                title="La cuenta de administrador principal no puede desactivarse."
              >
                Protegida
              </span>
            ) : (
              <button
                onClick={() => handleToggleActive(u)}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${
                  u.is_active
                    ? 'text-status-error hover:bg-status-error-light'
                    : 'text-status-success hover:bg-status-success-light'
                }`}
              >
                {u.is_active ? 'Desactivar' : 'Activar'}
              </button>
            )}
          </div>
        );
      },
    },
  ];

  const activeVaults = allVaults.filter(v => v.is_active);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-text-primary">Gestión de Usuarios</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowVaultAssignments(true)}
            className="btn-outline flex items-center gap-2"
            title="Ver qué usuarios tienen acceso a cada bóveda"
          >
            <UsersIcon className="w-4 h-4" />
            Asignaciones por bóveda
          </button>
          <button
            onClick={() => setShowBulkImport(true)}
            className="btn-outline flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Carga masiva
          </button>
          <button
            onClick={() => {
              setTempPasswordReason('created');
              setShowCreateModal(true);
              loadVaults();
            }}
            className="btn-primary flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Nuevo usuario
          </button>
        </div>
      </div>

      {/* Fila única: chips de conteo + toggle activos/inactivos a la derecha */}
      {counts && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => { setRoleFilter(''); setPage(1); }}
            className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
              roleFilter === ''
                ? 'bg-primary/10 border-primary/30 text-primary font-semibold'
                : 'bg-background border-border text-text-secondary hover:bg-surface'
            }`}
          >
            Total <span className="ml-1 font-mono">{counts.total}</span>
          </button>
          {ROLE_OPTIONS.map((r) => {
            const value = counts[r.value as keyof typeof counts] as number;
            const isSelected = roleFilter === r.value;
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => {
                  setRoleFilter(isSelected ? '' : r.value);
                  setPage(1);
                }}
                className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                  isSelected
                    ? 'bg-primary/10 border-primary/30 text-primary font-semibold'
                    : 'bg-background border-border text-text-secondary hover:bg-surface'
                }`}
                title={`Filtrar por ${r.label}`}
              >
                {r.label} <span className="ml-1 font-mono">{value}</span>
              </button>
            );
          })}

          {/* Bloque derecho: etiqueta + toggle */}
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-text-muted">
              Mostrando: <strong className="text-text-primary">
                {showActive ? 'activos' : 'inactivos'}
              </strong>
              {roleFilter && (
                <>
                  {' · '}rol:{' '}
                  <strong className="text-text-primary">
                    {ROLE_OPTIONS.find((r) => r.value === roleFilter)?.label ?? roleFilter}
                  </strong>
                  <button
                    type="button"
                    onClick={() => { setRoleFilter(''); setPage(1); }}
                    className="ml-1.5 text-primary hover:underline"
                    title="Quitar filtro por rol"
                  >
                    limpiar
                  </button>
                </>
              )}
            </span>
            <button
              type="button"
              onClick={() => { setShowActive((v) => !v); setPage(1); }}
              className="btn-outline text-sm flex items-center gap-2"
              title={
                showActive ? 'Ver usuarios inactivos' : 'Volver a usuarios activos'
              }
            >
              {showActive ? (
                <>
                  <EyeOff className="w-4 h-4" />
                  Ver inactivos
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4" />
                  Ver activos
                </>
              )}
            </button>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        data={users}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        onSearch={(q) => { setSearch(q); setPage(1); }}
        searchPlaceholder="Buscar por email o nombre..."
        isLoading={isLoading}
      />

      {/* ─── Modal: Crear usuario ─────────────────────────────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-lg shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-border flex-shrink-0">
              <h2 className="text-base font-semibold text-text-primary">
                {tempPassword
                  ? tempPasswordReason === 'reset'
                    ? 'Contraseña restablecida'
                    : 'Usuario creado'
                  : 'Nuevo Usuario'}
              </h2>
              <button onClick={closeCreate} className="text-text-muted hover:text-text-primary text-lg leading-none">×</button>
            </div>

            {tempPassword ? (
              <div className="p-6">
                <div className="bg-status-success-light border border-status-success rounded-lg p-4 mb-4">
                  <p className="text-sm font-semibold text-status-success mb-1">
                    {tempPasswordReason === 'reset'
                      ? 'Contraseña restablecida'
                      : 'Usuario creado exitosamente'}
                  </p>
                  <p className="text-sm text-text-secondary">
                    Contraseña temporal (comunícala por un canal seguro):
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <p className="font-mono text-base font-bold text-text-primary bg-background border border-border rounded-lg px-3 py-2 select-all flex-1 break-all">
                      {tempPassword}
                    </p>
                    <button
                      type="button"
                      onClick={copyTempPassword}
                      title="Copiar al portapapeles"
                      className="btn-outline px-3 py-2 flex-shrink-0"
                    >
                      {tempPasswordCopied ? (
                        <Check className="w-4 h-4 text-status-success" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-status-success mt-2 flex items-center gap-1">
                    {tempPasswordCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Copiada al portapapeles. Pégala con Ctrl+V donde la
                        necesites.
                      </>
                    ) : (
                      'No se pudo copiar automáticamente. Usa el botón.'
                    )}
                  </p>
                </div>
                <button onClick={closeCreate} className="btn-primary w-full">
                  Cerrar
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit(onCreateSubmit)} className="p-5 space-y-4 overflow-y-auto flex-1">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="label">
                      Correo electrónico <span className="text-status-error">*</span>
                    </label>
                    <input type="email" className={errors.email ? 'input-error' : 'input'} {...register('email')} />
                    {errors.email && <p className="text-status-error text-xs mt-1">{errors.email.message}</p>}
                  </div>
                  <div className="col-span-2">
                    <label className="label">
                      Nombre completo <span className="text-status-error">*</span>
                    </label>
                    <input type="text" className={errors.full_name ? 'input-error' : 'input'} {...register('full_name')} />
                    {errors.full_name && <p className="text-status-error text-xs mt-1">{errors.full_name.message}</p>}
                  </div>
                  <div>
                    <label className="label">
                      Rol <span className="text-status-error">*</span>
                    </label>
                    <select
                      className={errors.role ? 'input-error' : 'input'}
                      {...register('role')}
                    >
                      <option value="">Seleccionar...</option>
                      {ROLE_OPTIONS.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                    {errors.role && <p className="text-status-error text-xs mt-1">{errors.role.message}</p>}
                  </div>
                  <div>
                    <label className="label">
                      {watchRole === 'etv' ? 'Sub-rol ETV' : 'Tipo de usuario'}
                      {watchRole === 'etv' && <span className="text-status-error"> *</span>}
                    </label>
                    {watchRole === 'etv' ? (
                      <>
                        <select
                          className={errors.etv_subrole ? 'input-error' : 'input'}
                          {...register('etv_subrole')}
                        >
                          <option value="">Seleccionar...</option>
                          <option value="gerente">Gerente</option>
                          <option value="tesorero">Tesorero</option>
                        </select>
                        {errors.etv_subrole && (
                          <p className="text-status-error text-xs mt-1">
                            {errors.etv_subrole.message}
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <input
                          type="text"
                          readOnly
                          className="input bg-surface text-text-muted cursor-default"
                          value={watchRole ? getUserTypeLabel(watchRole) : '—'}
                        />
                        <p className="text-text-muted text-xs mt-1">Auto por rol</p>
                      </>
                    )}
                  </div>
                  <div className="col-span-2">
                    <label className="label">
                      Puesto <span className="text-status-error">*</span>
                    </label>
                    <input
                      type="text"
                      className={errors.puesto ? 'input-error' : 'input'}
                      placeholder="Ej. Gerente de Operaciones"
                      {...register('puesto')}
                    />
                    {errors.puesto && (
                      <p className="text-status-error text-xs mt-1">
                        {errors.puesto.message}
                      </p>
                    )}
                  </div>

                  {watchRole === 'etv' && (
                    <>
                      <div className="col-span-2">
                        <label className="label">
                          ETV (transportadora) <span className="text-status-error">*</span>
                        </label>
                        <select
                          className={errors.company_id ? 'input-error' : 'input'}
                          {...register('company_id', { valueAsNumber: true })}
                        >
                          <option value="">Seleccionar ETV...</option>
                          {companies.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                        {errors.company_id && (
                          <p className="text-status-error text-xs mt-1">
                            {errors.company_id.message}
                          </p>
                        )}
                      </div>
                      {empresas.length > 0 && (
                        <div className="col-span-2">
                          <label className="label">
                            Empresa <span className="text-status-error">*</span>
                          </label>
                          <select
                            className={errors.empresa_id ? 'input-error' : 'input'}
                            {...register('empresa_id', { valueAsNumber: true })}
                          >
                            <option value="">Seleccionar empresa...</option>
                            {empresas.map(e => (
                              <option key={e.id} value={e.id}>{e.name}</option>
                            ))}
                          </select>
                          {errors.empresa_id && (
                            <p className="text-status-error text-xs mt-1">
                              {errors.empresa_id.message}
                            </p>
                          )}
                        </div>
                      )}
                      <div className="col-span-2">
                        <label className="label">
                          Bóvedas asignadas
                          {createVaults.length > 0 && (
                            <span className="ml-2 text-primary font-normal">({createVaults.length} seleccionada{createVaults.length > 1 ? 's' : ''})</span>
                          )}
                        </label>
                        <div className="border border-border rounded max-h-40 overflow-y-auto p-2 space-y-1">
                          {vaultsLoading ? (
                            <p className="text-xs text-text-muted px-1 py-2">Cargando bóvedas...</p>
                          ) : activeVaults.length === 0 ? (
                            <p className="text-xs text-text-muted px-1 py-2">No hay bóvedas activas disponibles.</p>
                          ) : (
                            activeVaults.map(v => (
                              <label key={v.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-surface rounded px-1 py-0.5">
                                <input
                                  type="checkbox"
                                  checked={createVaults.includes(v.id)}
                                  onChange={(e) => {
                                    setCreateVaults(prev =>
                                      e.target.checked ? [...prev, v.id] : prev.filter(id => id !== v.id)
                                    );
                                  }}
                                  className="rounded"
                                />
                                <span className="font-mono text-xs text-primary">{v.vault_code}</span>
                                <span className="text-text-secondary">{v.vault_name}</span>
                              </label>
                            ))
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {createError && <p className="text-status-error text-sm">{createError}</p>}

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={closeCreate} className="btn-secondary flex-1">Cancelar</button>
                  <button type="submit" disabled={isSubmitting} className="btn-primary flex-1">
                    {isSubmitting ? 'Creando...' : 'Crear usuario'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ─── Modal: Editar usuario ──────────────────────────────────────────── */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-lg shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-border flex-shrink-0">
              <div>
                <h2 className="text-base font-semibold text-text-primary">Editar Usuario</h2>
                <p className="text-xs text-text-muted mt-0.5">{editTarget.email}</p>
              </div>
              <button
                onClick={() => setEditTarget(null)}
                className="text-text-muted hover:text-text-primary text-lg leading-none"
              >
                ×
              </button>
            </div>
            <form
              onSubmit={editForm.handleSubmit(onEditSubmit)}
              className="p-5 space-y-4 overflow-y-auto flex-1"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="label">Nombre completo</label>
                  <input
                    type="text"
                    className={editForm.formState.errors.full_name ? 'input-error' : 'input'}
                    {...editForm.register('full_name')}
                  />
                  {editForm.formState.errors.full_name && (
                    <p className="text-status-error text-xs mt-1">
                      {editForm.formState.errors.full_name.message}
                    </p>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="label">Puesto</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Ej. Gerente de Operaciones"
                    {...editForm.register('puesto')}
                  />
                </div>
                <div>
                  <label className="label">Rol</label>
                  <input
                    type="text"
                    readOnly
                    className="input bg-surface text-text-muted cursor-default"
                    value={ROLE_OPTIONS.find((r) => r.value === editRole)?.label ?? ''}
                  />
                  <input type="hidden" {...editForm.register('role')} />
                  <p className="text-text-muted text-xs mt-1">
                    El rol no se puede modificar.
                  </p>
                </div>
                {editRole === 'etv' && (
                  <div>
                    <label className="label">
                      Sub-rol ETV <span className="text-status-error">*</span>
                    </label>
                    <select
                      className={editForm.formState.errors.etv_subrole ? 'input-error' : 'input'}
                      {...editForm.register('etv_subrole', {
                        setValueAs: (v) => (v === '' || v == null ? null : v),
                      })}
                    >
                      <option value="">Seleccionar...</option>
                      <option value="gerente">Gerente</option>
                      <option value="tesorero">Tesorero</option>
                    </select>
                    {editForm.formState.errors.etv_subrole && (
                      <p className="text-status-error text-xs mt-1">
                        {editForm.formState.errors.etv_subrole.message}
                      </p>
                    )}
                  </div>
                )}
                {editRole === 'etv' && (
                  <>
                    <div className="col-span-2">
                      <label className="label">
                        ETV (transportadora) <span className="text-status-error">*</span>
                      </label>
                      <select
                        className={editForm.formState.errors.company_id ? 'input-error' : 'input'}
                        {...editForm.register('company_id', {
                          setValueAs: (v) =>
                            v === '' || v == null ? null : Number(v),
                        })}
                      >
                        <option value="">Seleccionar ETV...</option>
                        {companies.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      {editForm.formState.errors.company_id && (
                        <p className="text-status-error text-xs mt-1">
                          {editForm.formState.errors.company_id.message}
                        </p>
                      )}
                    </div>
                    <div className="col-span-2">
                      <label className="label">Empresa (opcional)</label>
                      <select
                        className="input"
                        {...editForm.register('empresa_id', {
                          setValueAs: (v) =>
                            v === '' || v == null ? null : Number(v),
                        })}
                        disabled={!editCompanyId || editEmpresas.length === 0}
                      >
                        <option value="">Sin empresa específica</option>
                        {editEmpresas.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>

              {editError && <p className="text-status-error text-sm">{editError}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
                  className="btn-secondary flex-1"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editForm.formState.isSubmitting}
                  className="btn-primary flex-1"
                >
                  {editForm.formState.isSubmitting ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal: Gestionar bóvedas ─────────────────────────────────────────── */}
      {vaultModalUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div>
                <h2 className="text-base font-semibold text-text-primary">Bóvedas asignadas</h2>
                <p className="text-xs text-text-muted mt-0.5">{vaultModalUser.email}</p>
              </div>
              <button onClick={() => setVaultModalUser(null)} className="text-text-muted hover:text-text-primary text-lg leading-none">×</button>
            </div>
            <div className="p-5">
              <div className="border border-border rounded max-h-64 overflow-y-auto p-2 space-y-1 mb-4">
                {activeVaults.length === 0 ? (
                  <p className="text-xs text-text-muted px-1 py-2">No hay bóvedas activas disponibles.</p>
                ) : (
                  activeVaults.map(v => (
                    <label key={v.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-surface rounded px-1 py-0.5">
                      <input
                        type="checkbox"
                        checked={editingVaults.includes(v.id)}
                        onChange={(e) => {
                          setEditingVaults(prev =>
                            e.target.checked ? [...prev, v.id] : prev.filter(id => id !== v.id)
                          );
                        }}
                        className="rounded"
                      />
                      <span className="font-mono text-xs text-primary">{v.vault_code}</span>
                      <span className="text-text-secondary">{v.vault_name}</span>
                    </label>
                  ))
                )}
              </div>
              {editingVaults.length > 0 && (
                <p className="text-xs text-text-muted mb-3">{editingVaults.length} bóveda{editingVaults.length > 1 ? 's' : ''} seleccionada{editingVaults.length > 1 ? 's' : ''}</p>
              )}
              {vaultError && <p className="text-status-error text-sm mb-3">{vaultError}</p>}
              <div className="flex gap-3">
                <button type="button" onClick={() => setVaultModalUser(null)} className="btn-secondary flex-1">Cancelar</button>
                <button onClick={saveVaults} disabled={vaultSaving} className="btn-primary flex-1">
                  {vaultSaving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showBulkImport && (
        <BulkImportModal
          title="Carga masiva de usuarios"
          endpoint="/users/bulk-import"
          templateFilename="usuarios_template.csv"
          renderRowSummary={(item) => (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              <span className="font-medium">{String(item.email ?? '')}</span>
              <span className="text-text-muted">{String(item.full_name ?? '')}</span>
              <span className="badge-neutral text-[10px]">{String(item.role ?? '')}</span>
              {Boolean(item.etv_subrole) && (
                <span className="badge-neutral text-[10px] capitalize">
                  {String(item.etv_subrole)}
                </span>
              )}
              {Boolean(item.company_name) && (
                <span className="text-text-muted text-[11px]">
                  ETV: {String(item.company_name)}
                </span>
              )}
            </div>
          )}
          onClose={() => setShowBulkImport(false)}
          onSuccess={load}
        />
      )}

      <VaultAssignmentsModal
        open={showVaultAssignments}
        onClose={() => setShowVaultAssignments(false)}
      />
    </div>
  );
}
