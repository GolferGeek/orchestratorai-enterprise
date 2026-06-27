<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
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
  flaskOutline,
  shieldCheckmarkOutline,
  navigateOutline,
} from 'ionicons/icons';
import { useRbacStore } from '@/stores/rbacStore';
import { useEntitlementsStore } from '@/stores/entitlementsStore';
import { entitlementsService } from '@/services/entitlementsService';
import { useViewMode } from '@/composables/useViewMode';

const router = useRouter();
const rbacStore = useRbacStore();
const entitlementsStore = useEntitlementsStore();
const { viewMode, setViewMode, isVisibleInCurrentMode, hiddenSlugs } = useViewMode();

const { user, isAuthenticated, currentOrganization, userOrganizations } = storeToRefs(rbacStore);
const { accessibleProducts } = storeToRefs(entitlementsStore);

// Map icon name strings (from entitlementsService) to ionicons SVG imports
const iconMap: Record<string, string> = {
  'hammer-outline': hammerOutline,
  'layers-outline': layersOutline,
  'git-branch-outline': gitBranchOutline,
  'settings-outline': settingsOutline,
  'pulse-outline': pulseOutline,
  'swap-horizontal-outline': swapHorizontalOutline,
  'flask-outline': flaskOutline,
  'shield-checkmark-outline': shieldCheckmarkOutline,
  'navigate-outline': navigateOutline,
};

// Preferred sidebar order: Table Stakes (compose) before Big Ideas (forge)
const SIDEBAR_ORDER: string[] = ['compose', 'forge'];

// When authenticated: build nav items from entitlements, filtered by view mode.
// When not authenticated: empty array — sidebar renders but has no links.
const navItems = computed<NavItem[]>(() => {
  if (!isAuthenticated.value) return [];
  return accessibleProducts.value
    .filter((p) => isVisibleInCurrentMode(p.productSlug))
    .sort((a, b) => {
      const ai = SIDEBAR_ORDER.indexOf(a.productSlug);
      const bi = SIDEBAR_ORDER.indexOf(b.productSlug);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return 0;
    })
    .map((product) => ({
      label: product.productName,
      icon: iconMap[product.icon] ?? settingsOutline,
      path: entitlementsService.getProductUrl(product),
      external: true,
    }));
});

// Only expose userName when authenticated — OaiTopNav uses undefined to show Login button
const userName = computed<string | undefined>(() => {
  if (!isAuthenticated.value) return undefined;
  return user.value?.displayName ?? user.value?.email ?? undefined;
});

// Resolve org display name from the userOrganizations list.
// currentOrganization holds a slug or the '*' sentinel (all orgs).
// The UserMenu shows whatever string we pass as orgName, so we map the slug
// to its human-readable organizationName. '*' is intentionally omitted so the
// menu shows no org line when the user has cross-org access (super-admin).
const orgName = computed<string | undefined>(() => {
  if (!isAuthenticated.value) return undefined;
  const slug = currentOrganization.value;
  if (!slug || slug === '*') return undefined;
  const match = userOrganizations.value.find((o) => o.organizationSlug === slug);
  return match?.organizationName ?? slug;
});

async function handleSignOut(): Promise<void> {
  await rbacStore.logout();
  router.push('/login');
}

onMounted(async () => {
  if (isAuthenticated.value) {
    await entitlementsService.loadEntitlements();
  }
});

// Load entitlements when auth state changes (e.g. login happens after shell is mounted)
watch(isAuthenticated, async (authed) => {
  if (authed) {
    await entitlementsService.loadEntitlements();
  }
});
</script>

<template>
  <OaiAppShell
    product-slug="command"
    :nav-items="navItems"
    :user-name="userName"
    :org-name="orgName"
    :hidden-slugs="hiddenSlugs"
    @sign-out="handleSignOut"
    :use-router-outlet="true"
  >
    <template v-if="isAuthenticated" #topNavCenter>
      <div class="view-mode-toggle">
        <button
          :class="['view-mode-btn', { active: viewMode === 'standard' }]"
          @click="setViewMode('standard')"
        >Standard</button>
        <button
          :class="['view-mode-btn', { active: viewMode === 'advanced' }]"
          @click="setViewMode('advanced')"
        >Advanced</button>
      </div>
    </template>
  </OaiAppShell>
</template>

<style scoped>
.view-mode-toggle {
  display: inline-flex;
  background: var(--oai-bg-surface, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--oai-border, #334155);
  border-radius: 6px;
  padding: 2px;
  gap: 2px;
}

.view-mode-btn {
  padding: 4px 12px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--oai-text-muted, #94a3b8);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.view-mode-btn:hover {
  color: var(--oai-text-primary, #e2e8f0);
}

.view-mode-btn.active {
  background: var(--oai-primary, #3b82f6);
  color: #fff;
}
</style>
