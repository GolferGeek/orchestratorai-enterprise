/**
 * Landing Web — main.ts
 * Entry point for the OrchestratorAI Enterprise public landing site.
 * Port 6400 (dev) / 7400 (prod).
 *
 * Pure static marketing site:
 * - No authentication required
 * - No API calls
 * - No stores
 * - "Get Started" / "Login" redirect to Command Web (port 6001)
 */

import { createApp } from 'vue';
import App from './App.vue';
import router from './router';

import '@orchestratorai/ui/theme/brand.css';
import './styles/global.css';

import { applyThemeEarly } from '@orchestratorai/ui/theme';

// Apply persisted theme before Vue mounts to prevent flash of wrong theme
applyThemeEarly();

createApp(App)
  .use(router)
  .mount('#app');
