import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import * as path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '../../..'), '');

  const frontendPort = parseInt(env.PROTOCOL_LAB_FRONTEND_PORT ?? '5400', 10);
  const protocolApiPort = parseInt(env.PROTOCOL_LAB_PROTOCOL_API_PORT ?? '5402', 10);
  const researchHubPort = parseInt(env.PROTOCOL_LAB_RESEARCH_HUB_PORT ?? '5403', 10);
  const marketPulsePort = parseInt(env.PROTOCOL_LAB_MARKET_PULSE_PORT ?? '5404', 10);
  const contentForgePort = parseInt(env.PROTOCOL_LAB_CONTENT_FORGE_PORT ?? '5405', 10);
  const agentConsumerPort = parseInt(env.PROTOCOL_LAB_AGENT_CONSUMER_PORT ?? '5406', 10);
  const prairieRidgePort = parseInt(env.PROTOCOL_LAB_PRAIRIE_RIDGE_PORT ?? '5407', 10);
  const buildwellPort = parseInt(env.PROTOCOL_LAB_BUILDWELL_PORT ?? '5408', 10);

  return {
    plugins: [vue()],
    test: {
      environment: 'jsdom',
      globals: false,
    },
    server: {
      port: frontendPort,
      proxy: {
        '/protocol-api': {
          target: `http://[::1]:${protocolApiPort}`,
          rewrite: (path) => path.replace(/^\/protocol-api/, ''),
          changeOrigin: true,
          ws: true,
        },
        '/research-hub': {
          target: `http://[::1]:${researchHubPort}`,
          rewrite: (path) => path.replace(/^\/research-hub/, ''),
          changeOrigin: true,
        },
        '/market-pulse': {
          target: `http://[::1]:${marketPulsePort}`,
          rewrite: (path) => path.replace(/^\/market-pulse/, ''),
          changeOrigin: true,
        },
        '/content-forge': {
          target: `http://[::1]:${contentForgePort}`,
          rewrite: (path) => path.replace(/^\/content-forge/, ''),
          changeOrigin: true,
        },
        '/agent-consumer': {
          target: `http://[::1]:${agentConsumerPort}`,
          rewrite: (path) => path.replace(/^\/agent-consumer/, ''),
          changeOrigin: true,
        },
        '/mini-me': {
          target: 'http://gg-macstudio:3030',
          rewrite: (path) => path.replace(/^\/mini-me/, ''),
          changeOrigin: true,
        },
        '/prairie-ridge-app': {
          target: `http://[::1]:${prairieRidgePort}`,
          rewrite: (path) => path.replace(/^\/prairie-ridge-app/, ''),
          changeOrigin: true,
        },
        '/buildwell-app': {
          target: `http://[::1]:${buildwellPort}`,
          rewrite: (path) => path.replace(/^\/buildwell-app/, ''),
          changeOrigin: true,
        },
        '/main-api': {
          target: 'http://[::1]:6100',
          rewrite: (path) => path.replace(/^\/main-api/, ''),
          changeOrigin: true,
        },
      },
    },
  };
});
