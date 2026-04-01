<script setup lang="ts">
import { ref } from 'vue';
import {
  IonButton,
  IonIcon,
  IonPopover,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
} from '@ionic/vue';
import { personCircleOutline, logOutOutline } from 'ionicons/icons';

interface Props {
  userName?: string;
  orgName?: string;
}

const props = withDefaults(defineProps<Props>(), {
  userName: undefined,
  orgName: undefined,
});

const emit = defineEmits<{
  signOut: [];
}>();

const isOpen = ref(false);
const triggerRef = ref<HTMLElement | null>(null);

function openMenu(event: Event) {
  // Store the trigger element for popover positioning
  triggerRef.value = event.currentTarget as HTMLElement;
  isOpen.value = true;
}

function closeMenu() {
  isOpen.value = false;
}

function handleSignOut() {
  closeMenu();
  emit('signOut');
}
</script>

<template>
  <div class="oai-user-menu">
    <!-- Trigger button -->
    <IonButton
      id="oai-user-menu-trigger"
      fill="clear"
      size="small"
      class="oai-user-menu__trigger"
      :title="props.userName ?? 'User menu'"
      @click="openMenu"
    >
      <IonIcon slot="start" :icon="personCircleOutline" class="oai-user-menu__avatar-icon" />
      <span v-if="props.userName" class="oai-user-menu__label">{{ props.userName }}</span>
    </IonButton>

    <!-- Popover panel -->
    <IonPopover
      trigger="oai-user-menu-trigger"
      trigger-action="click"
      :is-open="isOpen"
      :show-backdrop="false"
      side="bottom"
      alignment="end"
      class="oai-user-menu__popover"
      @did-dismiss="closeMenu"
    >
      <IonContent class="oai-user-menu__content">
        <!-- User info header -->
        <div class="oai-user-menu__header">
          <div class="oai-user-menu__avatar">
            <IonIcon :icon="personCircleOutline" class="oai-user-menu__avatar-large" />
          </div>
          <div class="oai-user-menu__info">
            <p class="oai-user-menu__name">{{ props.userName ?? 'User' }}</p>
            <p v-if="props.orgName" class="oai-user-menu__org">{{ props.orgName }}</p>
          </div>
        </div>

        <!-- Divider -->
        <div class="oai-user-menu__divider" />

        <!-- Actions -->
        <IonList lines="none" class="oai-user-menu__list">
          <IonItem
            button
            :detail="false"
            class="oai-user-menu__item oai-user-menu__item--danger"
            @click="handleSignOut"
          >
            <IonIcon slot="start" :icon="logOutOutline" />
            <IonLabel>Sign out</IonLabel>
          </IonItem>
        </IonList>
      </IonContent>
    </IonPopover>
  </div>
</template>

<style scoped>
.oai-user-menu {
  display: inline-flex;
  align-items: center;
}

.oai-user-menu__trigger {
  --color: var(--oai-text-secondary, #94a3b8);
  --color-hover: var(--oai-text-primary, #e2e8f0);
  --background-hover: var(--oai-btn-ghost-hover, rgba(59, 130, 246, 0.08));
  --border-radius: var(--oai-radius-full, 9999px);
}

.oai-user-menu__avatar-icon {
  font-size: 1.5rem;
}

.oai-user-menu__label {
  font-size: var(--oai-font-size-sm, 0.875rem);
  font-weight: var(--oai-font-weight-medium, 500);
  color: var(--oai-text-secondary, #94a3b8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 150px;
}

.oai-user-menu__popover {
  --width: 220px;
  --border-radius: var(--oai-radius-lg, 12px);
  --box-shadow: var(--oai-shadow-lg);
  --background: var(--oai-bg-surface, #1e293b);
}

.oai-user-menu__content {
  --background: var(--oai-bg-surface, #1e293b);
}

.oai-user-menu__header {
  display: flex;
  align-items: center;
  gap: var(--oai-space-3, 0.75rem);
  padding: var(--oai-space-4, 1rem);
}

.oai-user-menu__avatar {
  flex-shrink: 0;
}

.oai-user-menu__avatar-large {
  font-size: 2.5rem;
  color: var(--oai-text-secondary, #94a3b8);
}

.oai-user-menu__info {
  min-width: 0;
}

.oai-user-menu__name {
  margin: 0;
  font-size: var(--oai-font-size-sm, 0.875rem);
  font-weight: var(--oai-font-weight-semibold, 600);
  color: var(--oai-text-primary, #e2e8f0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.oai-user-menu__org {
  margin: 0;
  font-size: var(--oai-font-size-xs, 0.75rem);
  color: var(--oai-text-secondary, #94a3b8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.oai-user-menu__divider {
  height: 1px;
  background: var(--oai-border, #334155);
  margin: 0 var(--oai-space-2, 0.5rem);
}

.oai-user-menu__list {
  padding: var(--oai-space-2, 0.5rem);
  background: transparent;
}

.oai-user-menu__item {
  --background: transparent;
  --background-hover: var(--oai-btn-ghost-hover, rgba(59, 130, 246, 0.08));
  --color: var(--oai-text-secondary, #94a3b8);
  --border-radius: var(--oai-radius, 8px);
  --min-height: 40px;
  border-radius: var(--oai-radius, 8px);
  margin-bottom: 2px;
}

.oai-user-menu__item--danger {
  --color: var(--oai-btn-danger-bg, #ef4444);
  --background-hover: rgba(239, 68, 68, 0.08);
}
</style>
