<template>
  <div class="org-user-picker">
    <div v-if="loading" class="picker-loading">Loading users...</div>
    <div v-else-if="loadError" class="picker-error">{{ loadError }}</div>
    <template v-else>
      <ion-searchbar
        v-model="search"
        placeholder="Search by email or name"
        :debounce="150"
        class="picker-search"
      />
      <div v-if="filteredUsers.length === 0" class="picker-empty">
        No users match your search.
      </div>
      <ion-list v-else lines="none" class="picker-list">
        <ion-item
          v-for="user in filteredUsers"
          :key="user.userId"
          :class="{ 'picker-item--disabled': isDisabled(user.userId) }"
          class="picker-item"
        >
          <ion-checkbox
            slot="start"
            :checked="isSelected(user.userId)"
            :disabled="isDisabled(user.userId)"
            @ion-change="onToggle(user.userId, $event)"
          />
          <ion-label>
            <div class="user-email">{{ user.email }}</div>
            <div v-if="user.displayName" class="user-name">{{ user.displayName }}</div>
          </ion-label>
          <ion-badge v-if="isDisabled(user.userId)" slot="end" color="medium">
            creator
          </ion-badge>
        </ion-item>
      </ion-list>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  IonSearchbar,
  IonList,
  IonItem,
  IonCheckbox,
  IonLabel,
  IonBadge,
} from '@ionic/vue';
import { legalJobsService } from '../legalJobsService';

interface OrgUser {
  userId: string;
  email: string;
  displayName?: string;
}

const props = defineProps<{
  orgSlug: string;
  /** Currently selected user IDs (v-model). */
  modelValue: string[];
  /** User IDs that are pre-selected and cannot be deselected (e.g. creator). */
  disabledUserIds: string[];
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string[]): void;
}>();

const users = ref<OrgUser[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);
const search = ref('');

const filteredUsers = computed(() => {
  const term = search.value.trim().toLowerCase();
  if (!term) return users.value;
  return users.value.filter(
    (u) =>
      u.email.toLowerCase().includes(term) ||
      (u.displayName?.toLowerCase().includes(term) ?? false),
  );
});

function isSelected(userId: string): boolean {
  return props.modelValue.includes(userId);
}

function isDisabled(userId: string): boolean {
  return props.disabledUserIds.includes(userId);
}

function onToggle(userId: string, event: CustomEvent): void {
  if (isDisabled(userId)) return;
  const checked = (event.detail as { checked: boolean }).checked;
  const current = props.modelValue.slice();
  if (checked && !current.includes(userId)) {
    emit('update:modelValue', [...current, userId]);
  } else if (!checked && current.includes(userId)) {
    emit('update:modelValue', current.filter((id) => id !== userId));
  }
}

onMounted(async () => {
  loading.value = true;
  loadError.value = null;
  try {
    const result = await legalJobsService.listOrganizationUsers(props.orgSlug);
    users.value = result;
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Failed to load users.';
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.org-user-picker {
  margin-top: 8px;
}

.picker-loading,
.picker-empty {
  color: var(--ion-color-medium);
  font-size: 0.875rem;
  padding: 8px 0;
}

.picker-error {
  color: var(--ion-color-danger);
  font-size: 0.875rem;
  padding: 8px 0;
}

.picker-search {
  --padding-start: 0;
  --padding-end: 0;
  padding: 0;
  margin-bottom: 4px;
}

.picker-list {
  max-height: 220px;
  overflow-y: auto;
  border: 1px solid var(--ion-color-step-150);
  border-radius: 8px;
}

.picker-item {
  --padding-start: 12px;
  --inner-padding-end: 12px;
}

.picker-item--disabled {
  opacity: 0.6;
}

.user-email {
  font-size: 0.9rem;
}

.user-name {
  font-size: 0.78rem;
  color: var(--ion-color-medium);
}
</style>
