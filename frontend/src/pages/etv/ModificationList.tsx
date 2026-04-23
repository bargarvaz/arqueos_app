// Lista de arqueos modificables para el ETV
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import modificationService, { ModifiableArqueo } from '@/services/modificationService';
import { ROUTES } from '@/utils/constants';

export default function ModificationList() {
  const navigate = useNavigate();
  const [arqueos, setArqueos] = useState<ModifiableArqueo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    modificationService
      .getMyModifiableArqueos()
      .then(setArqueos)
      .catch(() => setError('No se pudieron cargar los arqueos modificables.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-error/10 border border-error rounded-lg text-error text-sm">
        {error}
      </div>
    );
  }

  const formatMXN = (v: string) =>
    parseFloat(v).toLocaleString('es-MX', { minimumFractionDigits: 2 });

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-text-primary">Modificaciones</h1>
        <p className="text-sm text-text-muted mt-1">
          Arqueos publicados que puedes modificar dentro del periodo de gracia.
        </p>
      </div>

      {arqueos.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-text-muted gap-2">
          <p className="text-sm">No hay arqueos disponibles para modificar.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted border-b border-border bg-surface">
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2">Bóveda ID</th>
                <th className="px-4 py-2">Apertura</th>
                <th className="px-4 py-2">Cierre</th>
                <th className="px-4 py-2">Vence gracia</th>
                <th className="px-4 py-2">Días restantes</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {arqueos.map((a) => (
                <tr
                  key={a.header_id}
                  className="border-b border-border/50 hover:bg-surface/40"
                >
                  <td className="px-4 py-2 font-medium">
                    {new Date(a.arqueo_date + 'T12:00:00').toLocaleDateString('es-MX')}
                  </td>
                  <td className="px-4 py-2 text-text-muted">{a.vault_id}</td>
                  <td className="px-4 py-2">${formatMXN(a.opening_balance)}</td>
                  <td className="px-4 py-2">${formatMXN(a.closing_balance)}</td>
                  <td className="px-4 py-2 text-text-muted">
                    {new Date(a.grace_deadline + 'T12:00:00').toLocaleDateString('es-MX')}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`badge text-xs ${
                        (a.days_remaining ?? 0) <= 3
                          ? 'badge-error'
                          : (a.days_remaining ?? 0) <= 7
                          ? 'badge-warning'
                          : 'badge-success'
                      }`}
                    >
                      {a.days_remaining} días
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <button
                      className="btn btn-outline text-xs py-1"
                      onClick={() =>
                        navigate(ROUTES.ETV_MODIFICATIONS + `/${a.header_id}`)
                      }
                    >
                      Modificar →
                    </button>
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
