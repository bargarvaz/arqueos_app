// Servicio de reportes de error
import api from './api';

export type ErrorReportStatus = 'open' | 'acknowledged' | 'resolved' | 'closed';

export interface ReportedRecordSummary {
  id: number;
  record_uid: string;
  voucher: string;
  reference: string;
  entries: string;
  withdrawals: string;
  movement_type_name: string | null;
  sucursal_name: string | null;
  record_date: string | null;
}

export interface ErrorReport {
  id: number;
  reported_by: number;
  reported_by_name: string | null;
  assigned_to: number;
  assigned_to_name: string | null;
  arqueo_header_id: number | null;
  arqueo_date: string | null;
  vault_id: number | null;
  vault_code: string | null;
  vault_name: string | null;
  status: ErrorReportStatus;
  description: string;
  response: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  record_ids: number[];
  records: ReportedRecordSummary[];
}

export interface PagedErrorReports {
  items: ErrorReport[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

const errorReportService = {
  list: async (params: {
    status?: string;
    page?: number;
    page_size?: number;
  }): Promise<PagedErrorReports> => {
    const { data } = await api.get<PagedErrorReports>('/error-reports', { params });
    return data;
  },

  create: async (payload: {
    assigned_to?: number | null;
    description: string;
    arqueo_header_id?: number | null;
    record_ids?: number[];
  }): Promise<ErrorReport> => {
    const { data } = await api.post<ErrorReport>('/error-reports', payload);
    return data;
  },

  autoAssignPreview: async (
    arqueo_header_id: number,
  ): Promise<{
    arqueo_header_id: number;
    vault_id: number | null;
    vault_code: string | null;
    vault_name: string | null;
    assigned_user_id: number | null;
    assigned_user_name: string | null;
    assigned_via: 'manager' | 'treasurer' | 'vault_assignment' | null;
  }> => {
    const { data } = await api.get('/error-reports/auto-assign-preview', {
      params: { arqueo_header_id },
    });
    return data;
  },

  respond: async (reportId: number, response: string): Promise<ErrorReport> => {
    const { data } = await api.put<ErrorReport>(`/error-reports/${reportId}/respond`, { response });
    return data;
  },

  resolve: async (reportId: number): Promise<ErrorReport> => {
    const { data } = await api.put<ErrorReport>(`/error-reports/${reportId}/resolve`);
    return data;
  },
};

export default errorReportService;
