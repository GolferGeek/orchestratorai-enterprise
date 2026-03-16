<template>
  <!-- Always show something for visibility -->
  <div v-if="availableOrgs.length > 1" class="org-switcher-app">
    <ion-select
      :value="currentOrg"
      interface="popover"
      :interface-options="{ cssClass: 'org-popover' }"
      aria-label="Select active organization"
      placeholder="Organization"
      @ionChange="onOrgChange"
    >
      <ion-select-option
        v-for="org in availableOrgs"
        :key="org.organizationSlug"
        :value="org.organizationSlug"
      >
        {{ org.organizationName || formatOrgName(org.organizationSlug) }}
      </ion-select-option>
    </ion-select>
  </div>
  <div v-else class="org-pill-app">
    {{ currentOrg ? formatOrgName(currentOrg) : 'No Org' }}
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { IonSelect, IonSelectOption } from '@ionic/vue';
import type { SelectCustomEvent } from '@ionic/vue';
import { useRbacStore } from '@/stores/rbacStore';
import { useEvaluationsStore } from '@/stores/evaluationsStore';
import { useAdminEvaluationStore } from '@/stores/adminEvaluationStore';
const rbacStore = useRbacStore();
const evaluationsStore = useEvaluationsStore();
const adminEvaluationStore = useAdminEvaluationStore();

const availableOrgs = computed(() => rbacStore.userOrganizations || []);
const currentOrg = computed(() => rbacStore.currentOrganization);
const _hasMultipleOrgs = computed(() => availableOrgs.value.length > 1);

// Debug logging
onMounted(() => {
  console.log('🔍 OrganizationSwitcherApp mounted');
  console.log('Available orgs:', availableOrgs.value);
  console.log('Current org:', currentOrg.value);
  console.log('isSuperAdmin:', rbacStore.isSuperAdmin);
  console.log('User:', rbacStore.user);
});

watch([availableOrgs, currentOrg], ([orgs, current]) => {
  console.log('🔍 Org data changed:', { orgs, current });
}, { deep: true });

async function onOrgChange(event: SelectCustomEvent) {
  const value = event.detail.value as string | null;
  if (value && value !== currentOrg.value) {
    console.log('🔄 Organization changing from', currentOrg.value, 'to', value);

    // Set new organization in rbacStore - this will trigger watchers
    await rbacStore.setOrganization(value);

    // Refresh other org-dependent stores
    // Note: Agents are refreshed by AgentTreeView watcher
    try {
      const refreshPromises = [];

      // Evaluations - use refreshEvaluations if available
      if ('refreshEvaluations' in evaluationsStore && typeof evaluationsStore.refreshEvaluations === 'function') {
        refreshPromises.push(evaluationsStore.refreshEvaluations());
      }

      // Admin evaluations - use fetchAllEvaluations as refresh
      if ('fetchAllEvaluations' in adminEvaluationStore && typeof adminEvaluationStore.fetchAllEvaluations === 'function') {
        refreshPromises.push(adminEvaluationStore.fetchAllEvaluations());
      }

      // Deliverables - no refresh needed (state-only store)
      // deliverablesStore is a state-only store without async refresh methods

      await Promise.all(refreshPromises);
      console.log('✅ Organization changed and stores refreshed');
    } catch (error) {
      console.error('Error refreshing stores after org change:', error);
    }
  }
}

function formatOrgName(slug: string): string {
  return slug
    .split(/[\-_]/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
</script>

<style scoped>
.org-switcher-app {
  display: flex;
  align-items: center;
}

.org-pill-app {
  padding: 0.35rem 0.75rem;
  border-radius: 4px;
  background: var(--ion-color-step-50, rgba(255, 255, 255, 0.05));
  color: var(--ion-text-color, #e0e0e0);
  font-size: 0.8rem;
  font-weight: 500;
  border: 1px solid var(--ion-border-color, rgba(255, 255, 255, 0.1));
  white-space: nowrap;
}

ion-select {
  min-width: 120px;
  max-width: 160px;
  --padding-start: 0.5rem;
  --padding-end: 0.5rem;
  --padding-top: 0.25rem;
  --padding-bottom: 0.25rem;
  --min-height: 32px;
  --background: var(--ion-color-step-50, rgba(255, 255, 255, 0.05));
  --color: var(--ion-text-color, #e0e0e0);
  --placeholder-color: var(--ion-color-medium, #999999);
  font-size: 0.8rem;
  font-weight: 500;
  border-radius: 4px;
  border: 1px solid var(--ion-border-color, rgba(255, 255, 255, 0.1));
  color: var(--ion-text-color, #e0e0e0);
}

ion-select::part(text) {
  color: var(--ion-text-color, #e0e0e0);
}

ion-select::part(icon) {
  color: var(--ion-color-medium, #999999);
  opacity: 1;
}

ion-select::part(container) {
  border-radius: 4px;
}
</style>

<style>
/* Light mode overrides - unscoped for higher specificity */
html:not(.ion-palette-dark):not([data-theme="dark"]) .org-pill-app,
html[data-theme="light"] .org-pill-app {
  background: var(--ion-color-step-50, rgba(0, 0, 0, 0.05)) !important;
  color: #333333 !important;
  border-color: var(--ion-border-color, rgba(0, 0, 0, 0.1)) !important;
}

html:not(.ion-palette-dark):not([data-theme="dark"]) .org-switcher-app ion-select,
html[data-theme="light"] .org-switcher-app ion-select {
  --background: var(--ion-color-step-50, rgba(0, 0, 0, 0.05)) !important;
  --color: #333333 !important;
  --placeholder-color: var(--ion-color-medium, #666666) !important;
  color: #333333 !important;
  border-color: var(--ion-border-color, rgba(0, 0, 0, 0.1)) !important;
}

html:not(.ion-palette-dark):not([data-theme="dark"]) .org-switcher-app ion-select::part(text),
html[data-theme="light"] .org-switcher-app ion-select::part(text) {
  color: #333333 !important;
}

html:not(.ion-palette-dark):not([data-theme="dark"]) .org-switcher-app ion-select::part(icon),
html[data-theme="light"] .org-switcher-app ion-select::part(icon) {
  color: #666666 !important;
}
</style>
