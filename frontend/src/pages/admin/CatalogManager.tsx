// Gestión de catálogos administrables (Admin)
import { useState, useEffect } from 'react';
import { Plus, Pencil, Check, X } from 'lucide-react';
import catalogService, {
  type MovementType,
  type ModificationReason,
  type Holiday,
  type Sucursal,
} from '@/services/catalogService';
import userService, { type Company, type Empresa } from '@/services/userService';
import vaultService, { type Branch } from '@/services/vaultService';
import { getErrorMessage } from '@/services/api';

type CatalogTab = 'movement_types' | 'modification_reasons' | 'holidays' | 'etvs' | 'empresas' | 'branches' | 'sucursales';

export default function CatalogManager() {
  const [activeTab, setActiveTab] = useState<CatalogTab>('movement_types');

  const tabs: Array<{ key: CatalogTab; label: string }> = [
    { key: 'movement_types', label: 'Tipos de Movimiento' },
    { key: 'modification_reasons', label: 'Motivos de Modificación' },
    { key: 'holidays', label: 'Días Inhábiles' },
    { key: 'etvs', label: 'ETVs' },
    { key: 'empresas', label: 'Empresas' },
    { key: 'branches', label: 'Ubic. de Bóveda' },
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

      {activeTab === 'movement_types' && <MovementTypesCatalog />}
      {activeTab === 'modification_reasons' && <ModificationReasonsCatalog />}
      {activeTab === 'holidays' && <HolidaysCatalog />}
      {activeTab === 'etvs' && <EtvsCatalog />}
      {activeTab === 'empresas' && <EmpresasCatalog />}
      {activeTab === 'branches' && <BranchesCatalog />}
      {activeTab === 'sucursales' && <SucursalesCatalog />}
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

// ─── Sucursales ───────────────────────────────────────────────────────────────

function BranchesCatalog() {
  const [items, setItems] = useState<Branch[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);

  useEffect(() => { load(); }, [includeInactive]);

  const load = async () => {
    const data = await vaultService.listBranches({ include_inactive: includeInactive });
    setItems(data);
  };

  const handleSubmit = async () => {
    setError('');
    try {
      if (editId) {
        await vaultService.updateBranch(editId, { name });
      } else {
        await vaultService.createBranch(name);
      }
      setShowForm(false);
      setEditId(null);
      setName('');
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleToggle = async (item: Branch) => {
    try {
      await vaultService.updateBranch(item.id, { is_active: !item.is_active });
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
      renderRow={(item: Branch) => (
        <>
          <td className="px-4 py-3 font-medium">{item.name}</td>
          <td className="px-4 py-3">
            <StatusBadge active={item.is_active} />
          </td>
          <td className="px-4 py-3">
            <div className="flex items-center gap-2">
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
