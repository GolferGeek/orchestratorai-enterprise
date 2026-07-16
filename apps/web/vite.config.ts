import vue from '@vitejs/plugin-vue';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

function readRequiredPort(env: Record<string, string>): number {
  const rawPort = env.VITE_PLATFORM_WEB_PORT;

  if (!rawPort) {
    throw new Error('VITE_PLATFORM_WEB_PORT is required for the unified platform web app.');
  }

  const port = Number(rawPort);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`VITE_PLATFORM_WEB_PORT must be a positive integer. Received: ${rawPort}`);
  }

  return port;
}

function readRequiredApiBaseUrl(env: Record<string, string>): string {
  const apiBaseUrl = env.VITE_API_BASE_URL;

  if (!apiBaseUrl) {
    throw new Error('VITE_API_BASE_URL is required for the unified platform web app.');
  }

  return apiBaseUrl;
}

function readRequiredDevProxyTarget(apiBaseUrl: string): string {
  if (apiBaseUrl !== '/api') {
    throw new Error('VITE_API_BASE_URL must be /api when running the Vite dev server.');
  }

  const proxyTarget = process.env.VITE_API_PROXY_TARGET;

  if (!proxyTarget) {
    throw new Error('VITE_API_PROXY_TARGET is required when running the Vite dev server.');
  }

  if (!proxyTarget.startsWith('http://') && !proxyTarget.startsWith('https://')) {
    throw new Error('VITE_API_PROXY_TARGET must be an absolute URL when running the Vite dev server.');
  }

  return proxyTarget;
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '../../'), 'VITE_');
  const webPort = readRequiredPort(env);
  const apiBaseUrl = readRequiredApiBaseUrl(env);
  const devProxyTarget = command === 'serve' ? readRequiredDevProxyTarget(apiBaseUrl) : undefined;

  return {
    base: '/',
    plugins: [vue()],
    envDir: path.resolve(__dirname, '../../'),
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@orchestratorai/ui': path.resolve(__dirname, '../../packages/ui'),
      },
      preserveSymlinks: true,
    },
    server: {
      port: webPort,
      host: true,
      allowedHosts: true,
      proxy: {
        '/api': {
          target: devProxyTarget,
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(/^\/api/, ''),
        },
      },
    },
    build: {
      sourcemap: true,
      cssCodeSplit: true,
      assetsDir: 'assets',
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/@ionic') || id.includes('node_modules/ionicons')) {
              return 'vendor-ionic';
            }
            if (id.includes('node_modules/vue') || id.includes('node_modules/pinia')) {
              return 'vendor-vue';
            }
            if (id.includes('node_modules/axios') || id.includes('node_modules/@capacitor')) {
              return 'vendor-platform';
            }
            if (id.includes('/src/modules/admin/') || id.includes('/src/modules/agents/')) {
              return 'module-management';
            }
            if (id.includes('/src/modules/workflows/')) {
              return 'module-workflows';
            }
            if (id.includes('/src/modules/secure-conversations/')) {
              return 'module-secure-conversations';
            }
            if (id.includes('/src/modules/ambient/')) {
              return 'module-ambient';
            }
            if (id.includes('/src/modules/rag/')) {
              return 'module-rag';
            }
            return undefined;
          },
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      include: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
      exclude: ['node_modules/**', 'dist/**'],
    },
  };
});
