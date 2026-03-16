/// <reference types="vitest" />
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
import path from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@orchestratorai/ui': path.resolve(__dirname, '../../../packages/ui'),
    },
  },
  server: {
    port: 6901,
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
        target: 'http://[::1]:6900',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  preview: {
    port: 7901,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    exclude: [
      'node_modules/**',
      'dist/**',
    ],
  },
});
