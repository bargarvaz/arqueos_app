# Sistema de Gestión de Arqueos Bancarios

Plataforma web interna para digitalizar el registro, validación y consulta de arqueos de bóvedas bancarias. Reemplaza el proceso manual en papel/Excel con un flujo estructurado: captura por ETVs, revisión interna y consulta multi-rol con trazabilidad completa.

---

## Stack tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Backend | Python + FastAPI + SQLAlchemy 2.0 asyncio + Pydantic v2 | Python 3.11 |
| Frontend | React + Vite + TypeScript (strict) + TailwindCSS + Zustand + react-hook-form + Zod | React 18 |
| Base de datos | PostgreSQL | 16 |
| Almacenamiento | MinIO (PDFs vía proxy stream desde el backend) | latest |
| Contenedores | Docker + Docker Compose | Compose v2 |
| Autenticación | JWT RS256 (access 15 min + refresh HttpOnly 24 h) | python-jose 3.3.0 |
| OTP | Email OTP 6 dígitos para ETVs (5 min TTL) | |
| Migraciones | Alembic | 1.13 |
| Rate limiting | SlowAPI | |
| Tareas programadas | APScheduler (cierres automáticos, lock de arqueos) | |

---

## Requisitos previos

- **Docker Desktop** instalado y en ejecución
- **Git**
- Puerto `80` libre (nginx frontend)
- Puerto `8000` libre (FastAPI)
- Puerto `5433` libre (PostgreSQL — **no 5432**, evita conflicto con instancias locales)
- Puertos `9010` y `9011` libres (MinIO API y Console)

---

## Inicio rápido (Docker)

```bash
# 1. Clonar
git clone https://github.com/Bargarvaz/arqueos_app.git
cd arqueos_app

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env — mínimo requerido: DATABASE_URL, SECRET_KEY, MINIO_*, SMTP_*

# 3. Levantar servicios
docker compose up -d --build

# 4. Aplicar migraciones
docker compose exec backend alembic upgrade head

# 5. Sembrar catálogos (tipos de movimiento, motivos, días inhábiles)
docker compose exec backend python scripts/seed_catalogs.py

# 6. Crear primer usuario admin
docker compose exec backend python scripts/create_admin.py
# El script imprime una contraseña temporal — guardarla
```

### Puertos expuestos

| Servicio | URL |
|---------|-----|
| Frontend | http://localhost |
| API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |
| PostgreSQL | localhost:5433 |
| MinIO API | localhost:9010 |
| MinIO Console | localhost:9011 |

> Los puertos de PostgreSQL y MinIO difieren de los defaults para evitar conflictos con instancias locales preexistentes.

---

## Portales de acceso

| Portal | URL | Roles permitidos |
|--------|-----|-----------------|
| Usuarios internos | http://localhost/internal/login | admin, operations, data_science |
| ETVs | http://localhost/external/login | etv (con OTP por correo) |

---

## Roles de usuario

| Rol | Sub-rol | Descripción | Acceso |
|-----|---------|-------------|--------|
| `admin` | — | Control total del sistema | Todos los módulos + gestión de usuarios + catálogos + audit log |
| `operations` | — | Operaciones diarias | Arqueos, reportes de error, descargas, directorio |
| `data_science` | — | Análisis | Consulta, filtrado y descarga de datos |
| `etv` | `gerente` / `tesorero` | Empresa transportadora de valores | Captura de arqueos, modificaciones, reportes de error asignados, solo bóvedas asignadas |

---

## Módulos del sistema

### Portal interno (admin / operations / data_science)

| Módulo | Ruta | Descripción |
|--------|------|-------------|
| Dashboard | `/internal/dashboard` | KPIs por día/mes con filtros por ETV y bóveda: arqueos publicados, faltantes, saldos negativos, totales de entradas/salidas, tendencia 7 días, distribución por denominación |
| Explorador de Arqueos | `/internal/arqueos` | Drill-down por bóveda → mes → registros. Filtros avanzados (empresa, bóveda, fechas, tipo de movimiento, estado, búsqueda). Descarga XLSX con auditoría |
| Directorio de Bóvedas | `/internal/vaults` | CRUD completo (admin) con asignación de gerente/tesorero como usuarios, edición de ETV/empresa, denominaciones iniciales, activar/desactivar/reactivar |
| Saldos Finales | `/internal/saldos-finales` | Tabla mensual por bóveda con cierre por denominación y total. Día ancla = max(creación, último reset). Exporta CSV |
| Reportes de Error | `/internal/error-reports` | Crear (admin/ops), ver respuesta del ETV, marcar resuelto |
| Gestión de Usuarios | `/admin/users` | Solo admin: crear, editar (full_name, puesto, sub-rol ETV, ETV/empresa), desactivar, resetear contraseña, asignar bóvedas. Carga masiva CSV |
| Gestor de Catálogos | `/admin/catalogs` | Solo admin: ETVs, empresas, sucursales, tipos de movimiento, motivos de modificación, días inhábiles |
| Audit Log | `/admin/audit` | Solo admin: historial completo con `old_values`/`new_values` JSON expandibles, filtros por usuario/acción/entidad/fecha |
| Mis Sesiones | `/perfil/sesiones` | Listado de sesiones activas multi-pestaña, revocar sesiones individuales o todas |

### Portal ETV (etv)

| Módulo | Ruta | Descripción |
|--------|------|-------------|
| Mis Bóvedas | `/etv/vaults` | Bóvedas asignadas con estado del arqueo del día |
| Captura de Arqueo | `/etv/arqueo` | Formulario sin selector de fecha, drag&drop de filas, hidden record_uid para republicación, validación intra-día por denominación, panel de inventario colapsable, certificados PDF |
| Mis Arqueos | `/etv/arqueos` | Historial filtrado por bóveda asignada, estado y fecha |
| Modificaciones | `/etv/modifications` | Lista y formulario de modificaciones autorizadas con contrapartidas |
| Explorador | `/etv/explorer` | Mismo drill-down que el portal interno, restringido a bóvedas asignadas |
| Saldos Finales | `/etv/saldos-finales` | Mismo módulo que el portal interno, restringido a bóvedas asignadas |
| Reportes de Error | `/etv/error-reports` | Reportes asignados, responder con justificación |
| Mis Sesiones | `/perfil/sesiones` | Igual que en portal interno |

---

## Flujo principal

```
Admin crea bóveda con denominaciones iniciales → balance_reset_at = creación
        ↓
ETV captura arqueo (validación intra-día contra inventario)
        ↓
ETV publica → cierre se calcula y se propaga en cascada → notificación a Operaciones
        ↓
Operaciones revisa en Dashboard / Explorador / Saldos Finales
        ↓
Si hay error: Operaciones reporta → ETV responde → Operaciones marca resuelto
        ↓
Si requiere corregir registros publicados: ETV genera modificación con contrapartida
        ↓
Si admin reescribe denominaciones: balance_reset_at = hoy → notificación + cálculos a partir del reset
```

---

## Características clave

### Cálculo de saldos y reset
- **Día ancla** por bóveda = `max(fecha_creación, balance_reset_at)`. Antes del ancla, la bóveda no aparece en ningún reporte.
- Editar denominaciones desde Directorio de Bóvedas (o reactivar) marca `balance_reset_at = hoy`. Los cálculos de apertura, inventario por denominación, Saldos Finales, Explorador y Dashboard ignoran arqueos previos al reset.
- Cada reset dispara notificación `vault_balance_reset` a operations + admin + ETVs asignados.

### Multi-pestaña
- Cada pestaña genera un `session_id` UUID propio. Permite que un mismo navegador tenga admin y ETV abiertos simultáneamente sin pelearse por el token.
- Las sesiones se guardan en `auth_sessions` con `refresh_hash` SHA-256, IP, user agent y `last_activity_at`. La página *Mis Sesiones* permite revocar individualmente o todas.

### Modo oscuro
- Tokens semánticos vía CSS variables (`:root` y `.dark`) — todos los colores del sistema se intercambian automáticamente.
- `themeStore` (Zustand persist) con tres modos: `light` / `dark` / `system`.
- Inicialización antes del primer render para evitar parpadeo.
- Listener a `prefers-color-scheme` cuando el modo es `system`.
- Toggle en el header de ambos layouts (sol → luna → monitor).

### Validación de denominaciones intra-día
- Al publicar un arqueo, se valida que cada denominación no genere stock negativo durante el día (no solo al cierre).
- Si la bóveda está "sin migrar" (sin desglose inicial), se muestra advertencia y la validación se relaja.

### Certificados PDF
- Hasta 10 PDFs por arqueo, almacenados en MinIO con clave `{empresa}/{vault_code}/{YYYY}/{MM}/{vault}_{date}_{ts}.pdf`.
- Servidos al navegador vía stream-proxy desde el backend (no presigned URLs) para preservar control de acceso.

### Importación masiva CSV
- Plantillas descargables para usuarios y bóvedas.
- Flujo `preview → apply` con validación previa fila por fila y reporte de errores antes de aplicar.

### Cierres automáticos
- Job APScheduler diario a las 22:00: detecta bóvedas sin arqueo del día y notifica.
- Job 22:30: bloquea (`status=locked`) los arqueos publicados que ya están fuera del periodo de gracia.

---

## Seguridad

- JWT con `sub` como **string** (RFC 7519) — access 15 min, refresh HttpOnly 24 h.
- MFA por email OTP para usuarios ETV (6 dígitos, expira en 5 min).
- Cambio de contraseña obligatorio en primer login (`must_change_password`).
- Sesiones por pestaña con revocación individual.
- Audit log inmutable de toda acción significativa con `old_values` / `new_values` JSON.
- Soft deletes — nada se elimina físicamente.
- Rate limiting (SlowAPI) en endpoints de autenticación.
- Headers de seguridad: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
- CORS con whitelist estricta configurable por variable de entorno.
- bcrypt 3.2.2 (compatibilidad con passlib 1.7.4).
- Cookie `Secure=True` solo en producción; `Secure=settings.is_production` permite localhost sin SSL.

---

## Variables de entorno

Ver `.env.example` para referencia completa. Variables críticas:

```env
# Base de datos
DATABASE_URL=postgresql+asyncpg://user:pass@db:5432/arqueos_db

# JWT
SECRET_KEY=<cadena aleatoria larga>
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_HOURS=24

# MinIO
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=...
MINIO_SECRET_KEY=...
MINIO_BUCKET=arqueos-docs

# Email (SMTP) — requerido para OTP de ETVs
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASSWORD=...
SMTP_FROM=noreply@example.com

# Frontend
VITE_API_URL=http://localhost:8000
```

> **SMTP es requerido** para que los usuarios ETV puedan hacer login (el flujo usa OTP por correo). Sin SMTP configurado, los ETVs no pueden autenticarse.

---

## Desarrollo local (sin Docker)

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate      # Windows
pip install -r requirements.txt
# Crear .env local con DATABASE_URL apuntando a PostgreSQL local
uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# Disponible en http://localhost:5173
```

### Tests
```bash
cd backend
pytest
pytest --cov=app tests/
```

---

## Estructura del proyecto

```
arqueos_app/
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── app/
│   │   ├── auth/             # JWT, OTP, refresh tokens, rate limiting, sesiones por pestaña
│   │   ├── users/             # CRUD usuarios, ETVs, empresas, asignación de bóvedas, bulk CSV
│   │   ├── vaults/            # Bóvedas, sucursales, denominaciones iniciales, bulk CSV
│   │   ├── arqueos/           # Core: headers, registros, publicación, explorer, saldos finales, validaciones intra-día
│   │   ├── modifications/     # Modificaciones autorizadas con contrapartidas
│   │   ├── catalogs/          # Tipos de movimiento, motivos, días inhábiles
│   │   ├── notifications/     # Notificaciones in-app
│   │   ├── documents/         # Integración MinIO (stream proxy)
│   │   ├── reports/           # Generadores XLSX (compartidos con explorer)
│   │   ├── dashboard/         # KPIs agregados con filtros
│   │   ├── error_reports/     # Reportes de error ETV ↔ Operaciones
│   │   ├── audit/             # Audit log
│   │   ├── jobs/              # APScheduler: missing arqueo, lock expirados
│   │   └── common/            # Schemas compartidos, dependencias, paginación
│   ├── alembic/versions/      # Migraciones (16 hasta la fecha)
│   ├── scripts/
│   │   ├── create_admin.py
│   │   └── seed_catalogs.py
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── admin/         # UserManagement, CatalogManager, AuditLog
│       │   ├── auth/          # InternalLogin, ExternalLogin, MfaVerification, ChangePassword
│       │   ├── etv/           # EtvVaults, ArqueoForm (drag&drop), EtvArqueoList, ModificationList, ModificationForm, EtvErrorReports
│       │   ├── internal/      # Dashboard, ArqueoExplorer, VaultDirectory, ErrorReports
│       │   ├── closings/      # ClosingsTable (Saldos Finales, compartido cross-rol)
│       │   └── profile/       # MySessions
│       ├── layouts/           # InternalLayout, ExternalLayout (sidebar claro con acento por rol)
│       ├── components/        # DataTable, ComboSelect, DenominationGrid, BulkImportModal, NotificationBell, ThemeToggle, CertificateManager, …
│       ├── services/          # Axios wrappers: api.ts + *Service.ts por módulo
│       ├── store/             # authStore (persistido), themeStore (light/dark/system)
│       ├── styles/            # globals.css con tokens semánticos light/dark
│       └── utils/             # formatters, constants (ROUTES, DENOMINATIONS)
└── docs/
    ├── data-model.md          # Esquema de tablas y relaciones
    └── CHANGELOG.md           # Historial de cambios y correcciones
```

---

## Etapas de desarrollo completadas

| Etapa | Descripción | Estado |
|-------|-------------|--------|
| 1 | Infraestructura Docker, FastAPI base, JWT auth, migraciones Alembic | ✅ |
| 2 | Catálogos, bóvedas, sucursales | ✅ |
| 3 | Módulo de arqueos: captura, registros, publicación, recálculo en cascada | ✅ |
| 4 | Módulo de modificaciones con contrapartidas | ✅ |
| 5 | Documentos PDF en MinIO con stream-proxy | ✅ |
| 6 | Dashboard KPIs con filtros día/mes/ETV/bóveda + tendencia 7 días | ✅ |
| 7 | Notificaciones in-app, reportes de error ETV ↔ Operaciones | ✅ |
| 8 | Explorador de arqueos drill-down, audit log con diff JSON | ✅ |
| 9 | QA: correcciones críticas de runtime, módulos frontend completos | ✅ |
| 10 | Sesiones multi-pestaña, bulk CSV usuarios/bóvedas, sub-roles ETV (gerente/tesorero) | ✅ |
| 11 | Validación intra-día por denominación, drag&drop de filas, vista mensual cross-rol | ✅ |
| 12 | Saldos Finales (mensual con desglose por denominación), reset de saldo por bóveda con notificación, día ancla | ✅ |
| 13 | Modo oscuro con tokens semánticos, refresh visual, edición completa de usuarios y bóvedas | ✅ |
| 14 | Cleanup de Reportes legacy (módulo desplazado por Saldos Finales + Explorador), eliminación de tabla `personnel` | ✅ |

---

## Pendiente / Configuración requerida antes de producción

| Ítem | Descripción | Prioridad |
|------|-------------|-----------|
| SMTP | Configurar servidor de email real para OTP de ETVs y notificaciones | **Crítico** — sin esto los ETVs no pueden hacer login |
| HTTPS / TLS | El refresh token usa cookie HttpOnly; en producción requiere `Secure=True` que solo funciona con HTTPS | **Crítico** para producción |
| Cambio de puertos | En producción ajustar puertos 5433, 9010, 9011 a los valores estándar o los que defina infraestructura | Media |
| Seed de datos maestros | Registrar empresas ETV, sub-empresas y sucursales antes de que los ETVs puedan operar | Alta |
| Lockout de cuenta | El modelo tiene `failed_login_attempts` y `locked_until` pero la lógica de bloqueo automático no está implementada | Media |
| 2FA para usuarios internos | Actualmente solo ETVs tienen MFA; internos solo usan usuario/contraseña | Media |
| Notificaciones en tiempo real | WebSocket / SSE para alertas instantáneas de nuevos arqueos | Baja |
| Tests de integración | Backend tiene estructura de tests; cobertura de endpoints críticos pendiente | Media |
| Branding / logo | Logo placeholder en sidebars (cuadro con inicial "A"). Reemplazar cuando esté el activo definitivo | Baja |

---

## Licencia

Uso interno. No distribuir.
