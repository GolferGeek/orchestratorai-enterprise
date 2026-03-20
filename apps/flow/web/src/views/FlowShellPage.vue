<script setup lang="ts">
/**
 * FlowShellPage — Flow app shell with sidebar + top nav + content.
 *
 * Uses IonSplitPane + IonMenu (via OaiSidebar) for the sidebar,
 * and standard vue-router <router-view> for content rendering.
 */
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonSplitPane,
  IonPage,
  IonHeader,
  IonContent,
} from '@ionic/vue';
import { useAuthStore } from '@/stores/auth.store';
import { useTeamsStore } from '@/stores/teams.store';
import { OaiSidebar, OaiTopNav } from '@orchestratorai/ui';
import type { NavItem } from '@orchestratorai/ui';
import { getProductDisplayName } from '@orchestrator-ai/transport-types';
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
  <IonSplitPane content-id="flow-main" when="lg">
    <OaiSidebar
      :nav-items="navItems"
      product-slug="flow"
      content-id="flow-main"
    />
    <IonPage id="flow-main">
      <IonHeader>
        <OaiTopNav
          :product-name="getProductDisplayName('flow')"
          :user-name="userName"
          :org-name="orgName"
          @sign-out="handleSignOut"
        />
      </IonHeader>
      <IonContent>
        <router-view />
      </IonContent>
    </IonPage>
  </IonSplitPane>
</template>
