// Servicio del módulo de arqueos
import api from './api';

export interface VaultStatus {
  vault: {
    id: number;
    vault_code: string;
    vault_name: string;
    initial_balance: string;
    branch_id: number;
  };
  today_status: 'draft' | 'published' | 'locked' | null;
  today_header_id: number | null;
  today_closing_balance: string | null;
}

export interface ArqueoRecord {
  id: number;
  record_uid: string;
  arqueo_header_id: number;
  voucher: string;
  reference: string;
  branch_id: number;
  entries: string;
  withdrawals: string;
  bill_1000: string;
  bill_500: string;
  bill_200: string;
  bill_100: string;
  bill_50: string;
  bill_20: string;
  coin_100: string;
  coin_50: string;
  coin_20: string;
  coin_10: string;
  coin_5: string;
  coin_2: string;
  coin_1: string;
  coin_050: string;
  coin_020: string;
  coin_010: string;
  movement_type_id: number;
  is_counterpart: boolean;
  counterpart_type: string | null;
  original_record_uid: string | null;
  record_date: string;
  upload_date: string;
  is_active: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface ArqueoHeader {
  id: number;
  vault_id: number;
  arqueo_date: string;
  opening_balance: string;
  closing_balance: string;
  status: 'draft' | 'published' | 'locked';
  published_at: string | null;
  locked_at: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface ArqueoHeaderWithRecords extends ArqueoHeader {
  records: ArqueoRecord[];
}

export interface RecordCreatePayload {
  voucher: string;
  reference: string;
  branch_id: number;
  movement_type_id: number;
  entries: string;
  withdrawals: string;
  bill_1000: string;
  bill_500: string;
  bill_200: string;
  bill_100: string;
  bill_50: string;
  bill_20: string;
  coin_100: string;
  coin_50: string;
  coin_20: string;
  coin_10: string;
  coin_5: string;
  coin_2: string;
  coin_1: string;
  coin_050: string;
  coin_020: string;
  coin_010: string;
  record_date: string;
  record_uid?: string;
}

export interface PublishArqueoPayload {
  records: RecordCreatePayload[];
  updated_at: string;
}

const arqueoService = {
  // ─── ETV ────────────────────────────────────────────────────────────────────
  getMyVaults: async (): Promise<VaultStatus[]> => {
    const { data } = await api.get('/arqueos/my-vaults');
    return data;
  },

  getOrCreateHeader: async (
    vault_id: number,
    arqueo_date: string
  ): Promise<ArqueoHeader> => {
    const { data } = await api.post('/arqueos/headers', { vault_id, arqueo_date });
    return data;
  },

  getHeader: async (header_id: number): Promise<ArqueoHeaderWithRecords> => {
    const { data } = await api.get(`/arqueos/headers/${header_id}`);
    return data;
  },

  publishArqueo: async (
    vault_id: number,
    arqueo_date: string,
    payload: PublishArqueoPayload
  ): Promise<ArqueoHeaderWithRecords> => {
    const { data } = await api.post(
      `/arqueos/${vault_id}/${arqueo_date}/publish`,
      payload
    );
    return data;
  },

  // ─── Internos ───────────────────────────────────────────────────────────────
  listHeaders: async (params: {
    vault_id?: number;
    status?: string;
    date_from?: string;
    date_to?: string;
    page?: number;
    page_size?: number;
  }) => {
    const { data } = await api.get('/arqueos/headers', { params });
    return data;
  },
};

export default arqueoService;
