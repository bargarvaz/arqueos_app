// Página de verificación OTP — Paso 2 del login ETV
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mail, RefreshCw } from 'lucide-react';

import authService from '@/services/authService';
import { useAuthStore } from '@/store/authStore';
import { getErrorMessage } from '@/services/api';
import { ROUTES } from '@/utils/constants';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60; // segundos
const MAX_RESENDS = 3;

interface LocationState {
  session_token: string;
  email: string;
}

export default function MfaVerification() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useAuthStore();

  const state = location.state as LocationState | null;
  const email = state?.email ?? '';
  const sessionToken = state?.session_token ?? '';

  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [resendCount, setResendCount] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Si no hay state válido, redirigir al login
  useEffect(() => {
    if (!email || !sessionToken) {
      navigate(ROUTES.EXTERNAL_LOGIN, { replace: true });
    }
  }, [email, sessionToken, navigate]);

  // Timer del cooldown de reenvío
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  // Auto-focus al primer input
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleOtpChange = (index: number, value: string) => {
    if (!value.match(/^\d*$/)) return; // Solo dígitos

    const newOtp = [...otp];
    newOtp[index] = value.slice(-1); // Solo el último carácter
    setOtp(newOtp);
    setError('');

    // Auto-avanzar al siguiente input
    if (value && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit si se completaron todos los dígitos
    const complete = newOtp.join('');
    if (complete.length === OTP_LENGTH && !newOtp.includes('')) {
      handleVerify(complete);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = useCallback(
    async (code?: string) => {
      const otpCode = code ?? otp.join('');
      if (otpCode.length !== OTP_LENGTH) {
        setError('Ingresa los 6 dígitos del código.');
        return;
      }

      setIsVerifying(true);
      setError('');

      try {
        const response = await authService.loginExternalStep2(email, otpCode, sessionToken);
        const me = await authService.getMe();
        setUser(me);

        if (response.must_change_password) {
          navigate(ROUTES.CHANGE_PASSWORD, { replace: true });
        } else {
          navigate(ROUTES.ETV_VAULTS, { replace: true });
        }
      } catch (err) {
        setError(getErrorMessage(err));
        setOtp(Array(OTP_LENGTH).fill(''));
        inputRefs.current[0]?.focus();
      } finally {
        setIsVerifying(false);
      }
    },
    [email, otp, sessionToken, navigate, setUser],
  );

  const handleResend = async () => {
    if (cooldown > 0 || resendCount >= MAX_RESENDS || isResending) return;

    setIsResending(true);
    setError('');

    try {
      await authService.resendOtp(email, sessionToken);
      setResendCount((c) => c + 1);
      setCooldown(RESEND_COOLDOWN);
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsResending(false);
    }
  };

  const isLocked = resendCount >= MAX_RESENDS;

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-full mb-4">
            <Mail className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">Verificación</h1>
          <p className="text-text-secondary text-sm mt-1">
            Ingresa el código de 6 dígitos enviado a
          </p>
          <p className="font-medium text-text-primary text-sm">{email}</p>
        </div>

        <div className="card">
          <div className="space-y-6">
            {/* Inputs del OTP */}
            <div className="flex justify-center gap-3">
              {Array.from({ length: OTP_LENGTH }).map((_, i) => (
                <input
                  key={i}
                  ref={(el) => (inputRefs.current[i] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={otp[i]}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  className={`
                    w-12 h-12 text-center text-xl font-bold rounded border-2
                    focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent
                    ${error ? 'border-status-error' : 'border-border'}
                    ${otp[i] ? 'bg-primary text-white border-primary' : 'bg-white text-text-primary'}
                  `}
                  disabled={isVerifying}
                />
              ))}
            </div>

            {/* Error */}
            {error && (
              <div className="bg-status-error-light border border-status-error rounded p-3">
                <p className="text-status-error text-sm text-center">{error}</p>
              </div>
            )}

            {/* Botón de verificar */}
            <button
              onClick={() => handleVerify()}
              disabled={isVerifying || otp.join('').length !== OTP_LENGTH}
              className="btn-primary w-full"
            >
              {isVerifying ? 'Verificando...' : 'Verificar código'}
            </button>

            {/* Reenvío */}
            <div className="text-center">
              {isLocked ? (
                <p className="text-status-error text-sm">
                  Demasiados intentos. Inténtelo de nuevo más tarde.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={cooldown > 0 || isResending}
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline
                             disabled:text-text-muted disabled:no-underline disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isResending ? 'animate-spin' : ''}`} />
                  {cooldown > 0
                    ? `Reenviar en ${cooldown}s`
                    : isResending
                      ? 'Enviando...'
                      : 'Reenviar código'}
                </button>
              )}

              {resendCount > 0 && !isLocked && (
                <p className="text-text-muted text-xs mt-1">
                  Reenvíos usados: {resendCount}/{MAX_RESENDS}
                </p>
              )}
            </div>

            <p className="text-text-muted text-xs text-center">
              El código expira en 5 minutos.
            </p>
          </div>
        </div>

        <div className="text-center mt-4">
          <a href={ROUTES.EXTERNAL_LOGIN} className="text-text-muted text-xs hover:text-primary">
            ← Volver al inicio de sesión
          </a>
        </div>
      </div>
    </div>
  );
}
