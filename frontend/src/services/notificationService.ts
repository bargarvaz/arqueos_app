// Servicio de notificaciones in-app
import api from './api';

export type NotificationType =
  | 'arqueo_published' | 'correction_made' | 'missing_arqueo'
  | 'weekend_upload' | 'negative_balance' | 'excess_certificates'
  | 'vault_reactivated' | 'vault_balance_reset' | 'password_reset'
  | 'error_reported' | 'error_response' | 'general';

export interface Notification {
  id: number;
  recipient_id: number;
  sender_id: number | null;
  notification_type: NotificationType;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: number | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface NotificationsPage {
  items: Notification[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

const notificationService = {
  getUnreadCount: async (): Promise<number> => {
    const { data } = await api.get('/notifications/unread-count');
    return data.unread_count;
  },

  list: async (params?: {
    unread_only?: boolean;
    page?: number;
    page_size?: number;
  }): Promise<NotificationsPage> => {
    const { data } = await api.get('/notifications', { params });
    return data;
  },

  markAsRead: async (id: number): Promise<void> => {
    await api.put(`/notifications/${id}/read`);
  },

  markAllAsRead: async (): Promise<void> => {
    await api.put('/notifications/mark-all-read');
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/notifications/${id}`);
  },

  deleteAll: async (): Promise<{ deleted: number }> => {
    const { data } = await api.delete<{ deleted: number }>('/notifications');
    return data;
  },
};

export default notificationService;
