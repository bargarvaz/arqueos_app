// Directorio de bóvedas — consulta (activas/inactivas) con edición y gestión de estado
import { useState, useEffect, useCallback } from 'react';
import { Power, PowerOff, Edit2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ColumnDef } from '@tanstack/react-table';

import DataTable from '@/components/tables/DataTable';
import vaultService, { type Vault, type Branch } from '@/services/vaultService';
import userService, { type UserResponse } from '@/services/userService';
import { formatCurrency } from '@/utils/formatters';
import { getErrorMessage } from '@/services/api';
import { useAuthStore } from '@/store/authStore';

const editSchema = z.object({
  vault_name: z.string().min(2, 'Nombre requerido.').max(150),
  branch_id: z.number({ invalid_type_error: 'Selecciona sucursal.' }).min(1),
  manager_id: z.number().nullable().optional(),
  treasurer_id: z.number().nullable().optional(),
});

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

  const [branches, setBranches] = useState<Branch[]>([]);
  const [etvUsers, setEtvUsers] = useState<UserResponse[]>([]);

  const [editTarget, setEditTarget] = useState<Vault | null>(null);
  const [editError, setEditError] = useState('');
  const [reactivateTarget, setReactivateTarget] = useState<Vault | null>(null);
  const [reactivateBalance, setReactivateBalance] = useState('0.00');
  const [reactivateError, setReactivateError] = useState('');

  const editForm = useForm<EditForm>({ resolver: zodResolver(editSchema) });

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await vaultService.listVaults({
        page,
        page_size: pageSize,
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
      vaultService.listBranches(),
      userService.listUsers({ page: 1, page_size: 0, role: 'etv', is_active: true }),
    ]).then(([b, u]) => {
      setBranches(b);
      setEtvUsers(u.items);
    }).catch(() => {});
  }, [isAdmin]);

  const handleDeactivate = async (vault: Vault) => {
    if (!confirm(`¿Desactivar la bóveda ${vault.vault_code} — ${vault.vault_name}?`)) return;
    try {
      await vaultService.deactivateVault(vault.id);
      await load();
    } catch (err) {
      alert(getErrorMessage(err));
    }
  };

  const openReactivate = (vault: Vault) => {
    setReactivateTarget(vault);
    setReactivateBalance('0.00');
    setReactivateError('');
  };

  const handleReactivate = async () => {
    if (!reactivateTarget) return;
    setReactivateError('');
    try {
      await vaultService.reactivateVault(reactivateTarget.id, reactivateBalance);
      setReactivateTarget(null);
      await load();
    } catch (err) {
      setReactivateError(getErrorMessage(err));
    }
  };

  const openEdit = (vault: Vault) => {
    setEditTarget(vault);
    setEditError('');
    editForm.reset({
      vault_name: vault.vault_name,
      branch_id: vault.branch_id,
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
        branch_id: data.branch_id,
        manager_id: data.manager_id ?? null,
        treasurer_id: data.treasurer_id ?? null,
      });
      setEditTarget(null);
      await load();
    } catch (err) {
      setEditError(getErrorMessage(err));
    }
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
      accessorKey: 'initial_balance',
      header: 'Saldo Inicial',
      cell: ({ getValue }) => (
        <span className="font-mono">{formatCurrency(String(getValue()))}</span>
      ),
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
      ? [
          {
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
                      <Edit2 className="w-3.5 h-3.5" />
                      Editar
                    </button>
                  )}
                  {vault.is_active ? (
                    <button
                      onClick={() => handleDeactivate(vault)}
                      className="flex items-center gap-1 text-xs text-status-error hover:bg-status-error-light px-2 py-1 rounded"
                    >
                      <PowerOff className="w-3.5 h-3.5" />
                      Desactivar
                    </button>
                  ) : (
                    <button
                      onClick={() => openReactivate(vault)}
                      className="flex items-center gap-1 text-xs text-status-success hover:bg-status-success-light px-2 py-1 rounded"
                    >
                      <Power className="w-3.5 h-3.5" />
                      Reactivar
                    </button>
                  )}
                </div>
              );
            },
          } as ColumnDef<Vault>,
        ]
      : []),
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-text-primary">Directorio de Bóvedas</h1>
        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="rounded"
          />
          Mostrar inactivas
        </label>
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

      {/* ─── Modal Editar ─────────────────────────────────────────────── */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-lg shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-base font-semibold text-text-primary">
                Editar Bóveda — <span className="font-mono text-primary">{editTarget.vault_code}</span>
              </h2>
              <button onClick={() => setEditTarget(null)} className="text-text-muted hover:text-text-primary text-lg leading-none">×</button>
            </div>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="p-5 space-y-4">
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
                <div className="col-span-2">
                  <label className="label">Sucursal</label>
                  <select
                    className={editForm.formState.errors.branch_id ? 'input-error' : 'input'}
                    {...editForm.register('branch_id', { valueAsNumber: true })}
                  >
                    <option value="">Seleccionar...</option>
                    {branches.filter(b => b.is_active).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Gerente</label>
                  <select className="input" {...editForm.register('manager_id', { valueAsNumber: true })}>
                    <option value="">Ninguno</option>
                    {etvUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.full_name}{u.puesto ? ` — ${u.puesto}` : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Tesorero</label>
                  <select className="input" {...editForm.register('treasurer_id', { valueAsNumber: true })}>
                    <option value="">Ninguno</option>
                    {etvUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.full_name}{u.puesto ? ` — ${u.puesto}` : ''}</option>
                    ))}
                  </select>
                </div>
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
          <div className="bg-white rounded-lg w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-base font-semibold text-text-primary">Reactivar Bóveda</h2>
              <button onClick={() => setReactivateTarget(null)} className="text-text-muted hover:text-text-primary text-lg leading-none">×</button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-text-secondary">
                Bóveda: <span className="font-mono text-primary font-semibold">{reactivateTarget.vault_code}</span> — {reactivateTarget.vault_name}
              </p>
              <div>
                <label className="label">Saldo inicial de reactivación</label>
                <input
                  type="text"
                  value={reactivateBalance}
                  onChange={(e) => setReactivateBalance(e.target.value)}
                  className="input"
                  placeholder="0.00"
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
    </div>
  );
}
