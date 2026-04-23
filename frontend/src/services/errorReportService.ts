// Servicio de reportes de error
import api from './api';

export type ErrorReportStatus = 'open' | 'acknowledged' | 'resolved' | 'closed';

export interface ErrorReport {
  id: number;
  reported_by: number;
  assigned_to: number;
  arqueo_header_id: number | null;
  status: ErrorReportStatus;
  description: string;
  response: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  record_ids: number[];
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
    assigned_to: number;
    description: string;
    arqueo_header_id?: number | null;
    record_ids?: number[];
  }): Promise<ErrorReport> => {
    const { data } = await api.post<ErrorReport>('/error-reports', payload);
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
