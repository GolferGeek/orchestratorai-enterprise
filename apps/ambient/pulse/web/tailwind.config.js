/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        pulse: {
          primary: '#7c3aed',
          secondary: '#4f46e5',
          accent: '#06b6d4',
        },
      },
    },
  },
  plugins: [],
};
