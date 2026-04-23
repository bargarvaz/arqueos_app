// Servicio de dashboard y reportes
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

export interface DailyBalanceRow {
  header_id: number;
  date: string;
  vault_code: string;
  vault_name: string;
  company_name: string;
  opening_balance: number;
  closing_balance: number;
  total_entries: number;
  total_withdrawals: number;
  status: string;
}

const reportService = {
  // ─── Dashboard ───────────────────────────────────────────────────────────────
  getSummary: async (params?: { target_date?: string; company_id?: number }): Promise<DashboardSummary> => {
    const { data } = await api.get('/dashboard/summary', { params });
    return data;
  },

  getMissingVaults: async (params?: { target_date?: string; company_id?: number }): Promise<MissingVault[]> => {
    const { data } = await api.get('/dashboard/missing-vaults', { params });
    return data;
  },

  getWeeklyTrend: async (params?: { company_id?: number }): Promise<WeeklyTrendPoint[]> => {
    const { data } = await api.get('/dashboard/weekly-trend', { params });
    return data;
  },

  getDenominationDistribution: async (params?: { target_date?: string; company_id?: number }): Promise<DenominationPoint[]> => {
    const { data } = await api.get('/dashboard/denomination-distribution', { params });
    return data;
  },

  // ─── Reportes ─────────────────────────────────────────────────────────────
  getDailyBalances: async (params: {
    date_from?: string;
    date_to?: string;
    company_id?: number;
    vault_id?: number;
    page?: number;
    page_size?: number;
  }) => {
    const { data } = await api.get('/reports/daily-balances', { params });
    return data;
  },

  downloadDailyBalances: async (params: {
    date_from?: string;
    date_to?: string;
    company_id?: number;
    vault_id?: number;
  }): Promise<void> => {
    const response = await api.get('/reports/daily-balances/download', {
      params,
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    const from = params.date_from || 'inicio';
    const to = params.date_to || 'hoy';
    link.setAttribute('download', `saldos_${from}_${to}.xlsx`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};

export default reportService;
