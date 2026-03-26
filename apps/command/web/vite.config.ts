/// <reference types="vitest" />

import legacy from '@vitejs/plugin-legacy';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';

/**
 * Get HTTPS configuration for Vite dev server
 */
function getHttpsConfig(env: Record<string, string>) {
  if (env.VITE_ENFORCE_HTTPS !== 'true') {
    return false;
  }

  const certPath = path.resolve(__dirname, 'certs', 'localhost-cert.pem');
  const keyPath = path.resolve(__dirname, 'certs', 'localhost-key.pem');

  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    console.warn('HTTPS enabled but certificates not found. Run: node scripts/setup-https-dev.js');
    return false;
  }

  try {
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
  } catch (error) {
    console.error('Failed to read SSL certificates:', (error as Error).message);
    return false;
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env from monorepo root
  const env = loadEnv(mode, path.resolve(__dirname, '../../'), 'VITE_');

  // Command web runs on port 6102 (dev) / 7000 (prod)
  const webPort = parseInt(env.VITE_COMMAND_WEB_PORT || process.env.COMMAND_WEB_PORT || '6102');

  // Auth API port — Command only talks to Auth API
  const authApiPort = env.VITE_AUTH_API_PORT || '6100';

  return {
    base: process.env.VITE_BASE_URL || '/',
    plugins: [
      vue(),
      legacy(),
    ],
    envDir: path.resolve(__dirname, '../../'),
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@orchestratorai/ui': path.resolve(__dirname, '../../../packages/ui'),
      },
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json'],
      preserveSymlinks: true,
    },
    server: {
      port: webPort,
      host: true,
      allowedHosts: true,
      https: getHttpsConfig(env),
      // Disable HMR in gateway mode (HTTPS via Cloudflare can't connect to ws://)
      hmr: process.env.VITE_BASE_URL ? false : {
        protocol: env.VITE_ENFORCE_HTTPS === 'true' ? 'wss' : 'ws',
      },
      proxy: {
        // Command proxies to Auth API for auth and RBAC
        '/auth': {
          target: `http://localhost:${authApiPort}`,
          changeOrigin: true,
        },
        '/api': {
          target: `http://localhost:${authApiPort}`,
          changeOrigin: true,
        },
      },
    },
    build: {
      sourcemap: true,
      cssCodeSplit: true,
      assetsDir: 'assets',
      reportCompressedSize: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('vue') && !id.includes('@ionic/vue')) return 'vue-vendor';
              if (id.includes('@ionic/vue')) return 'ionic-vendor';
              if (id.includes('vue-router')) return 'router-vendor';
              if (id.includes('pinia')) return 'pinia-vendor';
              if (id.includes('axios')) return 'axios-vendor';
              return 'vendor';
            }
          },
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      include: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'tests/e2e/**',
        'cypress/**',
      ],
    },
  };
});
