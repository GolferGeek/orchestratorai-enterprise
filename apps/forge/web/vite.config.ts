/// <reference types="vitest" />

import legacy from '@vitejs/plugin-legacy'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import fs from 'fs'
import { defineConfig, loadEnv } from 'vite'
import { visualizer } from 'rollup-plugin-visualizer'
import viteCompression from 'vite-plugin-compression'

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

  return {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env from monorepo root (resolve relative to this file, not cwd)
  const env = loadEnv(mode, path.resolve(__dirname, '../../'), 'VITE_')

  console.log('Forge Web Vite config:')
  console.log('  VITE_FORGE_WEB_PORT:', env.VITE_FORGE_WEB_PORT)
  console.log('  VITE_FORGE_API_PORT:', env.VITE_FORGE_API_PORT)

  // Forge Web: port 6201 (dev) / 7201 (prod)
  const webPort = parseInt(
    env.VITE_FORGE_WEB_PORT ||
    process.env.FORGE_WEB_PORT ||
    (env.VITE_ENFORCE_HTTPS === 'true' ? '7201' : '6201')
  );

  // Forge API: port 6200 (dev) / 7200 (prod)
  const apiPort = parseInt(
    env.VITE_FORGE_API_PORT ||
    process.env.FORGE_API_PORT ||
    '6200'
  );

  const apiTarget = `http://[::1]:${apiPort}`;

  return {
    base: process.env.VITE_BASE_URL || '/',
    plugins: [
      vue(),
      legacy(),
      visualizer({
        filename: 'dist/stats.html',
        open: false,
        gzipSize: true,
        brotliSize: true,
        template: 'treemap',
      }),
      ...(mode === 'production' ? [
        viteCompression({
          algorithm: 'gzip',
          ext: '.gz',
          threshold: 1024,
          deleteOriginFile: false,
        }),
        viteCompression({
          algorithm: 'brotliCompress',
          ext: '.br',
          threshold: 1024,
          deleteOriginFile: false,
        }),
      ] : []),
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

    optimizeDeps: {
      include: ['three'],
    },

    server: {
      // Forge Web runs on port 6201
      port: webPort,
      host: true,
      allowedHosts: true,
      https: getHttpsConfig(env),
      hmr: process.env.VITE_BASE_URL ? false : {
        protocol: env.VITE_ENFORCE_HTTPS === 'true' ? 'wss' : 'ws',
      },
      proxy: {
        // All Forge API endpoints proxy to Forge API (port 6200)
        '/invoke': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/agent-conversations': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/marketing': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/marketing-swarm': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/legal-department': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/cad-agent': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/risk-runner': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/predictor': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/prediction': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/llm': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/agent-to-agent': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/agents': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/hierarchy': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/engineering': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/health': {
          target: apiTarget,
          changeOrigin: true,
        },
        // Observability SSE stream for real-time agent progress
        '/observability': {
          target: apiTarget,
          changeOrigin: true,
        },
        // Auth calls — Auth API (port 6100). Use [::1] to bypass Cursor IDE port conflicts.
        '/auth': {
          target: `http://[::1]:${env.VITE_AUTH_API_PORT || '6100'}`,
          changeOrigin: true,
        },
        // Prediction context API (Forge API, not Auth)
        '/api/prediction': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/api': {
          target: `http://[::1]:${env.VITE_AUTH_API_PORT || '6100'}`,
          changeOrigin: true,
        },
        // HITL task endpoints
        '/tasks': {
          target: apiTarget,
          changeOrigin: true,
        },
        // Deliverables produced by Forge agents
        '/deliverables': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },

    build: {
      sourcemap: true,
      cssCodeSplit: true,
      cssMinify: 'esbuild',
      assetsInlineLimit: 4096,
      assetsDir: 'assets',
      reportCompressedSize: true,
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.info', 'console.debug'],
        },
        mangle: {
          safari10: true,
        },
      },
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('vue') && !id.includes('@ionic/vue')) return 'vue-vendor';
              if (id.includes('@ionic/vue-router')) return 'ionic-router';
              if (id.includes('@ionic/vue')) return 'ionic-core';
              if (id.includes('@ionic/core')) return 'ionic-components';
              if (id.includes('vue-router')) return 'router-vendor';
              if (id.includes('pinia')) return 'pinia-vendor';
              if (id.includes('axios')) return 'axios-vendor';
              if (id.includes('chart.js')) return 'chart-vendor';
              if (id.includes('three')) return 'three-vendor';
              return 'vendor';
            }
            // Forge-specific chunks
            if (id.includes('marketing-swarm')) return 'marketing-swarm';
            if (id.includes('legal-department')) return 'legal-department';
            if (id.includes('cad-agent')) return 'cad-agent';
            if (id.includes('risk')) return 'risk-runner';
            if (id.includes('prediction') || id.includes('predictor')) return 'predictor';
          },
        },
      },
      chunkSizeWarningLimit: 1000,
    },

    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/tests/setup.ts'],
      testTimeout: 10000,
      hookTimeout: 10000,
      exclude: [
        'node_modules/**',
        'dist/**',
        'tests/e2e/**',
        '**/*.e2e.test.{ts,js}',
      ],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html', 'json', 'json-summary'],
        reportsDirectory: './coverage',
        include: ['src/**/*.{ts,tsx,vue}'],
        exclude: [
          'node_modules',
          'src/tests/**',
          '**/*.d.ts',
          '**/*.config.{ts,js}',
          'src/**/*.spec.{ts,js}',
          'src/**/*.test.{ts,js}',
        ],
      },
    },
  }
})
