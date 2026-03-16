<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { OaiAppShell } from '@orchestratorai/ui';
import type { NavItem } from '@orchestratorai/ui';
import {
  hammerOutline,
  layersOutline,
  gitBranchOutline,
  settingsOutline,
  pulseOutline,
  swapHorizontalOutline,
} from 'ionicons/icons';
import { useRbacStore } from '@/stores/rbacStore';
import { useEntitlementsStore } from '@/stores/entitlementsStore';
import { entitlementsService } from '@/services/entitlementsService';

const router = useRouter();
const rbacStore = useRbacStore();
const entitlementsStore = useEntitlementsStore();

const { user, currentOrganization } = storeToRefs(rbacStore);
const { accessibleProducts } = storeToRefs(entitlementsStore);

// Map icon name strings (from entitlementsService) to ionicons SVG imports
const iconMap: Record<string, string> = {
  'hammer-outline': hammerOutline,
  'layers-outline': layersOutline,
  'git-branch-outline': gitBranchOutline,
  'settings-outline': settingsOutline,
  'pulse-outline': pulseOutline,
  'swap-horizontal-outline': swapHorizontalOutline,
};

// Build OaiAppShell-compatible NavItem array from entitlements-based product list.
// Each accessible product becomes a top-level nav item that navigates to that
// product's standalone URL. Products without access are omitted.
const navItems = computed<NavItem[]>(() =>
  accessibleProducts.value.map((product) => ({
    label: product.productName,
    icon: iconMap[product.icon] ?? settingsOutline,
    // External href — OaiSidebar uses router-link for internal routes, but
    // Command routes to product URLs (different apps). We encode the external
    // URL in `path` and rely on OaiSidebar's IonItem href behaviour.
    path: entitlementsService.getProductUrl(product),
  }))
);

const userName = computed(() => user.value?.displayName ?? user.value?.email);
const orgName = computed(() => currentOrganization.value ?? undefined);

async function handleSignOut(): Promise<void> {
  await rbacStore.logout();
  router.push('/login');
}

onMounted(async () => {
  await entitlementsService.loadEntitlements();
});
</script>

<template>
  <OaiAppShell
    product-name="Command"
    product-slug="command"
    :nav-items="navItems"
    :user-name="userName ?? undefined"
    :org-name="orgName"
    :show-claude-pane="false"
    @sign-out="handleSignOut"
    :use-router-outlet="true"
  />
</template>
