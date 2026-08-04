/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'activity-bg': '#333333',
        'activity-active': '#ffffff',
        'activity-inactive': '#858585',
        'sidebar-bg': '#f3f3f3',
        'sidebar-border': '#e5e5e5',
        'tab-active-bg': '#ffffff',
        'tab-inactive-bg': '#ececec',
        'editor-bg': '#ffffff',
      },
      width: {
        'activity': '48px',
        'sidebar': '280px',
      },
      minWidth: {
        'activity': '48px',
        'sidebar': '280px',
      },
    },
  },
  plugins: [],
}
