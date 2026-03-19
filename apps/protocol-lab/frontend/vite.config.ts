import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    globals: false,
  },
  server: {
    port: 6400,
    proxy: {
      '/protocol-api': {
        target: 'http://localhost:6402',
        rewrite: (path) => path.replace(/^\/protocol-api/, ''),
        changeOrigin: true,
        ws: true,
      },
      '/research-hub': {
        target: 'http://localhost:6403',
        rewrite: (path) => path.replace(/^\/research-hub/, ''),
        changeOrigin: true,
      },
      '/market-pulse': {
        target: 'http://localhost:6404',
        rewrite: (path) => path.replace(/^\/market-pulse/, ''),
        changeOrigin: true,
      },
      '/content-forge': {
        target: 'http://localhost:6405',
        rewrite: (path) => path.replace(/^\/content-forge/, ''),
        changeOrigin: true,
      },
      '/agent-consumer': {
        target: 'http://localhost:6406',
        rewrite: (path) => path.replace(/^\/agent-consumer/, ''),
        changeOrigin: true,
      },
      '/mini-me': {
        target: 'http://gg-macstudio:3030',
        rewrite: (path) => path.replace(/^\/mini-me/, ''),
        changeOrigin: true,
      },
      '/sunstream-app': {
        target: 'http://localhost:6407',
        rewrite: (path) => path.replace(/^\/sunstream-app/, ''),
        changeOrigin: true,
      },
      '/ascentek-app': {
        target: 'http://localhost:6408',
        rewrite: (path) => path.replace(/^\/ascentek-app/, ''),
        changeOrigin: true,
      },
      '/main-api': {
        target: 'http://localhost:6100',
        rewrite: (path) => path.replace(/^\/main-api/, ''),
        changeOrigin: true,
      },
    },
  },
});
