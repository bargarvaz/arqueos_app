# Modelo de Datos — Sistema de Arqueos Bancarios

## Tablas principales

### companies
Empresas ETV (PanAmericano, GSI, etc.)

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| name | VARCHAR(150) UNIQUE | Nombre de la empresa |
| is_active | BOOLEAN | Baja lógica |

### users
Usuarios del sistema (internos y ETVs)

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| email | VARCHAR(255) UNIQUE | Login |
| password_hash | VARCHAR(255) | bcrypt |
| full_name | VARCHAR(200) | |
| role | ENUM | admin, operations, data_science, etv |
| user_type | ENUM | internal, external |
| company_id | FK → companies | NULL para internos |
| must_change_password | BOOLEAN | Fuerza cambio en próximo login |
| mfa_enabled | BOOLEAN | true para ETVs |
| failed_login_attempts | INT | Para lockout futuro |
| locked_until | TIMESTAMPTZ | Para lockout futuro |
| is_active | BOOLEAN | Baja lógica |

### user_vault_assignments
Relación M:N entre usuarios ETV y bóvedas asignadas.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| user_id | FK → users | |
| vault_id | FK → vaults | |
| is_active | BOOLEAN | Permite desasignar sin borrar |

### branches (sucursales)

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| name | VARCHAR(150) UNIQUE | |
| is_active | BOOLEAN | |

### personnel (personal de bóveda)

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| full_name | VARCHAR(200) | |
| position | VARCHAR(100) | |
| personnel_type | VARCHAR(50) | manager / treasurer |
| is_active | BOOLEAN | |

### vaults (bóvedas)

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| vault_code | VARCHAR(20) UNIQUE | Ej: "9001" |
| vault_name | VARCHAR(150) | |
| company_id | FK → companies | |
| branch_id | FK → branches | |
| manager_id | FK → personnel | Gerente asignado |
| treasurer_id | FK → personnel | Tesorero asignado |
| initial_balance | DECIMAL(15,2) | Saldo inicial (Admin lo establece) |
| is_active | BOOLEAN | Bóvedas inactivas no generan alertas |
| deactivated_at | TIMESTAMPTZ | Auditoría |
| reactivated_at | TIMESTAMPTZ | Auditoría |

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

Un registro por bóveda por día. Se crea en estado `draft` y avanza a `published` → `locked`.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| vault_id | FK → vaults | |
| arqueo_date | DATE | Fecha del arqueo |
| opening_balance | DECIMAL(15,2) | Saldo apertura (= closing del día anterior) |
| closing_balance | DECIMAL(15,2) | Saldo cierre = opening + entradas - salidas |
| status | ENUM (arqueo_status) | draft, published, locked |
| published_at | TIMESTAMPTZ | |
| locked_at | TIMESTAMPTZ | |
| created_by | FK → users | ETV que publicó |
| updated_at | TIMESTAMPTZ | Versión para optimistic locking |

**Constraint UNIQUE** en (vault_id, arqueo_date)

### arqueo_records (filas individuales del arqueo)

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| record_uid | CHAR(6) UNIQUE | ID alfanumérico A-Z,0-9 generado automáticamente |
| arqueo_header_id | FK → arqueo_headers | |
| voucher | VARCHAR(100) | Comprobante (obligatorio) |
| reference | VARCHAR(100) | Referencia (obligatorio) |
| branch_id | FK → branches | |
| movement_type_id | FK → movement_types | |
| entries | DECIMAL(15,2) | Entradas (mutuamente excluyente con withdrawals) |
| withdrawals | DECIMAL(15,2) | Salidas |
| bill_1000..coin_010 | DECIMAL(15,2) | 16 campos de denominaciones individuales |
| record_date | DATE | Fecha del movimiento |
| is_active | BOOLEAN | Soft delete; false en registros cancelados |
| is_counterpart | BOOLEAN | true si es registro de auditoría de modificación |
| counterpart_type | ENUM (counterpart_type) | cancellation, modification |
| original_record_uid | CHAR(6) | UID del registro original que origina la contrapartida |
| created_by | FK → users | |
| created_at | TIMESTAMPTZ | |

**CHECK constraint:** `entries = 0 OR withdrawals = 0`

**Regla:** suma de denominaciones = entries (si entries > 0) o withdrawals (si withdrawals > 0).

---

### arqueo_modifications (log de modificaciones)

Historial de cada operación add/edit/cancel sobre registros publicados.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| arqueo_header_id | FK → arqueo_headers | |
| arqueo_record_id | FK → arqueo_records | Registro afectado |
| modification_type | ENUM | add, edit, delete |
| reason_id | FK → modification_reasons | |
| reason_detail | TEXT | Detalle libre (opcional) |
| previous_data | JSONB | Snapshot antes del cambio |
| new_data | JSONB | Snapshot después del cambio |
| created_by | FK → users | ETV que realizó la operación |
| created_at | TIMESTAMPTZ | |

---

### certificates (documentos PDF por arqueo)

Hasta 10 PDFs por arqueo header. Almacenados en MinIO.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| arqueo_header_id | FK → arqueo_headers | |
| original_filename | VARCHAR(255) | Nombre original del archivo |
| minio_bucket | VARCHAR(100) | Nombre del bucket en MinIO |
| minio_key | VARCHAR(500) | Path interno: `{company}/{vault}/{YYYY}/{MM}/{vault}_{date}_{ts}.pdf` |
| file_size_bytes | INT | Máximo 10 MB |
| uploaded_by | FK → users | |
| uploaded_at | TIMESTAMPTZ | |
| is_active | BOOLEAN | Baja lógica |

---

### notifications

Notificaciones in-app para usuarios internos y ETVs. 11 tipos definidos.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| user_id | FK → users | Destinatario |
| notification_type | ENUM (notification_type) | Ver tabla abajo |
| title | VARCHAR(200) | |
| message | TEXT | |
| entity_type | VARCHAR(50) | Tipo de entidad relacionada (arqueo_header, vault...) |
| entity_id | INT | ID de la entidad relacionada |
| is_read | BOOLEAN | |
| read_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

**Tipos de notificación:**

| Tipo | Quién la recibe | Descripción |
|------|----------------|-------------|
| arqueo_published | Operations + Admin | ETV publicó un arqueo |
| correction_made | Operations + Admin | Se realizó una modificación |
| missing_arqueo | Operations + Admin | Bóveda sin arqueo al cierre |
| weekend_upload | Operations + Admin | Arqueo cargado en día festivo/fin de semana |
| negative_balance | Operations + Admin | Saldo de cierre negativo |
| excess_certificates | Operations + Admin | Bóveda acumula más de 10 certificados |
| vault_reactivated | Operations + Admin | Bóveda reactivada |
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
| arqueo_header_id | FK → arqueo_headers | Arqueo relacionado (opcional) |
| subject | VARCHAR(200) | |
| description | TEXT | |
| status | ENUM (error_report_status) | open, acknowledged, resolved, closed |
| response | TEXT | Respuesta de operaciones |
| responded_by | FK → users | |
| responded_at | TIMESTAMPTZ | |
| resolved_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

### error_report_records (registros afectados en un reporte)

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
| user_id | FK → users | NULL = sistema/job |
| action | VARCHAR(50) | login, create, update, publish, download, lock, cancel_record... |
| entity_type | VARCHAR(50) | user, vault, arqueo_header, arqueo_record... |
| entity_id | INT | ID de la entidad afectada |
| old_values | JSONB | Snapshot antes del cambio |
| new_values | JSONB | Snapshot después del cambio (o filtros aplicados en descargas) |
| ip_address | VARCHAR(45) | IPv4 o IPv6 |
| user_agent | VARCHAR(500) | |
| created_at | TIMESTAMPTZ | |

---

## Diagrama de relaciones

```
companies
   ├── users (ETV, M:N via user_vault_assignments)
   └── vaults
          ├── arqueo_headers (1 por día por bóveda, UNIQUE vault_id+date)
          │      ├── arqueo_records (N filas, incluye contrapartidas)
          │      │      └── arqueo_modifications (log add/edit/delete)
          │      └── certificates (hasta 10 PDFs en MinIO)
          └── user_vault_assignments

users → notifications (destinatario, N por usuario)
users → audit_log (actor de la acción)
users → error_reports (reporta) ──→ error_report_records ──→ arqueo_records
users → error_reports (responde)

catalogs: movement_types, modification_reasons, holidays, branches, personnel
```

## Reglas de integridad

1. **Denominaciones**: suma de todos los campos `bill_*` y `coin_*` debe igualar `entries` o `withdrawals` (el que sea > 0)
2. **Exclusividad**: `entries > 0` XOR `withdrawals > 0`; nunca ambos en el mismo registro
3. **Denominaciones múltiplos**: cada campo debe ser múltiplo de su valor facial (bill_500 debe ser múltiplo de 500)
4. **record_uid**: generado aleatoriamente, único global, 6 caracteres alfanuméricos (A-Z, 0-9)
5. **Soft deletes**: nada se elimina físicamente; `is_active = false` en usuarios, bóvedas, registros cancelados
6. **Cascade**: `closing_balance` de cada día se recalcula en cascada al publicar o modificar un registro (con lock por bóveda para concurrencia)
7. **Periodo de gracia**: mes M es modificable hasta el último día hábil del mes M+1 (usa catálogo de holidays)
8. **Contrapartidas**: las operaciones de modificación crean registros `is_counterpart=true` para preservar trazabilidad completa

## Enumeraciones

| Enum | Valores |
|------|---------|
| user_role | admin, operations, data_science, etv |
| user_type | internal, external |
| arqueo_status | draft, published, locked |
| counterpart_type | cancellation, modification |
| modification_type | add, edit, delete |
| error_report_status | open, acknowledged, resolved, closed |
| notification_type | arqueo_published, correction_made, missing_arqueo, weekend_upload, negative_balance, excess_certificates, vault_reactivated, password_reset, error_reported, error_response, general |
