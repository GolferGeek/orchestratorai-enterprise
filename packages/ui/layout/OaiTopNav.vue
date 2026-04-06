<script setup lang="ts">
import {
  IonToolbar,
  IonTitle,
  IonButtons,
  IonIcon,
  IonButton,
  IonMenuButton,
} from '@ionic/vue';
import { useRouter } from 'vue-router';
import ThemeToggle from './ThemeToggle.vue';
import CrawlerBubble from './CrawlerBubble.vue';
import UserMenu from './UserMenu.vue';

interface Props {
  productName: string;
  productIcon?: string;
  userName?: string;
  orgName?: string;
  homeUrl?: string;
  showCrawlerBubble?: boolean;
  showThemeToggle?: boolean;
  forgeApiUrl?: string;
  /** Route path for the Login button shown when userName is undefined. Default: '/login' */
  loginPath?: string;
  /** Menu ID that the hamburger button toggles on mobile. Default: 'oai-sidebar' */
  menuId?: string;
  /** URL for the OrchestratorAI brand link (Command landing page). Default: 'http://localhost:6102' */
  landingUrl?: string;
}

const props = withDefaults(defineProps<Props>(), {
  productIcon: undefined,
  userName: undefined,
  orgName: undefined,
  homeUrl: undefined,
  showCrawlerBubble: true,
  showThemeToggle: true,
  forgeApiUrl: import.meta.env.VITE_FORGE_API_URL || 'http://localhost:5200',
  loginPath: '/login',
  menuId: 'oai-sidebar',
  landingUrl: import.meta.env.VITE_BASE_URL ? '/' : (import.meta.env.VITE_COMMAND_WEB_URL || 'http://localhost:5102'),
});

const emit = defineEmits<{
  signOut: [];
}>();

const router = useRouter();

function navigateToLogin() {
  router.push(props.loginPath);
}
</script>

<template>
  <IonToolbar class="oai-topnav">
    <!-- Left: hamburger (mobile only) + OrchestratorAI brand (always, links to landing) -->
    <IonButtons slot="start" class="oai-topnav__start">
      <IonMenuButton :menu="props.menuId" class="oai-topnav__menu-btn" />
      <a :href="props.landingUrl" class="oai-topnav__brand">
        <span class="oai-topnav__brand-name">OrchestratorAI</span>
      </a>
    </IonButtons>

    <!-- Center: optional slot for product-specific nav items -->
    <IonTitle class="oai-topnav__center">
      <slot name="center" />
    </IonTitle>

    <!-- Right: CrawlerBubble, ThemeToggle, UserMenu or Login button -->
    <IonButtons slot="end" class="oai-topnav__end">
      <CrawlerBubble
        v-if="props.showCrawlerBubble"
        :forge-api-url="props.forgeApiUrl"
      />
      <ThemeToggle v-if="props.showThemeToggle" />
      <!-- Authenticated: show user menu with sign out -->
      <UserMenu
        v-if="props.userName"
        :user-name="props.userName"
        :org-name="props.orgName"
        @sign-out="emit('signOut')"
      />
      <!-- Unauthenticated: show Log In button -->
      <IonButton
        v-else
        fill="clear"
        size="small"
        class="oai-topnav__login-btn"
        @click="navigateToLogin"
      >
        Log In
      </IonButton>
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

.oai-topnav__menu-btn {
  --color: var(--oai-text-primary, #e2e8f0);
}

/* IonSplitPane when="lg" shows sidebar at 992px+. Hide hamburger when sidebar is visible. */
@media (min-width: 992px) {
  .oai-topnav__menu-btn {
    display: none;
  }
}

.oai-topnav__brand {
  display: flex;
  align-items: center;
  gap: var(--oai-space-2, 0.5rem);
  padding: 0 var(--oai-space-2, 0.5rem);
  text-decoration: none;
  color: inherit;
  cursor: pointer;
}

.oai-topnav__brand-name {
  font-size: 1.125rem;
  font-weight: var(--oai-font-weight-semibold, 600);
  color: var(--oai-text-primary, #e2e8f0);
  white-space: nowrap;
  letter-spacing: 0.01em;
}

.oai-topnav__brand:hover .oai-topnav__brand-name {
  color: var(--ion-color-primary, #3b82f6);
}

.oai-topnav__center {
  --color: var(--oai-text-primary, #e2e8f0);
  text-align: center;
}

.oai-topnav__end {
  gap: var(--oai-space-1, 0.25rem);
  flex-shrink: 0;
}

.oai-topnav__login-btn {
  --color: var(--oai-text-secondary, #94a3b8);
  --color-hover: var(--oai-text-primary, #e2e8f0);
  --background-hover: var(--oai-btn-ghost-hover, rgba(59, 130, 246, 0.08));
  font-size: var(--oai-font-size-sm, 0.875rem);
  font-weight: var(--oai-font-weight-semibold, 600);
}
</style>
