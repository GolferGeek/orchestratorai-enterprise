import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

// Dev JWT for local testing (HS256, matches SUPABASE_JWT_SECRET in .env)
const DEV_TOKEN = 'eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJzdWIiOiAiZGV2LWZpc2hib3dsIiwgImV4cCI6IDE4MDQ3MTA3OTUsICJyb2xlIjogImF1dGhlbnRpY2F0ZWQifQ.a7p6TuhzMNuik_xW2UVVCPRsa-gmncaNwZdRO9dkdh8';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(__dirname, '../../../../../..'), '');

  const prairieRidgePort = parseInt(env.PROTOCOL_LAB_PRAIRIE_RIDGE_PORT ?? '5407', 10);
  const frontendPort = parseInt(env.PROTOCOL_LAB_PRAIRIE_RIDGE_FRONTEND_PORT ?? '5409', 10);

  const proxyConfig = {
    target: `http://[::1]:${prairieRidgePort}`,
    changeOrigin: true,
    headers: { Authorization: `Bearer ${DEV_TOKEN}` },
  };

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
        '@agent-communication/shared-protocols': resolve(__dirname, '../../../packages/shared-protocols/src/index.browser.ts'),
      },
    },
    server: {
      port: frontendPort,
      proxy: {
        '/api/prairie-ridge': {
          ...proxyConfig,
          rewrite: (path) => path.replace(/^\/api\/prairie-ridge/, '/prairie-ridge'),
        },
        '/api/fcs': {
          ...proxyConfig,
          rewrite: (path) => path.replace(/^\/api\/fcs/, '/fcs'),
        },
        '/api/central-farm-bank': {
          ...proxyConfig,
          rewrite: (path) => path.replace(/^\/api\/central-farm-bank/, '/central-farm-bank'),
        },
        '/api/scenarios': {
          ...proxyConfig,
          rewrite: (path) => path.replace(/^\/api\/scenarios/, '/scenarios'),
        },
        '/api/data': proxyConfig,
        '/api/source': proxyConfig,
      },
    },
    build: {
      outDir: 'dist',
    },
  };
});
