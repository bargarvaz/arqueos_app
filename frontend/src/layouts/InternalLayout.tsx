// Layout para usuarios internos: sidebar claro + header + área de contenido
import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FileSearch,
  Vault,
  Users,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ShieldCheck,
  Wallet,
} from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/utils/constants';
import NotificationBell from '@/components/notifications/NotificationBell';
import ThemeToggle from '@/components/ui/ThemeToggle';

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
  roles?: string[];
  group?: string;
}

const NAV_ITEMS: NavItem[] = [
  // Operación
  {
    label: 'Dashboard',
    to: ROUTES.DASHBOARD,
    icon: <LayoutDashboard className="w-[18px] h-[18px]" />,
    group: 'Operación',
  },
  {
    label: 'Explorador de Arqueos',
    to: ROUTES.ARQUEO_EXPLORER,
    icon: <FileSearch className="w-[18px] h-[18px]" />,
    group: 'Operación',
  },
  {
    label: 'Directorio de Bóvedas',
    to: ROUTES.VAULT_DIRECTORY,
    icon: <Vault className="w-[18px] h-[18px]" />,
    group: 'Operación',
  },
  {
    label: 'Saldos Finales',
    to: ROUTES.CLOSINGS,
    icon: <Wallet className="w-[18px] h-[18px]" />,
    group: 'Operación',
  },
  {
    label: 'Reportes de Error',
    to: ROUTES.ERROR_REPORTS,
    icon: <ClipboardList className="w-[18px] h-[18px]" />,
    roles: ['admin', 'operations'],
    group: 'Operación',
  },
  // Administración
  {
    label: 'Usuarios',
    to: ROUTES.USER_MANAGEMENT,
    icon: <Users className="w-[18px] h-[18px]" />,
    roles: ['admin'],
    group: 'Administración',
  },
  {
    label: 'Catálogos',
    to: ROUTES.CATALOG_MANAGER,
    icon: <Settings className="w-[18px] h-[18px]" />,
    roles: ['admin'],
    group: 'Administración',
  },
  {
    label: 'Auditoría',
    to: ROUTES.AUDIT_LOG,
    icon: <ClipboardList className="w-[18px] h-[18px]" />,
    roles: ['admin'],
    group: 'Administración',
  },
];

export default function InternalLayout() {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(user?.role ?? ''),
  );

  // Agrupar items por sección
  const groups = visibleItems.reduce<Record<string, NavItem[]>>((acc, item) => {
    const key = item.group ?? 'General';
    (acc[key] ||= []).push(item);
    return acc;
  }, {});

  const currentItem = visibleItems.find((i) => i.to === location.pathname);

  const handleLogout = async () => {
    await logout();
  };

  const initials =
    user?.full_name
      ?.split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('') ?? '··';

  return (
    <div className="flex h-screen bg-surface-alt overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`bg-white border-r border-border flex flex-col transition-all duration-200 flex-shrink-0 ${
          collapsed ? 'w-[72px]' : 'w-64'
        }`}
      >
        {/* Logo + toggle */}
        <div
          className={`px-4 py-5 flex items-center ${
            collapsed ? 'justify-center' : 'justify-between'
          }`}
        >
          {!collapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-primary text-white grid place-items-center text-sm font-bold shadow-soft flex-shrink-0">
                A
              </div>
              <div className="min-w-0">
                <p className="text-text-primary font-semibold text-sm leading-tight truncate">
                  Arqueos
                </p>
                <p className="text-text-muted text-[11px] capitalize truncate">
                  {user?.role}
                </p>
              </div>
            </div>
          )}
          {collapsed && (
            <div className="w-8 h-8 rounded-lg bg-primary text-white grid place-items-center text-sm font-bold shadow-soft">
              A
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={`text-text-muted hover:text-text-primary hover:bg-surface rounded-md p-1 transition-colors ${
              collapsed ? 'mt-3' : ''
            }`}
            title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Navegación agrupada */}
        <nav className="flex-1 py-2 px-3 overflow-y-auto space-y-5">
          {Object.entries(groups).map(([groupName, items]) => (
            <div key={groupName} className="space-y-0.5">
              {!collapsed && (
                <p className="px-2.5 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  {groupName}
                </p>
              )}
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={collapsed ? item.label : undefined}
                  end
                  className={({ isActive }) =>
                    [
                      'group relative flex items-center gap-3 rounded-lg text-sm font-medium transition-all',
                      collapsed ? 'justify-center px-2 py-2.5' : 'px-2.5 py-2',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-text-secondary hover:bg-surface hover:text-text-primary',
                    ].join(' ')
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && !collapsed && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-primary" />
                      )}
                      <span
                        className={`flex-shrink-0 ${
                          isActive ? 'text-primary' : 'text-text-muted group-hover:text-text-primary'
                        }`}
                      >
                        {item.icon}
                      </span>
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Usuario + perfil + logout */}
        <div className="border-t border-border p-3 space-y-1">
          <NavLink
            to={ROUTES.MY_SESSIONS}
            title={collapsed ? 'Mis sesiones' : undefined}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 rounded-lg text-sm transition-colors',
                collapsed ? 'justify-center px-2 py-2' : 'px-2.5 py-2',
                isActive
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-text-secondary hover:bg-surface hover:text-text-primary',
              ].join(' ')
            }
          >
            <ShieldCheck className="w-[18px] h-[18px] flex-shrink-0" />
            {!collapsed && <span>Mis sesiones</span>}
          </NavLink>
          <button
            onClick={handleLogout}
            title={collapsed ? 'Cerrar sesión' : undefined}
            className={`w-full flex items-center gap-3 rounded-lg text-sm text-text-secondary hover:bg-surface hover:text-text-primary transition-colors ${
              collapsed ? 'justify-center px-2 py-2' : 'px-2.5 py-2'
            }`}
          >
            <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
            {!collapsed && <span>Cerrar sesión</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-sm border-b border-border flex items-center justify-between px-6 h-14 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {currentItem && (
              <>
                <span className="text-text-muted">{currentItem.icon}</span>
                <h1 className="text-sm font-semibold text-text-primary truncate">
                  {currentItem.label}
                </h1>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <NotificationBell />
            <div className="w-px h-6 bg-border" />
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary grid place-items-center text-xs font-semibold">
                {initials}
              </div>
              <div className="text-right hidden sm:block">
                <p className="text-xs font-medium text-text-primary leading-tight">
                  {user?.full_name}
                </p>
                <p className="text-[11px] text-text-muted capitalize leading-tight">
                  {user?.role}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Contenido */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
