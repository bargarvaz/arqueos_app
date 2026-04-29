# Modelo de Datos — Sistema de Arqueos Bancarios

## Tablas principales

### companies
Empresas ETV (transportadoras de valores).

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| name | VARCHAR(150) UNIQUE | Nombre de la ETV |
| is_active | BOOLEAN | Baja lógica |

### empresas
Sub-empresas dentro de una ETV (clientes finales, divisiones, marcas).

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| name | VARCHAR(150) | |
| etv_id | FK → companies | ETV a la que pertenece |
| is_active | BOOLEAN | Baja lógica |

### users
Usuarios del sistema (internos y ETVs). Los gerentes/tesoreros también son usuarios con sub-rol.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| email | VARCHAR(255) UNIQUE | Login |
| password_hash | VARCHAR(255) | bcrypt |
| full_name | VARCHAR(200) | |
| puesto | VARCHAR(100) NULL | Texto libre del puesto |
| role | ENUM `user_role` | admin, operations, data_science, etv |
| user_type | ENUM `user_type` | internal, external |
| etv_subrole | ENUM `etv_subrole` NULL | gerente, tesorero (solo cuando role = etv) |
| company_id | FK → companies NULL | NULL para internos |
| empresa_id | FK → empresas NULL | Sub-empresa del ETV |
| must_change_password | BOOLEAN | Fuerza cambio en próximo login |
| mfa_enabled | BOOLEAN | true para ETVs |
| failed_login_attempts | INT | Para lockout futuro |
| locked_until | TIMESTAMPTZ | Para lockout futuro |
| is_active | BOOLEAN | Baja lógica |

**Constraint:** `etv_subrole` es obligatorio si y solo si `role = 'etv'`.

### user_vault_assignments
Relación M:N entre usuarios ETV y bóvedas asignadas.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| user_id | FK → users | |
| vault_id | FK → vaults | |
| assigned_at | TIMESTAMPTZ | |
| is_active | BOOLEAN | Permite desasignar sin borrar |

**UNIQUE** en `(user_id, vault_id)`.

### auth_sessions
Una fila por sesión activa (multi-pestaña, multi-dispositivo).

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID PK | session_id único, generado en frontend |
| user_id | FK → users | |
| refresh_hash | VARCHAR(64) | SHA-256 del refresh token (no se guarda el token) |
| ip_address | VARCHAR(45) | |
| user_agent | VARCHAR(500) | |
| created_at | TIMESTAMPTZ | |
| last_activity_at | TIMESTAMPTZ | Actualizado en cada refresh |
| expires_at | TIMESTAMPTZ | |
| is_active | BOOLEAN | Revocada manual o por logout |

### branches (sucursales)
Sucursales operativas (catálogo de origen/destino de movimientos).

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| name | VARCHAR(150) UNIQUE | |
| is_active | BOOLEAN | |

### vaults (bóvedas)

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| vault_code | VARCHAR(20) UNIQUE | Ej: "9001" |
| vault_name | VARCHAR(150) | |
| company_id | FK → companies | ETV propietaria |
| empresa_id | FK → empresas NULL | Sub-empresa (cliente) |
| branch_id | FK → branches | |
| manager_id | FK → users NULL | Gerente asignado (sub-rol gerente) |
| treasurer_id | FK → users NULL | Tesorero asignado (sub-rol tesorero) |
| initial_balance | DECIMAL(15,2) | Suma de las 16 denominaciones iniciales |
| initial_bill_1000 .. initial_coin_010 | DECIMAL(15,2) × 16 | Desglose de saldo inicial |
| balance_reset_at | DATE NULL | Día del último reset (admin reescribió denominaciones o reactivó). Cálculos posteriores ignoran arqueos previos. |
| is_active | BOOLEAN | Bóvedas inactivas no generan alertas |
| deactivated_at | TIMESTAMPTZ NULL | Auditoría |
| reactivated_at | TIMESTAMPTZ NULL | Auditoría |
| created_at | TIMESTAMPTZ | Día ancla = max(created_at, balance_reset_at) |

### movement_types (tipos de movimiento)

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| name | VARCHAR(100) UNIQUE | Ej: "Depósito", "Retiro" |
| is_active | BOOLEAN | |

### modification_reasons (motivos de modificación)

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| reason | VARCHAR(200) UNIQUE | Ej: "Error de captura" |
| is_active | BOOLEAN | |

### holidays (días inhábiles)

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| holiday_date | DATE UNIQUE | |
| description | VARCHAR(200) | |

---

### arqueo_headers (cabecera de arqueo diario)

Un registro por bóveda por día. Avanza `draft → published → locked`.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| vault_id | FK → vaults | |
| arqueo_date | DATE | Fecha del arqueo |
| opening_balance | DECIMAL(15,2) | Saldo apertura (= closing del día anterior; respeta `balance_reset_at`) |
| closing_balance | DECIMAL(15,2) | Saldo cierre = opening + Σ(entradas) − Σ(salidas) |
| status | ENUM `arqueo_status` | draft, published, locked |
| auto_published | BOOLEAN | True si lo publicó un job automático |
| published_at | TIMESTAMPTZ | |
| locked_at | TIMESTAMPTZ | |
| created_by | FK → users | ETV que creó el header |
| created_at, updated_at | TIMESTAMPTZ | `updated_at` actúa como versión para optimistic locking |

**Constraint UNIQUE** en `(vault_id, arqueo_date)`.

### arqueo_records (filas individuales del arqueo)

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| record_uid | CHAR(6) UNIQUE | ID alfanumérico A-Z,0-9 generado automáticamente |
| arqueo_header_id | FK → arqueo_headers | |
| voucher | VARCHAR(100) | Comprobante (obligatorio) |
| reference | VARCHAR(100) | Referencia (obligatorio) |
| sucursal_id | FK → branches NULL | Sucursal origen/destino |
| movement_type_id | FK → movement_types | |
| entries | DECIMAL(15,2) | Entradas (mutuamente excluyente con withdrawals) |
| withdrawals | DECIMAL(15,2) | Salidas |
| bill_1000 .. coin_010 | DECIMAL(15,2) × 16 | Denominaciones individuales |
| record_date | DATE | Fecha del movimiento (puede diferir del arqueo_date en modificaciones) |
| upload_date | TIMESTAMPTZ | |
| is_active | BOOLEAN | Soft delete |
| is_counterpart | BOOLEAN | true si es registro de auditoría de modificación |
| counterpart_type | ENUM `counterpart_type` NULL | cancellation, modification |
| original_record_uid | CHAR(6) NULL | UID del registro original que origina la contrapartida |
| created_by | FK → users | |
| created_at, updated_at | TIMESTAMPTZ | |

**CHECK constraints:**
- `entries = 0 OR withdrawals = 0` (no ambos)
- `entries > 0 OR withdrawals > 0` salvo en filas vacías ignoradas

**Reglas:**
- Suma de denominaciones = `entries` (si entries > 0) o `withdrawals` (si withdrawals > 0).
- Cada `bill_*` / `coin_*` debe ser múltiplo de su valor facial.
- Validación intra-día: ninguna denominación puede quedar en negativo en ningún punto del día.

---

### arqueo_modifications (log de modificaciones)

Historial de cada operación add / edit / cancel sobre registros publicados.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| arqueo_header_id | FK → arqueo_headers | |
| arqueo_record_id | FK → arqueo_records | Registro afectado |
| modification_type | ENUM `modification_type` | add, edit, delete |
| reason_id | FK → modification_reasons | |
| reason_detail | TEXT | Detalle libre (opcional) |
| previous_data | JSONB | Snapshot antes del cambio |
| new_data | JSONB | Snapshot después del cambio |
| created_by | FK → users | ETV que realizó la operación |
| created_at | TIMESTAMPTZ | |

---

### certificates (documentos PDF por arqueo)

Hasta 10 PDFs por arqueo header. Almacenados en MinIO. Servidos via stream-proxy desde el backend (no presigned URLs).

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| arqueo_header_id | FK → arqueo_headers | |
| original_filename | VARCHAR(255) | Nombre original del archivo |
| minio_bucket | VARCHAR(100) | Nombre del bucket en MinIO |
| minio_key | VARCHAR(500) | `{empresa}/{vault_code}/{YYYY}/{MM}/{vault}_{date}_{ts}.pdf` |
| file_size_bytes | INT | Máximo 10 MB |
| uploaded_by | FK → users | |
| uploaded_at | TIMESTAMPTZ | |
| is_active | BOOLEAN | Baja lógica |

---

### notifications

Notificaciones in-app para usuarios internos y ETVs.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| recipient_id | FK → users | Destinatario |
| sender_id | FK → users NULL | Actor (NULL si fue el sistema) |
| notification_type | ENUM `notification_type` | Ver tabla abajo |
| title | VARCHAR(200) | |
| message | TEXT | |
| entity_type | VARCHAR(50) NULL | Tipo de entidad relacionada |
| entity_id | INT NULL | |
| is_read | BOOLEAN | |
| read_at | TIMESTAMPTZ NULL | |
| created_at | TIMESTAMPTZ | |

**Tipos de notificación:**

| Tipo | Quién la recibe | Descripción |
|------|----------------|-------------|
| arqueo_published | Operations + Admin | ETV publicó un arqueo |
| correction_made | Operations + Admin | Se realizó una modificación |
| missing_arqueo | Operations + Admin | Bóveda sin arqueo al cierre del día |
| weekend_upload | Operations + Admin | Arqueo cargado en día festivo / fin de semana |
| negative_balance | Operations + Admin | Saldo de cierre negativo |
| excess_certificates | Operations + Admin | Bóveda intentó superar el límite de 10 certificados |
| vault_reactivated | Operations + Admin | Bóveda reactivada |
| vault_balance_reset | Operations + Admin + ETVs asignados | Admin reescribió las denominaciones iniciales (reset de saldo) |
| password_reset | Usuario específico | Nueva contraseña temporal generada |
| error_reported | ETV reportante | Confirmación de reporte enviado |
| error_response | ETV reportante | Respuesta de operations al reporte |
| general | Cualquiera | Notificación genérica |

---

### error_reports (reportes de error)

Comunicación asíncrona entre ETVs y equipo de operaciones.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| reported_by | FK → users | ETV que reporta |
| arqueo_header_id | FK → arqueo_headers NULL | Arqueo relacionado (opcional) |
| subject | VARCHAR(200) | |
| description | TEXT | |
| status | ENUM `error_report_status` | open, acknowledged, resolved, closed |
| response | TEXT NULL | Respuesta de operaciones |
| responded_by | FK → users NULL | |
| responded_at | TIMESTAMPTZ NULL | |
| resolved_at | TIMESTAMPTZ NULL | |
| created_at | TIMESTAMPTZ | |

### error_report_records (registros mencionados en un reporte)

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| error_report_id | FK → error_reports | |
| arqueo_record_id | FK → arqueo_records | Registro específico mencionado |

---

### audit_log

Registro inmutable de toda acción significativa. Solo INSERT, nunca UPDATE/DELETE.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | BIGSERIAL PK | |
| user_id | FK → users NULL | NULL = sistema/job |
| action | VARCHAR(50) | login, create, update, publish, download, lock, cancel_record, vault_balance_reset, vault_activate, vault_deactivate, … |
| entity_type | VARCHAR(50) | user, vault, arqueo_header, arqueo_record, certificate, error_report, … |
| entity_id | INT NULL | |
| old_values | JSONB NULL | Snapshot antes del cambio |
| new_values | JSONB NULL | Snapshot después del cambio (o filtros aplicados en descargas) |
| ip_address | VARCHAR(45) NULL | IPv4 o IPv6 |
| user_agent | VARCHAR(500) NULL | |
| created_at | TIMESTAMPTZ | |

---

## Diagrama de relaciones

```
companies (ETVs)
   ├── empresas (sub-empresas)
   ├── users (M:N con vaults via user_vault_assignments)
   └── vaults
          ├── arqueo_headers (1 por día por bóveda, UNIQUE vault_id+date)
          │      ├── arqueo_records (N filas, incluye contrapartidas)
          │      │      └── arqueo_modifications (log add/edit/delete)
          │      └── certificates (hasta 10 PDFs en MinIO)
          └── user_vault_assignments

users → notifications (recipient + sender)
users → audit_log (actor de la acción)
users → auth_sessions (1:N, una por pestaña / dispositivo)
users → error_reports (reporta) ──→ error_report_records ──→ arqueo_records
users → error_reports (responde)

catalogs: movement_types, modification_reasons, holidays, branches
```

## Reglas de integridad

1. **Denominaciones**: suma de todos los `bill_*` y `coin_*` debe igualar `entries` o `withdrawals` (el que sea > 0).
2. **Exclusividad**: `entries > 0` XOR `withdrawals > 0`; nunca ambos en el mismo registro.
3. **Múltiplos de denominación**: cada campo debe ser múltiplo de su valor facial (`bill_500` debe ser múltiplo de 500).
4. **Validación intra-día**: ninguna denominación puede quedar en negativo en ningún momento del día durante la simulación de los registros publicados.
5. **record_uid**: generado aleatoriamente, único global, 6 caracteres alfanuméricos (A-Z, 0-9).
6. **Soft deletes**: nada se elimina físicamente; `is_active = false`.
7. **Cascade**: `closing_balance` de cada día se recalcula en cascada al publicar o modificar (lock por bóveda para concurrencia).
8. **Periodo de gracia**: el mes M es modificable hasta el último día hábil del mes M+1 (usa `holidays`).
9. **Contrapartidas**: las modificaciones generan registros `is_counterpart = true` para preservar trazabilidad completa.
10. **Reset de saldo**: al editar `initial_*` o reactivar la bóveda, `balance_reset_at = hoy`. Los cálculos (`_get_opening_balance`, `get_denomination_inventory`, Saldos Finales, Explorador, Dashboard, `list_headers`) filtran `arqueo_date >= balance_reset_at` cuando esté seteado.
11. **Día ancla**: una bóveda solo aparece en reportes desde `max(created_at::date, balance_reset_at)`. En Saldos Finales, si el día ancla cae dentro del mes consultado y no hay arqueo publicado ese día, se inserta una fila sintética con `is_anchor = true`.
12. **ETV sub-rol**: `users.etv_subrole` es obligatorio si `role = 'etv'` y prohibido en otros roles (validador Pydantic).

## Enumeraciones

| Enum | Valores |
|------|---------|
| `user_role` | admin, operations, data_science, etv |
| `user_type` | internal, external |
| `etv_subrole` | gerente, tesorero |
| `arqueo_status` | draft, published, locked |
| `counterpart_type` | cancellation, modification |
| `modification_type` | add, edit, delete |
| `error_report_status` | open, acknowledged, resolved, closed |
| `notification_type` | arqueo_published, correction_made, missing_arqueo, weekend_upload, negative_balance, excess_certificates, vault_reactivated, vault_balance_reset, password_reset, error_reported, error_response, general |

## Migraciones

| # | Descripción |
|---|-------------|
| 001 | Tablas base: users, companies, vaults, branches, arqueo_headers, arqueo_records, etc. |
| 002 | Catálogos auxiliares (motivos, días inhábiles) |
| 003 | Notificaciones in-app |
| 004 | Audit log |
| 005 | Modificaciones autorizadas |
| 006 | Notificaciones extendidas + reportes de error |
| 007 | Tabla `empresas` (sub-empresas dentro de una ETV) |
| 008 | Campo `puesto` en users |
| 009 | `vaults.manager_id` y `vaults.treasurer_id` apuntan a `users.id` (antes a `personnel`) |
| 010 | Catálogo `sucursales` |
| 011 | Flag `auto_published` en arqueo_headers |
| 012 | Tabla `auth_sessions` (sesiones por pestaña) |
| 013 | 16 columnas `initial_*` en vaults (denominaciones obligatorias en creación) |
| 014 | Enum `etv_subrole` y columna en users |
| 015 | `vaults.balance_reset_at` + valor `vault_balance_reset` en enum de notificaciones |
| 016 | Drop tabla `personnel` y enum `personnel_type` (legacy desde 009) |
