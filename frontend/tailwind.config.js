/** @type {import('tailwindcss').Config} */
const withVar = (token) => `rgb(var(${token}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ─── Marca (fijos en ambos modos) ──────────────────────────────────
        primary: {
          DEFAULT: '#4A5D23',
          light: '#5E7530',
          dark: '#384718',
          foreground: '#FFFFFF',
        },
        secondary: {
          DEFAULT: '#B8860B',
          light: '#D4A017',
          dark: '#9A7009',
          foreground: '#FFFFFF',
        },

        // ─── Tokens semánticos (vía CSS vars, light/dark) ──────────────────
        background: withVar('--color-background'),
        surface: withVar('--color-surface'),
        'surface-alt': withVar('--color-surface-alt'),
        'surface-hover': withVar('--color-surface-hover'),
        border: withVar('--color-border'),
        'border-strong': withVar('--color-border-strong'),
        text: {
          primary: withVar('--color-text-primary'),
          secondary: withVar('--color-text-secondary'),
          muted: withVar('--color-text-muted'),
        },

        // ─── Estado (mantengo paleta original; las "*-light" se refuerzan
        //     con un shim en globals.css para dark mode). ────────────────────
        status: {
          error: '#D32F2F',
          'error-light': withVar('--color-status-error-light'),
          success: '#388E3C',
          'success-light': withVar('--color-status-success-light'),
          warning: '#F57C00',
          'warning-light': withVar('--color-status-warning-light'),
          info: '#1976D2',
          'info-light': withVar('--color-status-info-light'),
        },
        error: {
          DEFAULT: '#D32F2F',
          light: withVar('--color-status-error-light'),
        },
        success: {
          DEFAULT: '#388E3C',
          light: withVar('--color-status-success-light'),
        },
        warning: {
          DEFAULT: '#F57C00',
          light: withVar('--color-status-warning-light'),
        },
        info: {
          DEFAULT: '#1976D2',
          light: withVar('--color-status-info-light'),
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '8px',
        lg: '12px',
        xl: '16px',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(20, 20, 30, 0.04), 0 1px 3px rgba(20, 20, 30, 0.04)',
        card: '0 1px 3px rgba(20, 20, 30, 0.05), 0 4px 12px -4px rgba(20, 20, 30, 0.04)',
        elevated: '0 4px 24px -8px rgba(20, 20, 30, 0.10), 0 2px 6px -2px rgba(20, 20, 30, 0.06)',
        ring: '0 0 0 4px rgba(74, 93, 35, 0.12)',
        'ring-secondary': '0 0 0 4px rgba(184, 134, 11, 0.14)',
      },
      keyframes: {
        // Solo opacidad: NO transform. Un transform en un ancestro crea un
        // nuevo containing block y rompe `position: fixed` de los modales
        // (el overlay no cubre el header que vive fuera de <main>).
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out',
      },
    },
  },
  plugins: [],
}
