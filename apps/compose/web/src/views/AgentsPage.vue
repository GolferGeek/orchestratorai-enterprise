<template>
  <ion-split-pane content-id="compose-main" when="lg">
    <!-- Left sidebar: agent + conversation tree -->
    <ion-menu content-id="compose-main" type="overlay" class="compose-nav-menu">
      <ion-header>
        <ion-toolbar>
          <ion-title>Compose</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content>
        <AgentNavTree />
      </ion-content>
    </ion-menu>

    <!-- Main content area -->
    <ion-page id="compose-main">
      <OaiAppShell
        product-slug="compose"
        :nav-items="navItems"
        :user-name="userName"
        :org-name="orgName"
        :admin-api-url="adminApiUrl"
        :forge-api-url="forgeApiUrl"
        @sign-out="handleSignOut"
        :use-router-outlet="true"
      />
    </ion-page>
  </ion-split-pane>
</template>

<script lang="ts" setup>
import { computed, onMounted } from 'vue';
import {
  IonSplitPane,
  IonMenu,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonPage,
} from '@ionic/vue';
import {
  appsOutline,
  layersOutline,
  chatbubblesOutline,
} from 'ionicons/icons';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/rbacStore';
import { useUserPreferencesStore } from '@/stores/userPreferencesStore';
import { OaiAppShell } from '@orchestratorai/ui';
import type { NavItem } from '@orchestratorai/ui';
import AgentNavTree from '@/components/nav/AgentNavTree.vue';

const router = useRouter();
const auth = useAuthStore();
const userPreferencesStore = useUserPreferencesStore();

const userName = computed(() => auth.user?.displayName || auth.user?.email);
const orgName = computed(() => auth.currentOrganization ?? undefined);

const adminApiUrl = import.meta.env.VITE_ADMIN_API_URL || 'http://localhost:6150';
const forgeApiUrl = import.meta.env.VITE_FORGE_API_URL || 'http://localhost:6200';

const navItems: NavItem[] = [
  {
    label: 'Agents',
    icon: appsOutline,
    path: '/app/agents',
  },
  {
    label: 'Conversations',
    icon: chatbubblesOutline,
    path: '/app/home',
  },
  {
    label: 'Runner Compose',
    icon: layersOutline,
    path: '/app/compose',
  },
];

async function handleSignOut(): Promise<void> {
  await auth.logout();
  router.push('/access-denied');
}

onMounted(() => {
  userPreferencesStore.initializePreferences();
});
</script>

<style scoped>
.compose-nav-menu {
  --width: 260px;
  --max-width: 260px;
}
</style>
