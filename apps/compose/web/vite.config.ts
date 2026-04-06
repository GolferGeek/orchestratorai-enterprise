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
  // Only use HTTPS if explicitly enabled
  if (env.VITE_ENFORCE_HTTPS !== 'true') {
    return false;
  }

  const certPath = path.resolve(__dirname, 'certs', 'localhost-cert.pem');
  const keyPath = path.resolve(__dirname, 'certs', 'localhost-key.pem');

  // Check if certificates exist
  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    console.warn('⚠️  HTTPS enabled but certificates not found!');
    console.warn('   Run: node scripts/setup-https-dev.js');
    console.warn('   Falling back to HTTP...');
    return false;
  }

  try {
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    };
  } catch (error) {
    console.error('❌ Failed to read SSL certificates:', error.message);
    console.warn('   Falling back to HTTP...');
    return false;
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file from project root (two levels up from apps/web)
  const env = loadEnv(mode, path.resolve(__dirname, '../../../'), 'VITE_')

  // Debug: Log environment variables during build
  console.log('Vite Environment Variables:')
  console.log('VITE_API_BASE_URL:', env.VITE_API_BASE_URL)
  console.log('VITE_COMPOSE_API_BASE_URL:', env.VITE_COMPOSE_API_BASE_URL)



  // Set HMR environment variables based on mode
  if (mode === 'production') {
    process.env.VITE_HMR_HOST = 'app.orchestratorai.io'
    process.env.VITE_HMR_PORT = '443'
    process.env.VITE_HMR_PROTOCOL = 'wss'
  } else {
    process.env.VITE_HMR_HOST = 'localhost'
    process.env.VITE_HMR_PORT = '7101'
    process.env.VITE_HMR_PROTOCOL = 'ws'
  }

  return {
    base: process.env.VITE_BASE_URL || '/',
    plugins: [
      vue(),
      legacy(),
      // Add bundle analyzer for performance optimization
      visualizer({
        filename: 'dist/stats.html',
        open: false,
        gzipSize: true,
        brotliSize: true,
        template: 'treemap'
      }),
      // Enable gzip and brotli compression for production builds
      ...(mode === 'production' ? [
        viteCompression({
          algorithm: 'gzip',
          ext: '.gz',
          threshold: 1024, // Only compress files larger than 1KB
          deleteOriginFile: false
        }),
        viteCompression({
          algorithm: 'brotliCompress',
          ext: '.br',
          threshold: 1024,
          deleteOriginFile: false
        })
      ] : [])
    ],
    // Load VITE_* env vars from monorepo root .env
    envDir: path.resolve(__dirname, '../../../'),
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@orchestratorai/ui': path.resolve(__dirname, '../../../packages/ui'),
      },
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json'],
      preserveSymlinks: true,
    },
    optimizeDeps: {
      include: [
        'three'
      ]
    },
    server: {
      // Compose Web: port 6301 (dev) / 7301 (prod)
      port: parseInt((env.VITE_COMPOSE_WEB_PORT || process.env.COMPOSE_WEB_PORT || (env.VITE_ENFORCE_HTTPS === 'true' ? '7301' : '5301'))),
      host: true,
      // Allow all hosts for Tailscale/remote access
      allowedHosts: true,
      https: getHttpsConfig(env),
      hmr: process.env.VITE_BASE_URL ? false : {
        // For remote access (Tailscale/LAN), let the browser determine the host
        // Setting host to false allows the client to connect to the same host as the page
        protocol: env.VITE_ENFORCE_HTTPS === 'true' ? 'wss' : 'ws'
      },
      // Proxy all API requests to the NestJS backend to avoid CORS issues
      // and enable remote access (SSH, Tailscale) without extra port forwarding.
      // Every @Controller() prefix in apps/api must have a matching proxy entry.
      proxy: {
        // Compose API (port 6300) — primary backend for this product
        ...(Object.fromEntries(
          [
            '/invoke',
            '/runners',
            '/pipelines',
            '/conversations',
            '/customer-service',
            '/speech',
            '/health',
          ].map(prefix => [prefix, {
            target: `http://[::1]:${env.VITE_COMPOSE_API_PORT || '5300'}`,
            changeOrigin: true,
          }])
        )),
        // Agent-to-Agent execution goes to Compose API (port 6300) — NOT Auth
        '/agent-to-agent': {
          target: `http://[::1]:${env.VITE_COMPOSE_API_PORT || '5300'}`,
          changeOrigin: true,
        },
        // Auth API (port 6100) — shared auth service
        ...(Object.fromEntries(
          [
            '/auth',
            '/sessions',
            '/errors',
            '/hierarchy',
            '/orchestrator',
            '/agent-conversations',
            '/deliverables',
            '/deliverable-versions',
          ].map(prefix => [prefix, {
            target: `http://[::1]:${env.VITE_AUTH_API_PORT || '5100'}`,
            changeOrigin: true,
          }])
        )),
        // RBAC API calls go to Auth API (port 6100)
        '/api': {
          target: `http://[::1]:${env.VITE_AUTH_API_PORT || '5100'}`,
          changeOrigin: true,
        },
      }
    },
    build: {
      sourcemap: true,
      // CSS optimization
      cssCodeSplit: true,
      cssMinify: 'esbuild', // Use esbuild for faster CSS minification
      // Asset optimization
      assetsInlineLimit: 4096, // Inline assets smaller than 4KB
      assetsDir: 'assets', // Organize assets in subdirectory
      // Enable asset optimization
      reportCompressedSize: true,
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true, // Remove console.logs in production
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.info', 'console.debug']
        },
        mangle: {
          safari10: true
        }
      },
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Dynamic chunking strategy for better optimization
            if (id.includes('node_modules')) {
              // Core framework chunks
              if (id.includes('vue') && !id.includes('@ionic/vue')) {
                return 'vue-vendor';
              }
              if (id.includes('@ionic/vue-router')) {
                return 'ionic-router';
              }
              if (id.includes('@ionic/vue')) {
                return 'ionic-core';
              }
              if (id.includes('@ionic/core')) {
                return 'ionic-components';
              }
              if (id.includes('vue-router')) {
                return 'router-vendor';
              }
              if (id.includes('pinia')) {
                return 'pinia-vendor';
              }
              if (id.includes('axios')) {
                return 'axios-vendor';
              }
              if (id.includes('chart.js')) {
                return 'chart-vendor';
              }
              if (id.includes('dompurify')) {
                return 'security-vendor';
              }
              if (id.includes('yup') || id.includes('vee-validate')) {
                return 'validation-vendor';
              }
              // Other vendor dependencies
              return 'vendor';
            }

            // Application chunks based on feature areas
            if (id.includes('stores/auth') || id.includes('services/auth')) {
              return 'auth-module';
            }
            if (id.includes('stores/agent') || id.includes('services/agent')) {
              return 'agent-module';
            }
            if (id.includes('stores/pii') || id.includes('services/pii') || id.includes('PII')) {
              return 'pii-module';
            }
            if (id.includes('stores/analytics') || id.includes('services/analytics') || id.includes('LlmUsage')) {
              return 'analytics-module';
            }
            if (id.includes('stores/project') || id.includes('services/project') || id.includes('deliverables')) {
              return 'project-module';
            }
            if (id.includes('composables/useValidation') || id.includes('utils/validation') || id.includes('utils/sanitization')) {
              return 'validation-module';
            }
          }
        }
      },
      chunkSizeWarningLimit: 1000, // Increase warning limit temporarily
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
        'tests/e2e/**', // Exclude Playwright E2E tests
        '**/*.e2e.test.{ts,js}', // Exclude E2E test files
      ],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html', 'json', 'json-summary'],
        reportsDirectory: './coverage',
        include: [
          'src/**/*.{ts,tsx,vue}',
        ],
        exclude: [
          'node_modules',
          'src/tests/**',
          '**/*.d.ts',
          '**/*.config.{ts,js}',
          'src/**/*.spec.{ts,js}',
          'src/**/*.test.{ts,js}',
          'src/**/types.ts',
          'src/**/interfaces.ts',
        ],
        thresholds: {
          global: {
            branches: 70,
            functions: 70,
            lines: 70,
            statements: 70
          },
          each: {
            branches: 60,
            functions: 60,
            lines: 60,
            statements: 60
          }
        }
      }
    }
  }
})
