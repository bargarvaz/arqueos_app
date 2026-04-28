// Grid editable para capturar/mostrar denominaciones (billetes y monedas)
import { DENOMINATIONS } from '@/utils/constants';

export type DenominationKey =
  | 'bill_1000' | 'bill_500' | 'bill_200' | 'bill_100' | 'bill_50' | 'bill_20'
  | 'coin_100' | 'coin_50' | 'coin_20' | 'coin_10' | 'coin_5' | 'coin_2'
  | 'coin_1' | 'coin_050' | 'coin_020' | 'coin_010';

export type DenominationValues = Record<DenominationKey, string>;

const formatMXN = (v: string | number) =>
  parseFloat(String(v) || '0').toLocaleString('es-MX', { minimumFractionDigits: 2 });

interface Props {
  /** Prefijo para nombrar los campos en el `value`. P.ej. 'initial_' para `initial_bill_1000`. */
  prefix?: string;
  /** Valores actuales por campo (con prefijo si aplica). */
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  /** Inventario disponible por denominación (sin prefijo). Si se pasa, valida que value <= disponible y resalta excesos. */
  available?: Partial<Record<DenominationKey, string>>;
  disabled?: boolean;
  compact?: boolean; // tamaño reducido para edición inline
}

export function emptyDenominations(prefix = ''): Record<string, string> {
  return DENOMINATIONS.reduce<Record<string, string>>((acc, d) => {
    acc[`${prefix}${d.key}`] = '0';
    return acc;
  }, {});
}

export default function DenominationGrid({
  prefix = '',
  value,
  onChange,
  available,
  disabled = false,
  compact = false,
}: Props) {
  const total = DENOMINATIONS.reduce(
    (s, d) => s + (parseFloat(value[`${prefix}${d.key}`] || '0') || 0),
    0,
  );

  const billsAndCoins: Array<['bill' | 'coin', string]> = [
    ['bill', 'Billetes'],
    ['coin', 'Monedas'],
  ];

  const handleChange = (key: string, raw: string) => {
    onChange({ ...value, [key]: raw });
  };

  return (
    <div className="space-y-3">
      {billsAndCoins.map(([type, label]) => (
        <div key={type}>
          <p className="text-xs font-medium text-text-muted mb-1">{label}</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {DENOMINATIONS.filter((d) => d.type === type).map((d) => {
              const fieldKey = `${prefix}${d.key}`;
              const current = value[fieldKey] || '0';
              const denomKey = d.key as DenominationKey;
              const avail = available?.[denomKey];
              const exceeds =
                avail !== undefined &&
                parseFloat(current || '0') > parseFloat(avail || '0');
              return (
                <div key={d.key}>
                  <label className="text-xs text-text-muted block">{d.label}</label>
                  <input
                    type="number"
                    step={d.multiplier}
                    min="0"
                    disabled={disabled}
                    value={current}
                    onChange={(e) => handleChange(fieldKey, e.target.value)}
                    className={`w-full text-right ${
                      compact ? 'input text-xs py-1' : 'input text-sm'
                    } ${exceeds ? 'border-error text-error' : ''}`}
                  />
                  {avail !== undefined && (
                    <span
                      className={`text-[10px] block text-right mt-0.5 ${
                        exceeds ? 'text-error' : 'text-text-muted/70'
                      }`}
                    >
                      Disp: ${formatMXN(avail)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="pt-2 border-t border-border flex justify-end">
        <span className="text-sm">
          Total:{' '}
          <span className="font-semibold text-text-primary">${formatMXN(total)}</span>
        </span>
      </div>
    </div>
  );
}
