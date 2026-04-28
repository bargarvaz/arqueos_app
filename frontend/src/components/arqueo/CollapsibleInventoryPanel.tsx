// Panel colapsable de inventario por denominación con indicador visual claro
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { DENOMINATIONS } from '@/utils/constants';

const formatMXN = (v: string | number) =>
  parseFloat(String(v) || '0').toLocaleString('es-MX', { minimumFractionDigits: 2 });

interface Props {
  title: string;
  inventory: Record<string, number>;
  unmigrated: boolean;
  defaultOpen?: boolean;
}

export default function CollapsibleInventoryPanel({
  title,
  inventory,
  unmigrated,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const hasNegative = Object.values(inventory).some((v) => v < 0);

  return (
    <div className="mb-4 card p-0 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-3 hover:bg-surface/40 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="w-4 h-4 text-text-muted" />
          ) : (
            <ChevronRight className="w-4 h-4 text-text-muted" />
          )}
          <span className="text-sm font-medium text-text-primary">{title}</span>
          <span className="text-xs text-primary hover:underline">
            {open ? '(ocultar)' : '(ver detalle)'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {hasNegative && (
            <span className="badge badge-error text-xs">
              Hay denominaciones en negativo
            </span>
          )}
          {unmigrated && (
            <span className="badge badge-warning text-xs">
              Bóveda sin migrar — validación relajada
            </span>
          )}
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-8 gap-2">
          {DENOMINATIONS.map((d) => {
            const v = inventory[d.key] ?? 0;
            const negative = v < 0;
            return (
              <div
                key={d.key}
                className={`text-xs px-2 py-1 rounded border ${
                  negative
                    ? 'border-error bg-error/10 text-error'
                    : 'border-border bg-surface text-text-secondary'
                }`}
              >
                <div className="text-[10px] text-text-muted">{d.label}</div>
                <div className="font-mono">${formatMXN(v)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
