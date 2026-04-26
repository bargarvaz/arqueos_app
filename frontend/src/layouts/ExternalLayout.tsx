// Layout para usuarios ETV: sidebar colapsable + header
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Vault, FileText, Edit, Bell, LogOut, ChevronLeft, ChevronRight } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/utils/constants';
import NotificationBell from '@/components/notifications/NotificationBell';

const NAV_ITEMS = [
  { label: 'Mis Bóvedas', to: ROUTES.ETV_VAULTS, icon: <Vault className="w-5 h-5" /> },
  { label: 'Mis Arqueos', to: ROUTES.ETV_ARQUEO_LIST, icon: <FileText className="w-5 h-5" /> },
  {
    label: 'Modificaciones',
    to: ROUTES.ETV_MODIFICATIONS,
    icon: <Edit className="w-5 h-5" />,
  },
  {
    label: 'Reportes de Error',
    to: ROUTES.ETV_ERROR_REPORTS,
    icon: <Bell className="w-5 h-5" />,
  },
];

export default function ExternalLayout() {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      {/* Sidebar ETV — colores secondary (dorado) */}
      <aside className={`bg-secondary flex flex-col transition-all duration-200 flex-shrink-0 ${collapsed ? 'w-16' : 'w-60'}`}>
        {/* Logo + toggle */}
        <div className={`px-4 py-5 border-b border-secondary-dark flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
          {!collapsed && (
            <div className="min-w-0">
              <span className="text-white font-bold text-sm">Sistema Arqueos</span>
              <p className="text-white/60 text-xs mt-0.5">{user?.company_id ? 'ETV' : 'Externo'}</p>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-white/70 hover:text-white flex-shrink-0"
            title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          >
            {collapsed
              ? <ChevronRight className="w-5 h-5" />
              : <ChevronLeft className="w-5 h-5" />
            }
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) => `
                flex items-center gap-3 px-4 py-3 text-sm transition-colors
                ${collapsed ? 'justify-center' : ''}
                ${isActive
                  ? 'bg-secondary-dark text-white font-medium'
                  : 'text-white/70 hover:bg-secondary-dark/50 hover:text-white'}
              `}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Usuario */}
        <div className={`border-t border-secondary-dark p-4 ${collapsed ? 'flex flex-col items-center' : ''}`}>
          {!collapsed && (
            <p className="text-white text-xs font-medium truncate">{user?.full_name}</p>
          )}
          <button
            onClick={logout}
            title={collapsed ? 'Cerrar sesión' : undefined}
            className={`flex items-center gap-2 text-white/70 hover:text-white text-xs transition-colors ${collapsed ? '' : 'mt-2'}`}
          >
            <LogOut className="w-4 h-4" />
            {!collapsed && 'Cerrar sesión'}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="bg-white border-b border-border flex items-center justify-between px-6 py-3 h-14 flex-shrink-0">
          <div />
          <div className="flex items-center gap-4">
            <NotificationBell />
            <div className="text-right">
              <p className="text-sm font-medium text-text-primary">{user?.full_name}</p>
              <p className="text-xs text-text-muted">ETV</p>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
