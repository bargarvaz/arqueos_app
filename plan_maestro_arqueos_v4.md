# Plan Maestro de Desarrollo — Sistema de Gestión de Arqueos Bancarios

## 1. Visión General del Proyecto

### 1.1 Objetivo
Digitalizar el proceso de registro, validación y consulta de arqueos de bóvedas bancarias, reemplazando el flujo actual basado en papel y Excel por una plataforma web segura, trazable y en tiempo real.

### 1.2 Problema actual
- Información con **T-2** de retraso (llega 2 días después).
- Errores frecuentes en datos capturados manualmente en Excel.
- Pérdida de trazabilidad al pasar por múltiples personas/áreas.
- Sin validaciones automáticas ni auditoría de cambios.
- Certificados impresos, firmados y escaneados como PDF.

### 1.3 Solución
Plataforma web interna con:
- Captura directa en formulario web por las ETVs (empresas transportadoras de valores).
- Validaciones en tiempo real (cuadre de denominaciones, campos obligatorios).
- Dashboard operativo para usuarios internos.
- Trazabilidad completa de cada operación y cambio.
- Sistema de notificaciones in-app.
- Almacenamiento de certificados PDF en MinIO.

---

## 2. Arquitectura Técnica

### 2.1 Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Backend | Python 3.11+ / FastAPI |
| Frontend | React (Vite) |
| Base de datos | PostgreSQL 16 |
| Almacenamiento de objetos | MinIO |
| Contenedores | Docker + Docker Compose |
| Autenticación | JWT (access + refresh tokens) |
| MFA | Email OTP (solo ETVs) |

### 2.2 Diagrama de arquitectura de alto nivel

```
┌─────────────────────────────────────────────────────────┐
│                      DOCKER COMPOSE                      │
│                                                          │
│  ┌──────────┐   ┌──────────┐   ┌────────┐   ┌────────┐ │
│  │  React   │──▶│ FastAPI  │──▶│Postgres│   │ MinIO  │ │
│  │ (Nginx)  │   │ Backend  │──▶│  DB    │   │Storage │ │
│  │ :80/:443 │   │ :8000    │   │ :5432  │   │ :9000  │ │
│  └──────────┘   └──────────┘   └────────┘   └────────┘ │
│                      │                                    │
│                      ▼                                    │
│              ┌──────────────┐                             │
│              │ Cron/Tareas  │                             │
│              │ programadas  │                             │
│              └──────────────┘                             │
└─────────────────────────────────────────────────────────┘
```

### 2.3 Estructura de directorios del proyecto

```
arqueos-platform/
├── docker-compose.yml
├── .env.example
├── README.md
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic/                    # Migraciones de BD
│   │   └── versions/
│   ├── app/
│   │   ├── main.py                 # Entry point FastAPI
│   │   ├── config.py               # Settings con Pydantic
│   │   ├── dependencies.py         # Deps inyectables (DB session, current_user, etc.)
│   │   │
│   │   ├── auth/                   # Módulo de autenticación
│   │   │   ├── router.py
│   │   │   ├── service.py
│   │   │   ├── schemas.py
│   │   │   ├── utils.py            # JWT, hashing, OTP
│   │   │   └── tests/
│   │   │
│   │   ├── users/                  # Módulo de usuarios
│   │   │   ├── router.py
│   │   │   ├── service.py
│   │   │   ├── schemas.py
│   │   │   ├── models.py
│   │   │   └── tests/
│   │   │
│   │   ├── vaults/                 # Módulo de bóvedas
│   │   │   ├── router.py
│   │   │   ├── service.py
│   │   │   ├── schemas.py
│   │   │   ├── models.py
│   │   │   └── tests/
│   │   │
│   │   ├── arqueos/                # Módulo de arqueos (core)
│   │   │   ├── router.py
│   │   │   ├── service.py
│   │   │   ├── schemas.py
│   │   │   ├── models.py
│   │   │   ├── validators.py       # Reglas de negocio (cuadre denominaciones, etc.)
│   │   │   └── tests/
│   │   │
│   │   ├── modifications/          # Módulo de modificaciones
│   │   │   ├── router.py
│   │   │   ├── service.py
│   │   │   ├── schemas.py
│   │   │   ├── models.py
│   │   │   └── tests/
│   │   │
│   │   ├── catalogs/               # Módulo de catálogos administrables
│   │   │   ├── router.py
│   │   │   ├── service.py
│   │   │   ├── schemas.py
│   │   │   ├── models.py
│   │   │   └── tests/
│   │   │
│   │   ├── notifications/          # Módulo de notificaciones
│   │   │   ├── router.py
│   │   │   ├── service.py
│   │   │   ├── schemas.py
│   │   │   ├── models.py
│   │   │   └── tests/
│   │   │
│   │   ├── documents/              # Módulo de documentos (MinIO)
│   │   │   ├── router.py
│   │   │   ├── service.py
│   │   │   ├── schemas.py
│   │   │   ├── models.py
│   │   │   └── tests/
│   │   │
│   │   ├── reports/                # Módulo de reportes y descargas
│   │   │   ├── router.py
│   │   │   ├── service.py
│   │   │   ├── generators.py       # Generación XLSX
│   │   │   └── tests/
│   │   │
│   │   ├── dashboard/              # Módulo de dashboard
│   │   │   ├── router.py
│   │   │   ├── service.py
│   │   │   ├── schemas.py
│   │   │   └── tests/
│   │   │
│   │   ├── audit/                  # Módulo de auditoría/trazabilidad
│   │   │   ├── service.py
│   │   │   ├── models.py
│   │   │   ├── middleware.py
│   │   │   └── tests/
│   │   │
│   │   └── common/                 # Utilidades compartidas
│   │       ├── pagination.py
│   │       ├── filters.py
│   │       ├── sorting.py
│   │       ├── exceptions.py
│   │       ├── security.py         # Rate limiting, headers, CORS
│   │       └── id_generator.py     # Generador de IDs alfanuméricos 6 chars
│   │
│   └── scripts/
│       ├── seed_catalogs.py        # Datos iniciales de catálogos
│       └── create_admin.py         # Crear primer usuario admin
│
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── public/
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── routes/
│       │   ├── index.tsx            # Router principal
│       │   ├── external/            # Rutas login/vistas ETV
│       │   └── internal/            # Rutas login/vistas internas
│       │
│       ├── layouts/
│       │   ├── ExternalLayout.tsx   # Layout para ETVs
│       │   └── InternalLayout.tsx   # Layout para internos
│       │
│       ├── pages/
│       │   ├── auth/
│       │   │   ├── ExternalLogin.tsx
│       │   │   ├── InternalLogin.tsx
│       │   │   └── MfaVerification.tsx
│       │   │
│       │   ├── etv/                 # Páginas exclusivas ETV
│       │   │   ├── ArqueoForm.tsx           # Formulario de captura
│       │   │   ├── ArqueoList.tsx           # Lista de arqueos propios
│       │   │   ├── ModificationList.tsx     # Módulo de modificaciones
│       │   │   ├── ModificationForm.tsx
│       │   │   └── Notifications.tsx
│       │   │
│       │   ├── internal/            # Páginas internos
│       │   │   ├── Dashboard.tsx
│       │   │   ├── ArqueoExplorer.tsx       # Explorador de arqueos
│       │   │   ├── VaultDirectory.tsx       # Directorio de bóvedas
│       │   │   ├── PersonnelDirectory.tsx   # Directorio gerentes/tesoreros
│       │   │   ├── ErrorReport.tsx          # Reportar error a ETV
│       │   │   └── Reports.tsx
│       │   │
│       │   └── admin/               # Páginas solo admin
│       │       ├── UserManagement.tsx
│       │       ├── CatalogManager.tsx
│       │       └── AuditLog.tsx
│       │
│       ├── components/
│       │   ├── ui/                  # Componentes base (Button, Input, Modal, etc.)
│       │   ├── tables/              # DataTable genérico con filtros, sort, paginación
│       │   ├── notifications/       # Icono campana + panel de notificaciones
│       │   ├── forms/               # Componentes de formulario reutilizables
│       │   └── layout/              # Sidebar, Header, Breadcrumbs
│       │
│       ├── hooks/
│       │   ├── useAuth.ts
│       │   ├── useDraft.ts          # Gestión de borradores en localStorage
│       │   ├── useNotifications.ts
│       │   ├── useFilters.ts
│       │   └── usePagination.ts
│       │
│       ├── services/                # Llamadas API (axios/fetch)
│       │   ├── api.ts               # Instancia base con interceptors
│       │   ├── authService.ts
│       │   ├── arqueoService.ts
│       │   ├── vaultService.ts
│       │   ├── catalogService.ts
│       │   ├── notificationService.ts
│       │   ├── documentService.ts
│       │   └── reportService.ts
│       │
│       ├── store/                   # Estado global (Zustand o Context)
│       │   ├── authStore.ts
│       │   └── notificationStore.ts
│       │
│       ├── utils/
│       │   ├── validators.ts        # Validaciones frontend
│       │   ├── formatters.ts        # Formatos moneda, fecha, etc.
│       │   └── constants.ts
│       │
│       └── styles/
│           ├── globals.css
│           └── theme.ts             # Paleta: blanco, negro, verde militar, dorado
│
└── docs/
    ├── api.md
    ├── deployment.md
    └── data-model.md
```

### 2.4 Paleta de colores UI

| Uso | Color | Hex |
|-----|-------|-----|
| Fondo principal | Blanco | `#FFFFFF` |
| Texto principal | Negro | `#1A1A1A` |
| Acento primario | Verde militar | `#4A5D23` |
| Acento secundario | Dorado | `#B8860B` |
| Fondo secundario | Gris claro | `#F5F5F5` |
| Bordes | Gris medio | `#E0E0E0` |
| Error | Rojo | `#D32F2F` |
| Éxito | Verde | `#388E3C` |
| Warning | Ámbar | `#F57C00` |
| Info | Azul | `#1976D2` |

Diseño minimalista, limpio, sin elementos decorativos innecesarios. Tipografía sans-serif (Inter o similar).

---

## 3. Modelo de Datos

### 3.1 Diagrama entidad-relación (tablas principales)

> **Convención:** Todo código de backend, nombres de tablas, columnas y endpoints en **inglés**. Labels de UI en **español**. Encoding UTF-8 en toda la BD.

#### Tabla: `companies` (Empresas ETV)
| Columna | Tipo | Notas |
|---------|------|-------|
| id | SERIAL PK | |
| name | VARCHAR(150) NOT NULL | Ej: "PanAmericano", "GSI" |
| is_active | BOOLEAN DEFAULT true | Baja lógica |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

#### Tabla: `users`
| Columna | Tipo | Notas |
|---------|------|-------|
| id | SERIAL PK | |
| email | VARCHAR(255) UNIQUE NOT NULL | Login |
| password_hash | VARCHAR(255) NOT NULL | bcrypt |
| full_name | VARCHAR(200) NOT NULL | |
| role | ENUM('admin','operations','data_science','etv') | |
| user_type | ENUM('internal','external') | Determina portal de login |
| company_id | FK → companies | NULL para internos |
| is_active | BOOLEAN DEFAULT true | Baja lógica |
| must_change_password | BOOLEAN DEFAULT true | true al crear cuenta o restablecer contraseña. Fuerza pantalla de cambio de contraseña en el próximo login |
| failed_login_attempts | INT DEFAULT 0 | Preparado para lockout futuro |
| locked_until | TIMESTAMPTZ NULL | Preparado para lockout futuro |
| mfa_enabled | BOOLEAN DEFAULT false | true para ETVs |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

#### Tabla: `user_vault_assignments` (M:N usuarios-bóvedas)
| Columna | Tipo | Notas |
|---------|------|-------|
| id | SERIAL PK | |
| user_id | FK → users | |
| vault_id | FK → vaults | |
| assigned_at | TIMESTAMPTZ | |
| is_active | BOOLEAN DEFAULT true | |

**Constraint UNIQUE** en (user_id, vault_id).

#### Tabla: `vaults` (Bóvedas)
| Columna | Tipo | Notas |
|---------|------|-------|
| id | SERIAL PK | |
| vault_code | VARCHAR(20) UNIQUE NOT NULL | Ej: "9001" |
| vault_name | VARCHAR(150) NOT NULL | |
| company_id | FK → companies | |
| branch_id | FK → branches | |
| manager_id | FK → personnel | Gerente asignado |
| treasurer_id | FK → personnel | Tesorero asignado |
| initial_balance | DECIMAL(15,2) NOT NULL DEFAULT 0 | Saldo inicial de la bóveda al momento de activarla en el sistema. Lo establece el Admin. Se usa como `opening_balance` del primer arqueo de la bóveda. También se actualiza cuando se reactiva una bóveda previamente apagada |
| is_active | BOOLEAN DEFAULT true | Bóvedas apagadas no generan alertas de arqueo faltante ni aparecen en el formulario ETV. El Admin puede apagar y reactivar bóvedas |
| deactivated_at | TIMESTAMPTZ NULL | Fecha en que se apagó la bóveda (para auditoría) |
| reactivated_at | TIMESTAMPTZ NULL | Última fecha en que se reactivó |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

#### Tabla: `branches` (Sucursales)
| Columna | Tipo | Notas |
|---------|------|-------|
| id | SERIAL PK | |
| name | VARCHAR(200) NOT NULL | |
| is_active | BOOLEAN DEFAULT true | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

#### Tabla: `personnel` (Gerentes y Tesoreros)
| Columna | Tipo | Notas |
|---------|------|-------|
| id | SERIAL PK | |
| full_name | VARCHAR(200) NOT NULL | |
| position | VARCHAR(100) NOT NULL | Ej: "Gerente de Bóveda" |
| personnel_type | ENUM('manager','treasurer') | |
| is_active | BOOLEAN DEFAULT true | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

#### Tabla: `movement_types` (Catálogo tipo_movimiento)
| Columna | Tipo | Notas |
|---------|------|-------|
| id | SERIAL PK | |
| name | VARCHAR(100) UNIQUE NOT NULL | Ej: "remanente", "flotante", "ingreso", "traspaso" |
| description | TEXT | |
| is_active | BOOLEAN DEFAULT true | |
| created_at | TIMESTAMPTZ | |

#### Tabla: `modification_reasons` (Catálogo motivos de modificación)
| Columna | Tipo | Notas |
|---------|------|-------|
| id | SERIAL PK | |
| name | VARCHAR(150) NOT NULL | |
| is_active | BOOLEAN DEFAULT true | |
| created_at | TIMESTAMPTZ | |

#### Tabla: `holidays` (Catálogo de días inhábiles)
| Columna | Tipo | Notas |
|---------|------|-------|
| id | SERIAL PK | |
| holiday_date | DATE UNIQUE NOT NULL | Fecha del día inhábil |
| name | VARCHAR(200) NOT NULL | Descripción/motivo (ej. "Día de la Independencia") |
| is_active | BOOLEAN DEFAULT true | |
| created_at | TIMESTAMPTZ | |

#### Tabla: `arqueo_headers` (Cabecera de arqueo diario por bóveda)
| Columna | Tipo | Notas |
|---------|------|-------|
| id | SERIAL PK | |
| vault_id | FK → vaults | |
| arqueo_date | DATE NOT NULL | Fecha del arqueo |
| opening_balance | DECIMAL(15,2) NOT NULL DEFAULT 0 | Saldo de apertura (= closing_balance del día anterior). Se calcula automáticamente al crear el header |
| closing_balance | DECIMAL(15,2) NOT NULL DEFAULT 0 | Saldo de cierre = opening_balance + Σ(entries) - Σ(withdrawals). Se recalcula al publicar |
| status | ENUM('draft','published','locked') | draft=borrador en servidor (respaldo), published=visible, locked=cerrado |
| published_at | TIMESTAMPTZ NULL | Primera vez publicado |
| locked_at | TIMESTAMPTZ NULL | Cuando se bloqueó (cierre de mes) |
| created_by | FK → users | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Constraint UNIQUE** en (vault_id, arqueo_date).

#### Tabla: `arqueo_records` (Registros/filas individuales del arqueo)
| Columna | Tipo | Notas |
|---------|------|-------|
| id | SERIAL PK | |
| record_uid | CHAR(6) UNIQUE NOT NULL | ID alfanumérico A-Z, 0-9, generado automáticamente |
| arqueo_header_id | FK → arqueo_headers | |
| voucher | VARCHAR(100) NOT NULL | Comprobante (campo libre, obligatorio) |
| reference | VARCHAR(100) NOT NULL | Referencia (campo libre, obligatorio) |
| branch_id | FK → branches NOT NULL | Sucursal (catálogo) |
| entries | DECIMAL(15,2) DEFAULT 0 | Entradas. Se llena manualmente. Mutuamente excluyente con withdrawals. Debe ser = suma de denominaciones si es el campo activo |
| withdrawals | DECIMAL(15,2) DEFAULT 0 | Salidas. Se llena manualmente. Mutuamente excluyente con entries. Debe ser = suma de denominaciones si es el campo activo |
| bill_1000 | DECIMAL(15,2) DEFAULT 0 | Monto en billetes de $1000. Debe ser múltiplo de 1000 |
| bill_500 | DECIMAL(15,2) DEFAULT 0 | Monto en billetes de $500. Debe ser múltiplo de 500 |
| bill_200 | DECIMAL(15,2) DEFAULT 0 | Monto en billetes de $200. Debe ser múltiplo de 200 |
| bill_100 | DECIMAL(15,2) DEFAULT 0 | Monto en billetes de $100. Debe ser múltiplo de 100 |
| bill_50 | DECIMAL(15,2) DEFAULT 0 | Monto en billetes de $50. Debe ser múltiplo de 50 |
| bill_20 | DECIMAL(15,2) DEFAULT 0 | Monto en billetes de $20. Debe ser múltiplo de 20 |
| coin_100 | DECIMAL(15,2) DEFAULT 0 | Monto en monedas de $100. Debe ser múltiplo de 100 |
| coin_50 | DECIMAL(15,2) DEFAULT 0 | Monto en monedas de $50. Debe ser múltiplo de 50 |
| coin_20 | DECIMAL(15,2) DEFAULT 0 | Monto en monedas de $20. Debe ser múltiplo de 20 |
| coin_10 | DECIMAL(15,2) DEFAULT 0 | Monto en monedas de $10. Debe ser múltiplo de 10 |
| coin_5 | DECIMAL(15,2) DEFAULT 0 | Monto en monedas de $5. Debe ser múltiplo de 5 |
| coin_2 | DECIMAL(15,2) DEFAULT 0 | Monto en monedas de $2. Debe ser múltiplo de 2 |
| coin_1 | DECIMAL(15,2) DEFAULT 0 | Monto en monedas de $1. Debe ser múltiplo de 1 |
| coin_050 | DECIMAL(15,2) DEFAULT 0 | Monto en monedas de $0.50. Debe ser múltiplo de 0.50 |
| coin_020 | DECIMAL(15,2) DEFAULT 0 | Monto en monedas de $0.20. Debe ser múltiplo de 0.20 |
| coin_010 | DECIMAL(15,2) DEFAULT 0 | Monto en monedas de $0.10. Debe ser múltiplo de 0.10 |
| movement_type_id | FK → movement_types | Referencia al tipo de movimiento original |
| is_counterpart | BOOLEAN DEFAULT false | true si es un registro de contrapartida generado por una modificación/cancelación |
| counterpart_type | ENUM('cancellation','modification') NULL | Solo aplica si is_counterpart = true. En la UI se muestra como prefijo: "CANCELACIÓN TRASPASO", "MODIFICACIÓN TRASPASO" (se compone de counterpart_type + movement_type.name) |
| original_record_uid | CHAR(6) NULL | Referencia al record_uid del registro original al que afecta esta contrapartida |
| record_date | DATE NOT NULL | Fecha del registro (fecha a la que aplica el movimiento) |
| upload_date | TIMESTAMPTZ NOT NULL DEFAULT NOW() | Fecha de carga real |
| is_active | BOOLEAN DEFAULT true | Baja lógica |
| created_by | FK → users | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Campo `amount` (Importe / Saldo acumulado de la bóveda):**
El "importe" NO es un campo por registro. Es el **saldo acumulado de la bóveda** y se calcula y muestra en la UI en tiempo real:
- `saldo_bóveda = saldo_cierre_día_anterior + Σ(entries) - Σ(withdrawals)` del día actual.
- Se almacena como campo calculado en `arqueo_headers.closing_balance` al momento de publicar.
- En la UI se muestra como running total que se actualiza conforme se agregan filas.
- **No lo llena la ETV**, es automático.

**Reglas de validación críticas (backend y frontend):**

1. **Doble validación de cuadre:** La ETV llena manualmente tanto `entries`/`withdrawals` como las denominaciones. La suma de todas las denominaciones (`bill_1000 + bill_500 + ... + coin_010`) **debe ser exactamente igual** al valor de `entries` (si es entrada) o `withdrawals` (si es salida). Esto funciona como doble comprobación: la ETV declara el monto y lo desglosa, ambos deben coincidir. Validar por fila.

2. **Múltiplo por denominación:** Cada columna de denominación debe contener un valor que sea múltiplo exacto de su valor facial:
   - `bill_1000 % 1000 == 0`, `bill_500 % 500 == 0`, `bill_200 % 200 == 0`, etc.
   - `coin_050 % 0.50 == 0`, `coin_020 % 0.20 == 0`, `coin_010 % 0.10 == 0`.
   - Validar en frontend en tiempo real (resaltar en rojo si no es múltiplo) y en backend antes de persistir.
   - Ejemplo: `bill_500 = 3500` ✅ | `bill_500 = 3420100` ❌ | `coin_5 = 25` ✅ | `coin_5 = 27` ❌

3. **Exclusividad entries/withdrawals:** Un registro es entrada O salida, nunca ambos simultáneamente. Si `entries > 0` → `withdrawals = 0` y viceversa. `entries` suma al saldo, `withdrawals` resta. CHECK constraint en BD:
   ```sql
   CHECK (
     (entries > 0 AND withdrawals = 0) OR
     (entries = 0 AND withdrawals > 0) OR
     (entries = 0 AND withdrawals = 0)
   )
   ```

4. **Máximo 15 dígitos:** Todas las columnas DECIMAL(15,2) aceptan hasta 15 dígitos en la parte entera.

5. **Campos obligatorios:** `voucher`, `reference`, `branch_id`, `movement_type_id`, y (`entries` o `withdrawals` > 0).

6. **Unicidad:** `record_uid` único global. Generado automáticamente (alfanumérico, 6 chars, A-Z 0-9).

7. **Integridad referencial:** `vault_id`, `movement_type_id`, `branch_id` deben existir y estar activos.

8. **Permisos de bóveda:** ETV solo puede operar sobre bóvedas asignadas.

9. **Periodo de gracia:** Validar que la fecha del arqueo está dentro del periodo editable antes de permitir modificación.

10. **Certificados PDF:** Múltiples certificados permitidos por arqueo_header (día + bóveda). Solo PDF, máx 10 MB por archivo.

11. **Detección de filas vacías vs parcialmente llenas:** Una fila se considera **vacía** (se ignora) solo si TODOS sus campos están en su valor por defecto (textos vacíos, numéricos en 0, sin selección de catálogo). Si cualquier campo tiene un valor no-default, la fila se considera **parcialmente llena** y es un error que debe corregirse antes de publicar. Las denominaciones sin valor se tratan como 0.

12. **Saldo acumulado:** El saldo de la bóveda arrastra siempre del día anterior, incluso entre meses. Se calcula como `closing_balance del día anterior + Σ(entries) - Σ(withdrawals)` del día actual. Si no existe día anterior (primera vez), inicia en 0.

#### Tabla: `arqueo_modifications` (Log de modificaciones)
| Columna | Tipo | Notas |
|---------|------|-------|
| id | SERIAL PK | |
| arqueo_record_id | FK → arqueo_records | |
| modification_type | ENUM('add','edit','delete') | Tipo de modificación |
| reason_id | FK → modification_reasons | Motivo (obligatorio) |
| reason_detail | TEXT | Detalle libre adicional |
| previous_data | JSONB | Snapshot del registro antes del cambio |
| new_data | JSONB | Snapshot del registro después del cambio |
| modified_by | FK → users | |
| modified_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |

#### Tabla: `certificates` (Certificados PDF en MinIO)
| Columna | Tipo | Notas |
|---------|------|-------|
| id | SERIAL PK | |
| arqueo_header_id | FK → arqueo_headers | Asociado al arqueo del día de una bóveda. Puede haber múltiples certificados por arqueo |
| file_name | VARCHAR(255) NOT NULL | Nombre original del archivo |
| minio_bucket | VARCHAR(100) NOT NULL | |
| minio_key | VARCHAR(500) NOT NULL | Ruta en MinIO |
| file_size_bytes | BIGINT | |
| uploaded_by | FK → users | |
| uploaded_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |
| is_active | BOOLEAN DEFAULT true | |

**Estructura MinIO:**
```
certificates/
  └── {company_name}/
      └── {vault_code}/
          └── {YYYY}/
              └── {MM}/
                  └── {vault_code}_{YYYY-MM-DD}_{timestamp}.pdf
```

#### Tabla: `notifications`
| Columna | Tipo | Notas |
|---------|------|-------|
| id | SERIAL PK | |
| recipient_id | FK → users | |
| sender_id | FK → users NULL | NULL = sistema |
| notification_type | ENUM('arqueo_published','error_reported','error_response','correction_made','missing_arqueo','weekend_upload','negative_balance','excess_certificates','vault_reactivated','password_reset','general') | |
| title | VARCHAR(200) NOT NULL | |
| message | TEXT NOT NULL | |
| related_entity_type | VARCHAR(50) NULL | Ej: 'arqueo_record', 'arqueo_header' |
| related_entity_id | INT NULL | ID de la entidad relacionada |
| is_read | BOOLEAN DEFAULT false | |
| created_at | TIMESTAMPTZ | |

#### Tabla: `error_reports` (Reportes de error Operaciones → ETV)
| Columna | Tipo | Notas |
|---------|------|-------|
| id | SERIAL PK | |
| reported_by | FK → users | Usuario interno que reporta |
| assigned_to | FK → users | Usuario ETV al que se le asigna |
| status | ENUM('open','acknowledged','resolved','closed') | |
| description | TEXT NOT NULL | Descripción del error |
| response | TEXT NULL | Respuesta de la ETV |
| responded_at | TIMESTAMPTZ NULL | |
| created_at | TIMESTAMPTZ | |
| resolved_at | TIMESTAMPTZ NULL | |

#### Tabla: `error_report_records` (Registros asociados al reporte de error)
| Columna | Tipo | Notas |
|---------|------|-------|
| id | SERIAL PK | |
| error_report_id | FK → error_reports | |
| arqueo_record_id | FK → arqueo_records | |

#### Tabla: `audit_log` (Trazabilidad global)
| Columna | Tipo | Notas |
|---------|------|-------|
| id | BIGSERIAL PK | |
| user_id | FK → users | |
| action | VARCHAR(50) NOT NULL | Ej: 'create', 'update', 'delete', 'login', 'publish', 'download' |
| entity_type | VARCHAR(50) NOT NULL | Ej: 'arqueo_record', 'vault', 'user' |
| entity_id | INT | |
| old_values | JSONB NULL | Valores antes del cambio |
| new_values | JSONB NULL | Valores después del cambio |
| ip_address | VARCHAR(45) | |
| user_agent | VARCHAR(500) | |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |

**Índice** en (entity_type, entity_id) y en (user_id, created_at).

---

## 4. Seguridad

### 4.1 Autenticación

- **Dos portales de login separados:**
  - `/external/login` → ETVs (con MFA por email OTP).
  - `/internal/login` → Admin, Operaciones, Ciencia de Datos (sin MFA).
- **JWT Access Token:** Expiración 15 minutos.
- **JWT Refresh Token:** Expiración 24 horas, almacenado en HttpOnly cookie.
- **Sesión:** Cierre tras 1 hora de inactividad. Si la ETV está en un formulario, el draft se guarda en localStorage antes de cerrar sesión.
- **Bloqueo de cuenta:** Infraestructura lista (campos `failed_login_attempts`, `locked_until`). Desactivado inicialmente, activable por configuración.
- **OTP por email (ETVs):**
  - Código válido por **5 minutos** desde su generación. Después de ese tiempo, se invalida y debe solicitarse uno nuevo.
  - Botón "Reenviar código" disponible en la pantalla de verificación, con **cooldown de 60 segundos** entre reenvíos.
  - Máximo **3 reenvíos por sesión de login**. Si se agotan, se muestra mensaje: "Demasiados intentos. Inténtelo de nuevo más tarde." y se bloquea el flujo por 15 minutos.
  - Código de 6 dígitos numéricos, generado con `secrets` (criptográficamente seguro).
- **Zona horaria:** Todo el sistema opera en hora de Ciudad de México (America/Mexico_City, UTC-6). Cierre de día a las 23:59:59 CDMX. Almacenar todo en UTC en BD y convertir a CDMX en la capa de presentación.
- **Restablecimiento de contraseña:**
  1. El Admin va al módulo de usuarios, selecciona al usuario y da clic en "Restablecer contraseña".
  2. El sistema genera una contraseña aleatoria de un solo uso y la muestra al Admin (una sola vez, no se almacena en texto plano).
  3. El Admin comunica esa contraseña al usuario por canal externo.
  4. Al hacer login con la contraseña temporal, el sistema fuerza pantalla de cambio de contraseña (`must_change_password = true`).
  5. La nueva contraseña debe cumplir requisitos de seguridad (mínimo 12 caracteres, mayúscula, minúscula, número, carácter especial), se debe escribir 2 veces y los campos no permiten pegar (paste deshabilitado).
  6. El restablecimiento y el cambio de contraseña quedan registrados en `audit_log`.
  7. Aplica para todos los roles: ETV, Operaciones, Ciencia de Datos.
- **Auditoría de usuarios:** Toda operación sobre usuarios (crear, desactivar, restablecer contraseña, cambiar contraseña, reasignar bóvedas) queda registrada en `audit_log`.

### 4.2 Autorización

| Acción | Admin | Operaciones | Ciencia de Datos | ETV |
|--------|-------|-------------|-------------------|-----|
| Ver dashboard | ✅ | ✅ | ✅ | ❌ |
| Ver todos los arqueos | ✅ | ✅ | ✅ | ❌ |
| Crear/editar arqueos | ❌ | ❌ | ❌ | ✅ (solo sus bóvedas) |
| Publicar arqueos | ❌ | ❌ | ❌ | ✅ (solo sus bóvedas) |
| Modificar arqueos pasados | ❌ | ❌ | ❌ | ✅ (dentro del periodo de gracia) |
| Reportar error en arqueo | ❌ | ✅ | ❌ | ❌ |
| Responder reporte de error | ❌ | ❌ | ❌ | ✅ |
| Descargar XLSX/PDF | ✅ | ✅ | ✅ | ✅ (solo sus datos) |
| Gestionar catálogos | ✅ | ❌ | ❌ | ❌ |
| Gestionar usuarios | ✅ | ❌ | ❌ | ❌ |
| Restablecer contraseñas | ✅ | ❌ | ❌ | ❌ |
| Activar/desactivar bóvedas | ✅ | ❌ | ❌ | ❌ |
| Establecer saldo inicial bóveda | ✅ | ❌ | ❌ | ❌ |
| Ver audit log | ✅ | ❌ | ❌ | ❌ |
| Subir certificados PDF | ❌ | ❌ | ❌ | ✅ |

### 4.3 Medidas de seguridad

- **SQL Injection:** Uso exclusivo de ORM (SQLAlchemy) con parámetros bound. Cero queries raw sin parametrizar.
- **XSS:** Sanitización de inputs en backend. React escapa por defecto. No usar `dangerouslySetInnerHTML`.
- **CSRF:** Tokens CSRF en formularios o validación de origin header.
- **CORS:** Whitelist estricta de orígenes permitidos.
- **Headers de seguridad:** Helmet-equivalent headers (X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security, etc.).
- **Rate Limiting:** En endpoints de login y OTP para prevenir brute force.
- **Validación de archivos:** Solo aceptar PDF para certificados. Validar MIME type y extensión. Límite de tamaño: 10 MB por archivo, máximo 10 archivos por arqueo. Si se intenta subir más de 10, se genera notificación `excess_certificates` al Admin.
- **No info sensible en URLs:** Ningún dato de negocio en query parameters. Todo en body o path params con IDs.
- **Passwords:** bcrypt con salt, mínimo 12 caracteres, mayúsculas, minúsculas, números, caracteres especiales. Campos de nueva contraseña con paste deshabilitado.
- **Encoding:** UTF-8 en toda la BD, API y frontend para correcto soporte de español (acentos, ñ, etc.).

---

## 5. Roles y Usuarios

### 5.1 Tipos de usuario

| Rol | Tipo | Portal | MFA | Descripción |
|-----|------|--------|-----|-------------|
| admin | internal | `/internal` | No | Control total del sistema |
| operations | internal | `/internal` | No | Monitoreo, reportes de error, descargas |
| data_science | internal | `/internal` | No | Consulta, filtrado, descarga de datos |
| etv | external | `/external` | Sí (email OTP) | Captura y modificación de arqueos |

### 5.2 Gestión de usuarios ETV

- Solo el Admin crea cuentas ETV (creación queda auditada).
- Al crear una cuenta se genera una contraseña aleatoria de un solo uso (`must_change_password = true`).
- Al crear una cuenta ETV se asignan las bóvedas que le corresponden.
- Un usuario ETV puede tener múltiples bóvedas asignadas.
- Al entrar, el ETV ve solo sus bóvedas asignadas (activas) y selecciona cuál operar.
- **Reasignación de bóveda mid-month:** Si una bóveda se reasigna del usuario A al usuario B, el usuario B hereda la visibilidad completa de los arqueos de esa bóveda (incluidos los que subió A) y puede modificarlos dentro del periodo de gracia como si fueran suyos.

### 5.3 Gestión de bóvedas (Admin)

- El Admin activa/desactiva bóvedas desde el directorio de bóvedas.
- **Bóveda activa (`is_active = true`):** Aparece en el formulario ETV, genera alertas si no se sube arqueo.
- **Bóveda inactiva (`is_active = false`):** No aparece en el formulario ETV, no genera alertas de arqueo faltante, no se lista en el dashboard como "faltante". Se registra `deactivated_at`.
- **Reactivación:** El Admin puede reactivar una bóveda previamente apagada. Al hacerlo, debe establecer el `initial_balance` (saldo de arranque). Se registra `reactivated_at`.
- **Saldo inicial:** Al dar de alta el sistema por primera vez, el Admin establece el `initial_balance` de cada bóveda con el saldo real acumulado. Este valor se usa como `opening_balance` del primer arqueo. Puede ajustarse si es necesario.

---

## 6. Flujos de Negocio Detallados

### 6.1 Flujo de captura diaria de arqueo (ETV)

```
1. ETV inicia sesión en /external/login
   → Si `must_change_password = true`, se fuerza pantalla de cambio de contraseña antes de continuar.
2. Ingresa credenciales → recibe OTP por email → lo ingresa
3. Ve lista de sus bóvedas asignadas (solo bóvedas activas).
   Si una bóveda fue reasignada a otro usuario, al recargar la página ya no aparece en la lista.
4. Selecciona bóveda → se abre formulario de captura para fecha de hoy.
   **Banner fijo arriba:** "Saldo apertura del día: $X" (opening_balance del día actual).
   Vista continua con **lazy loading**: se cargan los últimos 3 días. Al hacer scroll hacia arriba
   se cargan más días progresivamente. Los días anteriores al día actual se muestran con estilo
   opaco/bloqueado (solo lectura). Cada fila muestra la empresa ETV y el código de bóveda.
   El formulario está diseñado para desktop/laptop. Si las ~20 columnas de denominaciones no caben
   en pantalla, se usa scroll horizontal. El usuario puede ajustar el zoom del navegador.
5. Al inicio del día aparecen 30 filas vacías para el día actual. Si necesitan más, pueden agregar
   de 5 en 5 con un botón en la parte inferior. Filas 100% vacías se ignoran al publicar.
   Si una fila tiene algún campo con valor no-default pero no está completa, se marca visualmente
   como error y no permite publicar.
   Si la ETV regresa después de haber publicado, ve:
   - Arriba: los registros ya publicados del día (editables con advertencia: "Estos registros ya
     fueron publicados previamente hoy. ¿Está seguro de modificarlos?"). Si los modifica, se marcan
     como cambios no publicados.
   - Abajo: 30 filas vacías nuevas para seguir agregando.
   a. Llena campos: comprobante, referencia, sucursal (catálogo), entrada O salida (mutuamente excluyente),
      denominaciones (billetes y monedas), tipo_movimiento.
      El **importe (saldo acumulado de la bóveda)** NO se llena, se calcula automáticamente:
      `saldo = closing_balance del día anterior + Σ(entries) - Σ(withdrawals)` del día actual.
      Se muestra en la UI como running total que se actualiza en tiempo real conforme se agregan filas.
      **Si el saldo acumulado se vuelve negativo, se muestra alerta visual** y al publicar se genera
      notificación `negative_balance` a Operaciones y Admin.
   b. Validación en tiempo real: la suma de denominaciones debe ser exactamente igual al valor de
      entries (o withdrawals). Doble comprobación: la ETV declara el monto y lo desglosa.
   c. Campos obligatorios: comprobante, referencia, sucursal, (entrada o salida > 0) y denominaciones
      que cuadren. Denominaciones sin valor se tratan como 0.
   d. El draft se guarda automáticamente en localStorage del navegador (solo filas con datos, no las vacías)
6. En cualquier momento puede dar clic en "Publicar" (todos los registros deben cumplir con las reglas)
   → **Verificación de asignación:** Antes de persistir, el backend verifica que el usuario sigue
     asignado a la bóveda. Si fue reasignado, se rechaza con mensaje: "Ya no tienes asignada esta
     bóveda. Contacta al administrador." El draft permanece en localStorage.
   → **Ediciones del mismo día = UPDATE directo** (sin contrapartida). El cambio queda en `audit_log`
     con snapshot antes/después, pero NO genera registros de contrapartida. Las contrapartidas solo
     se generan en el módulo de modificaciones (días anteriores).
   → Se recalcula `closing_balance` del día.
   → **Recálculo en cascada:** Si ya existen días posteriores con arqueos publicados (ej. se republica
     un día pasado que aún está en el mismo día calendario), se recalculan `opening_balance` y
     `closing_balance` de todos los días posteriores de esa bóveda.
   → Se genera notificación a Operaciones.
7. Puede seguir agregando filas después de publicar
   → Se muestra indicador "Tienes cambios no publicados"
   → Puede volver a publicar (incluye filas nuevas Y ediciones a filas previamente publicadas del día)
8. Al día siguiente, cualquier cambio a ese arqueo se considera MODIFICACIÓN
   (se gestiona por módulo de modificaciones)
9. Si se detecta inactividad ≥ 1 hora:
   → Se guarda draft en localStorage automáticamente
   → Se cierra la sesión
```

### 6.2 Flujo de modificaciones (ETV)

```
1. ETV accede al módulo de modificaciones
2. Ve lista de sus arqueos publicados (filtrable por bóveda, mes).
   **Verificación de asignación:** Solo se muestran bóvedas actualmente asignadas al usuario.
3. Selecciona el arqueo de la bóveda del mes a cambiar
4. Verifica que está dentro del periodo de gracia:
   → Modificaciones al mes M se permiten hasta el último día hábil del mes M+1
     (calculado usando catálogo de `holidays`)
   → Si está fuera del periodo → arqueo bloqueado, no editable
5. Se abre el módulo de modificaciones como un **grupo de trabajo (batch)**.
   Se aplican las **mismas validaciones** que en captura diaria (doble cuadre, múltiplo por
   denominación, exclusividad entries/withdrawals, campos obligatorios).
   La ETV puede realizar múltiples cambios antes de guardar:

   - **Agregar registro:** Se crea un nuevo registro con la fecha de aplicación
     (el día al que pertenece) y la fecha real de creación.

   - **Editar registro:** Se generan 2 registros:
     (a) Registro de reversa con `counterpart_type = 'modification'`, `is_counterpart = true`,
         `original_record_uid` = UID del original. Invierte el monto original (si era entrada,
         ahora es salida por el mismo importe y denominaciones).
     (b) Registro nuevo corregido con los datos correctos (`is_counterpart = false`).
         Este registro es el que queda como "el bueno".

   - **Cancelar registro (baja lógica):** Se desactiva el original y se crea 1 registro
     de contrapartida con `counterpart_type = 'cancellation'` que revierte el efecto sobre el saldo.

   **Regla de editabilidad de contrapartidas:**
   - Los registros de contrapartida (`is_counterpart = true`) **NO son editables ni cancelables**.
     Son registros de auditoría inmutables.
   - Si la ETV necesita corregir de nuevo, edita el registro "nuevo corregido" (el que quedó como
     bueno, `is_counterpart = false`). Esto genera otra reversa + otro registro corregido.
   - Ejemplo: Original A → se edita → genera Reversa-A (intocable) + Corregido-B (el bueno).
     Si B también está mal → se edita B → genera Reversa-B (intocable) + Corregido-C (el nuevo bueno).

   Para cada cambio: selecciona motivo de modificación (catálogo obligatorio) + detalle libre.
   Campos: fecha de cuando se hizo el cambio (`modified_at`) y fecha de aplicación (`record_date`).

6. Si la ETV intenta salir sin guardar, se muestra alerta: "Tienes modificaciones sin guardar.
   ¿Seguro que deseas salir?"
7. Al dar clic en "Guardar modificaciones":
   → **Verificación de asignación:** El backend verifica que el usuario sigue asignado a la bóveda.
     Si fue reasignado, se rechaza con mensaje claro.
   → Se envía todo el batch al backend en una sola transacción.
   → Se bloquea el envío de un nuevo batch si un recálculo de cascada anterior aún está en proceso
     (para evitar conflictos en saldos).
   → Se guardan los snapshots en `arqueo_modifications`.
   → Se registra en `audit_log`.
   → Se recalcula `closing_balance` del día afectado y se propaga en cascada a todos los días
     posteriores de esa bóveda (una sola vez por batch, no por cada modificación individual).
   → Se genera notificación a Operaciones indicando las modificaciones realizadas.
```

### 6.3 Flujo de reporte de error (Operaciones → ETV)

```
1. Usuario interno navega al explorador de arqueos
2. Detecta error en uno o más registros
3. Hace clic en "Reportar Error" (se habilitan casillas)
4. Selecciona el o los registros específicos con error (casillas)
5. Escribe descripción del error
6. Se envía → genera notificación in-app al usuario ETV correspondiente
7. ETV ve la notificación → puede responder dentro del sistema O ir directamente
   al módulo de modificaciones a corregir
8. Si corrige, el estado del error report cambia a "resolved"
9. Operaciones recibe notificación de la corrección/respuesta
```

### 6.4 Reglas de cierre temporal y edición

| Concepto | Regla |
|----------|-------|
| Edición mismo día | UPDATE directo al registro (sin contrapartida). Queda en `audit_log` con snapshot antes/después. Requiere republicar |
| Cierre de día | Automático al terminar el día calendario (23:59:59 CDMX). Cualquier cambio posterior = modificación con contrapartida |
| Periodo de modificación | Mes M editable hasta último día hábil de mes M+1 (calculado con catálogo `holidays`). Ej: enero editable hasta último hábil de febrero |
| Bloqueo definitivo | Después del periodo de gracia, el arqueo pasa a status `locked`. No más cambios |
| Registro en fin de semana/inhábil | Permitido, pero genera notificación de alerta a Operaciones |
| Recálculo de saldos | Toda publicación o modificación que afecte un día recalcula `closing_balance` de ese día y propaga en cascada a todos los días posteriores de esa bóveda |
| Detección de arqueo faltante | Job diario a las **22:00 CDMX**: detecta bóvedas **activas** sin arqueo del día y genera notificación `missing_arqueo` |

### 6.5 Validaciones de negocio (backend obligatorias, frontend también)

> Referencia completa de validaciones en §3.1 (tabla `arqueo_records`). Resumen ejecutivo:

1. **Doble validación de cuadre:** La ETV llena manualmente `entries`/`withdrawals` Y las denominaciones. La suma de denominaciones debe ser exactamente igual al valor de `entries` (si entrada) o `withdrawals` (si salida). Doble comprobación por fila.

2. **Múltiplo por denominación:** Cada columna debe ser múltiplo exacto de su valor facial. Frontend resalta en rojo en tiempo real, backend rechaza antes de persistir.

3. **Exclusividad entries/withdrawals:** Un registro es entrada O salida, nunca ambos. CHECK constraint en BD.

4. **Campos obligatorios:** `voucher`, `reference`, `branch_id`, `movement_type_id`, y (`entries` o `withdrawals` > 0).

5. **Unicidad:** `record_uid` único global. Generado automáticamente (alfanumérico, 6 chars, A-Z 0-9).

6. **Integridad referencial:** `vault_id`, `movement_type_id`, `branch_id` deben existir y estar activos.

7. **Permisos de bóveda:** ETV solo puede operar sobre bóvedas asignadas.

8. **Periodo de gracia:** Validar que la fecha del arqueo está dentro del periodo editable antes de permitir modificación. Periodo calculado usando catálogo de `holidays` para determinar último día hábil.

9. **Certificados PDF:** Múltiples certificados permitidos por arqueo_header (día + bóveda). Solo PDF, máx 10 MB por archivo, máximo 10 archivos por arqueo. Si se intentan subir más de 10, se genera notificación `excess_certificates` al Admin.

10. **Filas vacías vs parcialmente llenas:** Fila 100% en valores default = se ignora. Cualquier campo con valor no-default = parcialmente llena = error visual, no permite publicar.

11. **Saldo acumulado:** Se calcula automáticamente. Arrastra del día anterior, incluso entre meses. Primera vez usa `vaults.initial_balance` (establecido por Admin). Si se reactiva una bóveda, el Admin establece el nuevo `initial_balance`.

12. **Saldo negativo:** Se permite, pero genera notificación `negative_balance` a Operaciones y Admin. Se muestra alerta visual en el formulario y en el dashboard.

13. **Bóvedas activas/inactivas:** Solo bóvedas con `is_active = true` aparecen en el formulario ETV y generan alertas de `missing_arqueo`. El Admin puede desactivar una bóveda (deja de generar alertas) y reactivarla (requiere establecer nuevo `initial_balance`).

14. **Datos de ETV y bóveda en registros:** Cada fila de arqueo muestra en la UI (vía JOINs) la empresa ETV (`companies.name`) y el código de bóveda (`vaults.vault_code`). No se desnormalizan en `arqueo_records`, se resuelven en las queries de listado y descarga XLSX.

15. **Reasignación de bóveda mid-month:** Si una bóveda se reasigna de usuario A a usuario B, el usuario B ve todos los registros históricos de esa bóveda como propios y puede modificarlos (dentro del periodo de gracia). El usuario A, al recargar la página, ya no ve la bóveda.

16. **Edición mismo día vs modificación día anterior:** Ediciones a registros publicados del mismo día = UPDATE directo (sin contrapartida, queda en `audit_log`). Cambios a días anteriores = módulo de modificaciones con contrapartidas.

17. **Contrapartidas inmutables:** Los registros con `is_counterpart = true` **no son editables ni cancelables**. Son registros de auditoría. Si se necesita corregir de nuevo, se edita el registro "nuevo corregido" (`is_counterpart = false`), lo que genera otra reversa + otro registro corregido.

18. **Verificación de asignación al publicar/guardar:** Antes de persistir (tanto en captura diaria como en modificaciones), el backend verifica que el usuario sigue asignado a la bóveda. Si fue reasignado, se rechaza con mensaje claro. El draft permanece en localStorage.

---

## 7. Dashboard (Usuarios Internos)

### 7.1 Actualización
Polling cada 30 minutos (endpoint GET que retorna el estado actual).

### 7.2 Métricas propuestas

| Métrica | Descripción |
|---------|-------------|
| Bóvedas con arqueo hoy | Total de bóvedas activas que ya publicaron vs. total esperado |
| Bóvedas faltantes hoy | Lista de bóvedas activas que NO han publicado arqueo hoy |
| Monto total del día | Sumatoria de importes por entradas y salidas |
| Monto por empresa ETV | Desglose por PanAmericano / GSI |
| Arqueos modificados hoy | Cuántas modificaciones se hicieron en el día |
| Errores reportados abiertos | Reportes de error sin resolver |
| Tendencia semanal de montos | Gráfica de entradas/salidas de los últimos 7 días |
| Concentración por denominación | Distribución del efectivo por tipo de billete/moneda |
| Alertas de fin de semana | Registros subidos en días inhábiles |
| Bóvedas con saldo negativo | Lista de bóvedas cuyo `closing_balance` es < 0 (alerta) |
| Estado de bóvedas | Conteo de bóvedas activas vs inactivas |

### 7.3 Filtros del dashboard
- Por empresa ETV
- Por bóveda
- Por rango de fechas
- Por tipo de movimiento

### 7.4 Estructura
Diseñar el dashboard con componentes independientes (widgets/cards) para facilitar personalización futura por rol.

---

## 8. Notificaciones In-App

### 8.1 Icono de campana
- Ubicado en el header, visible para todos los roles.
- Badge con contador de notificaciones no leídas.
- Al hacer clic, se abre panel lateral con lista de notificaciones.
- Cada notificación es clickeable y navega a la entidad relacionada.
- Opción "Marcar todas como leídas".

### 8.2 Tipos de notificación

| Tipo | Destinatario | Disparo |
|------|-------------|---------|
| `arqueo_published` | Operaciones, Admin | Cuando una ETV publica un arqueo |
| `error_reported` | ETV correspondiente | Cuando Operaciones reporta un error |
| `error_response` | Operaciones (quien reportó) | Cuando ETV responde al reporte |
| `correction_made` | Operaciones, Admin | Cuando ETV hace una modificación a un arqueo (batch) |
| `missing_arqueo` | Operaciones, Admin | Job diario a las **22:00 CDMX**: bóvedas **activas** que no subieron arqueo hoy |
| `weekend_upload` | Operaciones, Admin | Cuando se detecta carga en fin de semana o inhábil |
| `negative_balance` | Operaciones, Admin | Cuando el saldo acumulado de una bóveda se vuelve negativo al publicar |
| `excess_certificates` | Admin | Cuando una ETV intenta subir más de 10 certificados PDF a un mismo arqueo |
| `vault_reactivated` | Operaciones, Admin | Cuando el Admin reactiva una bóveda previamente inactiva |
| `password_reset` | Usuario afectado | Cuando el Admin restablece la contraseña de un usuario (informativo) |

---

## 9. Descargas y Reportes

### 9.1 Descarga de tablas (XLSX)
- Disponible en todas las vistas de tabla para todos los roles.
- **Respeta los filtros activos** — descarga solo lo que el usuario está viendo.
- Formato XLSX con headers, formato de moneda, y fecha.

### 9.2 Descarga de certificados (PDF)
- Disponible desde el detalle del arqueo.
- Se descarga el PDF original almacenado en MinIO.

### 9.3 Reporte de saldos finales
- Reporte de saldo final por bóveda por día.
- Cálculo: usa `closing_balance` de `arqueo_headers` (= `opening_balance` + Σ entries − Σ withdrawals del día).
- Descargable en XLSX.
- Filtrable por bóveda, rango de fechas, empresa.

---

## 10. Funcionalidades Transversales

### 10.1 Tablas con funcionalidad completa
Todas las vistas de tabla deben tener:
- **Buscador** (búsqueda por texto en columnas relevantes).
- **Filtros** por columna (dropdowns para catálogos, rangos para fechas y montos).
- **Ordenamiento** por cualquier columna (asc/desc).
- **Paginación** (configurable: 25, 50, 100 o total (solo si el dataset es ≤ 10,000 registros), registros por página).
- **Botón de descarga XLSX** (respeta filtros activos).

### 10.2 Trazabilidad (Audit Log)
- **Toda** acción significativa se registra en `audit_log`.
- Acciones rastreadas: login, logout, create, update, delete (lógica), publish, download, report_error, respond_error, password_reset, password_change, vault_activate, vault_deactivate.
- Se registra: quién, cuándo, qué entidad, valores anteriores y posteriores, IP y user agent.
- **Descargas XLSX:** Al registrar una descarga, se almacenan en `new_values` (JSONB) los **filtros activos** que el usuario tenía aplicados al momento de descargar. Esto permite saber exactamente qué subconjunto de datos exportó cada persona. Campos a registrar: filtros de empresa, bóveda, rango de fechas, tipo de movimiento, texto de búsqueda, paginación.
- Visible solo para Admin desde el panel de administración.
- Filtrable por usuario, acción, entidad, rango de fechas.

### 10.3 Control de concurrencia (Optimistic Locking)
Para evitar conflictos cuando un usuario ETV tiene 2 sesiones abiertas (2 pestañas, 2 laptops) editando la misma bóveda del mismo día:
- Cada `arqueo_header` tiene un campo `updated_at` que actúa como **versión**.
- Al cargar el formulario de captura, el frontend almacena el `updated_at` actual del header.
- Al publicar, el backend compara el `updated_at` enviado con el actual en BD:
  - **Si coinciden:** Se persisten los cambios y se actualiza `updated_at`.
  - **Si no coinciden** (otro proceso publicó entre tanto): Se rechaza la publicación y se responde con un mensaje: **"La información de esta bóveda fue actualizada por otro usuario o sesión. Por favor, recargue la página para ver los cambios más recientes."**
  - El frontend muestra un modal con este mensaje y un botón "Recargar". El draft en localStorage se conserva para que el usuario pueda comparar sus datos con los recién publicados.
- **Aplica a:** publicación diaria (§6.1) y guardado de batch de modificaciones (§6.2).
- **Implementación técnica:** En el endpoint de publicación, usar `WHERE id = :header_id AND updated_at = :expected_updated_at` como condición. Si `rows_affected = 0`, es conflicto.
- **Gaps por bóvedas inactivas:** La cascada de recálculo solo itera sobre `arqueo_headers` existentes
  en BD ordenados por fecha. Si una bóveda estuvo inactiva durante un periodo (sin headers en esos días),
  la cascada los salta naturalmente. Al reactivar la bóveda, el `initial_balance` establecido por el Admin
  se usa como `opening_balance` del primer arqueo post-reactivación. No se requiere lógica especial para gaps.
- **Primera publicación del día (sin header previo):** Cuando aún no existe `arqueo_header` para una
  bóveda + fecha, la primera publicación hace un INSERT. Si 2 sesiones intentan insertar simultáneamente,
  el constraint UNIQUE en `(vault_id, arqueo_date)` hace que una gane y la otra falle con error de
  duplicado → se le muestra al usuario el mismo mensaje de "recargue la página". Las publicaciones
  posteriores del mismo día ya usan el flujo normal de optimistic locking con `updated_at`.

### 10.4 Baja lógica global
- **Nada se elimina físicamente** en todo el sistema.
- Toda entidad tiene campo `is_active`.
- Las queries por defecto filtran `WHERE is_active = true`.
- El Admin puede "desactivar" registros.

### 10.5 Sistema de drafts (borradores)
- Se guarda en **localStorage** del navegador de la ETV.
- Autosave cada 30 segundos mientras se está llenando el formulario (solo filas con datos, no las vacías).
- Al reabrir la página, si hay draft pendiente para esa bóveda/fecha, se pregunta si desea recuperarlo.
- El draft se limpia después de publicar exitosamente.
- Si la sesión expira por inactividad, el draft permanece en localStorage.
- **Alerta de navegación:** Si la ETV intenta salir o regresar del formulario y tiene cambios sin guardar/publicar, se muestra una alerta de confirmación ("Tienes cambios sin publicar. ¿Seguro que deseas salir?").

---

## 11. Plan de Desarrollo por Etapas

### ETAPA 1: Infraestructura y Autenticación (Sprint 1-2)

**Objetivo:** Levantar entorno, BD, autenticación y estructura base.

**Backend:**
1. Configurar proyecto FastAPI con estructura modular definida en §2.3.
2. Configurar Docker Compose con servicios: FastAPI, PostgreSQL, MinIO, Nginx (React).
3. Configurar Alembic para migraciones.
4. Crear migraciones iniciales: `companies`, `users` (con `must_change_password`), `branches`, `personnel`, `vaults` (con `initial_balance`, `deactivated_at`, `reactivated_at`), `user_vault_assignments`, `audit_log`.
5. Implementar módulo `auth/`: login, refresh, logout, OTP por email (código de 6 dígitos, expiración 5 min, cooldown 60s entre reenvíos, máx 3 reenvíos por sesión, bloqueo 15 min si se agotan), middleware JWT, detección de `must_change_password`.
6. Implementar módulo `users/`: CRUD de usuarios (solo Admin), asignación de bóvedas, endpoint de restablecimiento de contraseña (genera contraseña aleatoria de un solo uso, marca `must_change_password = true`).
7. Implementar endpoint de cambio de contraseña obligatorio (valida requisitos, escribe 2 veces, audita).
8. Implementar middleware de auditoría (interceptar acciones y escribir a `audit_log`). Auditar: creación de usuarios, desactivación, restablecimiento de contraseña, cambio de contraseña, reasignación de bóvedas.
9. Implementar manejo global de excepciones y error responses estandarizados.
10. Configurar CORS, rate limiting, headers de seguridad.
11. Configurar zona horaria del sistema: `America/Mexico_City` para toda lógica temporal.
12. Script `create_admin.py` para primer usuario.

**Frontend:**
1. Inicializar proyecto React + Vite + TypeScript.
2. Configurar tema (paleta §2.4), layout base, componentes UI fundamentales.
3. Implementar 2 portales de login: `/external/login` y `/internal/login`.
4. Implementar flujo MFA (pantalla de ingreso OTP) para ETVs: campo de 6 dígitos, botón "Reenviar código" con cooldown de 60s y contador regresivo, mensaje de expiración (5 min), manejo de máx 3 reenvíos.
5. Implementar pantalla de **cambio de contraseña obligatorio** (se muestra si `must_change_password = true`): validación de requisitos, doble escritura, paste deshabilitado en campos de nueva contraseña.
6. Implementar `useAuth` hook con manejo de JWT, refresh, y detección de inactividad (1 hora).
7. Implementar layouts: `ExternalLayout` y `InternalLayout` con sidebar y header.
8. Implementar componente de notificaciones (campana + panel) — vacío de lógica, solo estructura.
9. Configurar rutas protegidas por rol.

**Tests:**
- Tests unitarios de auth: login, refresh, OTP (generación, validación, expiración a los 5 min, cooldown entre reenvíos, bloqueo tras 3 reenvíos).
- Tests de permisos: verificar que cada rol solo accede a lo permitido.
- Test de rate limiting en login.
- Test de flujo de restablecimiento: Admin resetea → login con temporal → fuerza cambio → accede al sistema.
- Test de auditoría: verificar que creación de usuario, restablecimiento y cambio de contraseña quedan en `audit_log`.

**Entregables:**
- Docker compose funcional con todos los servicios levantados.
- Login funcional en ambos portales con flujo de cambio de contraseña obligatorio.
- Usuario admin creado por script.
- Admin puede crear usuarios, restablecer contraseñas y asignar bóvedas.

---

### ETAPA 2: Módulos Core — Catálogos y Bóvedas (Sprint 3)

**Objetivo:** Catálogos administrables y directorios operativos.

**Backend:**
1. Implementar módulo `catalogs/`: CRUD genérico para `movement_types`, `modification_reasons`, `branches`, `holidays`.
2. Implementar módulo `vaults/`:
   - CRUD de bóvedas con relaciones a empresa, sucursal, gerente, tesorero.
   - Endpoint para **activar/desactivar bóveda** (Admin). Al desactivar: `is_active = false`, `deactivated_at = now()`. Al reactivar: `is_active = true`, `reactivated_at = now()`, requiere nuevo `initial_balance`. Genera notificación `vault_reactivated`.
   - Endpoint para **establecer/actualizar `initial_balance`** (Admin). Solo se usa para la primera vez que la bóveda entra al sistema o cuando se reactiva.
3. Endpoints de directorio: listar bóvedas con su info completa (incluir estado activo/inactivo), listar personal.
4. Filtros, ordenamiento y paginación en todos los endpoints de listado (usar módulo `common/`).
5. Script `seed_catalogs.py` con datos iniciales.

**Frontend:**
1. Página Admin: Gestión de catálogos (tabla + formulario CRUD por catálogo). Incluir catálogo de `holidays` (fecha + motivo).
2. Página Admin: Gestión de bóvedas con acciones: activar/desactivar, establecer saldo inicial. Indicador visual de bóvedas activas vs inactivas.
3. Página Interna: Directorio de bóvedas (tabla con buscador, filtros, sort). Mostrar estado activo/inactivo.
4. Página Interna: Directorio de personal (gerentes y tesoreros).
5. Componente `DataTable` genérico reutilizable con: buscador, filtros, sort, paginación (25, 50, 100, o total si ≤ 10,000), botón descarga XLSX.

**Tests:**
- CRUD completo de cada catálogo (incluyendo holidays).
- Activar/desactivar bóveda: verificar que bóvedas inactivas no aparecen en formulario ETV ni generan alertas.
- Establecer `initial_balance` y verificar que el primer arqueo lo usa como `opening_balance`.
- Reactivar bóveda: verificar que requiere nuevo `initial_balance` y genera notificación.
- Validar baja lógica (no eliminación física).
- Verificar que solo Admin puede gestionar catálogos y bóvedas.

**Entregables:**
- Catálogos funcionales y administrables (incluyendo días inhábiles).
- Gestión completa de bóvedas: activar, desactivar, saldo inicial.
- Directorios de bóvedas y personal operativos.
- DataTable genérico reutilizable para todas las vistas futuras.

---

### ETAPA 3: Módulo de Arqueos — Captura y Publicación (Sprint 4-5)

**Objetivo:** Flujo completo de captura diaria de arqueos por las ETVs.

**Backend:**
1. Crear migraciones: `arqueo_headers` (con `opening_balance`, `closing_balance`), `arqueo_records` (con `is_counterpart`, `counterpart_type`, `original_record_uid`).
2. Implementar módulo `arqueos/`:
   - `POST /arqueos/headers` — Crear cabecera de arqueo (bóveda + fecha). Calcular `opening_balance` automáticamente del `closing_balance` del día anterior.
   - `POST /arqueos/records` — Agregar registro individual.
   - `PUT /arqueos/records/{id}` — Editar registro (solo mismo día, solo ETV asignada).
   - `POST /arqueos/headers/{id}/publish` — Publicar arqueo. Recalcular `closing_balance`.
   - `GET /arqueos/headers` — Listar arqueos (filtrable por bóveda, fecha, status).
   - `GET /arqueos/records?header_id=X` — Listar registros de un arqueo.
   - `GET /arqueos/vault/{vault_id}/balance` — Obtener saldo actual de la bóveda.
3. Implementar `validators.py`:
   - Doble validación de cuadre: suma de denominaciones = `entries` (o `withdrawals`) por fila.
   - Múltiplo por denominación: cada columna debe ser divisible por su valor facial.
   - Exclusividad entries/withdrawals: un registro es entrada O salida, nunca ambos. CHECK constraint en BD.
   - Campos obligatorios: `voucher`, `reference`, `branch_id`, `movement_type_id`, (`entries` o `withdrawals` > 0).
   - Detección de filas vacías vs parcialmente llenas.
   - Validar que ETV tiene asignada la bóveda.
   - Validar unicidad de `record_uid`.
4. Generador de `record_uid`: 6 caracteres alfanuméricos (A-Z, 0-9), con verificación de colisión.
5. Disparar notificaciones al publicar.
6. Detectar y notificar si se publica en día inhábil/fin de semana (consultar catálogo `holidays`).
7. **Control de concurrencia (Optimistic Locking):** En el endpoint de publicación, verificar que `updated_at` del `arqueo_header` no cambió desde que el frontend cargó los datos. Si cambió (otra sesión publicó entre tanto), rechazar con HTTP 409 Conflict y mensaje para que recargue. Implementar con `WHERE id = :id AND updated_at = :expected`. Ver §10.3.

**Frontend:**
1. Página ETV: Selección de bóveda (solo bóvedas activas asignadas) → Formulario de captura.
2. Vista continua con **lazy loading**: se cargan los últimos 3 días al abrir. Al hacer scroll hacia arriba se cargan más días progresivamente. Días anteriores al actual con estilo opaco/bloqueado (solo lectura). Cada fila muestra empresa ETV y código de bóveda (vía JOIN, no desnormalizado).
3. Diseño para **desktop/laptop**: tabla con scroll horizontal si las columnas de denominaciones no caben. El usuario ajusta zoom del navegador según necesite.
4. Formulario del día actual:
   - Si hay registros ya publicados hoy: se muestran arriba (editables, con advertencia al modificar: "Estos registros ya fueron publicados. ¿Está seguro de modificarlos?").
   - Debajo: 30 filas vacías nuevas + botón "Agregar 5 filas" en la parte inferior.
   - Validación en tiempo real: doble cuadre (denominaciones = entries/withdrawals), múltiplo por denominación (resaltar en rojo), campos obligatorios.
   - Exclusividad entries/withdrawals: si se llena uno, el otro se deshabilita o se pone en 0.
   - Indicadores visuales de error por fila (rojo si no cuadra, parcialmente llena, etc.).
   - **Saldo acumulado** (importe de la bóveda) mostrado en tiempo real como running total: `opening_balance + Σ(entries) - Σ(withdrawals)`. **Alerta visual si el saldo se vuelve negativo.**
   - Sucursal como selector de catálogo (`branches`), no texto libre.
5. Implementar `useDraft` hook:
   - Autosave a localStorage cada 30 segundos (solo filas con datos, no vacías).
   - Recuperación de draft al entrar a la página.
   - Limpieza de draft post-publicación.
   - Alerta de navegación si hay cambios sin publicar.
6. Botón "Publicar" con confirmación. Solo habilitado si todas las filas no-vacías pasan validación. Al publicar con saldo negativo, se muestra advertencia adicional y se genera notificación `negative_balance`.
7. Indicador "Tienes cambios no publicados" si agrega filas o edita registros ya publicados del día.
8. Página ETV: Lista de arqueos propios (con filtros y paginación).

**Tests:**
- Doble validación de cuadre (denominaciones = entries/withdrawals, positivo y negativo).
- Validación de múltiplo por denominación (aceptar múltiplos válidos, rechazar inválidos).
- Validación de exclusividad entries/withdrawals (rechazar si ambos > 0).
- Cálculo correcto de `opening_balance` (usa `initial_balance` de bóveda si es el primer día) y `closing_balance`.
- Detección correcta de filas vacías vs parcialmente llenas.
- Flujo de republication: publicar → editar registro publicado (UPDATE directo, sin contrapartida) → republicar → verificar que `audit_log` tiene snapshot.
- Recálculo en cascada al republicar: `closing_balance` del día se recalcula y propaga a días posteriores.
- Saldo negativo genera notificación `negative_balance`.
- Lazy loading de días anteriores.
- Flujo completo: crear header → agregar registros → publicar.
- **Verificación de asignación:** Si la bóveda fue reasignada, el intento de publicar se rechaza con mensaje claro.
- **Concurrencia (Optimistic Locking):** Si 2 sesiones publican la misma bóveda/día, la segunda recibe HTTP 409 con mensaje para recargar.
- Que ETV no pueda operar bóvedas no asignadas ni bóvedas inactivas.
- Generación de UIDs sin colisión.
- Publicación genera notificación.
- Banner de saldo apertura muestra el `opening_balance` correcto.

**Entregables:**
- ETVs pueden capturar y publicar arqueos completos.
- Saldo acumulado de bóveda calculado y mostrado en tiempo real.
- Validaciones funcionando en frontend y backend.
- Sistema de drafts operativo.

---

### ETAPA 4: Módulo de Modificaciones (Sprint 6)

**Objetivo:** Permitir edición de arqueos pasados dentro del periodo de gracia, con registros de contrapartida y recálculo de saldos.

**Backend:**
1. Crear migraciones: `arqueo_modifications`, `modification_reasons`.
2. Implementar módulo `modifications/`:
   - `GET /modifications/editable-arqueos` — Listar arqueos dentro del periodo de gracia para la ETV (filtrable por bóveda, mes).
   - `POST /modifications/add` — Agregar registro a arqueo pasado. Requiere `record_date` (fecha a la que aplica).
   - `PUT /modifications/edit/{record_id}` — Editar registro existente. Genera registro de contrapartida con `counterpart_type = 'modification'`, `is_counterpart = true`, `original_record_uid` = UID del original. Luego crea el nuevo registro con los datos corregidos.
   - `DELETE /modifications/cancel/{record_id}` — Cancelación (baja lógica). Desactiva el original y genera registro de contrapartida con `counterpart_type = 'cancellation'`, que revierte el efecto sobre el saldo.
   - Todos requieren: `reason_id` (obligatorio), `reason_detail` (opcional).
3. Validar periodo de gracia: mes M editable hasta último día hábil de mes M+1. Consultar catálogo `holidays` para calcular días hábiles.
4. Guardar snapshot previo y posterior en `previous_data` / `new_data` (JSONB) en `arqueo_modifications`.
5. **Recálculo de saldos en cascada (requerimiento técnico crítico):**
   Al crear contrapartida o al republicar, recalcular `closing_balance` del día afectado y propagar
   a todos los días posteriores de esa bóveda (`opening_balance` de día N+1 = `closing_balance` de día N).
   **Implementación obligatoria:**
   - Implementar como **función async con lock por `vault_id`** (semáforo/mutex) para que 2 cascadas
     de la misma bóveda **nunca corran en paralelo**. Si se intenta ejecutar una cascada mientras
     otra está en proceso para la misma bóveda, la segunda espera o rechaza con mensaje al usuario.
   - Alternativa aceptable: stored procedure en PostgreSQL con `SELECT ... FOR UPDATE` sobre los
     `arqueo_headers` de la bóveda para serializar acceso.
   - El recálculo se ejecuta **una sola vez por batch** de modificaciones, no por cada registro individual.
   - En publicación diaria (§6.1), la cascada se ejecuta sincrónicamente dentro de la transacción.
   - Registrar en logs del servidor el tiempo de ejecución de cada cascada para monitoreo de performance.
6. Disparar notificación a Operaciones por cada modificación.
7. Job programado: al inicio de cada mes, marcar como `locked` los arqueos fuera del periodo de gracia.

**Frontend:**
1. Página ETV: Módulo de Modificaciones.
   - Lista de arqueos pasados editables, filtrable por bóveda y mes.
   - Al seleccionar un arqueo del mes, ver sus registros agrupados por día.
   - Acciones por registro: Editar / Cancelar (baja lógica). **Solo en registros con `is_counterpart = false`.**
   - Registros de contrapartida (`is_counterpart = true`) se muestran en gris/bloqueados, sin acciones. Tooltip: "Registro de auditoría, no editable."
   - Acción global: Agregar nuevo registro a día pasado (seleccionar fecha de aplicación).
   - Formulario de modificación: campos del registro (mismas validaciones que captura diaria) + selector de motivo (catálogo obligatorio) + detalle libre.
   - Mostrar la fecha de aplicación y la fecha real de la modificación.
   - Alerta de navegación si hay modificaciones sin guardar.
2. Indicador visual de registros modificados/cancelados y sus contrapartidas.
3. Registros de contrapartida visibles con etiqueta "CANCELACIÓN [TIPO]" o "MODIFICACIÓN [TIPO]" (compuesto de `counterpart_type` + `movement_type.name`).

**Tests:**
- Que no se pueda modificar fuera del periodo de gracia.
- Que se genere correctamente el registro de contrapartida (con flags y UIDs correctos).
- **Contrapartidas inmutables:** Que los registros con `is_counterpart = true` no se puedan editar ni cancelar.
- Que el registro "nuevo corregido" sí se pueda editar de nuevo (genera otra reversa + otro corregido).
- Que se recalcule el `closing_balance` del día afectado y los posteriores (cascada una sola vez por batch).
- Que se guarde correctamente el snapshot antes/después.
- Que el motivo sea obligatorio.
- Que se apliquen las mismas validaciones que en captura diaria (doble cuadre, múltiplo, exclusividad).
- **Verificación de asignación:** Si la bóveda fue reasignada durante la sesión, el guardar se rechaza.
- Que se genere notificación a Operaciones.
- Que no se pueda guardar un nuevo batch si hay cascada en proceso.

**Entregables:**
- Módulo de modificaciones funcional con contrapartidas y trazabilidad completa.
- Recálculo automático de saldos en cascada.
- Bloqueo automático por periodo de gracia.

---

### ETAPA 5: Documentos — Certificados PDF (Sprint 7)

**Objetivo:** Subida y descarga de certificados PDF vinculados a arqueos.

**Backend:**
1. Crear migración: `certificates`.
2. Implementar módulo `documents/`:
   - `POST /documents/certificates` — Subir PDF (validar tipo MIME, extensión, tamaño ≤ 10 MB). Máximo 10 archivos por arqueo: los primeros 10 se aceptan normalmente; si se intenta subir el 11°, se rechaza y se genera notificación `excess_certificates` al Admin.
   - `GET /documents/certificates/{id}/download` — Descargar PDF desde MinIO.
   - `GET /documents/certificates?header_id=X` — Listar certificados de un arqueo.
3. Configurar cliente MinIO (bucket `certificates`).
4. Implementar estructura de carpetas en MinIO: `{company}/{vault_code}/{YYYY}/{MM}/{filename}`.
5. Registro en audit_log de cada subida/descarga.

**Frontend:**
1. En el detalle del arqueo (ETV): botón "Subir Certificado" con drag & drop. Permitir subir múltiples archivos (hasta 10). Mostrar contador: "X de 10 certificados subidos".
2. Si ya hay 10, deshabilitar el botón de subida con mensaje: "Límite de certificados alcanzado. Contacte al administrador."
3. Lista de certificados ya subidos con opción de descarga individual.
4. Validación frontend: solo PDF, máx 10 MB por archivo.
5. Indicador de progreso de subida.
6. En el detalle del arqueo (todos los roles): lista de certificados con botón "Descargar" por cada uno.

**Tests:**
- Subida de PDF válido.
- Rechazo de archivo no-PDF.
- Rechazo de archivo > 10 MB.
- Rechazo del 11° archivo y generación de notificación `excess_certificates`.
- Descarga correcta desde MinIO.

**Entregables:**
- Certificados PDF subidos y almacenados en MinIO con estructura organizada.
- Descarga funcional para todos los roles.

---

### ETAPA 6: Dashboard y Reportes (Sprint 8)

**Objetivo:** Dashboard operativo y reportes descargables.

**Backend:**
1. Implementar módulo `dashboard/`:
   - `GET /dashboard/summary` — Métricas del día (bóvedas con/sin arqueo, montos, etc.).
   - `GET /dashboard/missing-vaults` — Lista de bóvedas faltantes hoy.
   - `GET /dashboard/weekly-trend` — Tendencia de 7 días.
   - `GET /dashboard/denomination-distribution` — Concentración por denominación.
   - Todos los endpoints con filtros: empresa, bóveda, rango de fechas, tipo de movimiento.
2. Implementar módulo `reports/`:
   - `GET /reports/daily-balances` — Reporte de saldos finales por bóveda por día.
   - `GET /reports/daily-balances/download` — Descarga XLSX con filtros aplicados.
3. Implementar descarga XLSX genérica que respete filtros activos (reutilizable por todas las tablas). **Al ejecutar cada descarga, registrar en `audit_log`** la acción `download` con los filtros aplicados almacenados en `new_values` (JSONB): empresa, bóveda, rango de fechas, tipo de movimiento, texto de búsqueda, paginación. Ver §10.2.

**Frontend:**
1. Página Dashboard (internos):
   - Cards con métricas principales.
   - Tabla de bóvedas faltantes.
   - Gráfica de tendencia semanal (usar recharts o chart.js).
   - Gráfica de distribución por denominación.
   - Filtros globales del dashboard.
2. Página Reportes:
   - Reporte de saldos finales con filtros y descarga XLSX.
3. Agregar botón de descarga XLSX en todas las DataTable existentes.

**Tests:**
- Cálculos del dashboard con datos de prueba.
- Descarga XLSX respeta filtros.
- Descarga XLSX registra filtros activos en `audit_log`.
- Dashboard accesible solo para internos.

**Entregables:**
- Dashboard operativo con métricas y gráficas.
- Reporte de saldos finales descargable.
- Descarga XLSX funcional en todas las tablas.

---

### ETAPA 7: Notificaciones y Reporte de Errores (Sprint 9)

**Objetivo:** Sistema completo de notificaciones y flujo de reporte de errores.

**Backend:**
1. Crear migraciones: `notifications`, `error_reports`, `error_report_records`.
2. Implementar módulo `notifications/`:
   - `GET /notifications` — Listar notificaciones del usuario con paginación.
   - `GET /notifications/unread-count` — Contador de no leídas.
   - `PUT /notifications/{id}/read` — Marcar como leída.
   - `PUT /notifications/mark-all-read` — Marcar todas como leídas.
   - Service layer para crear notificaciones (usado por otros módulos).
3. Completar la integración de notificaciones en todos los flujos:
   - Publicación de arqueo → notificar Operaciones + Admin.
   - Modificación (batch) → notificar Operaciones + Admin.
   - Reporte de error → notificar ETV.
   - Respuesta a error → notificar quien reportó.
   - Carga en fin de semana/inhábil → notificar Operaciones + Admin.
   - Saldo negativo al publicar → notificar Operaciones + Admin (`negative_balance`).
   - Exceso de certificados (>10) → notificar Admin (`excess_certificates`).
   - Reactivación de bóveda → notificar Operaciones + Admin (`vault_reactivated`).
   - Restablecimiento de contraseña → notificar al usuario afectado (`password_reset`).
4. Job programado (cron diario a las **22:00 CDMX**): detectar bóvedas **activas** sin arqueo del día y generar notificación `missing_arqueo`.
5. Implementar módulo de reportes de error:
   - `POST /error-reports` — Crear reporte (con lista de record_ids afectados).
   - `PUT /error-reports/{id}/respond` — ETV responde.
   - `PUT /error-reports/{id}/resolve` — Marcar como resuelto.
   - `GET /error-reports` — Listar reportes (filtrable por status, fecha, ETV).

**Frontend:**
1. Completar componente de notificaciones:
   - Campana con badge de conteo.
   - Panel desplegable con lista de notificaciones.
   - Click en notificación → navega a entidad relacionada.
   - Botón "Marcar todas como leídas".
   - Polling de conteo cada 30 minutos.
2. Botón "Reportar Error" en el explorador de arqueos (internos):
   - Modal para seleccionar registros con error.
   - Campo de descripción.
3. Vista ETV: lista de reportes de error recibidos con opción de responder.
4. Vista interna: lista de reportes de error enviados con estado.

**Tests:**
- Creación de notificaciones en cada flujo.
- Reporte de error completo (crear → notificar → responder → resolver).
- Conteo de no leídas.
- Permisos: ETV solo ve sus notificaciones, internos las suyas.

**Entregables:**
- Sistema de notificaciones completo e integrado.
- Flujo de reporte de errores funcional de ida y vuelta.

---

### ETAPA 8: Explorador de Arqueos y Vista Admin (Sprint 10)

**Objetivo:** Vistas completas de consulta para internos y panel de administración.

**Backend:**
1. Endpoint avanzado: `GET /arqueos/explorer` con filtros combinados (empresa, bóveda, fecha, tipo_movimiento, status, buscador de texto).
2. `GET /audit-log` — Listar audit log con filtros (solo Admin).
3. Endpoints de estadísticas de uso para Admin.

**Frontend:**
1. Página interna: Explorador de Arqueos.
   - DataTable completa con todos los registros de arqueos. Cada fila muestra: empresa ETV, código de bóveda, comprobante, referencia, sucursal, entrada/salida, denominaciones, tipo_movimiento, fecha, status.
   - Registros de contrapartida marcados visualmente con etiqueta "CANCELACIÓN [TIPO]" o "MODIFICACIÓN [TIPO]".
   - Filtros: empresa, bóveda, rango de fechas, tipo movimiento, buscador de texto.
   - Detalle expandible por fila o modal de detalle.
   - Botón "Reportar Error" integrado (solo Operaciones).
   - Descarga XLSX con filtros (incluye columnas empresa ETV y bóveda).
2. Panel Admin:
   - Gestión de usuarios: crear, editar, desactivar, restablecer contraseña, asignar/reasignar bóvedas.
   - Gestión de bóvedas: activar/desactivar, establecer saldo inicial, reasignar a otro usuario. (Acciones ya implementadas en Etapa 2, integrar en layout admin).
   - Gestión de catálogos (ya hecho en etapa 2, solo integrar en layout admin).
   - Visor de audit log con filtros (usuario, acción, entidad, rango de fechas).

**Tests:**
- Filtros combinados en explorador (incluyendo empresa ETV y bóveda).
- Audit log solo accesible por Admin.
- Flujo completo Admin: crear usuario → asignar bóvedas → restablecer contraseña → verificar acceso.
- Flujo Admin: desactivar bóveda → verificar que no genera alertas → reactivar con nuevo saldo inicial.

**Entregables:**
- Explorador de arqueos completo para usuarios internos (con empresa y bóveda por fila).
- Panel de administración completo (usuarios, bóvedas, catálogos, audit log).

---

### ETAPA 9: Integración, QA y Hardening (Sprint 11-12)

**Objetivo:** Pruebas integrales, optimización y preparación para producción.

**Tareas:**
1. **Tests de integración end-to-end:**
   - Flujo completo ETV: login → MFA → cambio contraseña (primera vez) → captura → draft → publicar → republicar (editar mismo día) → modificar (día anterior, batch) → certificado.
   - Flujo completo Operaciones: dashboard → explorar → reportar error → recibir respuesta.
   - Flujo Admin: crear usuario → asignar bóvedas → restablecer contraseña → desactivar bóveda → reactivar bóveda con saldo inicial.
   - Flujo de saldo negativo: publicar arqueo que genera saldo negativo → verificar notificación.
   - Flujo de reasignación: reasignar bóveda de usuario A a B → B ve registros de A → B puede modificar. A al recargar ya no ve la bóveda.
   - Flujo de concurrencia: 2 sesiones publican misma bóveda/día → segunda recibe conflicto 409 → recarga → ve datos actualizados.
2. **Pruebas de carga:**
   - Simular 150 bóvedas cargando 150 registros simultáneamente.
   - Verificar performance del dashboard con datos reales.
3. **Seguridad:**
   - Auditoría de seguridad: intentar SQL injection, XSS, CSRF, acceso no autorizado.
   - Verificar que no hay información sensible en URLs o responses de error.
   - Verificar headers de seguridad.
4. **Optimización de BD:**
   - Crear índices necesarios según queries más frecuentes.
   - Optimizar queries del dashboard.
5. **UTF-8 y localización:**
   - Verificar que acentos, ñ, y caracteres especiales se renderizan correctamente en toda la UI.
   - Verificar en descargas XLSX.
6. **Documentación:**
   - README con instrucciones de despliegue.
   - Documentación de API (auto-generada por FastAPI/Swagger).
   - Guía de usuario básica.
7. **Docker Compose final:**
   - Variables de entorno en `.env`.
   - Volumes para persistencia de PostgreSQL y MinIO.
   - Health checks en todos los servicios.
   - Configuración de Nginx como reverse proxy.

**Entregables:**
- Sistema completo, probado y funcional.
- Docker Compose listo para despliegue local.
- Documentación de despliegue y API.

---

## 12. Reglas para Agentes de Desarrollo

### 12.1 Convenciones de código

- **Backend (Python):** código en inglés, PEP 8, type hints en todo, docstrings en todas las funciones públicas. Usar `async/await` en endpoints FastAPI.
- **Frontend (TypeScript):** código en inglés, componentes funcionales con hooks, TypeScript estricto (no `any`), labels de UI en español.
- **Nombres de archivos:** `snake_case` en Python, React y para hooks y servicios.
- **Commits:** Conventional Commits (feat:, fix:, chore:, etc.).
- **BD:** `snake_case` para tablas y columnas. Nombres en inglés.

### 12.2 Principios obligatorios

- **Modularidad:** Cada módulo es independiente con su router, service, schemas, models, tests. Baja acoplamiento, alta cohesión.
- **SOLID, DRY, KISS:** Sin duplicación de lógica. Funciones con responsabilidad única.
- **Seguridad por diseño:** Validar todo input. Nunca confiar en el frontend. Parametrizar queries. Sanitizar outputs.
- **Soft deletes:** `is_active = false`, nunca DELETE físico.
- **Trazabilidad:** Toda acción significativa va a `audit_log`.
- **Tests:** Cada módulo incluye tests unitarios. Mínimo 80% coverage en lógica de negocio.
- **Error handling:** Excepciones personalizadas, responses estandarizados con códigos HTTP correctos.
- **Paginación:** Todo endpoint de listado debe soportar paginación, filtros y ordenamiento.

### 12.3 Dependencias Python principales

```
fastapi
uvicorn
sqlalchemy[asyncio]
asyncpg
alembic
pydantic
pydantic-settings
python-jose[cryptography]   # JWT
passlib[bcrypt]              # Hashing
python-multipart             # File uploads
minio                        # MinIO SDK
openpyxl                     # Generación XLSX
httpx                        # Testing async
pytest
pytest-asyncio
```

### 12.4 Dependencias React principales

```
react
react-router-dom
axios
zustand                      # Estado global
react-hook-form              # Formularios
zod                          # Validación de schemas
recharts                     # Gráficas
date-fns                     # Manejo de fechas
lucide-react                 # Iconos
tailwindcss                  # Estilos
@tanstack/react-table        # Tablas avanzadas
```

---

## 13. Docker Compose (Referencia)

```yaml
version: '3.8'

services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: arqueos
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-LINE", "pg_isready -U ${DB_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_PASSWORD}
    volumes:
      - minio_data:/data
    ports:
      - "9000:9000"
      - "9001:9001"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build: ./backend
    environment:
      DATABASE_URL: postgresql+asyncpg://${DB_USER}:${DB_PASSWORD}@db:5432/arqueos
      MINIO_ENDPOINT: minio:9000
      MINIO_ACCESS_KEY: ${MINIO_USER}
      MINIO_SECRET_KEY: ${MINIO_PASSWORD}
      JWT_SECRET: ${JWT_SECRET}
      OTP_EMAIL_HOST: ${OTP_EMAIL_HOST}
      OTP_EMAIL_PORT: ${OTP_EMAIL_PORT}
      OTP_EMAIL_USER: ${OTP_EMAIL_USER}
      OTP_EMAIL_PASSWORD: ${OTP_EMAIL_PASSWORD}
    ports:
      - "8000:8000"
    depends_on:
      db:
        condition: service_healthy
      minio:
        condition: service_healthy

  frontend:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - backend

volumes:
  postgres_data:
  minio_data:
```

---

## 14. Glosario

| Término | Definición |
|---------|-----------|
| ETV | Empresa Transportadora de Valores |
| Arqueo | Registro diario de entradas y salidas de efectivo de una bóveda |
| Bóveda | Caja fuerte/almacén de efectivo administrado por una ETV. Puede activarse/desactivarse por el Admin |
| Certificado | Documento PDF firmado que respalda el arqueo del día. Máx 10 por arqueo |
| Draft | Borrador guardado en localStorage antes de publicar |
| Periodo de gracia | Tiempo durante el cual se permite modificar un arqueo publicado (hasta último día hábil del mes siguiente, calculado con catálogo de `holidays`) |
| Cierre de día | 23:59:59 hora CDMX del día; a partir de ahí, cambios = modificación |
| Baja lógica | Desactivar un registro (`is_active = false`) sin eliminarlo de la BD |
| Record UID | Identificador único alfanumérico de 6 caracteres (A-Z, 0-9) |
| Importe / Saldo acumulado | Saldo total de la bóveda. No se llena manualmente. Se calcula como `closing_balance del día anterior + Σ(entries) - Σ(withdrawals)` del día actual. Puede ser negativo (genera alerta) |
| Contrapartida | Registro espejo generado automáticamente al modificar o cancelar un registro pasado. En edición se generan 2 registros (reversa + nuevo). En cancelación se genera 1 (reversa). Se identifica con `is_counterpart = true` |
| Batch de modificaciones | Grupo de modificaciones que la ETV realiza en una sola sesión del módulo de modificaciones. Se guardan todas de una vez y el recálculo de saldos en cascada se ejecuta una sola vez al final |
| Saldo inicial (`initial_balance`) | Monto que el Admin establece al activar o reactivar una bóveda en el sistema. Se usa como `opening_balance` del primer arqueo |
| Día hábil | Lunes a viernes excluyendo fechas del catálogo `holidays` |
| Zona horaria del sistema | `America/Mexico_City` (UTC-6 / UTC-5 en horario de verano). Toda la lógica temporal se basa en esta zona |
