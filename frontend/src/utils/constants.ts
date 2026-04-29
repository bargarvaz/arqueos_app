// Rutas de la aplicación
export const ROUTES = {
  // Auth
  EXTERNAL_LOGIN: '/external/login',
  INTERNAL_LOGIN: '/internal/login',
  MFA_VERIFY: '/external/verify',
  CHANGE_PASSWORD: '/change-password',

  // ETV
  ETV_VAULTS: '/etv/vaults',
  ETV_ARQUEO_FORM: '/etv/arqueo',
  ETV_ARQUEO_LIST: '/etv/arqueos',
  ETV_MODIFICATIONS: '/etv/modifications',
  ETV_NOTIFICATIONS: '/etv/notifications',
  ETV_ERROR_REPORTS: '/etv/error-reports',
  ETV_EXPLORER: '/etv/explorer',
  ETV_CLOSINGS: '/etv/saldos-finales',

  // Internal
  DASHBOARD: '/internal/dashboard',
  ARQUEO_EXPLORER: '/internal/arqueos',
  VAULT_DIRECTORY: '/internal/vaults',
  PERSONNEL_DIRECTORY: '/internal/personnel',
  ERROR_REPORTS: '/internal/error-reports',
  NOTIFICATIONS: '/internal/notifications',
  CLOSINGS: '/internal/saldos-finales',

  // Admin
  USER_MANAGEMENT: '/admin/users',
  CATALOG_MANAGER: '/admin/catalogs',
  AUDIT_LOG: '/admin/audit',

  // Perfil del usuario
  MY_SESSIONS: '/perfil/sesiones',
} as const;

// Denominaciones de billetes y monedas (en orden descendente)
export const DENOMINATIONS = [
  { key: 'bill_1000', label: '$1,000', multiplier: 1000, type: 'bill' },
  { key: 'bill_500', label: '$500', multiplier: 500, type: 'bill' },
  { key: 'bill_200', label: '$200', multiplier: 200, type: 'bill' },
  { key: 'bill_100', label: '$100', multiplier: 100, type: 'bill' },
  { key: 'bill_50', label: '$50', multiplier: 50, type: 'bill' },
  { key: 'bill_20', label: '$20', multiplier: 20, type: 'bill' },
  { key: 'coin_100', label: '$100 M', multiplier: 100, type: 'coin' },
  { key: 'coin_50', label: '$50 M', multiplier: 50, type: 'coin' },
  { key: 'coin_20', label: '$20 M', multiplier: 20, type: 'coin' },
  { key: 'coin_10', label: '$10 M', multiplier: 10, type: 'coin' },
  { key: 'coin_5', label: '$5 M', multiplier: 5, type: 'coin' },
  { key: 'coin_2', label: '$2 M', multiplier: 2, type: 'coin' },
  { key: 'coin_1', label: '$1 M', multiplier: 1, type: 'coin' },
  { key: 'coin_050', label: '$0.50', multiplier: 0.5, type: 'coin' },
  { key: 'coin_020', label: '$0.20', multiplier: 0.2, type: 'coin' },
  { key: 'coin_010', label: '$0.10', multiplier: 0.1, type: 'coin' },
] as const;

// Roles de usuario
export const USER_ROLES = {
  ADMIN: 'admin',
  OPERATIONS: 'operations',
  DATA_SCIENCE: 'data_science',
  ETV: 'etv',
} as const;

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];

// Estados de arqueo
export const ARQUEO_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  LOCKED: 'locked',
} as const;

// Paginación
export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const MAX_TOTAL_RECORDS = 10_000;

// Límite de certificados por arqueo
export const MAX_CERTIFICATES = 10;
export const MAX_CERTIFICATE_SIZE_MB = 10;

// Inactividad de sesión (en ms)
export const SESSION_INACTIVITY_MS = 60 * 60 * 1000; // 1 hora

// Autosave del draft (en ms)
export const DRAFT_AUTOSAVE_MS = 30_000; // 30 segundos

// Polling del dashboard y notificaciones (en ms)
export const POLLING_INTERVAL_MS = 30 * 60 * 1000; // 30 minutos
