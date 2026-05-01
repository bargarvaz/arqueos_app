// Servicio de bóvedas y sucursales
import api from './api';

export interface Branch {
  id: number;
  name: string;
  is_active: boolean;
}

export interface InitialDenominations {
  initial_bill_1000: string;
  initial_bill_500: string;
  initial_bill_200: string;
  initial_bill_100: string;
  initial_bill_50: string;
  initial_bill_20: string;
  initial_coin_100: string;
  initial_coin_50: string;
  initial_coin_20: string;
  initial_coin_10: string;
  initial_coin_5: string;
  initial_coin_2: string;
  initial_coin_1: string;
  initial_coin_050: string;
  initial_coin_020: string;
  initial_coin_010: string;
}

export interface Vault extends InitialDenominations {
  id: number;
  vault_code: string;
  vault_name: string;
  company_id: number;
  empresa_id: number | null;
  branch_id: number;
  manager_id: number | null;
  treasurer_id: number | null;
  initial_balance: string;
  current_balance: string | null;
  is_active: boolean;
  deactivated_at: string | null;
  reactivated_at: string | null;
  balance_reset_at: string | null;
}

export interface DenominationInventory {
  vault_id: number;
  date: string;
  unmigrated: boolean;
  inventory: Record<keyof InitialDenominations | string, string>;
}

export interface PagedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

const vaultService = {
  // ─── Bóvedas ─────────────────────────────────────────────────────────────
  listVaults: async (params: {
    page?: number;
    page_size?: number;
    include_inactive?: boolean;
    company_id?: number;
    search?: string;
  }): Promise<PagedResponse<Vault>> => {
    const { data } = await api.get('/vaults/', { params });
    return data;
  },

  getVault: async (id: number): Promise<Vault> => {
    const { data } = await api.get(`/vaults/${id}`);
    return data;
  },

  createVault: async (body: {
    vault_code: string;
    vault_name: string;
    company_id: number;
    empresa_id?: number | null;
    manager_id?: number | null;
    treasurer_id?: number | null;
    initial_denominations?: Partial<Record<keyof InitialDenominations, string>>;
  }): Promise<Vault> => {
    const { data } = await api.post('/vaults/', body);
    return data;
  },

  updateVault: async (id: number, body: Partial<{
    vault_name: string;
    company_id: number;
    empresa_id: number | null;
    manager_id: number | null;
    treasurer_id: number | null;
    initial_denominations: Partial<Record<keyof InitialDenominations, string>>;
  }>): Promise<Vault> => {
    const { data } = await api.patch(`/vaults/${id}`, body);
    return data;
  },

  /** Inventario disponible por denominación al inicio de `date` (default hoy). */
  getDenominationInventory: async (
    id: number,
    date?: string,
  ): Promise<DenominationInventory> => {
    const { data } = await api.get(`/vaults/${id}/denomination-inventory`, {
      params: date ? { date } : undefined,
    });
    return data;
  },

  deactivateVault: async (id: number): Promise<Vault> => {
    const { data } = await api.post(`/vaults/${id}/deactivate`);
    return data;
  },

  reactivateVault: async (
    id: number,
    body: {
      initial_balance?: string;
      initial_denominations?: Partial<Record<keyof InitialDenominations, string>>;
      manager_id?: number | null;
      treasurer_id?: number | null;
    },
  ): Promise<Vault> => {
    const { data } = await api.post(`/vaults/${id}/reactivate`, body);
    return data;
  },

  setInitialBalance: async (
    id: number,
    body: {
      initial_balance?: string;
      initial_denominations?: Partial<Record<keyof InitialDenominations, string>>;
    },
  ): Promise<Vault> => {
    const { data } = await api.put(`/vaults/${id}/initial-balance`, body);
    return data;
  },

  // ─── Sucursales ───────────────────────────────────────────────────────────
  listBranches: async (params?: { include_inactive?: boolean; search?: string }): Promise<Branch[]> => {
    const { data } = await api.get('/vaults/branches/list', { params });
    return data;
  },

  createBranch: async (name: string): Promise<Branch> => {
    const { data } = await api.post('/vaults/branches', { name });
    return data;
  },

  updateBranch: async (id: number, updates: Partial<Branch>): Promise<Branch> => {
    const { data } = await api.patch(`/vaults/branches/${id}`, updates);
    return data;
  },
};

export default vaultService;
