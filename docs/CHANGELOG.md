# CHANGELOG — Sistema de Arqueos Bancarios

Formato: `[YYYY-MM-DD] tipo: descripción`
Tipos: `fix` (corrección), `feat` (nueva funcionalidad), `chore` (infraestructura/config), `refactor`

---

## [2026-04-29] refactor: cleanup de legacy + drop tabla `personnel`

### refactor: eliminación del módulo Reportes
- **Backend:** se quitó `app/reports/router.py`, `app/reports/service.py` y la función `generate_daily_balances_xlsx` de `generators.py`. Solo se conserva `generate_records_xlsx`, usado por el Explorador para descarga XLSX.
- **Frontend:** se quitó `pages/internal/Reports.tsx`, la ruta `REPORTS`, el ítem del sidebar y el ícono `BarChart3` no usado.
- Razón: la funcionalidad quedó cubierta entre **Saldos Finales** (vista mensual con desglose por denominación) y el **Explorador de Arqueos** (drill-down con descarga XLSX). Mantener tres rutas para lo mismo era ruido.

### refactor: drop de la tabla `personnel` y su enum
- **Migración 016 (`016_drop_personnel.py`):** `DROP TABLE personnel` + `DROP TYPE personnel_type`. La tabla quedó huérfana desde la migración 009 cuando los gerentes/tesoreros pasaron a ser usuarios con sub-rol ETV.
- **Backend:** removidos modelo `Personnel`, enum `PersonnelType`, schemas `PersonnelCreate`/`Update`/`Response`, servicios `create_personnel`/`update_personnel`/`list_personnel` y endpoint `GET /vaults/personnel/list` (cero callers desde frontend).
- **Frontend:** quitada la constante de ruta `PERSONNEL_DIRECTORY`.

### refactor: limpieza de servicios frontend
- `services/reportService.ts` → renombrado a `services/dashboardService.ts` (su único consumidor era el Dashboard); quitadas funciones `getDailyBalances`, `downloadDailyBalances` y la interfaz `DailyBalanceRow` que apuntaban al endpoint borrado.
- `services/explorerService.ts`: removida `getAuditLog` (cero callers; AuditLog usa su propio servicio).

### Archivos afectados
- `backend/alembic/versions/016_drop_personnel.py` (nuevo)
- `backend/app/vaults/{models,schemas,service,router}.py`
- `backend/alembic/env.py`
- `backend/app/main.py`, `backend/app/reports/{router.py,service.py}` (eliminados)
- `backend/app/reports/generators.py`
- `frontend/src/services/{dashboardService.ts,explorerService.ts}` (renombrado/limpiado)
- `frontend/src/utils/constants.ts`
- `frontend/src/routes/index.tsx`
- `frontend/src/layouts/InternalLayout.tsx`
- `frontend/src/pages/internal/Dashboard.tsx`
- `frontend/src/pages/internal/Reports.tsx` (eliminado)

---

## [2026-04-29] feat: Saldos Finales, reset de saldo, dark mode y refresh visual

### feat: módulo Saldos Finales
- **Archivo nuevo:** `frontend/src/pages/closings/ClosingsTable.tsx` (compartido entre rol interno y ETV).
- Tabla mensual por bóveda con cierre por denominación día por día. Columna *Estado* con badges `Inicio` / `Publicado` / `Bloqueado`. Fila final con suma del mes. Exporta CSV con BOM UTF-8.
- ETV solo ve sus bóvedas asignadas (`/arqueos/my-vaults`); roles internos ven todas (incluso inactivas).
- Backend: `GET /arqueos/closings/{vault_id}?year=&month=` con `MonthlyClosingsResponse` y `DailyClosingItem` (incluye `is_anchor: bool`).
- `arqueos/service.py:get_monthly_closings`: parte del inventario al inicio del mes (reusa `get_denomination_inventory`), recorre headers publicados/locked y acumula el neto por denominación día a día.

### feat: reset de saldo por bóveda
- **Migración 015 (`015_vault_balance_reset.py`):** agrega `vaults.balance_reset_at DATE NULL` y el valor `vault_balance_reset` al enum `notification_type`.
- Editar denominaciones desde Directorio de Bóvedas (`update_vault_denominations`) o reactivar (`reactivate_vault`) marca `balance_reset_at = hoy`. Los cálculos de apertura, inventario, Explorador, Dashboard, Saldos Finales y `list_headers` ignoran arqueos previos al reset.
- Día ancla = `max(fecha_creación, balance_reset_at)`. Si cae dentro del mes consultado y no hay arqueo publicado ese día, Saldos Finales muestra una fila sintética con el saldo declarado y badge `Inicio`.
- **Notificación nueva** `vault_balance_reset` para operations + admin + todos los ETVs asignados a la bóveda.
- Filtro propagado a: `_get_opening_balance`, `get_denomination_inventory`, `list_headers`, `explore_records`, `get_vault_day_balances`, `get_summary`, `get_missing_vaults`, `get_monthly_closings`. Filtro `arqueo_date >= balance_reset_at` (incluye el día del reset, ya que la actividad de ese día parte del nuevo saldo inicial).

### feat: edición de usuarios desde Gestión de Usuarios
- `frontend/src/pages/admin/UserManagement.tsx`: nuevo botón **Editar usuario** y modal con campos editables `full_name`, `puesto`, `etv_subrole`, `company_id`, `empresa_id` (estos últimos solo para rol ETV). Rol no editable.
- Validación reactiva con Zod; errores en rojo bajo cada campo.
- Refactor de `useEffect` para cargar empresas filtradas por la ETV seleccionada en el formulario de edición.

### feat: edición de ETV/empresa desde Directorio de Bóvedas
- `frontend/src/pages/internal/VaultDirectory.tsx`: el modal de edición ahora permite cambiar `company_id` y `empresa_id`, con `useWatch` para refiltrar empresas reactivamente y `useEffect` que limpia `empresa_id` solo si la nueva ETV no la contiene.
- Backend: `VaultUpdate` schema y `vaultService.updateVault` aceptan `company_id`. Errores muestran mensajes legibles.

### feat: modo oscuro con tokens semánticos
- `frontend/src/styles/globals.css`: tokens vía CSS variables (`:root` light, `.dark` dark) para `background`, `surface`, `surface-alt`, `surface-hover`, `border`, `border-strong`, `text-*`, status `*-light`. Shim `.dark .bg-white { ... }` para mapear los 36 usos literales sin refactor.
- `frontend/src/store/themeStore.ts` (nuevo): Zustand persist en `localStorage` con modos `light` / `dark` / `system`, listener a `prefers-color-scheme` cuando es `system`.
- `frontend/src/main.tsx`: `initTheme()` aplicado antes del primer render (sin parpadeo).
- `frontend/src/components/ui/ThemeToggle.tsx` (nuevo): botón cíclico Sol → Luna → Monitor; en header de ambos layouts.
- Paleta dark cuidando contraste WCAG AA: fondo `#101216`, cards `#181A1F`, texto primario `#E8E8ED` (≈ 14:1), `color-scheme: dark` aplicado al `<html>`.

### feat: refresh visual (rediseño completo)
- `frontend/tailwind.config.js`: `borderRadius` ampliado (`8/12/16`), nuevos `boxShadow` (`soft`, `card`, `elevated`, `ring`), animación `fade-in`.
- `globals.css`: rediseño de `.btn-*`, `.input`, `.card`, `.badge-*`, helpers `.tab-active`, `.heading-lg`, `.section-title`. Foco con `ring-4` translúcido. `active:translate-y-px` para micro-interacción.
- **Layouts:** sidebars **blancos** con acento institucional (verde militar para internos, dorado para ETV), agrupación por sección, header con título dinámico, avatar con iniciales y divisor sutil. `bg-surface-alt` como fondo de página, header con backdrop-blur.
- **Logins:** logos `rounded-2xl` con `shadow-card`, glows decorativos radiales en el fondo, tipografía 600 con `tracking-tight`.

### Archivos afectados (esta entrega)
- Migraciones: `015_vault_balance_reset.py`
- Backend: `arqueos/{schemas,service,router}.py`, `arqueos/explorer_service.py`, `vaults/{models,schemas,service}.py`, `notifications/{models,service}.py`, `dashboard/service.py`
- Frontend: `pages/closings/ClosingsTable.tsx`, `pages/admin/UserManagement.tsx`, `pages/internal/VaultDirectory.tsx`, `pages/auth/{InternalLogin,ExternalLogin}.tsx`, `services/{arqueoService,vaultService,notificationService}.ts`, `store/themeStore.ts`, `components/ui/ThemeToggle.tsx`, `layouts/{InternalLayout,ExternalLayout}.tsx`, `routes/index.tsx`, `utils/constants.ts`, `styles/globals.css`, `tailwind.config.js`, `main.tsx`

---

## [2026-04-23..27] feat: sesiones multi-pestaña, bulk CSV, sub-roles ETV, drag&drop, dashboard avanzado

### feat: sesiones de auth por pestaña
- **Migración 012:** tabla `auth_sessions` con `id` UUID, `refresh_hash` SHA-256, `last_activity_at`, `ip`, `user_agent`.
- Cada pestaña genera su propio `session_id` (sessionStorage) → permite admin y ETV abiertos en el mismo navegador sin colisionar.
- Frontend: `pages/profile/MySessions.tsx` para listar y revocar sesiones (individuales o todas).

### feat: bulk import CSV
- Plantillas descargables para usuarios y bóvedas (`/users/bulk-import/template`, `/vaults/bulk-import/template`).
- Flujo `preview → apply` con validación previa fila por fila.
- `frontend/src/components/bulk/BulkImportModal.tsx` reutilizable.

### feat: sub-roles ETV (gerente / tesorero)
- **Migración 014:** enum `etv_subrole` y columna `users.etv_subrole NULLABLE`.
- Validador Pydantic obliga `etv_subrole` cuando `role == 'etv'` y lo prohíbe en otros roles.

### feat: denominaciones obligatorias en creación de bóveda
- **Migración 013:** 16 columnas `initial_bill_*` / `initial_coin_*` en `vaults`.
- `VaultCreate` exige denominaciones; `initial_balance` se calcula como su suma.
- `DenominationGrid` reutilizable.

### feat: validación intra-día por denominación
- `validate_denomination_balance(intraday=True)`: además del cuadre al cierre, valida que ninguna denominación quede en negativo en ningún momento del día.
- Si la bóveda está "sin migrar" (sin desglose inicial) → validación se relaja, banner amarillo en UI.

### feat: drag & drop en captura de arqueo
- HTML5 native drag&drop con `useFieldArray.move()`. Hidden inputs preservan `record_uid` y `record_date` al republicar.

### feat: dashboard con filtros avanzados
- Filtros por día/mes, ETV y bóveda. Tendencia 7 días, distribución por denominación.

### feat: explorador drill-down
- Drill-down bóveda → mes → registros con descarga XLSX. Navegación por mes con `useSearchParams` (back/forward del navegador funcionan).

### feat: certificados PDF vía stream-proxy
- Cambio de presigned URLs a stream-proxy desde el backend (control de acceso). Hasta 10 PDFs por arqueo.

### Notificaciones nuevas
- `weekend_upload`, `negative_balance`, `excess_certificates`, `vault_reactivated`, `error_reported`, `error_response`.

### Catálogos extendidos
- ETVs (companies), sub-empresas (`empresas`), sucursales, tipos de movimiento, motivos de modificación, días inhábiles. CRUD completo desde *Gestor de Catálogos*.

### Jobs APScheduler
- 22:00 diario: `missing_arqueo_job` notifica bóvedas sin arqueo del día.
- 22:30: `lock_expired_arqueos_job` bloquea arqueos fuera del periodo de gracia.

---

## [2026-04-23] fix+feat: correcciones críticas de runtime y módulos frontend completos

### Correcciones críticas (runtime blockers)

#### fix: JWT `sub` debe ser string — JWTClaimsError silencioso
- **Archivos:** `backend/app/auth/utils.py`, `backend/app/dependencies.py`
- **Síntoma:** Cada GET /auth/me devolvía 401 inmediatamente después de login exitoso.
- **Causa:** `create_access_token` y `create_refresh_token` almacenaban `"sub": user_id` (int). python-jose 3.3.0 lanza `JWTClaimsError: Subject must be a string.` (RFC 7519 §4.1.2). La excepción era capturada silenciosamente, retornando `None` en `decode_access_token`.
- **Fix:** `"sub": str(user_id)` en creación; `int(payload.get("sub"))` en `get_current_user`.

#### fix: Alembic DuplicateObjectError en tipos ENUM
- **Causa:** SQLAlchemy 2.0.30 no respeta `create_type=False` dentro de `op.create_table`.
- **Fix:** Eliminados todos los `op.execute("CREATE TYPE ...")` y los argumentos `create_type=False`.

#### fix: bcrypt 4.x incompatible con passlib 1.7.4
- **Fix:** `bcrypt==3.2.2` en `requirements.txt`.

#### fix: token no persistido en localStorage tras login
- **Fix:** `localStorage.setItem('access_token', ...)` después del login en `authService.ts`.

#### fix: admin email rechazado por Pydantic EmailStr
- **Fix:** Email cambiado a `admin@arqueos.app` (`.local` es TLD reservado).

### Módulos frontend completos
- **Gestión de Usuarios** (`/admin/users`), **Audit Log** (`/admin/audit`), **Reportes de Error** (`/internal/error-reports`), **Mis Bóvedas** ETV, **Captura de Arqueo**, **Mis Arqueos**, **Modificaciones**, **Reportes de Error ETV**, **Explorador de Arqueos** drill-down.

### Infraestructura
- Puertos PostgreSQL `5432→5433` y MinIO `9000→9010`/`9001→9011` para evitar conflictos.
- `npm install` en lugar de `npm ci` en Dockerfile frontend (no requiere lock file).

---

## [Commits anteriores] ETAPAs 1-9 — Sistema base

Ver historial git para detalle de implementación inicial. Resumen:
- **ETAPA 1**: Docker Compose, FastAPI, PostgreSQL, Alembic, JWT+OTP, refresh tokens, rate limiting.
- **ETAPA 2**: Catálogos, bóvedas, sucursales, scripts de seed.
- **ETAPAs 3-9**: Arqueos, modificaciones, PDF/MinIO, dashboard, notificaciones, audit log, explorador, formularios ETV.
