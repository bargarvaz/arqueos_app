// Página de login para usuarios internos (admin, operations, data_science)
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock } from 'lucide-react';

import authService from '@/services/authService';
import { useAuthStore } from '@/store/authStore';
import { getErrorMessage } from '@/services/api';
import { ROUTES } from '@/utils/constants';
import ForgotPasswordModal from '@/components/auth/ForgotPasswordModal';

const schema = z.object({
  email: z.string().email('Email inválido.'),
  password: z.string().min(1, 'La contraseña es requerida.'),
});

type FormData = z.infer<typeof schema>;

export default function InternalLogin() {
  const navigate = useNavigate();
  const { setUser } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState('');
  const [showForgot, setShowForgot] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setServerError('');
    try {
      const response = await authService.loginInternal(data.email, data.password);
      const me = await authService.getMe();
      setUser(me);

      if (response.must_change_password) {
        navigate(ROUTES.CHANGE_PASSWORD, { replace: true });
      } else {
        navigate(ROUTES.DASHBOARD, { replace: true });
      }
    } catch (err) {
      setServerError(getErrorMessage(err));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-alt px-4 relative overflow-hidden">
      {/* Glow decorativo de fondo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -left-40 w-[420px] h-[420px] rounded-full opacity-[0.08] blur-3xl"
        style={{ background: 'radial-gradient(circle, #4A5D23 0%, transparent 70%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-40 w-[420px] h-[420px] rounded-full opacity-[0.08] blur-3xl"
        style={{ background: 'radial-gradient(circle, #B8860B 0%, transparent 70%)' }}
      />

      <div className="w-full max-w-md relative">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-primary rounded-2xl mb-5 shadow-card">
            <Lock className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-[26px] font-semibold text-text-primary tracking-tight">
            Sistema de Arqueos
          </h1>
          <p className="text-text-secondary text-sm mt-1.5">
            Acceso para usuarios internos
          </p>
        </div>

        {/* Card de login */}
        <div className="card">
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="space-y-4">
              {/* Email */}
              <div>
                <label className="label" htmlFor="email">
                  Correo electrónico
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  className={errors.email ? 'input-error' : 'input'}
                  placeholder="usuario@empresa.com"
                  {...register('email')}
                />
                {errors.email && (
                  <p className="text-status-error text-xs mt-1">{errors.email.message}</p>
                )}
              </div>

              {/* Contraseña */}
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
                <div className="text-right mt-2">
                  <button
                    type="button"
                    onClick={() => setShowForgot(true)}
                    className="text-xs text-primary hover:underline focus:outline-none"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
              </div>

              {/* Error del servidor */}
              {serverError && (
                <div className="bg-status-error-light border border-status-error rounded p-3">
                  <p className="text-status-error text-sm">{serverError}</p>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary w-full mt-2"
              >
                {isSubmitting ? 'Ingresando...' : 'Ingresar'}
              </button>
            </div>
          </form>
        </div>

        <p className="text-center text-text-muted text-xs mt-6">
          ¿Eres ETV?{' '}
          <a href={ROUTES.EXTERNAL_LOGIN} className="text-primary hover:underline">
            Accede aquí
          </a>
        </p>
      </div>

      <ForgotPasswordModal
        open={showForgot}
        onClose={() => setShowForgot(false)}
        accent="primary"
      />
    </div>
  );
}
