// Vista de asignaciones por bóveda (admin) — quién tiene acceso a cada bóveda
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Vault as VaultIcon, Users as UsersIcon } from 'lucide-react';

import userService, {
  type VaultAssignmentRow,
  type VaultAssignmentUser,
} from '@/services/userService';
import { getErrorMessage } from '@/services/api';

interface Props {
  open: boolean;
  onClose: () => void;
}

const SUBROLE_LABEL: Record<string, string> = {
  gerente: 'Gerente',
  tesorero: 'Tesorero',
};

function UserPill({ user, badge }: { user: VaultAssignmentUser; badge?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-surface text-xs">
      <span className="font-medium text-text-primary">{user.full_name}</span>
      <span className="text-text-muted">·</span>
      <span className="font-mono text-[10px] text-text-secondary">{user.email}</span>
      {user.etv_subrole && (
        <span className="text-[10px] text-text-muted capitalize">
          {SUBROLE_LABEL[user.etv_subrole] ?? user.etv_subrole}
        </span>
      )}
      {badge && (
        <span className="badge-info text-[10px]">{badge}</span>
      )}
    </span>
  );
}

export default function VaultAssignmentsModal({ open, onClose }: Props) {
  const [rows, setRows] = useState<VaultAssignmentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setError('');
    userService
      .getVaultAssignments()
      .then((data) => {
        if (alive) setRows(data);
      })
      .catch((err) => {
        if (alive) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!includeInactive && !r.vault_is_active) return false;
      if (!q) return true;
      if (r.vault_code.toLowerCase().includes(q)) return true;
      if (r.vault_name.toLowerCase().includes(q)) return true;
      const allUsers = [
        ...(r.manager ? [r.manager] : []),
        ...(r.treasurer ? [r.treasurer] : []),
        ...r.users,
      ];
      return allUsers.some(
        (u) =>
          u.full_name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q),
      );
    });
  }, [rows, search, includeInactive]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-4">
      <div className="bg-background rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-elevated">
        <div className="flex items-center justify-between p-5 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg grid place-items-center bg-primary/10 text-primary">
              <UsersIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text-primary">
                Asignaciones por bóveda
              </h2>
              <p className="text-xs text-text-muted">
                Quién tiene acceso a cada bóveda (gerente, tesorero y otros ETV asignados)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary p-1 rounded-md hover:bg-surface"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-border flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
            <input
              type="text"
              className="input pl-9 text-sm"
              placeholder="Buscar bóveda o usuario…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="rounded"
            />
            Incluir inactivas
          </label>
          <span className="text-xs text-text-muted ml-auto">
            {filtered.length} bóveda{filtered.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {error && (
            <div className="bg-status-error-light border border-status-error rounded-lg p-3 text-sm text-status-error">
              {error}
            </div>
          )}
          {loading ? (
            <p className="text-center text-text-muted text-sm py-12">
              Cargando…
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-text-muted text-sm py-12">
              {search
                ? 'Sin coincidencias.'
                : 'No hay bóvedas configuradas.'}
            </p>
          ) : (
            filtered.map((r) => {
              // Marcar manager/treasurer dentro de la lista de users (puede
              // que aparezcan duplicados). Usamos un set de ids ya mostrados.
              const shownIds = new Set<number>();
              if (r.manager) shownIds.add(r.manager.id);
              if (r.treasurer) shownIds.add(r.treasurer.id);
              const otherUsers = r.users.filter(
                (u) => !shownIds.has(u.id),
              );
              return (
                <div
                  key={r.vault_id}
                  className="border border-border rounded-xl p-4 bg-background"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <VaultIcon className="w-4 h-4 text-text-muted" />
                    <span className="font-mono font-semibold text-primary">
                      {r.vault_code}
                    </span>
                    <span className="text-text-muted">·</span>
                    <span className="font-medium text-text-primary">
                      {r.vault_name}
                    </span>
                    {!r.vault_is_active && (
                      <span className="badge-neutral ml-1">Inactiva</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {r.manager && (
                      <UserPill user={r.manager} badge="Gerente" />
                    )}
                    {r.treasurer && r.treasurer.id !== r.manager?.id && (
                      <UserPill user={r.treasurer} badge="Tesorero" />
                    )}
                    {otherUsers.map((u) => (
                      <UserPill key={u.id} user={u} />
                    ))}
                    {!r.manager && !r.treasurer && otherUsers.length === 0 && (
                      <span className="text-xs text-text-muted italic">
                        Sin usuarios asignados
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
