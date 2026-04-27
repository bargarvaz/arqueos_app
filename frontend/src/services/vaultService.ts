// Servicio de bóvedas y sucursales
import api from './api';

export interface Branch {
  id: number;
  name: string;
  is_active: boolean;
}

export interface Vault {
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
    initial_balance: string;
  }): Promise<Vault> => {
    const { data } = await api.post('/vaults/', body);
    return data;
  },

  updateVault: async (id: number, body: Partial<{
    vault_name: string;
    empresa_id: number | null;
    manager_id: number | null;
    treasurer_id: number | null;
  }>): Promise<Vault> => {
    const { data } = await api.patch(`/vaults/${id}`, body);
    return data;
  },

  deactivateVault: async (id: number): Promise<Vault> => {
    const { data } = await api.post(`/vaults/${id}/deactivate`);
    return data;
  },

  reactivateVault: async (id: number, initial_balance: string): Promise<Vault> => {
    const { data } = await api.post(`/vaults/${id}/reactivate`, { initial_balance });
    return data;
  },

  setInitialBalance: async (id: number, initial_balance: string): Promise<Vault> => {
    const { data } = await api.put(`/vaults/${id}/initial-balance`, { initial_balance });
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
