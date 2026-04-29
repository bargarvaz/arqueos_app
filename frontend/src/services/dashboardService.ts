// Servicio de métricas del dashboard
import api from './api';

export interface DashboardSummary {
  date: string;
  total_vaults: number;
  published_count: number;
  missing_count: number;
  negative_balance_count: number;
  total_entries: string;
  total_withdrawals: string;
}

export interface MissingVault {
  vault_id: number;
  vault_code: string;
  vault_name: string;
  company_id: number;
}

export interface WeeklyTrendPoint {
  date: string;
  published_count: number;
  total_entries: string;
  total_withdrawals: string;
}

export interface DenominationPoint {
  denomination: string;
  total: string;
}

interface DashboardFilters {
  target_date?: string;
  date_from?: string;
  date_to?: string;
  company_id?: number;
  vault_id?: number;
}

const dashboardService = {
  // ─── Dashboard ───────────────────────────────────────────────────────────────
  getSummary: async (params?: DashboardFilters): Promise<DashboardSummary> => {
    const { data } = await api.get('/dashboard/summary', { params });
    return data;
  },

  getMissingVaults: async (params?: DashboardFilters): Promise<MissingVault[]> => {
    const { data } = await api.get('/dashboard/missing-vaults', { params });
    return data;
  },

  getWeeklyTrend: async (params?: {
    company_id?: number;
    vault_id?: number;
    end_date?: string;
  }): Promise<WeeklyTrendPoint[]> => {
    const { data } = await api.get('/dashboard/weekly-trend', { params });
    return data;
  },

  getDenominationDistribution: async (params?: DashboardFilters): Promise<DenominationPoint[]> => {
    const { data } = await api.get('/dashboard/denomination-distribution', { params });
    return data;
  },
};

export default dashboardService;
