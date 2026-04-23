# CHANGELOG — Sistema de Arqueos Bancarios

Formato: `[YYYY-MM-DD] tipo: descripción`
Tipos: `fix` (corrección), `feat` (nueva funcionalidad), `chore` (infraestructura/config), `refactor`

---

## [2026-04-23] fix+feat: Correcciones críticas de runtime y módulos frontend completos

### Correcciones críticas (runtime blockers)

#### fix: JWT `sub` debe ser string — JWTClaimsError silencioso
- **Archivo:** `backend/app/auth/utils.py`, `backend/app/dependencies.py`
- **Síntoma:** Cada GET /auth/me devolvía 401 inmediatamente después de login exitoso. Botón "Ingresando..." bloqueado indefinidamente.
- **Causa:** `create_access_token` y `create_refresh_token` almacenaban `"sub": user_id` (int). python-jose 3.3.0 lanza `JWTClaimsError: Subject must be a string.` (RFC 7519 §4.1.2). La excepción era capturada silenciosamente, retornando `None` en `decode_access_token`.
- **Fix:** `"sub": str(user_id)` en creación; `int(payload.get("sub"))` en `get_current_user`.

#### fix: Alembic DuplicateObjectError en tipos ENUM de PostgreSQL
- **Archivos:** `backend/alembic/versions/001_*.py`, `003_*.py`, `004_*.py`, `006_*.py`
- **Síntoma:** `alembic upgrade head` fallaba con `ERROR: type "user_role" already exists`.
- **Causa:** SQLAlchemy 2.0.30 no respeta `create_type=False` dentro de `op.create_table`. Las migraciones tenían `op.execute("CREATE TYPE ...")` + `sa.Enum(create_type=False)`, creando el ENUM dos veces.
- **Fix:** Eliminados todos los `op.execute("CREATE TYPE ...")` y los argumentos `create_type=False`.

#### fix: bcrypt 4.x incompatible con passlib 1.7.4
- **Archivo:** `backend/requirements.txt`
- **Síntoma:** `ValueError: password cannot be longer than 72 bytes` durante verify en login.
- **Causa:** passlib 1.7.4 llama `detect_wrap_bug()` con contraseña >72 bytes; bcrypt ≥ 4.0 lanza ValueError en lugar de truncar.
- **Fix:** `bcrypt==3.2.2`

#### fix: Token no persistido en localStorage tras login
- **Archivo:** `frontend/src/services/authService.ts`
- **Síntoma:** Login retornaba 200 pero siguiente request no llevaba Authorization header.
- **Fix:** `localStorage.setItem('access_token', data.access_token)` después del login exitoso.

#### fix: Admin email rechazado por Pydantic EmailStr
- **Fix:** UPDATE directo a `admin@arqueos.app` (`.local` es TLD reservado, rechazado por validación).

### Infraestructura / Docker

#### chore: Puertos ajustados para evitar conflictos con servicios locales
- **Archivo:** `docker-compose.yml`
- PostgreSQL: `5432:5432` → `5433:5432`
- MinIO: `9000:9000` → `9010:9000`, `9001:9001` → `9011:9001`

#### chore: Dockerfile frontend — `npm ci` → `npm install`
- **Archivo:** `frontend/Dockerfile`
- `npm ci` requiere `package-lock.json`. Cambiado a `npm install` para no bloquear el build.

### Nuevos módulos frontend (portales internos)

#### feat: Gestión de Usuarios (`/app/admin/users`)
- **Archivos:** `frontend/src/pages/admin/UserManagement.tsx`, `frontend/src/services/userService.ts`
- DataTable paginada con filtros por rol y estado (activo/inactivo)
- Modal de creación: email, nombre, rol, tipo; para ETVs: selector de empresa + checkboxes de bóvedas asignadas
- Contraseña temporal mostrada en modal tras creación exitosa (leída del header `X-Temp-Password`)
- Acciones por fila: resetear contraseña, activar/desactivar usuario

#### feat: Directorio de Personal (`/app/personnel`)
- **Archivo:** `frontend/src/pages/internal/PersonnelDirectory.tsx`
- Lista completa de gerentes y tesoreros con filtro por tipo y búsqueda por nombre
- Toggle "Mostrar inactivos"
- Modal de creación/edición (solo admin); endpoint retorna array plano (no paginado)

#### feat: Reportes de Balances (`/app/reports`)
- **Archivo:** `frontend/src/pages/internal/Reports.tsx`
- Filtros: rango de fechas y bóveda específica
- Tabla con saldos apertura/cierre, entradas, salidas
- Descarga XLSX via `/reports/daily-balances/download` con `responseType: 'blob'`

#### feat: Reportes de Error — vista interna (`/app/error-reports`)
- **Archivo:** `frontend/src/pages/internal/ErrorReports.tsx`
- Vista de tarjetas mostrando descripción y respuesta del ETV
- Modal de creación (admin/operations): selector de ETV, ID de arqueo opcional, descripción
- Botón "Resolver" visible cuando el reporte tiene respuesta y no está cerrado

#### feat: Audit Log (`/app/admin/audit`)
- **Archivo:** `frontend/src/pages/admin/AuditLog.tsx`
- Filas expandibles al hacer clic para mostrar `old_values`/`new_values` como JSON formateado en `<pre>`
- Filtros: usuario, acción, entidad, rango de fechas

### Nuevos módulos frontend (portal ETV)

#### feat: Historial de Arqueos ETV (`/etv/arqueos`)
- **Archivo:** `frontend/src/pages/etv/EtvArqueoList.tsx`
- Llama al nuevo endpoint `GET /arqueos/my-history` que filtra por bóvedas asignadas del ETV
- Filtros: estado, rango de fechas, bóveda
- Botón "Ver" navega al ArqueoForm para esa bóveda/fecha

#### feat: Reportes de Error — vista ETV (`/etv/error-reports`)
- **Archivo:** `frontend/src/pages/etv/EtvErrorReports.tsx`
- Lista de reportes asignados al ETV autenticado
- Componente `RespondModal` con textarea validada (mínimo 5 caracteres)
- Botón "Responder" visible solo si el reporte está abierto/acknowledged y sin respuesta previa

### Nuevo módulo backend

#### feat: `GET /arqueos/my-history` — historial propio para ETV
- **Archivos:** `backend/app/arqueos/router.py`, `backend/app/arqueos/service.py`
- Endpoint que recupera los `vault_ids` asignados al ETV autenticado y filtra `list_headers` con ellos
- `list_headers` extendido para aceptar `vault_ids: list[int] | None` (lista IN de bóvedas)

### Completado: VaultDirectory CRUD

#### feat: VaultDirectory con creación y edición completas
- **Archivo:** `frontend/src/pages/internal/VaultDirectory.tsx`
- Añadido botón "Nueva Bóveda" (solo admin) con modal de creación
- Añadida columna "Editar" por fila con modal de edición pre-poblado
- Reemplazados todos los `prompt()` nativos con modales React propios
- Carga companies (userService), branches y personnel (vaultService) para los selects del formulario
- Validación con Zod: `vault_code` uppercase, `vault_name`, `company_id`, `branch_id`, `manager_id`, `treasurer_id`, `initial_balance`

### Router — eliminación de placeholders

#### refactor: Todas las rutas apuntan a implementaciones reales
- **Archivo:** `frontend/src/routes/index.tsx`
- Eliminados todos los componentes `ComingSoon` (7 páginas)
- Añadidos lazy imports para todos los módulos nuevos
- Helper `<Lazy>` con Suspense fallback consistente

### TypeScript strict mode

#### fix: Errores de compilación TypeScript resueltos
- `frontend/src/vite-env.d.ts`: creado con `/// <reference types="vite/client" />` para `import.meta.env`
- Imports no usados eliminados: `Eye`, `formatDatetime`, destructuring de `user` en createUser
- Cast doble para campos mixtos: `(record as unknown as Record<string, string>)[key]`

---

## [Commits anteriores] ETAPAs 1-9 — Sistema completo

Ver historial git para detalle de implementación inicial de todas las ETAPAs (commits `23cbb74`, `985d992`, `3217bf0`).

### Resumen de ETAPAs
- **ETAPA 1** (`23cbb74`): Docker Compose, FastAPI, PostgreSQL, Alembic, autenticación JWT+OTP, refresh tokens, rate limiting
- **ETAPA 2** (`985d992`): Catálogos, bóvedas, sucursales, personal, seed scripts
- **ETAPAs 3-9** (`3217bf0`): Arqueos, modificaciones, PDF/MinIO, dashboard, reportes, notificaciones, audit log, explorador, panel admin, formularios ETV completos
