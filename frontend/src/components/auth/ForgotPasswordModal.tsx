// Modal para solicitar restablecer contraseña por correo
import { useState } from 'react';
import { Mail, X } from 'lucide-react';

import authService from '@/services/authService';
import { getErrorMessage } from '@/services/api';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Color de acento — primary para internos, secondary para ETV. */
  accent?: 'primary' | 'secondary';
}

export default function ForgotPasswordModal({
  open,
  onClose,
  accent = 'primary',
}: Props) {
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  if (!open) return null;

  const accentBtn = accent === 'secondary' ? 'btn-secondary' : 'btn-primary';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!email.trim()) {
      setError('Ingresa tu correo.');
      return;
    }
    setIsSending(true);
    try {
      const res = await authService.forgotPassword(email.trim().toLowerCase());
      setMessage(
        res.message ||
          'Si el correo está registrado, recibirás una contraseña temporal en unos minutos.',
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    setEmail('');
    setMessage('');
    setError('');
    setIsSending(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-xl w-full max-w-md shadow-elevated">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-lg grid place-items-center ${
                accent === 'secondary'
                  ? 'bg-secondary/15 text-secondary-dark'
                  : 'bg-primary/10 text-primary'
              }`}
            >
              <Mail className="w-5 h-5" />
            </div>
            <h2 className="text-base font-semibold text-text-primary">
              Restablecer contraseña
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="text-text-muted hover:text-text-primary p-1 rounded-md hover:bg-surface"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {message ? (
          <div className="p-6">
            <div className="bg-status-success-light border border-status-success rounded-lg p-4 mb-4">
              <p className="text-sm text-status-success">{message}</p>
            </div>
            <p className="text-xs text-text-muted mb-4">
              Revisa tu bandeja de entrada (y la carpeta de spam). Al iniciar
              sesión con la contraseña temporal, el sistema te pedirá
              establecer una nueva.
            </p>
            <button onClick={handleClose} className={`${accentBtn} w-full`}>
              Entendido
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <p className="text-sm text-text-secondary">
              Ingresa el correo asociado a tu cuenta. Te enviaremos una
              contraseña temporal y al iniciar sesión deberás cambiarla.
            </p>

            <div>
              <label className="label" htmlFor="forgot-email">
                Correo electrónico
              </label>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                autoFocus
                className={error ? 'input-error' : 'input'}
                placeholder="usuario@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {error && (
                <p className="text-status-error text-xs mt-1">{error}</p>
              )}
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={handleClose}
                className="btn-outline flex-1"
                disabled={isSending}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSending || !email.trim()}
                className={`${accentBtn} flex-1`}
              >
                {isSending ? 'Enviando...' : 'Enviar contraseña'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
