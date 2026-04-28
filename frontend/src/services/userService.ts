// Servicio de gestión de usuarios (admin only)
import api from './api';

export interface Company {
  id: number;
  name: string;
  is_active: boolean;
}

export interface Empresa {
  id: number;
  name: string;
  etv_id: number;
  is_active: boolean;
}

export type EtvSubrole = 'gerente' | 'tesorero';

export interface UserResponse {
  id: number;
  email: string;
  full_name: string;
  role: string;
  user_type: string;
  company_id: number | null;    // ETV
  empresa_id: number | null;    // Sub-empresa
  puesto: string | null;
  etv_subrole: EtvSubrole | null;
  is_active: boolean;
  must_change_password: boolean;
  mfa_enabled: boolean;
}

export interface UserDetailResponse extends UserResponse {
  assigned_vault_ids: number[];
}

export interface CreateUserPayload {
  email: string;
  full_name: string;
  role: string;
  puesto?: string | null;
  etv_subrole?: EtvSubrole | null;
  company_id?: number | null;
  empresa_id?: number | null;
  vault_ids?: number[];
}

export interface UpdateUserPayload {
  full_name?: string;
  puesto?: string | null;
  is_active?: boolean;
  company_id?: number | null;
  empresa_id?: number | null;
  etv_subrole?: EtvSubrole | null;
}

export interface PagedUsers {
  items: UserResponse[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

const userService = {
  listUsers: async (params: {
    page?: number;
    page_size?: number;
    role?: string;
    user_type?: string;
    is_active?: boolean;
    search?: string;
  }): Promise<PagedUsers> => {
    const { data } = await api.get<PagedUsers>('/users/', { params });
    return data;
  },

  getUser: async (userId: number): Promise<UserDetailResponse> => {
    const { data } = await api.get<UserDetailResponse>(`/users/${userId}`);
    return data;
  },

  /** Crea usuario y retorna {user, tempPassword}. La contraseña temporal viene en el header X-Temp-Password. */
  createUser: async (payload: CreateUserPayload): Promise<{ user: UserDetailResponse; tempPassword: string }> => {
    const response = await api.post<UserDetailResponse>('/users/', payload);
    const tempPassword = response.headers['x-temp-password'] ?? '';
    return { user: response.data, tempPassword };
  },

  updateUser: async (userId: number, payload: UpdateUserPayload): Promise<UserResponse> => {
    const { data } = await api.patch<UserResponse>(`/users/${userId}`, payload);
    return data;
  },

  resetPassword: async (userId: number): Promise<{ temp_password: string; message: string }> => {
    const { data } = await api.post(`/users/${userId}/reset-password`);
    return data;
  },

  assignVaults: async (userId: number, vaultIds: number[]): Promise<void> => {
    await api.put(`/users/${userId}/vaults`, { vault_ids: vaultIds });
  },

  listCompanies: async (includeInactive = false): Promise<Company[]> => {
    const { data } = await api.get<Company[]>('/users/companies', {
      params: { include_inactive: includeInactive },
    });
    return data;
  },

  createCompany: async (name: string): Promise<Company> => {
    const { data } = await api.post<Company>('/users/companies', { name });
    return data;
  },

  updateCompany: async (id: number, name: string): Promise<Company> => {
    const { data } = await api.patch<Company>(`/users/companies/${id}`, { name });
    return data;
  },

  toggleCompany: async (id: number): Promise<Company> => {
    const { data } = await api.patch<Company>(`/users/companies/${id}/toggle`);
    return data;
  },

  // ─── Sub-empresas ──────────────────────────────────────────────────────────
  listEmpresas: async (params?: { etv_id?: number; include_inactive?: boolean }): Promise<Empresa[]> => {
    const { data } = await api.get<Empresa[]>('/users/empresas', { params });
    return data;
  },

  createEmpresa: async (name: string, etv_id: number): Promise<Empresa> => {
    const { data } = await api.post<Empresa>('/users/empresas', { name, etv_id });
    return data;
  },

  updateEmpresa: async (id: number, updates: { name?: string; etv_id?: number }): Promise<Empresa> => {
    const { data } = await api.patch<Empresa>(`/users/empresas/${id}`, updates);
    return data;
  },

  toggleEmpresa: async (id: number): Promise<Empresa> => {
    const { data } = await api.patch<Empresa>(`/users/empresas/${id}/toggle`);
    return data;
  },
};

export default userService;
