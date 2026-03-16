<script setup lang="ts">
/**
 * FlowShellPage — Flow app shell with sidebar + top nav + content.
 * Uses standard vue-router <router-view> for child route rendering.
 * Ionic components used for styling only (IonHeader, IonContent, IonPage).
 */
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';
import { useTeamsStore } from '@/stores/teams.store';
import { OaiSidebar, OaiTopNav } from '@orchestratorai/ui';
import type { NavItem } from '@orchestratorai/ui';
import {
  homeOutline,
  timerOutline,
  checkmarkCircleOutline,
  layersOutline,
  gridOutline,
  listOutline,
  peopleOutline,
  folderOutline,
} from 'ionicons/icons';

const authStore = useAuthStore();
const teamsStore = useTeamsStore();
const router = useRouter();

const navItems: NavItem[] = [
  { label: 'Home', icon: homeOutline, path: '/' },
  { label: 'Timer', icon: timerOutline, path: '/timer' },
  { label: 'Tasks', icon: checkmarkCircleOutline, path: '/tasks' },
  { label: 'Kanban', icon: gridOutline, path: '/kanban' },
  { label: 'Sprints', icon: layersOutline, path: '/sprints' },
  { label: 'Shared Lists', icon: listOutline, path: '/shared-lists' },
  { label: 'Teams', icon: peopleOutline, path: '/teams' },
  { label: 'Files', icon: folderOutline, path: '/files' },
];

const userName = computed(() => authStore.user?.email ?? undefined);
const orgName = computed(() => authStore.organizations[0]?.slug ?? undefined);

onMounted(async () => {
  if (!authStore.isAuthenticated) return;
  try {
    await authStore.loadUserContext();
  } catch (e: unknown) {
    const status = (e as Error & { status?: number }).status;
    if (status === 401) {
      authStore.signOut();
      router.push('/login');
      return;
    }
    throw e;
  }
  const orgs = authStore.organizations;
  if (orgs.length > 0) {
    await teamsStore.loadTeams(orgs[0].slug);
  }
});

function handleSignOut() {
  authStore.signOut();
  router.push('/login');
}
</script>

<template>
  <div class="flow-shell">
    <aside class="flow-shell__sidebar">
      <OaiSidebar
        :nav-items="navItems"
        product-slug="flow"
      />
    </aside>
    <div class="flow-shell__main">
      <header class="flow-shell__header">
        <OaiTopNav
          product-name="Flow"
          :user-name="userName"
          :org-name="orgName"
          @sign-out="handleSignOut"
        />
      </header>
      <main class="flow-shell__content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<style scoped>
.flow-shell {
  display: flex;
  height: 100vh;
  width: 100vw;
  background: var(--oai-bg-page, #0f172a);
}

.flow-shell__sidebar {
  width: 270px;
  flex-shrink: 0;
  overflow-y: auto;
}

.flow-shell__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.flow-shell__header {
  flex-shrink: 0;
}

.flow-shell__content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

@media (max-width: 992px) {
  .flow-shell__sidebar {
    display: none;
  }
}
</style>
