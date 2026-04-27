// Layout para usuarios internos: sidebar + header + área de contenido
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  FileSearch,
  Vault,
  Users,
  BarChart3,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ShieldCheck,
} from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/utils/constants';
import NotificationBell from '@/components/notifications/NotificationBell';

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
  roles?: string[];
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    to: ROUTES.DASHBOARD,
    icon: <LayoutDashboard className="w-5 h-5" />,
  },
  {
    label: 'Explorador de Arqueos',
    to: ROUTES.ARQUEO_EXPLORER,
    icon: <FileSearch className="w-5 h-5" />,
  },
  {
    label: 'Directorio de Bóvedas',
    to: ROUTES.VAULT_DIRECTORY,
    icon: <Vault className="w-5 h-5" />,
  },
  {
    label: 'Reportes de Error',
    to: ROUTES.ERROR_REPORTS,
    icon: <ClipboardList className="w-5 h-5" />,
    roles: ['admin', 'operations'],
  },
  {
    label: 'Reportes',
    to: ROUTES.REPORTS,
    icon: <BarChart3 className="w-5 h-5" />,
  },
  // Admin
  {
    label: 'Usuarios',
    to: ROUTES.USER_MANAGEMENT,
    icon: <Users className="w-5 h-5" />,
    roles: ['admin'],
  },
  {
    label: 'Catálogos',
    to: ROUTES.CATALOG_MANAGER,
    icon: <Settings className="w-5 h-5" />,
    roles: ['admin'],
  },
  {
    label: 'Auditoría',
    to: ROUTES.AUDIT_LOG,
    icon: <ClipboardList className="w-5 h-5" />,
    roles: ['admin'],
  },
];

export default function InternalLayout() {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(user?.role ?? ''),
  );

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      {/* Sidebar */}
      <aside className={`bg-primary flex flex-col transition-all duration-200 flex-shrink-0 ${collapsed ? 'w-16' : 'w-60'}`}>
        {/* Logo + toggle */}
        <div className={`px-4 py-5 border-b border-primary-dark flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
          {!collapsed && (
            <div className="min-w-0">
              <span className="text-white font-bold text-sm">Sistema Arqueos</span>
              <p className="text-white/60 text-xs mt-0.5 capitalize">{user?.role}</p>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-white/70 hover:text-white flex-shrink-0 transition-colors"
            title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          >
            {collapsed
              ? <ChevronRight className="w-5 h-5" />
              : <ChevronLeft className="w-5 h-5" />
            }
          </button>
        </div>

        {/* Navegación */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) => `
                flex items-center gap-3 px-4 py-3 text-sm transition-colors
                ${collapsed ? 'justify-center' : ''}
                ${isActive
                  ? 'bg-primary-dark text-white font-medium'
                  : 'text-white/70 hover:bg-primary-dark/50 hover:text-white'}
              `}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Usuario + perfil + logout */}
        <div className={`border-t border-primary-dark p-4 space-y-2 ${collapsed ? 'flex flex-col items-center' : ''}`}>
          {!collapsed && user && (
            <p className="text-white text-xs font-medium truncate mb-2">{user.full_name}</p>
          )}
          <NavLink
            to={ROUTES.MY_SESSIONS}
            title={collapsed ? 'Mis sesiones' : undefined}
            className={({ isActive }) =>
              `flex items-center gap-2 text-sm transition-colors ${
                isActive ? 'text-white font-medium' : 'text-white/70 hover:text-white'
              }`
            }
          >
            <ShieldCheck className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Mis sesiones</span>}
          </NavLink>
          <button
            onClick={handleLogout}
            title={collapsed ? 'Cerrar sesión' : undefined}
            className="flex items-center gap-2 text-white/70 hover:text-white text-sm transition-colors"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Cerrar sesión</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-border flex items-center justify-between px-6 py-3 h-14 flex-shrink-0">
          <div />
          <div className="flex items-center gap-4">
            <NotificationBell />
            <div className="text-right">
              <p className="text-sm font-medium text-text-primary">{user?.full_name}</p>
              <p className="text-xs text-text-muted capitalize">{user?.role}</p>
            </div>
          </div>
        </header>

        {/* Contenido */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
