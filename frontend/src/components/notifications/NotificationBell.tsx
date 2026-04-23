// Componente campana de notificaciones (estructura base — lógica completa en Etapa 7)
import { useState } from 'react';
import { Bell } from 'lucide-react';

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  // unreadCount y notificaciones se implementarán en Etapa 7
  const unreadCount = 0;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-full hover:bg-surface transition-colors text-text-secondary hover:text-text-primary"
        aria-label="Notificaciones"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-status-error text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Panel de notificaciones — expandido en Etapa 7 */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-border rounded-lg shadow-lg z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="font-semibold text-text-primary text-sm">Notificaciones</h3>
            <button className="text-xs text-primary hover:underline">
              Marcar todas como leídas
            </button>
          </div>
          <div className="py-8 text-center text-text-muted text-sm">
            No hay notificaciones.
          </div>
        </div>
      )}
    </div>
  );
}
