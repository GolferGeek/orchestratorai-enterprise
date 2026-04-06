import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

// Dev JWT for local testing (HS256, matches SUPABASE_JWT_SECRET in .env)
const DEV_TOKEN = 'eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJzdWIiOiAiZGV2LWZpc2hib3dsIiwgImV4cCI6IDE4MDQ3MTA3OTUsICJyb2xlIjogImF1dGhlbnRpY2F0ZWQifQ.a7p6TuhzMNuik_xW2UVVCPRsa-gmncaNwZdRO9dkdh8';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(__dirname, '../../../../../..'), '');

  const buildwellPort = parseInt(env.PROTOCOL_LAB_BUILDWELL_PORT ?? '5408', 10);
  const frontendPort = parseInt(env.PROTOCOL_LAB_BUILDWELL_FRONTEND_PORT ?? '5410', 10);

  const proxyConfig = {
    target: `http://[::1]:${buildwellPort}`,
    changeOrigin: true,
    headers: { Authorization: `Bearer ${DEV_TOKEN}` },
  };

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@agent-communication/shared-protocols': resolve(__dirname, '../../../packages/shared-protocols/src/index.browser.ts'),
      },
    },
    server: {
      port: frontendPort,
      proxy: {
        '/scenarios': proxyConfig,
        '/buildwell': proxyConfig,
        '/alloytech': proxyConfig,
        '/oem': proxyConfig,
        '/health': proxyConfig,
        '/api/data': proxyConfig,
        '/api/source': proxyConfig,
      },
    },
    build: {
      outDir: '../public',
      emptyOutDir: true,
    },
  };
});
