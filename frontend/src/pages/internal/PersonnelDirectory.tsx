// Directorio de personal (gerentes y tesoreros)
import { useState, useEffect, useCallback } from 'react';
import { UserPlus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import vaultService, { type Personnel } from '@/services/vaultService';
import { getErrorMessage } from '@/services/api';
import { useAuthStore } from '@/store/authStore';

const schema = z.object({
  full_name: z.string().min(2, 'Nombre requerido.'),
  position: z.string().min(2, 'Cargo requerido.'),
  personnel_type: z.enum(['manager', 'treasurer']),
});

type FormData = z.infer<typeof schema>;

export default function PersonnelDirectory() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Personnel | null>(null);
  const [serverError, setServerError] = useState('');

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await vaultService.listPersonnel({
        personnel_type: typeFilter || undefined,
        include_inactive: includeInactive,
        search: search || undefined,
      });
      setPersonnel(data);
    } finally {
      setIsLoading(false);
    }
  }, [typeFilter, includeInactive, search]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditTarget(null);
    reset({ full_name: '', position: '', personnel_type: 'manager' });
    setServerError('');
    setShowModal(true);
  };

  const openEdit = (p: Personnel) => {
    setEditTarget(p);
    reset({ full_name: p.full_name, position: p.position, personnel_type: p.personnel_type });
    setServerError('');
    setShowModal(true);
  };

  const onSubmit = async (data: FormData) => {
    setServerError('');
    try {
      if (editTarget) {
        await vaultService.updatePersonnel(editTarget.id, data);
      } else {
        await vaultService.createPersonnel(data);
      }
      setShowModal(false);
      await load();
    } catch (err) {
      setServerError(getErrorMessage(err));
    }
  };

  const handleToggleActive = async (p: Personnel) => {
    if (!confirm(`¿${p.is_active ? 'Desactivar' : 'Activar'} a ${p.full_name}?`)) return;
    try {
      await vaultService.updatePersonnel(p.id, { is_active: !p.is_active });
      await load();
    } catch (err) {
      alert(getErrorMessage(err));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-text-primary">Directorio de Personal</h1>
        {isAdmin && (
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <UserPlus className="w-4 h-4" />
            Agregar personal
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Buscar por nombre o cargo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input w-64 text-sm"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="input w-40 text-sm"
        >
          <option value="">Todos</option>
          <option value="manager">Gerentes</option>
          <option value="treasurer">Tesoreros</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="rounded"
          />
          Mostrar inactivos
        </label>
      </div>

      {/* Tabla */}
      <div className="card overflow-hidden p-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-text-muted text-sm">Cargando...</div>
        ) : personnel.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-text-muted text-sm">Sin resultados.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-text-secondary font-medium">Nombre</th>
                <th className="text-left px-4 py-3 text-text-secondary font-medium">Cargo</th>
                <th className="text-left px-4 py-3 text-text-secondary font-medium">Tipo</th>
                <th className="text-left px-4 py-3 text-text-secondary font-medium">Estado</th>
                {isAdmin && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {personnel.map((p) => (
                <tr key={p.id} className="hover:bg-surface/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-text-primary">{p.full_name}</td>
                  <td className="px-4 py-3 text-text-secondary">{p.position}</td>
                  <td className="px-4 py-3">
                    <span className="badge-neutral">
                      {p.personnel_type === 'manager' ? 'Gerente' : 'Tesorero'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={p.is_active ? 'badge-success' : 'badge-error'}>
                      {p.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(p)}
                          className="text-xs text-primary hover:bg-primary/10 px-2 py-1 rounded"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleToggleActive(p)}
                          className={`text-xs px-2 py-1 rounded ${
                            p.is_active
                              ? 'text-status-error hover:bg-status-error-light'
                              : 'text-status-success hover:bg-status-success-light'
                          }`}
                        >
                          {p.is_active ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-text-muted mt-2">{personnel.length} registros</p>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-base font-semibold text-text-primary">
                {editTarget ? 'Editar Personal' : 'Agregar Personal'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-text-muted hover:text-text-primary text-lg leading-none">×</button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
              <div>
                <label className="label">Nombre completo</label>
                <input type="text" className={errors.full_name ? 'input-error' : 'input'} {...register('full_name')} />
                {errors.full_name && <p className="text-status-error text-xs mt-1">{errors.full_name.message}</p>}
              </div>
              <div>
                <label className="label">Cargo</label>
                <input
                  type="text"
                  className={errors.position ? 'input-error' : 'input'}
                  placeholder="Ej. Gerente de Sucursal"
                  {...register('position')}
                />
                {errors.position && <p className="text-status-error text-xs mt-1">{errors.position.message}</p>}
              </div>
              <div>
                <label className="label">Tipo</label>
                <select className="input" {...register('personnel_type')}>
                  <option value="manager">Gerente</option>
                  <option value="treasurer">Tesorero</option>
                </select>
              </div>
              {serverError && <p className="text-status-error text-sm">{serverError}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" disabled={isSubmitting} className="btn-primary flex-1">
                  {isSubmitting ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
