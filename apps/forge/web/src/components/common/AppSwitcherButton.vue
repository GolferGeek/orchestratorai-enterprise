<template>
  <div class="app-switcher" ref="switcherRef">
    <button class="app-switcher-btn" @click="isOpen = !isOpen" :title="'Switch apps'">
      <ion-icon :icon="appsOutline"></ion-icon>
      <span v-if="showLabel" class="app-switcher-label">Apps</span>
    </button>
    <div v-if="isOpen" class="app-switcher-dropdown">
      <a
        v-for="link in appLinks"
        :key="link.slug"
        :href="link.url"
        target="_blank"
        rel="noopener noreferrer"
        class="app-switcher-item"
        @click="isOpen = false"
      >
        <ion-icon :icon="link.icon"></ion-icon>
        <span>{{ link.displayName }}</span>
        <ion-icon :icon="openOutline" class="external-icon"></ion-icon>
      </a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import { IonIcon } from '@ionic/vue';
import {
  appsOutline,
  constructOutline,
  flaskOutline,
  hammerOutline,
  layersOutline,
  linkOutline,
  openOutline,
  pulseOutline,
  shieldCheckmarkOutline,
} from 'ionicons/icons';
import { PRODUCT_REGISTRY, PRODUCT_SLUGS } from '@orchestrator-ai/transport-types';

type AppSwitcherSlug = (typeof PRODUCT_SLUGS)[number];

defineProps<{
  showLabel?: boolean;
}>();

const isOpen = ref(false);
const switcherRef = ref<HTMLElement | null>(null);

const SLUG_ICONS: Record<AppSwitcherSlug, typeof appsOutline> = {
  command: appsOutline,
  forge: hammerOutline,
  compose: layersOutline,
  pulse: pulseOutline,
  bridge: linkOutline,
  admin: shieldCheckmarkOutline,
  'protocol-lab': flaskOutline,
};

const appLinks = computed(() =>
  PRODUCT_SLUGS.map((slug) => ({
    slug,
    displayName: PRODUCT_REGISTRY[slug].displayName,
    url: `http://localhost:${PRODUCT_REGISTRY[slug].webPort}`,
    icon: SLUG_ICONS[slug] ?? constructOutline,
  })),
);

function handleClickOutside(event: MouseEvent) {
  if (switcherRef.value && !switcherRef.value.contains(event.target as Node)) {
    isOpen.value = false;
  }
}

onMounted(() => document.addEventListener('click', handleClickOutside));
onBeforeUnmount(() => document.removeEventListener('click', handleClickOutside));
</script>

<style scoped>
.app-switcher {
  position: relative;
}

.app-switcher-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 32px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--ion-border-color, rgba(255, 255, 255, 0.1));
  border-radius: 4px;
  background: var(--ion-color-step-50, rgba(255, 255, 255, 0.05));
  color: var(--ion-text-color, #e0e0e0);
  cursor: pointer;
  transition: all 0.15s ease;
  font-size: 13px;
  font-weight: 500;
}

.app-switcher-btn:hover {
  background: var(--ion-color-step-100, rgba(255, 255, 255, 0.1));
}

.app-switcher-btn ion-icon {
  font-size: 18px;
  color: var(--ion-text-color, #e0e0e0);
}

.app-switcher-label {
  font-size: 12px;
}

.app-switcher-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  min-width: 200px;
  background: var(--ion-background-color, #1a1a2e);
  border: 1px solid var(--ion-border-color, rgba(255, 255, 255, 0.15));
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  z-index: 10000;
  overflow: hidden;
}

.app-switcher-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  color: var(--ion-text-color, #e0e0e0);
  text-decoration: none;
  font-size: 13px;
  font-weight: 500;
  transition: background 0.15s ease;
}

.app-switcher-item:hover {
  background: var(--ion-color-step-100, rgba(255, 255, 255, 0.08));
}

.app-switcher-item ion-icon {
  font-size: 16px;
  color: var(--ion-text-color, #e0e0e0);
}

.app-switcher-item .external-icon {
  margin-left: auto;
  font-size: 12px;
  opacity: 0.4;
}

/* Landing header variant - uses landing page color scheme */
:host-context(.landing-header) .app-switcher-btn,
.landing-variant .app-switcher-btn {
  border-color: var(--landing-primary, #8B5A3C);
  color: var(--landing-primary, #8B5A3C);
  background: transparent;
}

:host-context(.landing-header) .app-switcher-btn:hover,
.landing-variant .app-switcher-btn:hover {
  background: var(--landing-primary, #8B5A3C);
  color: white;
}

:host-context(.landing-header) .app-switcher-btn ion-icon,
.landing-variant .app-switcher-btn ion-icon {
  color: inherit;
}

:host-context(.landing-header) .app-switcher-dropdown,
.landing-variant .app-switcher-dropdown {
  background: white;
  border-color: rgba(139, 90, 60, 0.15);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

:host-context(.landing-header) .app-switcher-item,
.landing-variant .app-switcher-item {
  color: #333;
}

:host-context(.landing-header) .app-switcher-item:hover,
.landing-variant .app-switcher-item:hover {
  background: rgba(139, 90, 60, 0.06);
}

:host-context(.landing-header) .app-switcher-item ion-icon,
.landing-variant .app-switcher-item ion-icon {
  color: var(--landing-primary, #8B5A3C);
}
</style>
