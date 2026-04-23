// Pantalla de cambio de contraseña obligatorio (must_change_password = true)
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Eye, EyeOff } from 'lucide-react';

import authService from '@/services/authService';
import { useAuthStore } from '@/store/authStore';
import { getErrorMessage } from '@/services/api';
import { ROUTES } from '@/utils/constants';

const PASSWORD_RULES = z
  .string()
  .min(12, 'Mínimo 12 caracteres.')
  .regex(/[A-Z]/, 'Debe incluir al menos una letra mayúscula.')
  .regex(/[a-z]/, 'Debe incluir al menos una letra minúscula.')
  .regex(/[0-9]/, 'Debe incluir al menos un número.')
  .regex(/[!@#$%^&*()_+\-=[\]{}|;':",./<>?]/, 'Debe incluir al menos un carácter especial.');

const schema = z
  .object({
    current_password: z.string().min(1, 'La contraseña actual es requerida.'),
    new_password: PASSWORD_RULES,
    confirm_password: z.string().min(1, 'Confirma la contraseña.'),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: 'Las contraseñas no coinciden.',
    path: ['confirm_password'],
  });

type FormData = z.infer<typeof schema>;

type FieldName = 'current_password' | 'new_password' | 'confirm_password';

export default function ChangePassword() {
  const navigate = useNavigate();
  const { user, setUser } = useAuthStore();
  const [serverError, setServerError] = useState('');
  const [show, setShow] = useState<Record<FieldName, boolean>>({
    current_password: false,
    new_password: false,
    confirm_password: false,
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setServerError('');
    try {
      await authService.changePassword(
        data.current_password,
        data.new_password,
        data.confirm_password,
      );
      // Recargar usuario para actualizar must_change_password
      const me = await authService.getMe();
      setUser(me);

      // Redirigir según tipo de usuario
      const redirect = me.user_type === 'external' ? ROUTES.ETV_VAULTS : ROUTES.DASHBOARD;
      navigate(redirect, { replace: true });
    } catch (err) {
      setServerError(getErrorMessage(err));
    }
  };

  const toggleShow = (field: FieldName) =>
    setShow((prev) => ({ ...prev, [field]: !prev[field] }));

  const fields: Array<{ name: FieldName; label: string; autocomplete: string }> = [
    { name: 'current_password', label: 'Contraseña actual', autocomplete: 'current-password' },
    { name: 'new_password', label: 'Nueva contraseña', autocomplete: 'new-password' },
    { name: 'confirm_password', label: 'Confirmar nueva contraseña', autocomplete: 'new-password' },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-secondary rounded-full mb-4">
            <KeyRound className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">Cambio de contraseña</h1>
          <p className="text-text-secondary text-sm mt-1">
            Hola {user?.full_name}. Debes establecer una nueva contraseña para continuar.
          </p>
        </div>

        <div className="card">
          <div className="bg-status-warning-light border border-status-warning rounded p-3 mb-5">
            <p className="text-status-warning text-sm font-medium">
              Esta acción es requerida. No puedes acceder al sistema hasta completarla.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            {fields.map(({ name, label, autocomplete }) => (
              <div key={name}>
                <label className="label" htmlFor={name}>
                  {label}
                </label>
                <div className="relative">
                  <input
                    id={name}
                    type={show[name] ? 'text' : 'password'}
                    autoComplete={autocomplete}
                    className={errors[name] ? 'input-error pr-10' : 'input pr-10'}
                    placeholder="••••••••"
                    // paste deshabilitado en campos de nueva contraseña
                    onPaste={name !== 'current_password' ? (e) => e.preventDefault() : undefined}
                    {...register(name)}
                  />
                  <button
                    type="button"
                    onClick={() => toggleShow(name)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                    tabIndex={-1}
                  >
                    {show[name] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors[name] && (
                  <p className="text-status-error text-xs mt-1">{errors[name]?.message}</p>
                )}
              </div>
            ))}

            {/* Requisitos */}
            <div className="bg-surface border border-border rounded p-3">
              <p className="text-text-secondary text-xs font-medium mb-1">Requisitos:</p>
              <ul className="text-text-muted text-xs space-y-0.5 list-disc list-inside">
                <li>Mínimo 12 caracteres</li>
                <li>Al menos una letra mayúscula</li>
                <li>Al menos una letra minúscula</li>
                <li>Al menos un número</li>
                <li>Al menos un carácter especial (!@#$%...)</li>
              </ul>
            </div>

            {serverError && (
              <div className="bg-status-error-light border border-status-error rounded p-3">
                <p className="text-status-error text-sm">{serverError}</p>
              </div>
            )}

            <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
              {isSubmitting ? 'Guardando...' : 'Establecer nueva contraseña'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
