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
    hmr: process.env.VITE_BASE_URL ? false : undefined,
    port: parseInt(process.env.PULSE_WEB_PORT || '6501', 10),
    proxy: {
      // RBAC calls go to Auth API
      '/api/rbac': {
        target: `http://[::1]:${process.env.COMMAND_WEB_PORT || '6102'}`,
        changeOrigin: true,
      },
      '/auth': {
        target: `http://[::1]:${process.env.COMMAND_WEB_PORT || '6102'}`,
        changeOrigin: true,
      },
      '/api': {
        target: `http://[::1]:${process.env.PULSE_API_PORT || '6500'}`,
        rewrite: (path) => path.replace(/^\/api/, ''),
        changeOrigin: true,
      },
    },
  },
});
