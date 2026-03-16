<template>
  <div v-if="hasMultipleOrgs" class="org-switcher">
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
  <div v-else-if="currentOrg" class="org-pill">
    {{ formatOrgName(currentOrg) }}
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { IonSelect, IonSelectOption } from '@ionic/vue';
import type { SelectCustomEvent } from '@ionic/vue';
import { useRbacStore } from '@/stores/rbacStore';
import { useRouter } from 'vue-router';

const rbacStore = useRbacStore();
const router = useRouter();

const availableOrgs = computed(() => rbacStore.userOrganizations || []);
const currentOrg = computed(() => rbacStore.currentOrganization);
const hasMultipleOrgs = computed(() => availableOrgs.value.length > 1);

async function onOrgChange(event: SelectCustomEvent) {
  const value = event.detail.value as string | null;
  if (value) {
    await rbacStore.setOrganization(value);
    router.replace('/app/agents');
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
.org-switcher {
  display: flex;
  align-items: center;
}

.org-pill {
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.08);
  color: var(--ion-color-dark, #222);
  font-size: 0.75rem;
  font-weight: 600;
}

ion-select {
  min-width: 140px;
  --padding-start: 0.5rem;
  --padding-end: 0.5rem;
  --padding-top: 0.25rem;
  --padding-bottom: 0.25rem;
  --min-height: 36px;
  --color: var(--ion-color-dark, #222);
  --placeholder-color: var(--ion-color-medium, #6b7280);
  font-size: 0.85rem;
}

ion-select::part(text) {
  color: var(--ion-color-dark, #222);
}
</style>
