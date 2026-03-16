import vue from '@vitejs/plugin-vue';
import path from 'path';
import { defineConfig } from 'vite';

// Landing Web — port 6400 (dev) / 7400 (prod)
// Pure static marketing site, no auth, no API calls
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@orchestratorai/ui': path.resolve(__dirname, '../../../packages/ui'),
    },
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json'],
  },
  server: {
    port: 6400,
    host: true,
  },
  preview: {
    port: 7400,
  },
  build: {
    sourcemap: true,
    cssCodeSplit: true,
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('vue-router')) return 'router-vendor';
            if (id.includes('vue')) return 'vue-vendor';
            return 'vendor';
          }
        },
      },
    },
  },
});
