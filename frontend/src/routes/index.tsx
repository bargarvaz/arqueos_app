// Router principal con rutas protegidas por rol
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { useAuthStore } from '@/store/authStore';
import { ROUTES } from '@/utils/constants';

// Páginas de auth (no lazy — se cargan inmediatamente)
import InternalLogin from '@/pages/auth/InternalLogin';
import ExternalLogin from '@/pages/auth/ExternalLogin';
import MfaVerification from '@/pages/auth/MfaVerification';
import ChangePassword from '@/pages/auth/ChangePassword';

// Layouts
import InternalLayout from '@/layouts/InternalLayout';
import ExternalLayout from '@/layouts/ExternalLayout';

// Placeholder para páginas aún no implementadas
const ComingSoon = ({ label }: { label: string }) => (
  <div className="flex items-center justify-center h-64 text-text-muted text-sm">
    {label} — En construcción
  </div>
);

// Lazy imports de páginas implementadas
const CatalogManager = lazy(() => import('@/pages/admin/CatalogManager'));
const VaultDirectory = lazy(() => import('@/pages/internal/VaultDirectory'));
const EtvVaults = lazy(() => import('@/pages/etv/EtvVaults'));
const ArqueoForm = lazy(() => import('@/pages/etv/ArqueoForm'));
const ModificationList = lazy(() => import('@/pages/etv/ModificationList'));
const ModificationForm = lazy(() => import('@/pages/etv/ModificationForm'));
const Dashboard = lazy(() => import('@/pages/internal/Dashboard'));
const ArqueoExplorer = lazy(() => import('@/pages/internal/ArqueoExplorer'));

// ─── Guardias de ruta ─────────────────────────────────────────────────────────

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to={ROUTES.INTERNAL_LOGIN} replace />;
  return <>{children}</>;
}

function RequireRole({
  roles,
  children,
}: {
  roles: string[];
  children: React.ReactNode;
}) {
  const { user } = useAuthStore();
  if (!user || !roles.includes(user.role)) {
    return <Navigate to={ROUTES.INTERNAL_LOGIN} replace />;
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
          <Route path={ROUTES.DASHBOARD} element={<Suspense fallback={null}><Dashboard /></Suspense>} />
          <Route path={ROUTES.ARQUEO_EXPLORER} element={<Suspense fallback={null}><ArqueoExplorer /></Suspense>} />
          <Route path={ROUTES.VAULT_DIRECTORY} element={<Suspense fallback={null}><VaultDirectory /></Suspense>} />
          <Route path={ROUTES.PERSONNEL_DIRECTORY} element={<ComingSoon label="Personal" />} />
          <Route path={ROUTES.REPORTS} element={<ComingSoon label="Reportes" />} />
          <Route path={ROUTES.ERROR_REPORTS} element={<ComingSoon label="Reportes de Error" />} />
          <Route
            path={ROUTES.USER_MANAGEMENT}
            element={
              <RequireRole roles={['admin']}>
                <ComingSoon label="Usuarios" />
              </RequireRole>
            }
          />
          <Route
            path={ROUTES.CATALOG_MANAGER}
            element={
              <RequireRole roles={['admin']}>
                <Suspense fallback={null}><CatalogManager /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path={ROUTES.AUDIT_LOG}
            element={
              <RequireRole roles={['admin']}>
                <ComingSoon label="Auditoría" />
              </RequireRole>
            }
          />
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
          <Route path={ROUTES.ETV_VAULTS} element={<Suspense fallback={null}><EtvVaults /></Suspense>} />
          <Route path={ROUTES.ETV_ARQUEO_FORM} element={<Suspense fallback={null}><ArqueoForm /></Suspense>} />
          <Route path={ROUTES.ETV_ARQUEO_LIST} element={<ComingSoon label="Mis Arqueos" />} />
          <Route path={ROUTES.ETV_MODIFICATIONS} element={<Suspense fallback={null}><ModificationList /></Suspense>} />
          <Route path={`${ROUTES.ETV_MODIFICATIONS}/:headerId`} element={<Suspense fallback={null}><ModificationForm /></Suspense>} />
          <Route
            path={ROUTES.ETV_ERROR_REPORTS}
            element={<ComingSoon label="Reportes de Error ETV" />}
          />
        </Route>

        {/* Redireccionamiento por defecto */}
        <Route path="/" element={<Navigate to={ROUTES.INTERNAL_LOGIN} replace />} />
        <Route path="*" element={<Navigate to={ROUTES.INTERNAL_LOGIN} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
