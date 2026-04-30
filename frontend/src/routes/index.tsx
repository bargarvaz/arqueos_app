// Router principal con rutas protegidas por rol
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';

import { useAuthStore } from '@/store/authStore';
import { ROUTES } from '@/utils/constants';

/** Devuelve la ruta de login que corresponde al contexto actual de la URL.
 * Si el usuario estaba navegando dentro del portal ETV (`/etv/*` o
 * `/external/*`), debe regresar al login externo; en caso contrario al
 * login interno. */
function loginPathForContext(pathname: string): string {
  if (pathname.startsWith('/etv') || pathname.startsWith('/external')) {
    return ROUTES.EXTERNAL_LOGIN;
  }
  return ROUTES.INTERNAL_LOGIN;
}

// Páginas de auth (no lazy — se cargan inmediatamente)
import InternalLogin from '@/pages/auth/InternalLogin';
import ExternalLogin from '@/pages/auth/ExternalLogin';
import MfaVerification from '@/pages/auth/MfaVerification';
import ChangePassword from '@/pages/auth/ChangePassword';

// Layouts
import InternalLayout from '@/layouts/InternalLayout';
import ExternalLayout from '@/layouts/ExternalLayout';

// Lazy imports — internas
const CatalogManager = lazy(() => import('@/pages/admin/CatalogManager'));
const UserManagement = lazy(() => import('@/pages/admin/UserManagement'));
const AuditLog = lazy(() => import('@/pages/admin/AuditLog'));
const VaultDirectory = lazy(() => import('@/pages/internal/VaultDirectory'));
const ErrorReports = lazy(() => import('@/pages/internal/ErrorReports'));
const Dashboard = lazy(() => import('@/pages/internal/Dashboard'));
const ArqueoExplorer = lazy(() => import('@/pages/internal/ArqueoExplorer'));
const ClosingsTable = lazy(() => import('@/pages/closings/ClosingsTable'));

// Lazy imports — ETV
const EtvVaults = lazy(() => import('@/pages/etv/EtvVaults'));
const ArqueoForm = lazy(() => import('@/pages/etv/ArqueoForm'));
const EtvArqueoList = lazy(() => import('@/pages/etv/EtvArqueoList'));
const ModificationList = lazy(() => import('@/pages/etv/ModificationList'));
const ModificationForm = lazy(() => import('@/pages/etv/ModificationForm'));
const EtvErrorReports = lazy(() => import('@/pages/etv/EtvErrorReports'));

// Perfil (todos los roles)
const MySessions = lazy(() => import('@/pages/profile/MySessions'));

const Lazy = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<div className="flex items-center justify-center h-32 text-text-muted text-sm">Cargando...</div>}>
    {children}
  </Suspense>
);

// ─── Guardias de ruta ─────────────────────────────────────────────────────────

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to={loginPathForContext(location.pathname)} replace />;
  }
  return <>{children}</>;
}

function RequireRole({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const { user } = useAuthStore();
  const location = useLocation();
  if (!user || !roles.includes(user.role)) {
    // Si el usuario es ETV pero está en una ruta interna (o viceversa),
    // mandarlo al login que le corresponde por contexto de URL.
    return <Navigate to={loginPathForContext(location.pathname)} replace />;
  }
  return <>{children}</>;
}

function RequirePasswordChange({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  if (user?.must_change_password) {
    return <Navigate to={ROUTES.CHANGE_PASSWORD} replace />;
  }
  return <>{children}</>;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Auth público */}
        <Route path={ROUTES.INTERNAL_LOGIN} element={<InternalLogin />} />
        <Route path={ROUTES.EXTERNAL_LOGIN} element={<ExternalLogin />} />
        <Route path={ROUTES.MFA_VERIFY} element={<MfaVerification />} />
        <Route
          path={ROUTES.CHANGE_PASSWORD}
          element={
            <RequireAuth>
              <ChangePassword />
            </RequireAuth>
          }
        />

        {/* Rutas internas (admin, operations, data_science) */}
        <Route
          element={
            <RequireAuth>
              <RequireRole roles={['admin', 'operations', 'data_science']}>
                <RequirePasswordChange>
                  <InternalLayout />
                </RequirePasswordChange>
              </RequireRole>
            </RequireAuth>
          }
        >
          <Route path={ROUTES.DASHBOARD} element={<Lazy><Dashboard /></Lazy>} />
          <Route path={ROUTES.ARQUEO_EXPLORER} element={<Lazy><ArqueoExplorer /></Lazy>} />
          <Route path={ROUTES.VAULT_DIRECTORY} element={<Lazy><VaultDirectory /></Lazy>} />
          <Route path={ROUTES.ERROR_REPORTS} element={<Lazy><ErrorReports /></Lazy>} />
          <Route path={ROUTES.CLOSINGS} element={<Lazy><ClosingsTable /></Lazy>} />
          <Route
            path={ROUTES.USER_MANAGEMENT}
            element={
              <RequireRole roles={['admin']}>
                <Lazy><UserManagement /></Lazy>
              </RequireRole>
            }
          />
          <Route
            path={ROUTES.CATALOG_MANAGER}
            element={
              <RequireRole roles={['admin']}>
                <Lazy><CatalogManager /></Lazy>
              </RequireRole>
            }
          />
          <Route
            path={ROUTES.AUDIT_LOG}
            element={
              <RequireRole roles={['admin']}>
                <Lazy><AuditLog /></Lazy>
              </RequireRole>
            }
          />
          <Route path={ROUTES.MY_SESSIONS} element={<Lazy><MySessions /></Lazy>} />
        </Route>

        {/* Rutas ETV */}
        <Route
          element={
            <RequireAuth>
              <RequireRole roles={['etv']}>
                <RequirePasswordChange>
                  <ExternalLayout />
                </RequirePasswordChange>
              </RequireRole>
            </RequireAuth>
          }
        >
          <Route path={ROUTES.ETV_VAULTS} element={<Lazy><EtvVaults /></Lazy>} />
          <Route path={ROUTES.ETV_ARQUEO_FORM} element={<Lazy><ArqueoForm /></Lazy>} />
          <Route path={ROUTES.ETV_ARQUEO_LIST} element={<Lazy><EtvArqueoList /></Lazy>} />
          <Route path={ROUTES.ETV_MODIFICATIONS} element={<Lazy><ModificationList /></Lazy>} />
          <Route path={`${ROUTES.ETV_MODIFICATIONS}/:headerId`} element={<Lazy><ModificationForm /></Lazy>} />
          <Route path={ROUTES.ETV_ERROR_REPORTS} element={<Lazy><EtvErrorReports /></Lazy>} />
          <Route path={ROUTES.ETV_EXPLORER} element={<Lazy><ArqueoExplorer /></Lazy>} />
          <Route path={ROUTES.ETV_CLOSINGS} element={<Lazy><ClosingsTable /></Lazy>} />
          <Route path={ROUTES.MY_SESSIONS} element={<Lazy><MySessions /></Lazy>} />
        </Route>

        {/* Redireccionamiento por defecto */}
        <Route path="/" element={<Navigate to={ROUTES.INTERNAL_LOGIN} replace />} />
        <Route path="*" element={<Navigate to={ROUTES.INTERNAL_LOGIN} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
