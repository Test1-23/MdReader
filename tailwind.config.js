/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // chrome 语义 token —— 值由 index.css 的 :root / .dark 变量提供，
        // 组件无需写 dark: 变体
        chrome: {
          subtle: 'var(--chrome-subtle)',
          surface: 'var(--chrome-surface)',
          raised: 'var(--chrome-raised)',
          border: 'var(--chrome-border)',
          'border-strong': 'var(--chrome-border-strong)',
          text: 'var(--chrome-text)',
          'text-muted': 'var(--chrome-text-muted)',
          'text-faint': 'var(--chrome-text-faint)',
          hover: 'var(--chrome-hover)',
        },
        activity: {
          bg: 'var(--activity-bg)',
          active: '#ffffff',
          inactive: '#9ca3af',
        },
      },
      width: {
        'activity': '48px',
        'sidebar': '280px',
      },
      minWidth: {
        'activity': '48px',
        'sidebar': '280px',
      },
      keyframes: {
        'slide-down': {
          '0%': { opacity: '0', transform: 'translate(-50%, -8px)' },
          '100%': { opacity: '1', transform: 'translate(-50%, 0)' },
        },
      },
      animation: {
        'slide-down': 'slide-down 0.2s ease-out',
      },
    },
  },
  plugins: [],
}
