<template>
  <OaiAppShell
    product-name="Compose"
    product-slug="compose"
    :nav-items="navItems"
    :user-name="userName"
    :org-name="orgName"
    :admin-api-url="adminApiUrl"
    :forge-api-url="forgeApiUrl"
    @sign-out="handleSignOut"
    :use-router-outlet="true"
  />
</template>

<script lang="ts" setup>
import { computed, onMounted } from 'vue';
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
