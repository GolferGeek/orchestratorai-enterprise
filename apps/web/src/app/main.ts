import { IonicVue } from '@ionic/vue';
import { applyThemeEarly } from '@orchestratorai/ui';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { router } from '@/routes';

import '@ionic/vue/css/core.css';
import '@ionic/vue/css/normalize.css';
import '@ionic/vue/css/structure.css';
import '@ionic/vue/css/typography.css';
import '@ionic/vue/css/padding.css';
import '@ionic/vue/css/flex-utils.css';
import '@ionic/vue/css/display.css';
import '@ionic/vue/css/palettes/dark.class.css';
import '@orchestratorai/ui/theme/brand.css';
import '@orchestratorai/ui/theme/ionic-dark.css';
import '@orchestratorai/ui/theme/ionic-light.css';
import '@/modules/secure-conversations/secure-conversations.css';
import '@/shared/styles/platform.css';

applyThemeEarly();

const app = createApp(App).use(IonicVue).use(router).use(createPinia());

router.isReady().then(() => {
  app.mount('#app');
});
