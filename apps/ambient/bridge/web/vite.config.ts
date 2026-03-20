import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig(({ mode }) => {
  // Load env from monorepo root
  const env = loadEnv(mode, path.resolve(__dirname, '../../../..'), 'VITE_');

  // Bridge Web: port 6601 (dev) / 7601 (prod)
  const webPort = parseInt(
    env.VITE_BRIDGE_WEB_PORT ||
    process.env.BRIDGE_WEB_PORT ||
    '6601'
  );

  // Bridge API: port 6600 (dev) / 7600 (prod)
  const apiPort = parseInt(
    env.VITE_BRIDGE_API_PORT ||
    process.env.BRIDGE_API_PORT ||
    '6600'
  );

  const apiTarget = `http://[::1]:${apiPort}`;

  // Auth API
  const authPort = parseInt(
    env.VITE_AUTH_API_PORT ||
    process.env.AUTH_API_PORT ||
    '6100'
  );
  const authTarget = `http://[::1]:${authPort}`;

  console.log('Bridge Web Vite config:');
  console.log('  Web port:', webPort);
  console.log('  API target:', apiTarget);
  console.log('  Auth target:', authTarget);

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@orchestratorai/ui': path.resolve(__dirname, '../../../../packages/ui'),
      },
    },

    envDir: path.resolve(__dirname, '../../../..'),

    test: {
      environment: 'jsdom',
      globals: false,
    },

    server: {
      port: webPort,
      host: true,
      proxy: {
        // Bridge API endpoints — only proxy paths that do NOT conflict with Vue Router routes.
        // The web stores use absolute URLs (VITE_API_URL / http://localhost:6600) for all
        // bridge API calls, so no proxy rules are needed for /registry, /stream, /training,
        // or /a2a. Those paths are also Vue Router routes; proxying them would intercept
        // client-side navigation and send it to NestJS instead of serving index.html.
        '/invoke': { target: apiTarget, changeOrigin: true },
        '/health': { target: apiTarget, changeOrigin: true },
        '/.well-known': { target: apiTarget, changeOrigin: true },
        // Auth API
        '/auth': { target: authTarget, changeOrigin: true },
        '/api': { target: authTarget, changeOrigin: true },
      },
    },
  };
});
