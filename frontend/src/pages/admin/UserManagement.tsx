// Gestión de usuarios — solo Admin
import { useState, useEffect, useCallback } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { UserPlus, KeyRound } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import DataTable from '@/components/tables/DataTable';
import userService, { type UserResponse, type Company, type Empresa } from '@/services/userService';
import vaultService, { type Vault } from '@/services/vaultService';
import { formatUserRole } from '@/utils/formatters';
import { getErrorMessage } from '@/services/api';

const createSchema = z.object({
  email: z.string().email('Email inválido.'),
  full_name: z.string().min(2, 'Nombre requerido.'),
  role: z.enum(['admin', 'operations', 'data_science', 'etv']),
  user_type: z.enum(['internal', 'external']),
  company_id: z.number().nullable().optional(),   // ETV
  empresa_id: z.number().nullable().optional(),   // Sub-empresa
  vault_ids: z.array(z.number()).optional(),
});

type CreateForm = z.infer<typeof createSchema>;

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Administrador' },
  { value: 'operations', label: 'Operaciones' },
  { value: 'data_science', label: 'Ciencia de Datos' },
  { value: 'etv', label: 'ETV' },
];

export default function UserManagement() {
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [isActive, setIsActive] = useState<boolean | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createError, setCreateError] = useState('');
  const [tempPassword, setTempPassword] = useState('');

  const [companies, setCompanies] = useState<Company[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [selectedVaults, setSelectedVaults] = useState<number[]>([]);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateForm>({ resolver: zodResolver(createSchema) });

  const watchRole = watch('role');
  const watchCompanyId = watch('company_id');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await userService.listUsers({
        page,
        page_size: pageSize,
        search: search || undefined,
        role: roleFilter || undefined,
        is_active: isActive,
      });
      setUsers(data.items);
      setTotal(data.total);
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, search, roleFilter, isActive]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    userService.listCompanies().then(setCompanies).catch(() => {});
    vaultService.listVaults({ page: 1, page_size: 200 }).then(d => setVaults(d.items)).catch(() => {});
  }, []);

  useEffect(() => {
    if (watchRole === 'etv' && watchCompanyId) {
      userService.listEmpresas({ etv_id: watchCompanyId }).then(setEmpresas).catch(() => {});
    } else {
      setEmpresas([]);
    }
  }, [watchRole, watchCompanyId]);

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
      alert(`Contraseña temporal: ${result.temp_password}\n\nComunícala al usuario por un canal seguro.`);
    } catch (err) {
      alert(getErrorMessage(err));
    }
  };

  const onCreateSubmit = async (data: CreateForm) => {
    setCreateError('');
    try {
      const { tempPassword: tp } = await userService.createUser({
        ...data,
        company_id: data.role === 'etv' ? data.company_id ?? null : null,
        empresa_id: data.role === 'etv' ? data.empresa_id ?? null : null,
        vault_ids: data.role === 'etv' ? selectedVaults : [],
      });
      setTempPassword(tp);
      reset();
      setSelectedVaults([]);
      await load();
      if (!tp) setShowCreateModal(false);
    } catch (err) {
      setCreateError(getErrorMessage(err));
    }
  };

  const closeCreate = () => {
    setShowCreateModal(false);
    setTempPassword('');
    setCreateError('');
    reset();
    setSelectedVaults([]);
    setEmpresas([]);
  };

  const columns: ColumnDef<UserResponse>[] = [
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ getValue }) => <span className="font-mono text-sm">{String(getValue())}</span>,
    },
    { accessorKey: 'full_name', header: 'Nombre' },
    {
      accessorKey: 'role',
      header: 'Rol',
      cell: ({ getValue }) => (
        <span className="badge-neutral">{formatUserRole(String(getValue()))}</span>
      ),
    },
    {
      accessorKey: 'user_type',
      header: 'Tipo',
      cell: ({ getValue }) => (
        <span className="text-xs capitalize">{getValue() === 'internal' ? 'Interno' : 'Externo'}</span>
      ),
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
              onClick={() => handleResetPassword(u)}
              className="flex items-center gap-1 text-xs text-primary hover:bg-primary/10 px-2 py-1 rounded"
              title="Resetear contraseña"
            >
              <KeyRound className="w-3.5 h-3.5" />
              Reset
            </button>
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
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-text-primary">Gestión de Usuarios</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <UserPlus className="w-4 h-4" />
          Nuevo usuario
        </button>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 mb-4">
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          className="input w-44 text-sm"
        >
          <option value="">Todos los roles</option>
          {ROLE_OPTIONS.map(r => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        <select
          value={isActive === undefined ? '' : String(isActive)}
          onChange={(e) => {
            setIsActive(e.target.value === '' ? undefined : e.target.value === 'true');
            setPage(1);
          }}
          className="input w-36 text-sm"
        >
          <option value="">Todos</option>
          <option value="true">Activos</option>
          <option value="false">Inactivos</option>
        </select>
      </div>

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

      {/* Modal crear usuario */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-lg shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-base font-semibold text-text-primary">Nuevo Usuario</h2>
              <button onClick={closeCreate} className="text-text-muted hover:text-text-primary text-lg leading-none">×</button>
            </div>

            {tempPassword ? (
              <div className="p-6">
                <div className="bg-status-success-light border border-status-success rounded p-4 mb-4">
                  <p className="text-sm font-semibold text-status-success mb-1">Usuario creado exitosamente</p>
                  <p className="text-sm text-text-secondary">Contraseña temporal (copia y comunica por canal seguro):</p>
                  <p className="font-mono text-base font-bold text-text-primary mt-2 bg-white border border-border rounded px-3 py-2 select-all">
                    {tempPassword}
                  </p>
                </div>
                <button onClick={closeCreate} className="btn-primary w-full">Cerrar</button>
              </div>
            ) : (
              <form onSubmit={handleSubmit(onCreateSubmit)} className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="label">Correo electrónico</label>
                    <input type="email" className={errors.email ? 'input-error' : 'input'} {...register('email')} />
                    {errors.email && <p className="text-status-error text-xs mt-1">{errors.email.message}</p>}
                  </div>
                  <div className="col-span-2">
                    <label className="label">Nombre completo</label>
                    <input type="text" className={errors.full_name ? 'input-error' : 'input'} {...register('full_name')} />
                    {errors.full_name && <p className="text-status-error text-xs mt-1">{errors.full_name.message}</p>}
                  </div>
                  <div>
                    <label className="label">Rol</label>
                    <select className="input" {...register('role')}>
                      <option value="">Seleccionar...</option>
                      {ROLE_OPTIONS.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Tipo</label>
                    <select className="input" {...register('user_type')}>
                      <option value="internal">Interno</option>
                      <option value="external">Externo</option>
                    </select>
                  </div>

                  {watchRole === 'etv' && (
                    <>
                      <div className="col-span-2">
                        <label className="label">ETV (transportadora)</label>
                        <select className="input" {...register('company_id', { valueAsNumber: true })}>
                          <option value="">Seleccionar ETV...</option>
                          {companies.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      {empresas.length > 0 && (
                        <div className="col-span-2">
                          <label className="label">Empresa</label>
                          <select className="input" {...register('empresa_id', { valueAsNumber: true })}>
                            <option value="">Sin empresa específica</option>
                            {empresas.map(e => (
                              <option key={e.id} value={e.id}>{e.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div className="col-span-2">
                        <label className="label">Bóvedas asignadas</label>
                        <div className="border border-border rounded max-h-36 overflow-y-auto p-2 space-y-1">
                          {vaults.filter(v => v.is_active).map(v => (
                            <label key={v.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-surface rounded px-1">
                              <input
                                type="checkbox"
                                checked={selectedVaults.includes(v.id)}
                                onChange={(e) => {
                                  setSelectedVaults(prev =>
                                    e.target.checked ? [...prev, v.id] : prev.filter(id => id !== v.id)
                                  );
                                }}
                                className="rounded"
                              />
                              <span className="font-mono text-xs text-primary">{v.vault_code}</span>
                              <span className="text-text-secondary">{v.vault_name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {createError && (
                  <p className="text-status-error text-sm">{createError}</p>
                )}

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={closeCreate} className="btn-secondary flex-1">
                    Cancelar
                  </button>
                  <button type="submit" disabled={isSubmitting} className="btn-primary flex-1">
                    {isSubmitting ? 'Creando...' : 'Crear usuario'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
