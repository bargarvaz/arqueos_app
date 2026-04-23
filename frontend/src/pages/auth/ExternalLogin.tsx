// Página de login para usuarios ETV — Paso 1: credenciales
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Shield } from 'lucide-react';

import authService from '@/services/authService';
import { useAuthStore } from '@/store/authStore';
import { getErrorMessage } from '@/services/api';
import { ROUTES } from '@/utils/constants';

const schema = z.object({
  email: z.string().email('Email inválido.'),
  password: z.string().min(1, 'La contraseña es requerida.'),
});

type FormData = z.infer<typeof schema>;

export default function ExternalLogin() {
  const navigate = useNavigate();
  const { setUser } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setServerError('');
    try {
      const response = await authService.loginExternalStep1(data.email, data.password);

      // MFA desactivado: el backend retorna el token directamente
      if (response.access_token) {
        const me = await authService.getMe();
        setUser(me);
        if (response.must_change_password) {
          navigate(ROUTES.CHANGE_PASSWORD, { replace: true });
        } else {
          navigate(ROUTES.ETV_VAULTS, { replace: true });
        }
        return;
      }

      // Flujo normal: navegar al paso 2 (OTP)
      navigate(ROUTES.MFA_VERIFY, {
        state: { session_token: response.session_token, email: data.email },
        replace: true,
      });
    } catch (err) {
      setServerError(getErrorMessage(err));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-secondary rounded-full mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">Sistema de Arqueos</h1>
          <p className="text-text-secondary text-sm mt-1">Acceso para empresas ETV</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="space-y-4">
              <div>
                <label className="label" htmlFor="email">
                  Correo electrónico
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  className={errors.email ? 'input-error' : 'input'}
                  placeholder="usuario@etv.com"
                  {...register('email')}
                />
                {errors.email && (
                  <p className="text-status-error text-xs mt-1">{errors.email.message}</p>
                )}
              </div>

              <div>
                <label className="label" htmlFor="password">
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    className={errors.password ? 'input-error pr-10' : 'input pr-10'}
                    placeholder="••••••••"
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-status-error text-xs mt-1">{errors.password.message}</p>
                )}
              </div>

              {serverError && (
                <div className="bg-status-error-light border border-status-error rounded p-3">
                  <p className="text-status-error text-sm">{serverError}</p>
                </div>
              )}

              <button type="submit" disabled={isSubmitting} className="btn-primary w-full mt-2">
                {isSubmitting ? 'Verificando...' : 'Continuar'}
              </button>
            </div>
          </form>

          <p className="text-center text-text-muted text-xs mt-4">
            Se enviará un código de verificación a tu correo.
          </p>
        </div>

        <p className="text-center text-text-muted text-xs mt-6">
          ¿Eres usuario interno?{' '}
          <a href={ROUTES.INTERNAL_LOGIN} className="text-primary hover:underline">
            Accede aquí
          </a>
        </p>
      </div>
    </div>
  );
}
