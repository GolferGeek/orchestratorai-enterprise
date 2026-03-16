<script setup lang="ts">
import {
  IonToolbar,
  IonTitle,
  IonButtons,
  IonIcon,
} from '@ionic/vue';
import ThemeToggle from './ThemeToggle.vue';
import CrawlerBubble from './CrawlerBubble.vue';
import UserMenu from './UserMenu.vue';

interface Props {
  productName: string;
  productIcon?: string;
  userName?: string;
  orgName?: string;
  showCrawlerBubble?: boolean;
  showThemeToggle?: boolean;
  forgeApiUrl?: string;
}

const props = withDefaults(defineProps<Props>(), {
  productIcon: undefined,
  userName: undefined,
  orgName: undefined,
  showCrawlerBubble: true,
  showThemeToggle: true,
  forgeApiUrl: 'http://localhost:6200',
});

const emit = defineEmits<{
  signOut: [];
}>();
</script>

<template>
  <IonToolbar class="oai-topnav">
    <!-- Left: product icon + name -->
    <IonButtons slot="start" class="oai-topnav__start">
      <div class="oai-topnav__brand">
        <IonIcon
          v-if="props.productIcon"
          :icon="props.productIcon"
          class="oai-topnav__product-icon"
        />
        <span class="oai-topnav__product-name">{{ props.productName }}</span>
      </div>
    </IonButtons>

    <!-- Center: optional slot for product-specific nav items -->
    <IonTitle class="oai-topnav__center">
      <slot name="center" />
    </IonTitle>

    <!-- Right: CrawlerBubble, ThemeToggle, UserMenu -->
    <IonButtons slot="end" class="oai-topnav__end">
      <CrawlerBubble
        v-if="props.showCrawlerBubble"
        :forge-api-url="props.forgeApiUrl"
      />
      <ThemeToggle v-if="props.showThemeToggle" />
      <UserMenu
        :user-name="props.userName"
        :org-name="props.orgName"
        @sign-out="emit('signOut')"
      />
    </IonButtons>
  </IonToolbar>
</template>

<style scoped>
.oai-topnav {
  --background: var(--ion-toolbar-background, #1e293b);
  --color: var(--ion-toolbar-color, #e2e8f0);
  --border-color: var(--ion-toolbar-border-color, #334155);
  --border-width: 0 0 1px 0;
  --min-height: var(--oai-topnav-height, 56px);
  --padding-start: var(--oai-space-4, 1rem);
  --padding-end: var(--oai-space-4, 1rem);
}

.oai-topnav__start {
  flex-shrink: 0;
}

.oai-topnav__brand {
  display: flex;
  align-items: center;
  gap: var(--oai-space-2, 0.5rem);
  padding: 0 var(--oai-space-2, 0.5rem);
}

.oai-topnav__product-icon {
  font-size: 1.25rem;
  color: var(--ion-color-primary, #3b82f6);
  flex-shrink: 0;
}

.oai-topnav__product-name {
  font-size: var(--oai-font-size-sm, 0.875rem);
  font-weight: var(--oai-font-weight-semibold, 600);
  color: var(--oai-text-primary, #e2e8f0);
  white-space: nowrap;
  letter-spacing: 0.01em;
}

.oai-topnav__center {
  --color: var(--oai-text-primary, #e2e8f0);
  text-align: center;
}

.oai-topnav__end {
  gap: var(--oai-space-1, 0.25rem);
  flex-shrink: 0;
}
</style>
