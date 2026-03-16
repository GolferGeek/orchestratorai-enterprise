export default {
  content: ['./index.html', './src/**/*.{vue,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        fishbowl: {
          bg: '#0f172a',
          surface: '#1e293b',
          card: '#1e293b',
          border: '#334155',
          muted: '#475569',
          text: '#f1f5f9',
          'text-muted': '#94a3b8',
          fcs: '#3b82f6',
          sunstream: '#10b981',
          agribank: '#f59e0b',
        },
        layer: {
          identity: '#3b82f6',
          encryption: '#10b981',
          transport: '#8b5cf6',
          trust: '#f59e0b',
          audit: '#ef4444',
          payment: '#ec4899',
          business: '#6b7280',
          data: '#14b8a6',
          observability: '#6366f1',
          resilience: '#f97316',
          negotiation: '#06b6d4',
          orchestration: '#84cc16',
          discovery: '#a78bfa',
        },
      },
    },
  },
  plugins: [],
};
