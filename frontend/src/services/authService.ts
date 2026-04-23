// Servicio de autenticación: login, OTP, logout, cambio de contraseña

import api from './api';

export interface LoginResponse {
  access_token: string;
  token_type: string;
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
}

export interface OtpStep1Response {
  session_token: string;
  message: string;
}

const authService = {
  /** Login para usuarios internos (admin, operations, data_science). */
  loginInternal: async (email: string, password: string): Promise<LoginResponse> => {
    const { data } = await api.post<LoginResponse>('/auth/internal/login', { email, password });
    localStorage.setItem('access_token', data.access_token);
    return data;
  },

  /** Paso 1 del login ETV: valida credenciales, envía OTP. */
  loginExternalStep1: async (email: string, password: string): Promise<OtpStep1Response> => {
    const { data } = await api.post<OtpStep1Response>('/auth/external/login', { email, password });
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
    localStorage.setItem('access_token', data.access_token);
    return data;
  },

  /** Reenvía el OTP. */
  resendOtp: async (email: string, session_token: string): Promise<{ message: string }> => {
    const { data } = await api.post('/auth/external/resend-otp', { email, session_token });
    return data;
  },

  /** Cierra sesión y limpia el token local. */
  logout: async (): Promise<void> => {
    try {
      await api.post('/auth/logout');
    } finally {
      localStorage.removeItem('access_token');
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
};

export default authService;
