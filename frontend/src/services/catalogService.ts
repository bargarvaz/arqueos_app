// Servicio de catálogos administrables
import api from './api';

export interface MovementType {
  id: number;
  name: string;
  description: string | null;
  is_active: boolean;
}

export interface ModificationReason {
  id: number;
  name: string;
  is_active: boolean;
}

export interface Holiday {
  id: number;
  holiday_date: string;
  name: string;
  is_active: boolean;
}

const catalogService = {
  // ─── Tipos de movimiento ─────────────────────────────────────────────────
  getMovementTypes: async (includeInactive = false): Promise<MovementType[]> => {
    const { data } = await api.get('/catalogs/movement-types', {
      params: { include_inactive: includeInactive },
    });
    return data;
  },

  createMovementType: async (name: string, description?: string): Promise<MovementType> => {
    const { data } = await api.post('/catalogs/movement-types', { name, description });
    return data;
  },

  updateMovementType: async (
    id: number,
    updates: Partial<{ name: string; description: string; is_active: boolean }>,
  ): Promise<MovementType> => {
    const { data } = await api.patch(`/catalogs/movement-types/${id}`, updates);
    return data;
  },

  // ─── Motivos de modificación ─────────────────────────────────────────────
  getModificationReasons: async (includeInactive = false): Promise<ModificationReason[]> => {
    const { data } = await api.get('/catalogs/modification-reasons', {
      params: { include_inactive: includeInactive },
    });
    return data;
  },

  createModificationReason: async (name: string): Promise<ModificationReason> => {
    const { data } = await api.post('/catalogs/modification-reasons', { name });
    return data;
  },

  updateModificationReason: async (
    id: number,
    updates: Partial<{ name: string; is_active: boolean }>,
  ): Promise<ModificationReason> => {
    const { data } = await api.patch(`/catalogs/modification-reasons/${id}`, updates);
    return data;
  },

  // ─── Días inhábiles ───────────────────────────────────────────────────────
  getHolidays: async (includeInactive = false): Promise<Holiday[]> => {
    const { data } = await api.get('/catalogs/holidays', {
      params: { include_inactive: includeInactive },
    });
    return data;
  },

  createHoliday: async (holiday_date: string, name: string): Promise<Holiday> => {
    const { data } = await api.post('/catalogs/holidays', { holiday_date, name });
    return data;
  },

  updateHoliday: async (
    id: number,
    updates: Partial<{ name: string; is_active: boolean }>,
  ): Promise<Holiday> => {
    const { data } = await api.patch(`/catalogs/holidays/${id}`, updates);
    return data;
  },
};

export default catalogService;
