export default {
  content: ['./index.html', './src/**/*.{vue,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ascentek: {
          primary: '#f59e0b',
          secondary: '#d97706',
          surface: '#1c1a0e',
          card: '#292510',
        },
        protocol: {
          primary: '#6366f1',
          secondary: '#8b5cf6',
          success: '#22c55e',
          warning: '#f59e0b',
          danger: '#ef4444',
          surface: '#1e1b4b',
          card: '#312e81',
        },
      },
    },
  },
  plugins: [],
};
