// Campana de notificaciones con panel desplegable y polling
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, X, Trash2 } from 'lucide-react';
import notificationService, { Notification } from '@/services/notificationService';
import { POLLING_INTERVAL_MS, ROUTES } from '@/utils/constants';
import { useAuthStore } from '@/store/authStore';

function getNotificationRoute(
  notif: Notification,
  role: string | undefined,
): string | null {
  const isEtv = role === 'etv';
  if (notif.entity_type === 'arqueo_header' && notif.entity_id) {
    // ETV: ir al formulario de modificación del arqueo (su flujo natural).
    // Internos: explorador con drill-down al header.
    if (isEtv) {
      return `${ROUTES.ETV_MODIFICATIONS}/${notif.entity_id}`;
    }
    return `${ROUTES.ARQUEO_EXPLORER}?header=${notif.entity_id}`;
  }
  if (notif.entity_type === 'error_report' && notif.entity_id) {
    // ETV ve sus reportes en su propia ruta; al hacer clic se queda en su
    // listado, donde puede responder. Los internos abren el detalle.
    if (isEtv) return ROUTES.ETV_ERROR_REPORTS;
    return `${ROUTES.ERROR_REPORTS}/${notif.entity_id}`;
  }
  if (notif.entity_type === 'vault' && notif.entity_id) {
    if (isEtv) return ROUTES.ETV_VAULTS;
    return `${ROUTES.VAULT_DIRECTORY}?vault=${notif.entity_id}`;
  }
  return null;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} días`;
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const userRole = useAuthStore((s) => s.user?.role);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const loadCount = async () => {
    try {
      const count = await notificationService.getUnreadCount();
      setUnreadCount(count);
    } catch {
      // Silencioso — el polling no debe interrumpir al usuario
    }
  };

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const page = await notificationService.list({ page: 1, page_size: 25 });
      setNotifications(page.items);
    } catch {
      // Silencioso
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCount();
    const interval = setInterval(loadCount, POLLING_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (open) loadNotifications();
  }, [open]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotifClick = async (notif: Notification) => {
    if (!notif.is_read) {
      await notificationService.markAsRead(notif.id).catch(() => {});
      setUnreadCount((c) => Math.max(0, c - 1));
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
      );
    }
    const route = getNotificationRoute(notif, userRole);
    if (route) {
      setOpen(false);
      navigate(route);
    }
  };

  const handleMarkAllRead = async () => {
    await notificationService.markAllAsRead().catch(() => {});
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const handleDelete = async (e: React.MouseEvent, id: number, was_unread: boolean) => {
    e.stopPropagation();
    await notificationService.delete(id).catch(() => {});
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (was_unread) setUnreadCount((c) => Math.max(0, c - 1));
  };

  const handleDeleteAll = async () => {
    if (!confirm('¿Eliminar todas las notificaciones? No se pueden recuperar.')) return;
    await notificationService.deleteAll().catch(() => {});
    setNotifications([]);
    setUnreadCount(0);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-full hover:bg-surface transition-colors text-text-secondary hover:text-text-primary"
        aria-label="Notificaciones"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-error text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-border rounded-lg shadow-lg z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="font-semibold text-text-primary text-sm">
              Notificaciones
              {unreadCount > 0 && (
                <span className="ml-2 badge badge-error text-xs">{unreadCount}</span>
              )}
            </h3>
            <div className="flex items-center gap-3">
              {unreadCount > 0 && (
                <button
                  className="text-xs text-primary hover:underline"
                  onClick={handleMarkAllRead}
                >
                  Marcar todo leído
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  className="text-xs text-error hover:underline flex items-center gap-1"
                  onClick={handleDeleteAll}
                  title="Eliminar todas"
                >
                  <Trash2 className="w-3 h-3" />
                  Eliminar todas
                </button>
              )}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-6">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
              </div>
            ) : notifications.length === 0 ? (
              <p className="text-center text-text-muted text-xs py-6">
                Sin notificaciones
              </p>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`group relative w-full px-4 py-3 border-b border-border/50 hover:bg-surface/60 transition-colors ${
                    !notif.is_read ? 'bg-primary/5' : ''
                  }`}
                >
                  <button
                    type="button"
                    className="w-full text-left pr-6"
                    onClick={() => handleNotifClick(notif)}
                  >
                    <div className="flex items-start gap-2">
                      {!notif.is_read && (
                        <span className="mt-1.5 w-2 h-2 rounded-full bg-primary shrink-0" />
                      )}
                      <div className={!notif.is_read ? '' : 'ml-4'}>
                        <p className="text-xs font-semibold text-text-primary line-clamp-1">
                          {notif.title}
                        </p>
                        <p className="text-xs text-text-muted line-clamp-2 mt-0.5">
                          {notif.message}
                        </p>
                        <p className="text-xs text-text-muted/60 mt-1">
                          {timeAgo(notif.created_at)}
                        </p>
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, notif.id, !notif.is_read)}
                    className="absolute top-2 right-2 p-1 rounded-full text-text-muted hover:text-error hover:bg-error/10 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Eliminar notificación"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
