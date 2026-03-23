import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { IonicVue } from '@ionic/vue';
import App from './App.vue';
import { router } from './router';

/* Ionic CSS bundle */
import '@ionic/vue/css/ionic.bundle.css';

/* OAI shared theme — brand tokens + Ionic dark/light overrides */
import '@orchestratorai/ui/theme/brand.css';
import '@orchestratorai/ui/theme/ionic-dark.css';
import '@orchestratorai/ui/theme/ionic-light.css';

import { applyThemeEarly } from '@orchestratorai/ui';
applyThemeEarly();

import './style.css';

const app = createApp(App);
app.use(IonicVue);
app.use(createPinia());
app.use(router);

router.isReady().then(() => {
  app.mount('#app');
});
