// Panel de sesiones activas del usuario actual
import { useEffect, useState } from 'react';
import { Monitor, Smartphone, Globe, X } from 'lucide-react';

import authService, { type AuthSession } from '@/services/authService';
import { getErrorMessage } from '@/services/api';

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'hace unos segundos';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function deviceIcon(ua: string | null) {
  if (!ua) return <Globe className="w-4 h-4 text-text-muted" />;
  if (/Mobi|Android|iPhone|iPad/i.test(ua)) return <Smartphone className="w-4 h-4 text-text-muted" />;
  return <Monitor className="w-4 h-4 text-text-muted" />;
}

function shortUA(ua: string | null): string {
  if (!ua) return 'Desconocido';
  // Heurística simple: extraer browser/OS principales
  const browserMatch = ua.match(/(Chrome|Firefox|Safari|Edge|Opera)\/(\d+)/);
  const osMatch =
    ua.match(/Windows NT [\d.]+/) ||
    ua.match(/Mac OS X [\d_.]+/) ||
    ua.match(/Android [\d.]+/) ||
    ua.match(/iPhone OS [\d_]+/) ||
    ua.match(/Linux/);
  const browser = browserMatch ? `${browserMatch[1]} ${browserMatch[2]}` : 'Navegador';
  const os = osMatch ? osMatch[0].replace(/_/g, '.') : 'SO desconocido';
  return `${browser} · ${os}`;
}

export default function MySessions() {
  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = async () => {
    setError('');
    try {
      const data = await authService.listSessions();
      setSessions(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleRevoke = async (s: AuthSession) => {
    if (s.is_current) return;
    if (!confirm(`¿Cerrar la sesión de ${shortUA(s.user_agent)} (${s.ip_address ?? 'IP desconocida'})?`)) {
      return;
    }
    setRevoking(s.session_id);
    try {
      await authService.revokeSession(s.session_id);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-text-primary">Mis sesiones activas</h1>
        <p className="text-sm text-text-muted mt-1">
          Aquí ves todas las pestañas y dispositivos donde tu cuenta está abierta. Puedes
          cerrar cualquier sesión que no reconozcas; la sesión actual no se puede cerrar
          desde aquí (usa el botón de cerrar sesión).
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-error/10 border border-error rounded-lg text-error text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center text-sm text-text-muted py-12">
          No hay sesiones activas registradas.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted border-b border-border bg-surface">
                <th className="px-4 py-2">Dispositivo</th>
                <th className="px-4 py-2">IP</th>
                <th className="px-4 py-2">Iniciada</th>
                <th className="px-4 py-2">Última actividad</th>
                <th className="px-4 py-2">Expira</th>
                <th className="px-4 py-2 w-24" />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr
                  key={s.session_id}
                  className={`border-b border-border/50 ${
                    s.is_current ? 'bg-primary/5' : ''
                  }`}
                >
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      {deviceIcon(s.user_agent)}
                      <span>{shortUA(s.user_agent)}</span>
                      {s.is_current && (
                        <span className="badge badge-success text-xs">Esta pestaña</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-text-muted font-mono text-xs">
                    {s.ip_address ?? '—'}
                  </td>
                  <td className="px-4 py-2 text-text-muted text-xs" title={formatDate(s.created_at)}>
                    {formatRelative(s.created_at)}
                  </td>
                  <td className="px-4 py-2 text-text-muted text-xs" title={formatDate(s.last_used_at)}>
                    {formatRelative(s.last_used_at)}
                  </td>
                  <td className="px-4 py-2 text-text-muted text-xs">
                    {formatDate(s.expires_at)}
                  </td>
                  <td className="px-4 py-2">
                    {!s.is_current && (
                      <button
                        type="button"
                        onClick={() => handleRevoke(s)}
                        disabled={revoking === s.session_id}
                        className="text-xs text-error hover:underline flex items-center gap-1 disabled:opacity-50"
                      >
                        <X className="w-3 h-3" />
                        {revoking === s.session_id ? 'Cerrando...' : 'Cerrar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
