// Directorio de bóvedas para usuarios internos
import { useState, useEffect, useCallback } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Power, PowerOff, Settings } from 'lucide-react';

import DataTable from '@/components/tables/DataTable';
import vaultService, { type Vault } from '@/services/vaultService';
import { formatCurrency } from '@/utils/formatters';
import { useAuthStore } from '@/store/authStore';

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

  useEffect(() => {
    load();
  }, [load]);

  const handleDeactivate = async (vault: Vault) => {
    if (!confirm(`¿Desactivar la bóveda ${vault.vault_code} — ${vault.vault_name}?`)) return;
    await vaultService.deactivateVault(vault.id);
    await load();
  };

  const handleReactivate = async (vault: Vault) => {
    const balanceStr = prompt(
      `Ingresa el saldo inicial para reactivar la bóveda ${vault.vault_code}:`,
      '0.00',
    );
    if (!balanceStr) return;
    await vaultService.reactivateVault(vault.id, balanceStr);
    await load();
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
                      onClick={() => handleReactivate(vault)}
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
    </div>
  );
}
