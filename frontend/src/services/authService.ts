// Servicio de autenticación: login, OTP, logout, cambio de contraseña

import api, { setAuthSession, clearAuthSession } from './api';

export interface LoginResponse {
  access_token: string;
  token_type: string;
  session_id: string;
  must_change_password: boolean;
}

export interface MeResponse {
  id: number;
  email: string;
  full_name: string;
  role: string;
  user_type: string;
  must_change_password: boolean;
  mfa_enabled: boolean;
  company_id: number | null;
  empresa_id: number | null;
  puesto: string | null;
  etv_subrole: 'gerente' | 'tesorero' | null;
}

export interface OtpStep1Response {
  session_token?: string;
  message?: string;
  // MFA desactivado: se devuelven tokens directamente
  access_token?: string;
  token_type?: string;
  session_id?: string;
  must_change_password?: boolean;
}

const authService = {
  /** Login para usuarios internos (admin, operations, data_science). */
  loginInternal: async (email: string, password: string): Promise<LoginResponse> => {
    const { data } = await api.post<LoginResponse>('/auth/internal/login', { email, password });
    setAuthSession(data.access_token, data.session_id);
    return data;
  },

  /** Paso 1 del login ETV: valida credenciales, envía OTP (o retorna tokens si MFA está desactivado). */
  loginExternalStep1: async (email: string, password: string): Promise<OtpStep1Response> => {
    const { data } = await api.post<OtpStep1Response>('/auth/external/login', { email, password });
    // Cuando MFA está desactivado el backend retorna el token directamente
    if (data.access_token && data.session_id) {
      setAuthSession(data.access_token, data.session_id);
    }
    return data;
  },

  /** Paso 2 del login ETV: verifica OTP y devuelve tokens. */
  loginExternalStep2: async (
    email: string,
    otp_code: string,
    session_token: string,
  ): Promise<LoginResponse> => {
    const { data } = await api.post<LoginResponse>('/auth/external/verify-otp', {
      email,
      otp_code,
      session_token,
    });
    setAuthSession(data.access_token, data.session_id);
    return data;
  },

  /** Reenvía el OTP. */
  resendOtp: async (email: string, session_token: string): Promise<{ message: string }> => {
    const { data } = await api.post('/auth/external/resend-otp', { email, session_token });
    return data;
  },

  /** Cierra sesión y limpia los datos de la pestaña actual. */
  logout: async (): Promise<void> => {
    try {
      await api.post('/auth/logout');
    } finally {
      clearAuthSession();
    }
  },

  /** Obtiene el perfil del usuario autenticado. */
  getMe: async (): Promise<MeResponse> => {
    const { data } = await api.get<MeResponse>('/auth/me');
    return data;
  },

  /** Cambia la contraseña del usuario autenticado. */
  changePassword: async (
    current_password: string,
    new_password: string,
    confirm_password: string,
  ): Promise<void> => {
    await api.post('/auth/change-password', {
      current_password,
      new_password,
      confirm_password,
    });
  },

  /** Lista las sesiones activas del usuario actual. */
  listSessions: async (): Promise<AuthSession[]> => {
    const { data } = await api.get<AuthSession[]>('/auth/sessions');
    return data;
  },

  /** Revoca una sesión por id. No permite revocar la sesión actual. */
  revokeSession: async (session_id: string): Promise<void> => {
    await api.post(`/auth/sessions/${session_id}/revoke`);
  },
};

export interface AuthSession {
  session_id: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  last_used_at: string;
  expires_at: string;
  is_current: boolean;
}

export default authService;
