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

### arqueo_headers (cabecera de arqueo diario)

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| vault_id | FK → vaults | |
| arqueo_date | DATE | Fecha del arqueo |
| opening_balance | DECIMAL(15,2) | Saldo apertura (= closing del día anterior) |
| closing_balance | DECIMAL(15,2) | Saldo cierre = opening + entradas - salidas |
| status | ENUM | draft, published, locked |
| updated_at | TIMESTAMPTZ | Versión para optimistic locking |

**Constraint UNIQUE** en (vault_id, arqueo_date)

### arqueo_records (filas individuales del arqueo)

| Columna | Tipo | Descripción |
|---------|------|-------------|
| record_uid | CHAR(6) UNIQUE | ID alfanumérico A-Z,0-9 generado automáticamente |
| voucher | VARCHAR(100) | Comprobante (obligatorio) |
| reference | VARCHAR(100) | Referencia (obligatorio) |
| entries | DECIMAL(15,2) | Entradas (mutuamente excluyente con withdrawals) |
| withdrawals | DECIMAL(15,2) | Salidas |
| bill_1000..coin_010 | DECIMAL(15,2) | Denominaciones individuales |
| is_counterpart | BOOLEAN | true si es registro de auditoría de modificación |
| counterpart_type | ENUM | cancellation, modification |

**Regla crítica:** suma de denominaciones = entries (o withdrawals). Doble validación.

### audit_log

Registro inmutable de toda acción significativa. No se modifica, solo se inserta.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | BIGSERIAL PK | |
| user_id | FK → users | NULL = sistema |
| action | VARCHAR(50) | login, create, update, publish, download... |
| entity_type | VARCHAR(50) | user, vault, arqueo_record... |
| old_values | JSONB | Snapshot antes del cambio |
| new_values | JSONB | Snapshot después (o filtros en descargas) |
| ip_address | VARCHAR(45) | |
| user_agent | VARCHAR(500) | |

## Diagrama simplificado

```
companies
   └── users (M:N via user_vault_assignments)
   └── vaults
          └── arqueo_headers (1 por día por bóveda)
                 └── arqueo_records (N filas)
                        └── arqueo_modifications (log de cambios)
                 └── certificates (PDFs en MinIO)

users → notifications (destinatario)
users → audit_log (actor)
users → error_reports (reporta y recibe)
```

## Reglas de integridad

1. Todo lo que entra a `entries` o `withdrawals` debe cuadrarse con la suma de denominaciones
2. Denominaciones: cada campo debe ser múltiplo de su valor facial
3. Exclusividad: `entries > 0` XOR `withdrawals > 0`, nunca ambos
4. `record_uid`: único global, 6 chars alfanumérico
5. Nada se elimina físicamente (`is_active = false`)
6. `closing_balance` se recalcula en cascada al publicar o modificar
