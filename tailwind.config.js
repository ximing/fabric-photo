module.exports = {
  content: [
    './website/src/demo/**/*.{js,jsx,ts,tsx}',
    './website/src/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        primary: '#1f2937',
        secondary: '#6b7280',
        accent: '#3b82f6',
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
        info: '#0ea5e9'
      },
      borderRadius: {
        'lg': '0.5rem',
        'xl': '0.75rem'
      },
      boxShadow: {
        'sm': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'md': '0 2px 8px 0 rgba(0, 0, 0, 0.15)',
        'lg': '0 4px 12px 0 rgba(0, 0, 0, 0.15)',
        'xl': '0 8px 16px 0 rgba(0, 0, 0, 0.1)'
      }
    }
  },
  plugins: []
};
