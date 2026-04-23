# Sistema de Gestión de Arqueos Bancarios

Plataforma web interna para digitalizar el registro, validación y consulta de arqueos de bóvedas bancarias. Reemplaza el proceso manual en papel/Excel con un flujo estructurado: captura por ETVs, revisión interna y generación de reportes.

---

## Stack tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Backend | Python + FastAPI + SQLAlchemy 2.0 asyncio | Python 3.11 |
| Frontend | React + Vite + TypeScript (strict) + Tailwind CSS | React 18 |
| Base de datos | PostgreSQL | 16 |
| Almacenamiento | MinIO (objetos / PDFs) | latest |
| Contenedores | Docker + Docker Compose | Compose v2 |
| Autenticación | JWT RS256 (access 15 min + refresh HttpOnly 24 h) | python-jose 3.3.0 |
| OTP | Email OTP 6 dígitos para ETVs (5 min TTL) | |
| Migraciones | Alembic | 1.13 |
| Rate limiting | SlowAPI | |
| Tareas programadas | APScheduler | |

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
# Editar .env — mínimo requerido: DATABASE_URL, SECRET_KEY, MINIO_*

# 3. Levantar servicios
docker compose up -d --build

# 4. Aplicar migraciones
docker compose exec backend alembic upgrade head

# 5. Sembrar catálogos (tipos de documento, denominaciones)
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

> **Nota:** Los puertos de PostgreSQL y MinIO difieren de los defaults para evitar conflictos con instancias locales preexistentes.

---

## Portales de acceso

| Portal | URL | Roles permitidos |
|--------|-----|-----------------|
| Usuarios internos | http://localhost/internal/login | admin, operations, data_science |
| ETVs | http://localhost/external/login | etv |

---

## Roles de usuario

| Rol | Descripción | Acceso |
|-----|-------------|--------|
| `admin` | Control total del sistema | Todos los módulos + gestión de usuarios + catálogos + audit log |
| `operations` | Operaciones diarias | Arqueos, reportes de error, descargas, directorio |
| `data_science` | Análisis | Consulta, filtrado y descarga de datos |
| `etv` | Empresa transportadora de valores | Captura de arqueos, modificaciones, reportes de error asignados |

---

## Módulos del sistema

### Portal interno (admin / operations / data_science)

| Módulo | Ruta | Descripción |
|--------|------|-------------|
| Dashboard | `/app/dashboard` | KPIs: bóvedas activas, arqueos del día/mes, tasa de modificación, alertas |
| Explorador de Arqueos | `/app/arqueos` | Búsqueda paginada con filtros avanzados, descarga individual de PDFs |
| Directorio de Bóvedas | `/app/vaults` | CRUD completo (admin), búsqueda, activar/desactivar bóvedas |
| Directorio de Personal | `/app/personnel` | CRUD (admin), filtro por tipo (gerente/tesorero), activos/inactivos |
| Reportes | `/app/reports` | Balances diarios por fecha y bóveda, descarga XLSX |
| Reportes de Error | `/app/error-reports` | Crear (admin/ops), ver respuesta ETV, marcar resuelto |
| Gestión de Usuarios | `/app/admin/users` | Solo admin: crear, desactivar, resetear contraseña |
| Gestor de Catálogos | `/app/admin/catalogs` | Solo admin: tipos de documento y denominaciones |
| Audit Log | `/app/admin/audit` | Solo admin: historial completo de acciones con JSON diff expandible |

### Portal ETV

| Módulo | Ruta | Descripción |
|--------|------|-------------|
| Mis Bóvedas | `/etv/vaults` | Lista de bóvedas asignadas |
| Captura de Arqueo | `/etv/arqueo` | Formulario multi-sección con validación, firma y publicación |
| Historial de Arqueos | `/etv/arqueos` | Historial propio filtrado por bóveda, estado y fecha |
| Modificaciones | `/etv/modifications` | Lista de modificaciones autorizadas pendientes |
| Formulario de Modificación | `/etv/modifications/:headerId` | Aplicar correcciones autorizadas |
| Reportes de Error | `/etv/error-reports` | Ver reportes asignados, responder con justificación |

---

## Flujo principal

```
ETV captura arqueo → publica → sistema genera PDF en MinIO
      ↓
Operaciones revisa → detecta error → crea reporte de error → asigna a ETV
      ↓
ETV responde reporte → Operaciones marca resuelto
      ↓
Operaciones autoriza modificación → ETV aplica corrección
      ↓
Data Science / Operaciones descarga reportes XLSX
```

---

## Seguridad

- JWT con `sub` como **string** (RFC 7519 compliance) — access token 15 min, refresh token HttpOnly 24 h
- MFA por email OTP para usuarios ETV (código 6 dígitos, expira en 5 min)
- Cambio de contraseña obligatorio en primer login (`must_change_password`)
- Audit log completo de toda acción significativa (create/update/delete con `old_values` / `new_values`)
- Soft deletes — nada se elimina físicamente
- Rate limiting en endpoints de autenticación (SlowAPI)
- Headers de seguridad: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`
- CORS con whitelist estricta configurable por variable de entorno
- bcrypt para hashing de contraseñas (versión ≤ 3.x compatible con passlib 1.7.4)
- Contraseñas temporales generadas al crear usuarios (retornadas en header `X-Temp-Password`)

> **Producción:** El refresh token requiere `Secure=True` en la cookie, lo que exige **HTTPS**. En localhost funciona sin SSL; en producción es obligatorio.

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
│   │   ├── auth/           # JWT, OTP, refresh tokens, rate limiting
│   │   ├── users/          # CRUD usuarios, empresas, asignación de bóvedas
│   │   ├── vaults/         # Bóvedas, sucursales, personal
│   │   ├── arqueos/        # Core: headers, líneas, publicación, PDF
│   │   ├── modifications/  # Flujo de modificaciones autorizadas
│   │   ├── catalogs/       # Tipos de documento, denominaciones
│   │   ├── notifications/  # Email OTP
│   │   ├── documents/      # Integración MinIO
│   │   ├── reports/        # Balances diarios, descarga XLSX
│   │   ├── dashboard/      # KPIs agregados
│   │   ├── error_reports/  # Reportes de error ETV ↔ Operaciones
│   │   ├── audit/          # Audit log con diff JSON
│   │   └── common/         # Schemas compartidos, dependencias, paginación
│   ├── alembic/            # Migraciones de base de datos
│   ├── scripts/
│   │   ├── create_admin.py     # Crea usuario admin inicial
│   │   └── seed_catalogs.py    # Siembra catálogos base
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── admin/      # UserManagement, CatalogManager, AuditLog
│       │   ├── auth/       # InternalLogin, ExternalLogin, MfaVerification, ChangePassword
│       │   ├── etv/        # EtvVaults, ArqueoForm, EtvArqueoList, ModificationList, ModificationForm, EtvErrorReports
│       │   └── internal/   # Dashboard, ArqueoExplorer, VaultDirectory, PersonnelDirectory, Reports, ErrorReports
│       ├── layouts/        # InternalLayout, ExternalLayout (sidebar, header, nav)
│       ├── components/     # DataTable (TanStack), modal base, form inputs
│       ├── services/       # Axios wrappers: api.ts + *Service.ts por módulo
│       ├── store/          # Zustand: authStore (persist en localStorage)
│       └── utils/          # formatters, constants (ROUTES)
└── docs/
    ├── data-model.md       # Esquema completo de tablas y relaciones
    └── CHANGELOG.md        # Historial de cambios y correcciones
```

---

## Etapas de desarrollo completadas

| Etapa | Descripción | Estado |
|-------|-------------|--------|
| 1 | Infraestructura Docker, FastAPI base, JWT auth, migraciones Alembic | ✅ |
| 2 | Catálogos (tipos documento, denominaciones), bóvedas, sucursales, personal | ✅ |
| 3 | Módulo de arqueos: captura, líneas, publicación, generación de PDF | ✅ |
| 4 | Módulo de modificaciones: solicitud, autorización, aplicación | ✅ |
| 5 | Documentos PDF en MinIO: almacenamiento, descarga firmada | ✅ |
| 6 | Dashboard KPIs, reportes de balances diarios, descarga XLSX | ✅ |
| 7 | Notificaciones email, reportes de error ETV ↔ Operaciones | ✅ |
| 8 | Explorador de arqueos (admin/ops), panel de gestión de usuarios, audit log | ✅ |
| 9 | QA, correcciones críticas de runtime, módulos frontend completos | ✅ |

---

## Bugs críticos descubiertos y corregidos

### 1. JWT `sub` como entero — bucle infinito de 401

**Síntoma:** Login exitoso (POST /auth/login devolvía token), pero todos los GET /auth/me devolvían 401. El botón quedaba atascado en "Ingresando...".

**Causa raíz:** `create_access_token` almacenaba `"sub": user_id` donde `user_id` es `int`. La librería `python-jose 3.3.0` implementa validación estricta RFC 7519: `_validate_sub` lanza `JWTClaimsError: Subject must be a string.` Esta excepción era silenciosamente capturada por `decode_access_token`, que retornaba `None`, haciendo que cada token pareciera inválido.

**Corrección:**
- `backend/app/auth/utils.py`: `"sub": str(user_id)` en ambas funciones de creación de token
- `backend/app/dependencies.py`: `int(payload.get("sub"))` al recuperar el ID

---

### 2. Alembic `DuplicateObjectError` en tipos ENUM

**Síntoma:** `alembic upgrade head` fallaba con `ERROR: type "user_role" already exists`.

**Causa raíz:** Las migraciones tenían `op.execute("CREATE TYPE user_role AS ENUM ...")` seguido de `sa.Enum(..., name="user_role", create_type=False)` dentro de `op.create_table`. SQLAlchemy 2.0.30 ignora `create_type=False` dentro de `op.create_table` y crea el ENUM igualmente, resultando en doble creación.

**Corrección:** Eliminados todos los `op.execute("CREATE TYPE ...")` y todos los argumentos `create_type=False`. Se deja que `sa.Enum` cree los tipos automáticamente en el primer `op.create_table` que los usa.

---

### 3. bcrypt 4.x incompatible con passlib 1.7.4

**Síntoma:** `ValueError: password cannot be longer than 72 bytes` durante el login.

**Causa raíz:** passlib 1.7.4 llama `detect_wrap_bug()` que intenta verificar un hash con una contraseña >72 bytes. bcrypt ≥ 4.0 rechaza esto con `ValueError` en lugar de truncar silenciosamente.

**Corrección:** `backend/requirements.txt`: `bcrypt==3.2.2`

---

### 4. Token no almacenado en localStorage tras login

**Síntoma:** Login POST retornaba 200 con token, pero el interceptor Axios no enviaba el token en la siguiente solicitud.

**Causa raíz:** `authService.loginInternal` retornaba los datos sin llamar `localStorage.setItem('access_token', ...)`. El interceptor de request de Axios lee desde localStorage.

**Corrección:** `frontend/src/services/authService.ts`: añadido `localStorage.setItem` después del login exitoso.

---

### 5. Correcciones TypeScript (strict mode)

- `Eye` de lucide-react importado pero no usado → eliminado
- `formatDatetime` importado pero no usado en UserManagement → eliminado
- Destructuring `{ user, tempPassword }` donde `user` no se usaba → eliminado
- Cast de tipo para campos mixtos en ArqueoForm: `(record as unknown as Record<string, string>)[key]`
- `vite-env.d.ts` faltante → creado con `/// <reference types="vite/client" />` para resolver `import.meta.env`

---

### 6. Email de admin rechazado por Pydantic EmailStr

**Síntoma:** `admin@arqueos.local` era rechazado como email inválido (`.local` es TLD reservado).

**Corrección:** UPDATE directo en base de datos a `admin@arqueos.app`.

---

## Pendiente / Configuración requerida antes de producción

| Ítem | Descripción | Prioridad |
|------|-------------|-----------|
| SMTP | Configurar servidor de email real para OTP de ETVs | **Crítico** — sin esto los ETVs no pueden hacer login |
| HTTPS / TLS | El refresh token usa cookie HttpOnly; en producción requiere `Secure=True` que solo funciona con HTTPS | **Crítico** para producción |
| Cambio de puertos | En producción ajustar puertos 5433, 9010, 9011 a los valores estándar o los que defina infraestructura | Media |
| Seed de datos maestros | Registrar empresas ETV, sucursales y personal antes de que los ETVs puedan operar | Alta |
| Lockout de cuenta | El modelo tiene `failed_login_attempts` y `locked_until` pero la lógica de bloqueo automático no está implementada | Media |
| 2FA para usuarios internos | Actualmente solo ETVs tienen MFA; internos solo usan usuario/contraseña | Media |
| Notificaciones en tiempo real | WebSocket / SSE para alertas instantáneas de nuevos arqueos | Baja |
| Tests de integración | Backend tiene estructura de tests; cobertura de endpoints críticos pendiente | Media |

---

## Licencia

Uso interno. No distribuir.
