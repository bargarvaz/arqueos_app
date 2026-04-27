// Selección con búsqueda en tiempo real (reemplaza <select> cuando la lista es larga)
import { useState, useRef, useEffect } from 'react';

export interface ComboOption {
  value: number;
  label: string;
}

interface ComboSelectProps {
  options: ComboOption[];
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
}

export default function ComboSelect({
  options,
  value,
  onChange,
  placeholder = 'Buscar...',
  emptyLabel = 'Ninguno',
  disabled = false,
}: ComboSelectProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.value === value) ?? null;

  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (opt: ComboOption | null) => {
    onChange(opt?.value ?? null);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        className={`input w-full ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        placeholder={selected ? selected.label : placeholder}
        value={open ? query : (selected?.label ?? '')}
        disabled={disabled}
        onFocus={() => { if (!disabled) { setOpen(true); setQuery(''); } }}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        autoComplete="off"
      />
      {open && !disabled && (
        <ul className="absolute z-50 mt-1 w-full max-h-52 overflow-y-auto bg-white border border-border rounded-md shadow-lg text-sm">
          <li
            className="px-3 py-2 cursor-pointer hover:bg-surface-hover text-text-muted"
            onMouseDown={() => handleSelect(null)}
          >
            {emptyLabel}
          </li>
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-text-muted">Sin resultados</li>
          ) : (
            filtered.map(opt => (
              <li
                key={opt.value}
                className={`px-3 py-2 cursor-pointer hover:bg-surface-hover ${opt.value === value ? 'bg-primary/10 font-medium' : ''}`}
                onMouseDown={() => handleSelect(opt)}
              >
                {opt.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
