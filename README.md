# Sistema de Gestión de Arqueos Bancarios

Plataforma web interna para digitalizar el registro, validación y consulta de arqueos de bóvedas bancarias.

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Backend | Python 3.11 + FastAPI |
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS |
| Base de datos | PostgreSQL 16 |
| Almacenamiento | MinIO |
| Contenedores | Docker + Docker Compose |
| Autenticación | JWT (access 15min + refresh 24h) + Email OTP (ETVs) |

## Requisitos previos

- Docker Desktop instalado y en ejecución
- Git

## Inicio rápido

1. **Clonar y configurar variables de entorno:**
   ```bash
   git clone https://github.com/Bargarvaz/arqueos_app.git
   cd arqueos_app
   cp .env.example .env
   # Editar .env con valores reales
   ```

2. **Levantar todos los servicios:**
   ```bash
   docker compose up -d --build
   ```

3. **Ejecutar migraciones de base de datos:**
   ```bash
   docker compose exec backend alembic upgrade head
   ```

4. **Sembrar catálogos iniciales:**
   ```bash
   docker compose exec backend python scripts/seed_catalogs.py
   ```

5. **Crear primer usuario admin:**
   ```bash
   docker compose exec backend python scripts/create_admin.py
   ```

6. **Acceder a la aplicación:**
   - Frontend: http://localhost
   - API Docs (solo dev): http://localhost:8000/docs
   - MinIO Console: http://localhost:9001

## Portales de acceso

| Portal | URL | Usuarios |
|--------|-----|---------|
| Usuarios internos | http://localhost/internal/login | Admin, Operaciones, Ciencia de Datos |
| ETVs | http://localhost/external/login | Empresas transportadoras de valores |

## Roles de usuario

| Rol | Descripción |
|-----|-------------|
| `admin` | Control total del sistema |
| `operations` | Monitoreo, reportes de error, descargas |
| `data_science` | Consulta, filtrado, descarga de datos |
| `etv` | Captura y modificación de arqueos |

## Desarrollo local

### Backend (sin Docker)
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend (sin Docker)
```bash
cd frontend
npm install
npm run dev
```

### Ejecutar tests
```bash
cd backend
pytest
```

## Estructura del proyecto

```
arqueos_app/
├── docker-compose.yml
├── .env.example
├── backend/             # FastAPI + SQLAlchemy
│   ├── app/
│   │   ├── auth/       # Autenticación JWT + OTP
│   │   ├── users/      # Gestión de usuarios
│   │   ├── vaults/     # Bóvedas
│   │   ├── arqueos/    # Core del sistema
│   │   ├── modifications/
│   │   ├── catalogs/
│   │   ├── notifications/
│   │   ├── documents/  # MinIO
│   │   ├── reports/
│   │   ├── dashboard/
│   │   ├── audit/
│   │   └── common/
│   └── alembic/        # Migraciones
├── frontend/            # React + Vite + TypeScript
│   └── src/
│       ├── pages/
│       ├── layouts/
│       ├── components/
│       ├── hooks/
│       ├── services/
│       ├── store/
│       └── utils/
└── docs/               # Documentación técnica
```

## Etapas de desarrollo

1. ✅ Infraestructura y autenticación
2. 🔄 Catálogos y bóvedas
3. ⏳ Módulo de arqueos (captura y publicación)
4. ⏳ Módulo de modificaciones
5. ⏳ Documentos PDF (MinIO)
6. ⏳ Dashboard y reportes
7. ⏳ Notificaciones y reporte de errores
8. ⏳ Explorador y panel admin
9. ⏳ QA, hardening y documentación

## Seguridad

- JWT con access token de 15 minutos y refresh token HttpOnly
- MFA por email OTP para usuarios ETV (código 6 dígitos, expira en 5 min)
- Cambio de contraseña obligatorio en primer login
- Audit log completo de toda acción significativa
- Soft deletes — nada se elimina físicamente
- Rate limiting en endpoints de autenticación
- Headers de seguridad (X-Frame-Options, CSP, etc.)
- CORS con whitelist estricta

## Variables de entorno requeridas

Ver `.env.example` para la referencia completa.
