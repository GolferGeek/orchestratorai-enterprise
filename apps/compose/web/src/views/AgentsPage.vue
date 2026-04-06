<template>
  <OaiAppShell
    product-slug="compose"
    :nav-items="[]"
    :user-name="userName"
    :org-name="orgName"
    :admin-api-url="adminApiUrl"
    :forge-api-url="forgeApiUrl"
    @sign-out="handleSignOut"
    :use-router-outlet="true"
  >
    <template #sidebar>
      <AgentNavTree />
    </template>
  </OaiAppShell>
</template>

<script lang="ts" setup>
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/rbacStore';
import { useUserPreferencesStore } from '@/stores/userPreferencesStore';
import { OaiAppShell } from '@orchestratorai/ui';
import AgentNavTree from '@/components/nav/AgentNavTree.vue';

const router = useRouter();
const auth = useAuthStore();
const userPreferencesStore = useUserPreferencesStore();

const userName = computed(() => auth.user?.displayName || auth.user?.email);
const orgName = computed(() => auth.currentOrganization ?? undefined);

const adminApiUrl = import.meta.env.VITE_ADMIN_API_URL || 'http://localhost:5150';
const forgeApiUrl = import.meta.env.VITE_FORGE_API_URL || 'http://localhost:5200';

async function handleSignOut(): Promise<void> {
  await auth.logout();
  router.push('/access-denied');
}

onMounted(() => {
  userPreferencesStore.initializePreferences();
});
</script>
