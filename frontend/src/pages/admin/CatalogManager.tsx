// Gestión de catálogos administrables (Admin)
import { useState, useEffect } from 'react';
import { Plus, Pencil, Check, X, Power, PowerOff } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import catalogService, {
  type MovementType,
  type ModificationReason,
  type Holiday,
  type Sucursal,
} from '@/services/catalogService';
import userService, { type Company, type Empresa, type UserResponse } from '@/services/userService';
import vaultService, { type Vault, type Branch } from '@/services/vaultService';
import { formatCurrency } from '@/utils/formatters';
import { getErrorMessage } from '@/services/api';

type CatalogTab = 'movement_types' | 'modification_reasons' | 'holidays' | 'etvs' | 'empresas' | 'sucursales' | 'vaults';

export default function CatalogManager() {
  const [activeTab, setActiveTab] = useState<CatalogTab>('movement_types');

  const tabs: Array<{ key: CatalogTab; label: string }> = [
    { key: 'vaults', label: 'Bóvedas' },
    { key: 'movement_types', label: 'Tipos de Movimiento' },
    { key: 'modification_reasons', label: 'Motivos de Modificación' },
    { key: 'holidays', label: 'Días Inhábiles' },
    { key: 'etvs', label: 'ETVs' },
    { key: 'empresas', label: 'Empresas' },
    { key: 'sucursales', label: 'Sucursales' },
  ];

  return (
    <div>
      <h1 className="text-xl font-semibold text-text-primary mb-6">Gestión de Catálogos</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'vaults' && <VaultsCatalog />}
      {activeTab === 'movement_types' && <MovementTypesCatalog />}
      {activeTab === 'modification_reasons' && <ModificationReasonsCatalog />}
      {activeTab === 'holidays' && <HolidaysCatalog />}
      {activeTab === 'etvs' && <EtvsCatalog />}
      {activeTab === 'empresas' && <EmpresasCatalog />}
      {activeTab === 'sucursales' && <SucursalesCatalog />}
    </div>
  );
}

// ─── Bóvedas ─────────────────────────────────────────────────────────────────

const vaultCreateSchema = z.object({
  vault_code: z.string().min(1, 'Código requerido.').max(20),
  vault_name: z.string().min(2, 'Nombre requerido.').max(150),
  company_id: z.number({ invalid_type_error: 'Selecciona empresa.' }).min(1),
  branch_id: z.number({ invalid_type_error: 'Selecciona sucursal.' }).min(1),
  manager_id: z.number().nullable().optional(),
  treasurer_id: z.number().nullable().optional(),
  initial_balance: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Saldo inválido.'),
});

const vaultEditSchema = z.object({
  vault_name: z.string().min(2, 'Nombre requerido.').max(150),
  branch_id: z.number({ invalid_type_error: 'Selecciona sucursal.' }).min(1),
  manager_id: z.number().nullable().optional(),
  treasurer_id: z.number().nullable().optional(),
});

type VaultCreateForm = z.infer<typeof vaultCreateSchema>;
type VaultEditForm = z.infer<typeof vaultEditSchema>;

function VaultsCatalog() {
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [etvUsers, setEtvUsers] = useState<UserResponse[]>([]);

  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState('');
  const [editTarget, setEditTarget] = useState<Vault | null>(null);
  const [editError, setEditError] = useState('');
  const [reactivateTarget, setReactivateTarget] = useState<Vault | null>(null);
  const [reactivateBalance, setReactivateBalance] = useState('0.00');
  const [reactivateError, setReactivateError] = useState('');

  // Creación inline de ubicación
  const [inlineBranchCtx, setInlineBranchCtx] = useState<'create' | 'edit' | null>(null);
  const [inlineBranchName, setInlineBranchName] = useState('');
  const [inlineBranchError, setInlineBranchError] = useState('');

  const createForm = useForm<VaultCreateForm>({
    resolver: zodResolver(vaultCreateSchema),
    defaultValues: { initial_balance: '0.00' },
  });
  const editForm = useForm<VaultEditForm>({ resolver: zodResolver(vaultEditSchema) });

  const load = async () => {
    setIsLoading(true);
    try {
      const data = await vaultService.listVaults({
        page, page_size: PAGE_SIZE,
        search: search || undefined,
        include_inactive: includeInactive,
      });
      setVaults(data.items);
      setTotal(data.total);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, [page, search, includeInactive]);

  useEffect(() => {
    Promise.all([
      userService.listCompanies(),
      vaultService.listBranches(),
      userService.listUsers({ page: 1, page_size: 0, role: 'etv', is_active: true }),
    ]).then(([c, b, u]) => {
      setCompanies(c);
      setBranches(b);
      setEtvUsers(u.items);
    }).catch(() => {});
  }, []);

  const handleDeactivate = async (vault: Vault) => {
    if (!confirm(`¿Desactivar ${vault.vault_code} — ${vault.vault_name}?`)) return;
    try { await vaultService.deactivateVault(vault.id); await load(); }
    catch (err) { alert(getErrorMessage(err)); }
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
    } catch (err) { setReactivateError(getErrorMessage(err)); }
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

  const onEditSubmit = async (data: VaultEditForm) => {
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
    } catch (err) { setEditError(getErrorMessage(err)); }
  };

  const onCreateSubmit = async (data: VaultCreateForm) => {
    setCreateError('');
    try {
      await vaultService.createVault({
        vault_code: data.vault_code.toUpperCase(),
        vault_name: data.vault_name,
        company_id: data.company_id,
        branch_id: data.branch_id,
        manager_id: data.manager_id ?? null,
        treasurer_id: data.treasurer_id ?? null,
        initial_balance: data.initial_balance,
      });
      setShowCreate(false);
      createForm.reset({ initial_balance: '0.00' });
      await load();
    } catch (err) { setCreateError(getErrorMessage(err)); }
  };

  const handleInlineBranch = async () => {
    if (!inlineBranchName.trim()) return;
    setInlineBranchError('');
    try {
      const branch = await vaultService.createBranch(inlineBranchName.trim());
      const updated = await vaultService.listBranches();
      setBranches(updated);
      if (inlineBranchCtx === 'create') createForm.setValue('branch_id', branch.id);
      else if (inlineBranchCtx === 'edit') editForm.setValue('branch_id', branch.id);
      setInlineBranchCtx(null);
      setInlineBranchName('');
    } catch (err) { setInlineBranchError(getErrorMessage(err)); }
  };

  const getUserName = (id: number | null) => {
    if (!id) return '—';
    const u = etvUsers.find(u => u.id === id);
    return u ? u.full_name : `#${id}`;
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="card">
      {/* Cabecera */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="font-semibold text-text-primary">Bóvedas</h2>
        <div className="flex items-center gap-3">
          <input
            type="text"
            className="input w-52 text-sm"
            placeholder="Buscar código o nombre..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
            <input type="checkbox" checked={includeInactive} onChange={(e) => { setIncludeInactive(e.target.checked); setPage(1); }} className="rounded" />
            Mostrar inactivas
          </label>
          <button
            onClick={() => { setShowCreate(true); setCreateError(''); createForm.reset({ initial_balance: '0.00' }); }}
            className="btn-primary text-sm flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            Nueva bóveda
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface border-b border-border">
              {['Código', 'Nombre', 'Empresa', 'Saldo inicial', 'Gerente', 'Tesorero', 'Estado', 'Acciones'].map(col => (
                <th key={col} className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-text-muted">Cargando...</td></tr>
            ) : vaults.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-text-muted">Sin bóvedas.</td></tr>
            ) : vaults.map((v) => (
              <tr key={v.id} className="border-b border-border last:border-0 hover:bg-surface/50">
                <td className="px-4 py-3 font-mono font-semibold text-primary text-xs">{v.vault_code}</td>
                <td className="px-4 py-3">{v.vault_name}</td>
                <td className="px-4 py-3 text-sm text-text-secondary">
                  {companies.find(c => c.id === v.company_id)?.name ?? `#${v.company_id}`}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{formatCurrency(String(v.initial_balance))}</td>
                <td className="px-4 py-3 text-sm text-text-secondary">{getUserName(v.manager_id)}</td>
                <td className="px-4 py-3 text-sm text-text-secondary">{getUserName(v.treasurer_id)}</td>
                <td className="px-4 py-3">
                  <span className={v.is_active ? 'badge-success' : 'badge-error'}>
                    {v.is_active ? 'Activa' : 'Inactiva'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {v.is_active && (
                      <button onClick={() => openEdit(v)} className="btn-ghost text-xs px-2 py-1 flex items-center gap-1">
                        <Pencil className="w-3.5 h-3.5" /> Editar
                      </button>
                    )}
                    {v.is_active ? (
                      <button onClick={() => handleDeactivate(v)} className="flex items-center gap-1 text-xs text-status-error hover:bg-status-error-light px-2 py-1 rounded">
                        <PowerOff className="w-3.5 h-3.5" /> Desactivar
                      </button>
                    ) : (
                      <button onClick={() => openReactivate(v)} className="flex items-center gap-1 text-xs text-status-success hover:bg-status-success-light px-2 py-1 rounded">
                        <Power className="w-3.5 h-3.5" /> Reactivar
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {pages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-text-secondary">
          <span>{total} bóvedas</span>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary py-1 px-3 text-xs disabled:opacity-40">Anterior</button>
            <span>Pág. {page} de {pages}</span>
            <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="btn-secondary py-1 px-3 text-xs disabled:opacity-40">Siguiente</button>
          </div>
        </div>
      )}

      {/* ─── Modal Crear ───────────────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-lg shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-base font-semibold text-text-primary">Nueva Bóveda</h2>
              <button onClick={() => setShowCreate(false)} className="text-text-muted hover:text-text-primary text-lg leading-none">×</button>
            </div>
            <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Código</label>
                  <input type="text" placeholder="Ej. BOV-001"
                    className={createForm.formState.errors.vault_code ? 'input-error uppercase' : 'input uppercase'}
                    {...createForm.register('vault_code')} />
                  {createForm.formState.errors.vault_code && (
                    <p className="text-status-error text-xs mt-1">{createForm.formState.errors.vault_code.message}</p>
                  )}
                </div>
                <div>
                  <label className="label">Saldo inicial</label>
                  <input type="text" placeholder="0.00"
                    className={createForm.formState.errors.initial_balance ? 'input-error' : 'input'}
                    {...createForm.register('initial_balance')} />
                  {createForm.formState.errors.initial_balance && (
                    <p className="text-status-error text-xs mt-1">{createForm.formState.errors.initial_balance.message}</p>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="label">Nombre</label>
                  <input type="text" placeholder="Nombre descriptivo de la bóveda"
                    className={createForm.formState.errors.vault_name ? 'input-error' : 'input'}
                    {...createForm.register('vault_name')} />
                  {createForm.formState.errors.vault_name && (
                    <p className="text-status-error text-xs mt-1">{createForm.formState.errors.vault_name.message}</p>
                  )}
                </div>
                <div>
                  <label className="label">ETV</label>
                  <select className={createForm.formState.errors.company_id ? 'input-error' : 'input'}
                    {...createForm.register('company_id', { valueAsNumber: true })}>
                    <option value="">Seleccionar...</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {createForm.formState.errors.company_id && (
                    <p className="text-status-error text-xs mt-1">{createForm.formState.errors.company_id.message}</p>
                  )}
                </div>
                <div>
                  <label className="label">Ubicación de bóveda</label>
                  <div className="flex gap-2">
                    <select className={`flex-1 ${createForm.formState.errors.branch_id ? 'input-error' : 'input'}`}
                      {...createForm.register('branch_id', { valueAsNumber: true })}>
                      <option value="">Seleccionar...</option>
                      {branches.filter(b => b.is_active).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <button type="button"
                      onClick={() => { setInlineBranchCtx('create'); setInlineBranchName(''); setInlineBranchError(''); }}
                      className="btn-secondary text-xs whitespace-nowrap px-2">+ Nueva</button>
                  </div>
                  {inlineBranchCtx === 'create' && (
                    <div className="flex gap-2 mt-2">
                      <input
                        autoFocus
                        className="input flex-1 text-sm"
                        placeholder="Nombre de la ubicación"
                        value={inlineBranchName}
                        onChange={e => setInlineBranchName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleInlineBranch())}
                      />
                      <button type="button" onClick={handleInlineBranch} className="btn-primary text-xs">Crear</button>
                      <button type="button" onClick={() => setInlineBranchCtx(null)} className="btn-ghost text-xs">×</button>
                    </div>
                  )}
                  {inlineBranchCtx === 'create' && inlineBranchError && (
                    <p className="text-status-error text-xs mt-1">{inlineBranchError}</p>
                  )}
                  {createForm.formState.errors.branch_id && (
                    <p className="text-status-error text-xs mt-1">{createForm.formState.errors.branch_id.message}</p>
                  )}
                </div>
                <div>
                  <label className="label">Gerente (opcional)</label>
                  <select className="input" {...createForm.register('manager_id', { valueAsNumber: true })}>
                    <option value="">Ninguno</option>
                    {etvUsers.map(u => <option key={u.id} value={u.id}>{u.full_name}{u.puesto ? ` — ${u.puesto}` : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Tesorero (opcional)</label>
                  <select className="input" {...createForm.register('treasurer_id', { valueAsNumber: true })}>
                    <option value="">Ninguno</option>
                    {etvUsers.map(u => <option key={u.id} value={u.id}>{u.full_name}{u.puesto ? ` — ${u.puesto}` : ''}</option>)}
                  </select>
                </div>
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

      {/* ─── Modal Editar ──────────────────────────────────────────────── */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-lg shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-base font-semibold text-text-primary">
                Editar — <span className="font-mono text-primary">{editTarget.vault_code}</span>
              </h2>
              <button onClick={() => setEditTarget(null)} className="text-text-muted hover:text-text-primary text-lg leading-none">×</button>
            </div>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="label">Nombre</label>
                  <input type="text"
                    className={editForm.formState.errors.vault_name ? 'input-error' : 'input'}
                    {...editForm.register('vault_name')} />
                  {editForm.formState.errors.vault_name && (
                    <p className="text-status-error text-xs mt-1">{editForm.formState.errors.vault_name.message}</p>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="label">Ubicación de bóveda</label>
                  <div className="flex gap-2">
                    <select className={`flex-1 ${editForm.formState.errors.branch_id ? 'input-error' : 'input'}`}
                      {...editForm.register('branch_id', { valueAsNumber: true })}>
                      <option value="">Seleccionar...</option>
                      {branches.filter(b => b.is_active).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <button type="button"
                      onClick={() => { setInlineBranchCtx('edit'); setInlineBranchName(''); setInlineBranchError(''); }}
                      className="btn-secondary text-xs whitespace-nowrap px-2">+ Nueva</button>
                  </div>
                  {inlineBranchCtx === 'edit' && (
                    <div className="flex gap-2 mt-2">
                      <input
                        autoFocus
                        className="input flex-1 text-sm"
                        placeholder="Nombre de la ubicación"
                        value={inlineBranchName}
                        onChange={e => setInlineBranchName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleInlineBranch())}
                      />
                      <button type="button" onClick={handleInlineBranch} className="btn-primary text-xs">Crear</button>
                      <button type="button" onClick={() => setInlineBranchCtx(null)} className="btn-ghost text-xs">×</button>
                    </div>
                  )}
                  {inlineBranchCtx === 'edit' && inlineBranchError && (
                    <p className="text-status-error text-xs mt-1">{inlineBranchError}</p>
                  )}
                </div>
                <div>
                  <label className="label">Gerente</label>
                  <select className="input" {...editForm.register('manager_id', { valueAsNumber: true })}>
                    <option value="">Ninguno</option>
                    {etvUsers.map(u => <option key={u.id} value={u.id}>{u.full_name}{u.puesto ? ` — ${u.puesto}` : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Tesorero</label>
                  <select className="input" {...editForm.register('treasurer_id', { valueAsNumber: true })}>
                    <option value="">Ninguno</option>
                    {etvUsers.map(u => <option key={u.id} value={u.id}>{u.full_name}{u.puesto ? ` — ${u.puesto}` : ''}</option>)}
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

      {/* ─── Modal Reactivar ───────────────────────────────────────────── */}
      {reactivateTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-base font-semibold text-text-primary">Reactivar Bóveda</h2>
              <button onClick={() => setReactivateTarget(null)} className="text-text-muted hover:text-text-primary text-lg leading-none">×</button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-text-secondary">
                <span className="font-mono text-primary font-semibold">{reactivateTarget.vault_code}</span> — {reactivateTarget.vault_name}
              </p>
              <div>
                <label className="label">Saldo inicial de reactivación</label>
                <input type="text" value={reactivateBalance}
                  onChange={(e) => setReactivateBalance(e.target.value)}
                  className="input" placeholder="0.00" />
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

// ─── Tipos de movimiento ─────────────────────────────────────────────────────

function MovementTypesCatalog() {
  const [items, setItems] = useState<MovementType[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [error, setError] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);

  useEffect(() => {
    load();
  }, [includeInactive]);

  const load = async () => {
    const data = await catalogService.getMovementTypes(includeInactive);
    setItems(data);
  };

  const handleSubmit = async () => {
    setError('');
    try {
      if (editId) {
        await catalogService.updateMovementType(editId, formData);
      } else {
        await catalogService.createMovementType(formData.name, formData.description);
      }
      setShowForm(false);
      setEditId(null);
      setFormData({ name: '', description: '' });
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleToggleActive = async (item: MovementType) => {
    await catalogService.updateMovementType(item.id, { is_active: !item.is_active });
    await load();
  };

  return (
    <CatalogTable
      title="Tipos de Movimiento"
      items={items}
      columns={['Nombre', 'Descripción', 'Estado', 'Acciones']}
      renderRow={(item: MovementType) => (
        <>
          <td className="px-4 py-3 font-medium">{item.name}</td>
          <td className="px-4 py-3 text-text-secondary">{item.description ?? '—'}</td>
          <td className="px-4 py-3">
            <StatusBadge active={item.is_active} />
          </td>
          <td className="px-4 py-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setEditId(item.id);
                  setFormData({ name: item.name, description: item.description ?? '' });
                  setShowForm(true);
                }}
                className="btn-ghost text-xs px-2 py-1"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleToggleActive(item)}
                className={`text-xs px-2 py-1 rounded ${item.is_active ? 'text-status-error hover:bg-status-error-light' : 'text-status-success hover:bg-status-success-light'}`}
              >
                {item.is_active ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          </td>
        </>
      )}
      onAdd={() => {
        setEditId(null);
        setFormData({ name: '', description: '' });
        setShowForm(true);
      }}
      includeInactive={includeInactive}
      onToggleInactive={() => setIncludeInactive(!includeInactive)}
    >
      {showForm && (
        <InlineForm
          error={error}
          onCancel={() => setShowForm(false)}
          onSubmit={handleSubmit}
          isEdit={!!editId}
        >
          <input
            className="input"
            placeholder="Nombre *"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
          <input
            className="input"
            placeholder="Descripción (opcional)"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
        </InlineForm>
      )}
    </CatalogTable>
  );
}

// ─── Motivos de modificación ─────────────────────────────────────────────────

function ModificationReasonsCatalog() {
  const [items, setItems] = useState<ModificationReason[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);

  useEffect(() => {
    load();
  }, [includeInactive]);

  const load = async () => {
    const data = await catalogService.getModificationReasons(includeInactive);
    setItems(data);
  };

  const handleSubmit = async () => {
    setError('');
    try {
      if (editId) {
        await catalogService.updateModificationReason(editId, { name });
      } else {
        await catalogService.createModificationReason(name);
      }
      setShowForm(false);
      setEditId(null);
      setName('');
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <CatalogTable
      title="Motivos de Modificación"
      items={items}
      columns={['Nombre', 'Estado', 'Acciones']}
      renderRow={(item: ModificationReason) => (
        <>
          <td className="px-4 py-3 font-medium">{item.name}</td>
          <td className="px-4 py-3">
            <StatusBadge active={item.is_active} />
          </td>
          <td className="px-4 py-3">
            <button
              onClick={() => {
                setEditId(item.id);
                setName(item.name);
                setShowForm(true);
              }}
              className="btn-ghost text-xs px-2 py-1"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </td>
        </>
      )}
      onAdd={() => {
        setEditId(null);
        setName('');
        setShowForm(true);
      }}
      includeInactive={includeInactive}
      onToggleInactive={() => setIncludeInactive(!includeInactive)}
    >
      {showForm && (
        <InlineForm error={error} onCancel={() => setShowForm(false)} onSubmit={handleSubmit} isEdit={!!editId}>
          <input
            className="input"
            placeholder="Motivo *"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </InlineForm>
      )}
    </CatalogTable>
  );
}

// ─── Días inhábiles ───────────────────────────────────────────────────────────

function HolidaysCatalog() {
  const [items, setItems] = useState<Holiday[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ holiday_date: '', name: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    const data = await catalogService.getHolidays(true);
    setItems(data);
  };

  const handleSubmit = async () => {
    setError('');
    try {
      await catalogService.createHoliday(formData.holiday_date, formData.name);
      setShowForm(false);
      setFormData({ holiday_date: '', name: '' });
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleToggle = async (item: Holiday) => {
    await catalogService.updateHoliday(item.id, { is_active: !item.is_active });
    await load();
  };

  return (
    <CatalogTable
      title="Días Inhábiles"
      items={items}
      columns={['Fecha', 'Motivo', 'Estado', 'Acciones']}
      renderRow={(item: Holiday) => (
        <>
          <td className="px-4 py-3 font-mono">{item.holiday_date}</td>
          <td className="px-4 py-3">{item.name}</td>
          <td className="px-4 py-3">
            <StatusBadge active={item.is_active} />
          </td>
          <td className="px-4 py-3">
            <button
              onClick={() => handleToggle(item)}
              className={`text-xs px-2 py-1 rounded ${item.is_active ? 'text-status-error hover:bg-status-error-light' : 'text-status-success hover:bg-status-success-light'}`}
            >
              {item.is_active ? 'Desactivar' : 'Activar'}
            </button>
          </td>
        </>
      )}
      onAdd={() => setShowForm(true)}
      includeInactive={true}
      onToggleInactive={() => {}}
    >
      {showForm && (
        <InlineForm error={error} onCancel={() => setShowForm(false)} onSubmit={handleSubmit} isEdit={false}>
          <input
            type="date"
            className="input"
            value={formData.holiday_date}
            onChange={(e) => setFormData({ ...formData, holiday_date: e.target.value })}
          />
          <input
            className="input"
            placeholder="Motivo (ej. Día de la Independencia)"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </InlineForm>
      )}
    </CatalogTable>
  );
}

// ─── ETVs (transportadoras de valores) ───────────────────────────────────────

function EtvsCatalog() {
  const [items, setItems] = useState<Company[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);

  useEffect(() => { load(); }, [includeInactive]);

  const load = async () => {
    const data = await userService.listCompanies(includeInactive);
    setItems(data);
  };

  const handleSubmit = async () => {
    setError('');
    try {
      if (editId) {
        await userService.updateCompany(editId, name);
      } else {
        await userService.createCompany(name);
      }
      setShowForm(false);
      setEditId(null);
      setName('');
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <CatalogTable
      title="ETVs (Transportadoras de Valores)"
      items={items}
      columns={['Nombre', 'Estado', 'Acciones']}
      renderRow={(item: Company) => (
        <>
          <td className="px-4 py-3 font-medium">{item.name}</td>
          <td className="px-4 py-3"><StatusBadge active={item.is_active} /></td>
          <td className="px-4 py-3">
            <div className="flex items-center gap-2">
              <button onClick={() => { setEditId(item.id); setName(item.name); setShowForm(true); }} className="btn-ghost text-xs px-2 py-1">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={async () => { try { await userService.toggleCompany(item.id); await load(); } catch (err) { alert(getErrorMessage(err)); } }}
                className={`text-xs px-2 py-1 rounded ${item.is_active ? 'text-status-error hover:bg-status-error-light' : 'text-status-success hover:bg-status-success-light'}`}
              >
                {item.is_active ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          </td>
        </>
      )}
      onAdd={() => { setEditId(null); setName(''); setShowForm(true); }}
      includeInactive={includeInactive}
      onToggleInactive={() => setIncludeInactive(!includeInactive)}
    >
      {showForm && (
        <InlineForm error={error} onCancel={() => setShowForm(false)} onSubmit={handleSubmit} isEdit={!!editId}>
          <input className="input" placeholder="Nombre de la ETV *" value={name} onChange={(e) => setName(e.target.value)} />
        </InlineForm>
      )}
    </CatalogTable>
  );
}

// ─── Empresas (sub-empresas dentro de una ETV) ────────────────────────────────

function EmpresasCatalog() {
  const [items, setItems] = useState<Empresa[]>([]);
  const [etvs, setEtvs] = useState<Company[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ name: '', etv_id: 0 });
  const [filterEtvId, setFilterEtvId] = useState<number | ''>('');
  const [error, setError] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);

  useEffect(() => {
    userService.listCompanies(true).then(setEtvs).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [filterEtvId, includeInactive]);

  const load = async () => {
    const data = await userService.listEmpresas({
      etv_id: filterEtvId || undefined,
      include_inactive: includeInactive,
    });
    setItems(data);
  };

  const handleSubmit = async () => {
    setError('');
    if (!formData.etv_id) { setError('Selecciona una ETV.'); return; }
    if (!formData.name.trim()) { setError('El nombre es requerido.'); return; }
    try {
      if (editId) {
        await userService.updateEmpresa(editId, { name: formData.name, etv_id: formData.etv_id });
      } else {
        await userService.createEmpresa(formData.name, formData.etv_id);
      }
      setShowForm(false);
      setEditId(null);
      setFormData({ name: '', etv_id: 0 });
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const etvName = (etv_id: number) => etvs.find(e => e.id === etv_id)?.name ?? `ETV #${etv_id}`;

  return (
    <CatalogTable
      title="Empresas"
      items={items}
      columns={['Nombre', 'ETV', 'Estado', 'Acciones']}
      renderRow={(item: Empresa) => (
        <>
          <td className="px-4 py-3 font-medium">{item.name}</td>
          <td className="px-4 py-3 text-text-secondary text-sm">{etvName(item.etv_id)}</td>
          <td className="px-4 py-3"><StatusBadge active={item.is_active} /></td>
          <td className="px-4 py-3">
            <div className="flex items-center gap-2">
              <button onClick={() => { setEditId(item.id); setFormData({ name: item.name, etv_id: item.etv_id }); setShowForm(true); }} className="btn-ghost text-xs px-2 py-1">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={async () => { try { await userService.toggleEmpresa(item.id); await load(); } catch (err) { alert(getErrorMessage(err)); } }}
                className={`text-xs px-2 py-1 rounded ${item.is_active ? 'text-status-error hover:bg-status-error-light' : 'text-status-success hover:bg-status-success-light'}`}
              >
                {item.is_active ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          </td>
        </>
      )}
      onAdd={() => { setEditId(null); setFormData({ name: '', etv_id: 0 }); setShowForm(true); }}
      includeInactive={includeInactive}
      onToggleInactive={() => setIncludeInactive(!includeInactive)}
    >
      {/* Filtro por ETV */}
      <div className="mb-3">
        <select
          value={filterEtvId}
          onChange={(e) => setFilterEtvId(e.target.value === '' ? '' : Number(e.target.value))}
          className="input w-48 text-sm"
        >
          <option value="">Todas las ETVs</option>
          {etvs.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>
      {showForm && (
        <InlineForm error={error} onCancel={() => setShowForm(false)} onSubmit={handleSubmit} isEdit={!!editId}>
          <select
            className="input"
            value={formData.etv_id || ''}
            onChange={(e) => setFormData({ ...formData, etv_id: Number(e.target.value) })}
          >
            <option value="">Seleccionar ETV *</option>
            {etvs.filter(e => e.is_active).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <input
            className="input"
            placeholder="Nombre de la empresa *"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </InlineForm>
      )}
    </CatalogTable>
  );
}

// ─── Sucursales (catálogo para arqueo_records) ────────────────────────────────

function SucursalesCatalog() {
  const [items, setItems] = useState<Sucursal[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);

  useEffect(() => { load(); }, [includeInactive]);

  const load = async () => {
    const data = await catalogService.getSucursales(includeInactive);
    setItems(data);
  };

  const handleSubmit = async () => {
    setError('');
    try {
      if (editId) {
        await catalogService.updateSucursal(editId, { name });
      } else {
        await catalogService.createSucursal(name);
      }
      setShowForm(false);
      setEditId(null);
      setName('');
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleToggle = async (item: Sucursal) => {
    try {
      await catalogService.updateSucursal(item.id, { is_active: !item.is_active });
      await load();
    } catch (err) {
      alert(getErrorMessage(err));
    }
  };

  return (
    <CatalogTable
      title="Sucursales"
      items={items}
      columns={['Nombre', 'Estado', 'Acciones']}
      renderRow={(item: Sucursal) => (
        <>
          <td className="px-4 py-3 font-medium">{item.name}</td>
          <td className="px-4 py-3"><StatusBadge active={item.is_active} /></td>
          <td className="px-4 py-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setEditId(item.id); setName(item.name); setShowForm(true); }}
                className="btn-ghost text-xs px-2 py-1"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleToggle(item)}
                className={`text-xs px-2 py-1 rounded ${item.is_active ? 'text-status-error hover:bg-status-error-light' : 'text-status-success hover:bg-status-success-light'}`}
              >
                {item.is_active ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          </td>
        </>
      )}
      onAdd={() => { setEditId(null); setName(''); setShowForm(true); }}
      includeInactive={includeInactive}
      onToggleInactive={() => setIncludeInactive(!includeInactive)}
    >
      {showForm && (
        <InlineForm error={error} onCancel={() => setShowForm(false)} onSubmit={handleSubmit} isEdit={!!editId}>
          <input
            className="input"
            placeholder="Nombre de la sucursal *"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </InlineForm>
      )}
    </CatalogTable>
  );
}

// ─── Componentes compartidos ──────────────────────────────────────────────────

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={active ? 'badge-success' : 'badge-error'}>
      {active ? 'Activo' : 'Inactivo'}
    </span>
  );
}

interface CatalogTableProps<T> {
  title: string;
  items: T[];
  columns: string[];
  renderRow: (item: T) => React.ReactNode;
  onAdd: () => void;
  includeInactive: boolean;
  onToggleInactive: () => void;
  children?: React.ReactNode;
}

function CatalogTable<T extends { id: number }>({
  title,
  items,
  columns,
  renderRow,
  onAdd,
  includeInactive,
  onToggleInactive,
  children,
}: CatalogTableProps<T>) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-text-primary">{title}</h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={onToggleInactive}
              className="rounded"
            />
            Mostrar inactivos
          </label>
          <button onClick={onAdd} className="btn-primary text-sm">
            <Plus className="w-4 h-4" />
            Agregar
          </button>
        </div>
      </div>

      {children}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface border-b border-border">
              {columns.map((col) => (
                <th key={col} className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-text-muted">
                  Sin registros.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0 hover:bg-surface/50">
                  {renderRow(item)}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InlineForm({
  children,
  error,
  onCancel,
  onSubmit,
  isEdit,
}: {
  children: React.ReactNode;
  error: string;
  onCancel: () => void;
  onSubmit: () => void;
  isEdit: boolean;
}) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4 mb-4 space-y-3">
      <h3 className="text-sm font-medium text-text-primary">{isEdit ? 'Editar' : 'Nuevo registro'}</h3>
      {children}
      {error && <p className="text-status-error text-xs">{error}</p>}
      <div className="flex gap-2">
        <button onClick={onSubmit} className="btn-primary text-sm">
          <Check className="w-4 h-4" />
          {isEdit ? 'Guardar cambios' : 'Crear'}
        </button>
        <button onClick={onCancel} className="btn-ghost text-sm">
          <X className="w-4 h-4" />
          Cancelar
        </button>
      </div>
    </div>
  );
}
