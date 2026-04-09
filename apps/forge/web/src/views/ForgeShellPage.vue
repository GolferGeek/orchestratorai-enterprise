<template>
  <OaiAppShell
    product-slug="forge"
    :nav-items="navItems"
    :user-name="userName"
    :org-name="orgName"
    :admin-api-url="adminApiUrl"
    :forge-api-url="forgeApiUrl"
    @sign-out="handleSignOut"
    :use-router-outlet="true"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  megaphoneOutline,
  scaleOutline,
  constructOutline,
} from 'ionicons/icons';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/rbacStore';
import { OaiAppShell } from '@orchestratorai/ui';
import type { NavItem } from '@orchestratorai/ui';

const auth = useAuthStore();
const router = useRouter();

const userName = computed(() => auth.user?.displayName || auth.user?.email);
const orgName = computed(() => auth.currentOrganization ?? undefined);

const adminApiUrl = import.meta.env.VITE_ADMIN_API_URL || 'http://localhost:5150';
const forgeApiUrl = import.meta.env.VITE_FORGE_API_URL || 'http://localhost:5200';

const navItems: NavItem[] = [
  {
    label: 'Marketing Swarm',
    icon: megaphoneOutline,
    path: '/app/agents/marketing-swarm',
  },
  {
    label: 'Legal Department',
    icon: scaleOutline,
    path: '/app/agents/legal-department',
    children: [
      {
        label: 'Document Onboarding',
        path: '/app/agents/legal-department/document-onboarding',
      },
      {
        label: 'Contract Review',
        path: '/app/agents/legal-department/contract-review',
      },
      {
        label: 'Settings',
        path: '/app/agents/legal-department/settings',
      },
    ],
  },
  // CAD Agent — deactivated
  // { label: 'CAD Agent', icon: constructOutline, path: '/app/agents/cad-agent' },
];

async function handleSignOut() {
  await auth.logout();
  router.push('/login');
}
</script>
