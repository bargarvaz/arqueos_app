/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta del sistema de arqueos
        primary: {
          DEFAULT: '#4A5D23',   // Verde militar
          light: '#5E7530',
          dark: '#384718',
          foreground: '#FFFFFF',
        },
        secondary: {
          DEFAULT: '#B8860B',   // Dorado
          light: '#D4A017',
          dark: '#9A7009',
          foreground: '#FFFFFF',
        },
        background: '#FFFFFF',
        surface: '#F5F5F5',
        border: '#E0E0E0',
        text: {
          primary: '#1A1A1A',
          secondary: '#5A5A5A',
          muted: '#9E9E9E',
        },
        status: {
          error: '#D32F2F',
          'error-light': '#FFEBEE',
          success: '#388E3C',
          'success-light': '#E8F5E9',
          warning: '#F57C00',
          'warning-light': '#FFF3E0',
          info: '#1976D2',
          'info-light': '#E3F2FD',
        },
        // Aliases sin prefijo `status-` para que `text-error`, `bg-error/10`, etc.
        // funcionen consistentemente en todo el código.
        error: {
          DEFAULT: '#D32F2F',
          light: '#FFEBEE',
        },
        success: {
          DEFAULT: '#388E3C',
          light: '#E8F5E9',
        },
        warning: {
          DEFAULT: '#F57C00',
          light: '#FFF3E0',
        },
        info: {
          DEFAULT: '#1976D2',
          light: '#E3F2FD',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '6px',
      },
    },
  },
  plugins: [],
}
