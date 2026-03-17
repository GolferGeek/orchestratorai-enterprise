<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { OaiAppShell } from '@orchestratorai/ui';
import type { NavItem } from '@orchestratorai/ui';
import {
  businessOutline,
  peopleOutline,
  shieldOutline,
  keyOutline,
  cogOutline,
  analyticsOutline,
  hardwareChipOutline,
  cashOutline,
  libraryOutline,
  serverOutline,
  pulseOutline,
  listOutline,
  heartOutline,
  settingsOutline,
  globeOutline,
  terminalOutline,
  layersOutline,
} from 'ionicons/icons';
import { useRbacStore } from '@/stores/rbacStore';

const rbacStore = useRbacStore();
const router = useRouter();

const { user, currentOrganization } = storeToRefs(rbacStore);

const userName = computed(() => user.value?.displayName ?? user.value?.email);
const orgName = computed(() => currentOrganization.value ?? undefined);

// Build the full Admin nav tree as OaiAppShell NavItem[]
// Matches the original AdminShell structure: Management, LLM Analytics,
// RAG Management, Agent Registry, Observability, System
const navItems: NavItem[] = [
  // Management section
  { label: 'Organizations', icon: businessOutline, path: '/app/admin/organizations' },
  { label: 'Users',         icon: peopleOutline,   path: '/app/admin/users'          },
  { label: 'Roles',         icon: shieldOutline,   path: '/app/admin/roles'          },
  { label: 'Entitlements',  icon: keyOutline,      path: '/app/admin/entitlements'   },

  // LLM Analytics — accordion group with children
  {
    label: 'LLM Analytics',
    icon: analyticsOutline,
    children: [
      { label: 'Usage',  icon: analyticsOutline,    path: '/app/admin/llm/usage'   },
      { label: 'Models', icon: hardwareChipOutline,  path: '/app/admin/llm/models'  },
      { label: 'Costs',  icon: cashOutline,          path: '/app/admin/llm/costs'   },
    ],
  },

  // RAG Management
  { label: 'RAG Management', icon: libraryOutline, path: '/app/admin/rag' },

  // Agent Registry
  { label: 'Agent Registry', icon: serverOutline, path: '/app/admin/agents' },

  // Observability — accordion group with children
  {
    label: 'Observability',
    icon: pulseOutline,
    children: [
      { label: 'Dashboard', icon: pulseOutline, path: '/app/admin/observability'        },
      { label: 'Events',    icon: listOutline,  path: '/app/admin/observability/events' },
    ],
  },

  // System — accordion group with children
  {
    label: 'System',
    icon: settingsOutline,
    children: [
      { label: 'Config', icon: cogOutline,   path: '/app/admin/system'        },
      { label: 'Health', icon: heartOutline, path: '/app/admin/system/health' },
    ],
  },

  // Data & Infrastructure
  {
    label: 'Data & Infrastructure',
    icon: layersOutline,
    children: [
      { label: 'Crawler Sources', icon: globeOutline,    path: '/app/admin/crawler'  },
      { label: 'MCP Servers',     icon: terminalOutline, path: '/app/admin/mcp'      },
      { label: 'Database',        icon: serverOutline,   path: '/app/admin/database' },
    ],
  },
];

async function handleSignOut(): Promise<void> {
  await rbacStore.logout();
  router.push('/login');
}
</script>

<template>
  <OaiAppShell
    product-slug="admin"
    :nav-items="navItems"
    :user-name="userName ?? undefined"
    :org-name="orgName"
    :show-claude-pane="false"
    @sign-out="handleSignOut"
  >
    <router-view />
  </OaiAppShell>
</template>
