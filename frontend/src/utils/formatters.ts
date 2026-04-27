// Formateo de moneda, fechas y números para el sistema de arqueos

const CURRENCY_FORMATTER = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const NUMBER_FORMATTER = new Intl.NumberFormat('es-MX', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const DATE_FORMATTER = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const DATETIME_FORMATTER = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Formatea un número como moneda MXN: $1,234.56 */
export function formatCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '$0.00';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '$0.00';
  return CURRENCY_FORMATTER.format(num);
}

/** Formatea un número con 2 decimales: 1,234.56 */
export function formatNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '0.00';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0.00';
  return NUMBER_FORMATTER.format(num);
}

/** Formatea una fecha ISO a formato local CDMX: 22/04/2026 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    // YYYY-MM-DD: parsear directamente para evitar que new Date() lo trate como UTC
    // y lo desplace un día atrás en zonas UTC-N.
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [y, m, d] = dateStr.split('-');
      return `${d}/${m}/${y}`;
    }
    return DATE_FORMATTER.format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

/** Formatea una fecha ISO a fecha + hora local CDMX: 22/04/2026 14:30 */
export function formatDatetime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return DATETIME_FORMATTER.format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

/** Convierte 'draft' | 'published' | 'locked' a etiqueta en español */
export function formatArqueoStatus(status: string): string {
  const map: Record<string, string> = {
    draft: 'Borrador',
    published: 'Publicado',
    locked: 'Bloqueado',
  };
  return map[status] ?? status;
}

/** Convierte un rol de usuario a su etiqueta en español */
export function formatUserRole(role: string): string {
  const map: Record<string, string> = {
    admin: 'Administrador',
    operations: 'Operaciones',
    data_science: 'Ciencia de Datos',
    etv: 'ETV',
  };
  return map[role] ?? role;
}
