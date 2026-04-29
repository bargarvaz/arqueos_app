// Servicio del explorador de arqueos (internos)
import api from './api';

export interface ExplorerRecord {
  record_id: number;
  record_uid: string;
  arqueo_header_id: number;
  arqueo_date: string;
  vault_id: number;
  vault_code: string;
  vault_name: string;
  company_name: string;
  voucher: string;
  reference: string;
  branch_name: string;
  movement_type_name: string;
  entries: number;
  withdrawals: number;
  bill_1000: number;
  bill_500: number;
  bill_200: number;
  bill_100: number;
  bill_50: number;
  bill_20: number;
  coin_100: number;
  coin_50: number;
  coin_20: number;
  coin_10: number;
  coin_5: number;
  coin_2: number;
  coin_1: number;
  coin_050: number;
  coin_020: number;
  coin_010: number;
  record_date: string;
  header_status: string;
  is_counterpart: boolean;
  counterpart_type: string | null;
  original_record_uid: string | null;
}

export interface ExplorerFilters {
  company_id?: number;
  vault_id?: number;
  date_from?: string;
  date_to?: string;
  movement_type_id?: number;
  status?: string;
  search?: string;
  include_counterparts?: boolean;
  page?: number;
  page_size?: number;
}

export interface VaultDayBalance {
  vault_id: number;
  vault_code: string;
  vault_name: string;
  opening_balance: number;
  closing_balance: number;
  status: string | null;
}

const explorerService = {
  getRecords: async (filters: ExplorerFilters) => {
    const { data } = await api.get('/arqueos/explorer', { params: filters });
    return data;
  },

  getVaultBalances: async (date?: string): Promise<VaultDayBalance[]> => {
    const { data } = await api.get('/arqueos/explorer/vault-balances', {
      params: date ? { date } : undefined,
    });
    return data;
  },

  downloadXlsx: async (filters: ExplorerFilters): Promise<void> => {
    const response = await api.get('/arqueos/explorer/download', {
      params: filters,
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'arqueos_export.xlsx');
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};

export default explorerService;
