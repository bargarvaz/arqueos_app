// Página de selección de bóvedas para el ETV
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import arqueoService, { VaultStatus } from '@/services/arqueoService';
import { ROUTES, ARQUEO_STATUS } from '@/utils/constants';

const STATUS_CONFIG: Record<
  string,
  { label: string; badgeClass: string }
> = {
  [ARQUEO_STATUS.DRAFT]: {
    label: 'Borrador',
    badgeClass: 'badge-warning',
  },
  [ARQUEO_STATUS.PUBLISHED]: {
    label: 'Publicado',
    badgeClass: 'badge-success',
  },
  [ARQUEO_STATUS.LOCKED]: {
    label: 'Bloqueado',
    badgeClass: 'badge-info',
  },
};

export default function EtvVaults() {
  const navigate = useNavigate();
  const [vaults, setVaults] = useState<VaultStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    arqueoService
      .getMyVaults()
      .then(setVaults)
      .catch(() => setError('No se pudieron cargar las bóvedas asignadas.'))
      .finally(() => setLoading(false));
  }, []);

  const handleSelectVault = (vs: VaultStatus) => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
    navigate(ROUTES.ETV_ARQUEO_FORM, {
      state: { vault: vs.vault, arqueo_date: today, header_id: vs.today_header_id },
    });
  };

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

  if (vaults.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-text-muted gap-2">
        <span className="text-4xl">🏦</span>
        <p className="text-sm">No tienes bóvedas asignadas. Contacta al administrador.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-text-primary">Mis Bóvedas</h1>
        <p className="text-sm text-text-muted mt-1">
          Selecciona una bóveda para capturar o revisar el arqueo del día.
        </p>
      </div>

      <div className="grid gap-4">
        {vaults.map((vs) => {
          const statusCfg = vs.today_status
            ? STATUS_CONFIG[vs.today_status]
            : null;
          const isLocked = vs.today_status === ARQUEO_STATUS.LOCKED;
          const isPublished = vs.today_status === ARQUEO_STATUS.PUBLISHED;

          return (
            <div
              key={vs.vault.id}
              className={`card p-5 flex items-center justify-between gap-4 ${
                isLocked ? 'opacity-60' : 'hover:shadow-md cursor-pointer'
              }`}
              onClick={() => !isLocked && handleSelectVault(vs)}
              role={isLocked ? undefined : 'button'}
              tabIndex={isLocked ? -1 : 0}
              onKeyDown={(e) => {
                if (!isLocked && (e.key === 'Enter' || e.key === ' ')) {
                  handleSelectVault(vs);
                }
              }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-text-primary truncate">
                    {vs.vault.vault_name}
                  </span>
                  <span className="text-xs text-text-muted font-mono bg-surface px-2 py-0.5 rounded">
                    {vs.vault.vault_code}
                  </span>
                  {statusCfg && (
                    <span className={`badge ${statusCfg.badgeClass} text-xs`}>
                      {statusCfg.label}
                    </span>
                  )}
                  {!vs.today_status && (
                    <span className="badge badge-neutral text-xs">Sin arqueo</span>
                  )}
                </div>
                {vs.today_closing_balance && (
                  <p className="text-xs text-text-muted mt-1">
                    Saldo cierre:{' '}
                    <span className="font-medium text-text-secondary">
                      ${parseFloat(vs.today_closing_balance).toLocaleString('es-MX', {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </p>
                )}
              </div>

              {!isLocked && (
                <span className="text-text-muted text-sm shrink-0">
                  {isPublished ? 'Ver detalle →' : 'Capturar →'}
                </span>
              )}
              {isLocked && (
                <span className="text-text-muted text-sm shrink-0">Bloqueado</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
