import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '../../../../'), 'VITE_');

  return {
    base: process.env.VITE_BASE_URL || '/',
    plugins: [vue()],
    envDir: path.resolve(__dirname, '../../../../'),
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
      port: parseInt(env.VITE_PULSE_WEB_PORT || '6501'),
      host: true,
      allowedHosts: true,
      proxy: {
        '/api/rbac': {
          target: `http://[::1]:${env.VITE_AUTH_API_PORT || '6100'}`,
          changeOrigin: true,
        },
        '/auth': {
          target: `http://[::1]:${env.VITE_AUTH_API_PORT || '6100'}`,
          changeOrigin: true,
        },
        '/api': {
          target: `http://[::1]:${env.VITE_PULSE_API_PORT || '6500'}`,
          rewrite: (path) => path.replace(/^\/api/, ''),
          changeOrigin: true,
        },
      },
    },
  };
});
