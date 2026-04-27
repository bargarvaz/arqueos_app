// Servicio del módulo de modificaciones
import api from './api';

export interface ModifiableArqueo {
  header_id: number;
  vault_id: number;
  vault_code: string | null;
  vault_name: string | null;
  arqueo_date: string;
  status: string;
  auto_published: boolean;
  opening_balance: string;
  closing_balance: string;
  grace_deadline: string;
  days_remaining: number | null;
}

export interface GracePeriod {
  arqueo_date: string;
  grace_deadline: string;
  is_within_grace: boolean;
  days_remaining: number | null;
}

export interface ModificationRecord {
  id: number;
  arqueo_header_id: number;
  arqueo_record_id: number | null;
  modification_type: 'add' | 'edit' | 'delete';
  reason_id: number;
  reason_detail: string | null;
  previous_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_by: number;
  created_at: string;
}

const modificationService = {
  getMyModifiableArqueos: async (): Promise<ModifiableArqueo[]> => {
    const { data } = await api.get('/modifications/my-arqueos');
    return data;
  },

  getGracePeriod: async (header_id: number): Promise<GracePeriod> => {
    const { data } = await api.get(`/modifications/${header_id}/grace-period`);
    return data;
  },

  getHistory: async (header_id: number): Promise<ModificationRecord[]> => {
    const { data } = await api.get(`/modifications/${header_id}/history`);
    return data;
  },

  addRecord: async (
    header_id: number,
    payload: { record: Record<string, unknown>; reason_id: number; reason_detail?: string }
  ) => {
    const { data } = await api.post(`/modifications/${header_id}/add`, payload);
    return data;
  },

  editRecord: async (
    record_uid: string,
    payload: { new_data: Record<string, unknown>; reason_id: number; reason_detail?: string }
  ) => {
    const { data } = await api.post(`/modifications/records/${record_uid}/edit`, payload);
    return data;
  },

  cancelRecord: async (
    record_uid: string,
    payload: { reason_id: number; reason_detail?: string }
  ) => {
    const { data } = await api.post(`/modifications/records/${record_uid}/cancel`, payload);
    return data;
  },

  lockArqueo: async (header_id: number) => {
    const { data } = await api.post(`/modifications/${header_id}/lock`);
    return data;
  },
};

export default modificationService;
