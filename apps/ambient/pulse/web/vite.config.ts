import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  base: process.env.VITE_BASE_URL || '/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@orchestratorai/ui': path.resolve(__dirname, '../../../../packages/ui'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
  },
  server: {
    port: 6501,
    proxy: {
      // RBAC calls go to Auth API (port 6100)
      '/api/rbac': {
        target: 'http://[::1]:6102',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://[::1]:6102',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://[::1]:6500',
        rewrite: (path) => path.replace(/^\/api/, ''),
        changeOrigin: true,
      },
    },
  },
});
