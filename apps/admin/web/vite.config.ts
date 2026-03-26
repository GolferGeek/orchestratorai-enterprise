/// <reference types="vitest" />

import legacy from '@vitejs/plugin-legacy'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { defineConfig, loadEnv } from 'vite'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file from monorepo root
  const env = loadEnv(mode, path.resolve(__dirname, '../../'), 'VITE_')

  return {
    base: process.env.VITE_BASE_URL || '/',
    plugins: [
      vue(),
      legacy(),
    ],
    // Load VITE_* env vars from monorepo root .env
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
      // Admin Web runs on port 6101 (dev) / 7101 (prod)
      port: parseInt(env.VITE_ADMIN_WEB_PORT || '6101'),
      host: true,
      allowedHosts: true,
      hmr: process.env.VITE_BASE_URL ? false : undefined,
      proxy: {
        // MCP (Compose API port 6300) — MUST be before /admin-api
        '/mcp-api': {
          target: `http://[::1]:${env.VITE_COMPOSE_API_PORT || '6300'}`,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/mcp-api/, '/mcp'),
        },
        // Admin API (port 6150) — MUST be before /admin to avoid prefix collision
        // Controllers use /admin/* prefix, so rewrite /admin-api → /admin
        '/admin-api': {
          target: `http://[::1]:${env.VITE_ADMIN_API_PORT || '6150'}`,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/admin-api/, '/admin'),
        },
        // All API calls go to Auth API (port 6100)
        '/auth': {
          target: `http://[::1]:${env.VITE_AUTH_API_PORT || '6100'}`,
          changeOrigin: true,
        },
        '/health': {
          target: `http://[::1]:${env.VITE_AUTH_API_PORT || '6100'}`,
          changeOrigin: true,
        },
        '/api': {
          target: `http://[::1]:${env.VITE_AUTH_API_PORT || '6100'}`,
          changeOrigin: true,
        },
        // Only proxy /admin to Auth API in non-gateway mode (base URL = /).
        // In gateway mode (base URL = /admin/), this would intercept all SPA requests.
        ...(!(process.env.VITE_BASE_URL || '').startsWith('/admin') ? {
          '/admin': {
            target: `http://[::1]:${env.VITE_AUTH_API_PORT || '6100'}`,
            changeOrigin: true,
          },
        } : {}),
      },
    },
    build: {
      sourcemap: mode !== 'production',
      minify: mode === 'production' ? 'terser' : false,
      ...(mode === 'production' ? {
        terserOptions: {
          compress: {
            drop_console: true,
            drop_debugger: true,
          },
        },
      } : {}),
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('@ionic/vue')) return 'ionic';
              if (id.includes('vue')) return 'vue-vendor';
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
      setupFiles: ['./src/tests/setup.ts'],
      testTimeout: 10000,
      exclude: [
        'node_modules/**',
        'dist/**',
        'tests/e2e/**',
        '**/*.e2e.test.{ts,js}',
      ],
    },
  }
})
