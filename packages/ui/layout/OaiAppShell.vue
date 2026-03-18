<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  IonApp,
  IonSplitPane,
  IonPage,
  IonHeader,
  IonContent,
  IonRouterOutlet,
} from '@ionic/vue';
import OaiTopNav from './OaiTopNav.vue';
import OaiSidebar from './OaiSidebar.vue';
import type { NavItem } from './OaiSidebar.vue';
import { ClaudeCodePane } from '../claude-pane/index';
import { getProductDisplayName } from '@orchestrator-ai/transport-types';

interface Props {
  /** @deprecated Use productSlug — display name is now resolved from the product registry */
  productName?: string;
  productSlug: string;
  navItems: NavItem[];
  userName?: string;
  orgName?: string;
  showClaudePane?: boolean;
  showCrawlerBubble?: boolean;
  showThemeToggle?: boolean;
  homeUrl?: string;
  adminApiUrl?: string;
  forgeApiUrl?: string;
  menuId?: string;
  /** When true, use IonRouterOutlet for child route rendering (Ionic routing). Default: false (slot-based). */
  useRouterOutlet?: boolean;
  /** URL for the OrchestratorAI brand link (Command landing page). Default: 'http://localhost:6102' */
  landingUrl?: string;
}

const props = withDefaults(defineProps<Props>(), {
  productName: undefined,
  userName: undefined,
  orgName: undefined,
  homeUrl: undefined,
  showClaudePane: true,
  showCrawlerBubble: true,
  showThemeToggle: true,
  adminApiUrl: 'http://localhost:6150',
  forgeApiUrl: 'http://localhost:6200',
  menuId: 'oai-sidebar',
  useRouterOutlet: false,
  landingUrl: 'http://localhost:6102',
});

const emit = defineEmits<{
  signOut: [];
}>();

// Resolve display name: explicit prop wins, otherwise look up from registry
const resolvedProductName = computed(() =>
  props.productName ?? getProductDisplayName(props.productSlug)
);

// The content-id for IonSplitPane — must match the IonPage id
const contentId = 'main-content';

// Track Claude pane state so we can adjust IonRouterOutlet's right edge.
const claudePaneInset = ref('0px');

function onClaudePaneChange(state: { open: boolean; width: number }) {
  claudePaneInset.value = state.open ? `${state.width}px` : '0px';
}
</script>

<template>
  <IonApp class="oai-app-shell">
    <!--
      Top nav bar: plain div with position:fixed so it spans full viewport width.
      Lives outside IonSplitPane to avoid being constrained by IonPage bounds.
      Not an IonHeader — Ionic's web component shadow DOM fights position:fixed.
    -->
    <div class="oai-app-shell__topbar">
      <OaiTopNav
        :product-name="resolvedProductName"
        :home-url="props.homeUrl"
        :user-name="props.userName"
        :org-name="props.orgName"
        :show-crawler-bubble="props.showCrawlerBubble"
        :show-theme-toggle="props.showThemeToggle"
        :forge-api-url="props.forgeApiUrl"
        :menu-id="props.menuId"
        :landing-url="props.landingUrl"
        @sign-out="emit('signOut')"
      >
        <template v-if="$slots.topNavCenter" #center>
          <slot name="topNavCenter" />
        </template>
      </OaiTopNav>
    </div>

    <!-- Sidebar + content below the fixed top bar -->
    <IonSplitPane :content-id="contentId" when="lg" class="oai-app-shell__split-pane">
      <OaiSidebar
        :nav-items="props.navItems"
        :product-slug="props.productSlug"
        :menu-id="props.menuId"
      >
        <slot v-if="$slots.sidebar" name="sidebar" />
      </OaiSidebar>

      <IonPage
        :id="contentId"
        class="oai-app-shell__main"
        :style="{ '--claude-pane-inset': claudePaneInset }"
      >
        <!-- Empty IonHeader satisfies Ionic's page lifecycle (prevents classList errors) -->
        <IonHeader class="oai-app-shell__header-stub" />

        <IonRouterOutlet v-if="props.useRouterOutlet" />
        <IonContent v-else class="oai-app-shell__content">
          <slot />
        </IonContent>
      </IonPage>
    </IonSplitPane>

    <ClaudeCodePane
      v-if="props.showClaudePane"
      :product="props.productSlug"
      :admin-api-url="props.adminApiUrl"
      @pane-change="onClaudePaneChange"
    />
  </IonApp>
</template>

<style scoped>
.oai-app-shell {
  background: var(--oai-bg-page, #0f172a);
}

/*
 * Fixed top bar — full viewport width, above everything.
 * Uses a plain div (not IonHeader) because Ionic's shadow DOM
 * prevents position:fixed from working on ion-header.
 */
.oai-app-shell__topbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  height: var(--oai-topnav-height, 56px);
  background: var(--ion-toolbar-background, #1e293b);
  border-bottom: 1px solid var(--oai-border, #334155);
}

/*
 * Push the entire split pane down below the fixed top bar.
 */
.oai-app-shell__split-pane {
  --side-width: var(--oai-sidebar-width, 240px);
  --side-max-width: var(--oai-sidebar-width, 240px);
  --border: 1px solid var(--oai-border, #334155);
  margin-top: var(--oai-topnav-height, 56px);
}

/* Hidden stub — exists only so Ionic's page lifecycle doesn't crash */
.oai-app-shell__header-stub {
  display: none;
}

.oai-app-shell__main {
  --background: var(--oai-bg-page, #0f172a);
}

.oai-app-shell__main :deep(ion-router-outlet > .ion-page) {
  right: var(--claude-pane-inset, 0px);
}

.oai-app-shell__content {
  --background: var(--oai-bg-page, #0f172a);
  --color: var(--oai-text-primary, #e2e8f0);
  --padding-start: 0;
  --padding-end: 0;
  --padding-top: 0;
  --padding-bottom: 0;
}
</style>
