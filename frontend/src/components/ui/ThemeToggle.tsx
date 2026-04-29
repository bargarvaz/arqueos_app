// Botón cíclico light → dark → system
import { Sun, Moon, Monitor } from 'lucide-react';
import { useThemeStore } from '@/store/themeStore';

const LABEL: Record<string, string> = {
  light: 'Tema claro',
  dark: 'Tema oscuro',
  system: 'Tema del sistema',
};

export default function ThemeToggle() {
  const mode = useThemeStore((s) => s.mode);
  const toggle = useThemeStore((s) => s.toggle);

  const Icon = mode === 'light' ? Sun : mode === 'dark' ? Moon : Monitor;
  const next =
    mode === 'light' ? 'oscuro' : mode === 'dark' ? 'sistema' : 'claro';

  return (
    <button
      type="button"
      onClick={toggle}
      title={`${LABEL[mode]} — clic para ${next}`}
      aria-label={LABEL[mode]}
      className="w-9 h-9 rounded-lg grid place-items-center text-text-secondary hover:bg-surface hover:text-text-primary transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
    >
      <Icon className="w-[18px] h-[18px]" />
    </button>
  );
}
