import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

// Dev JWT for local testing (HS256, matches SUPABASE_JWT_SECRET in .env)
const DEV_TOKEN = 'eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJzdWIiOiAiZGV2LWZpc2hib3dsIiwgImV4cCI6IDE4MDQ3MTA3OTUsICJyb2xlIjogImF1dGhlbnRpY2F0ZWQifQ.a7p6TuhzMNuik_xW2UVVCPRsa-gmncaNwZdRO9dkdh8';

const proxyConfig = {
  target: 'http://localhost:6408',
  changeOrigin: true,
  headers: { Authorization: `Bearer ${DEV_TOKEN}` },
};

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@agent-communication/shared-protocols': resolve(__dirname, '../../../packages/shared-protocols/src/index.browser.ts'),
    },
  },
  server: {
    port: 6410,
    proxy: {
      '/scenarios': proxyConfig,
      '/ascentek': proxyConfig,
      '/lube-tech': proxyConfig,
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
});
