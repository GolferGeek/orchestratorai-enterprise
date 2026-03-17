<script setup lang="ts">
import { ref } from 'vue';
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

interface Props {
  productName: string;
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
}

const props = withDefaults(defineProps<Props>(), {
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
});

const emit = defineEmits<{
  signOut: [];
}>();

// The content-id for IonSplitPane — must match the IonPage id
const contentId = 'main-content';

// Track Claude pane state so we can adjust IonRouterOutlet's right edge.
// ClaudeCodePane is absolutely positioned on the right; when open, we shrink
// the main content area by setting --claude-pane-inset on IonPage.
const claudePaneInset = ref('0px');

function onClaudePaneChange(state: { open: boolean; width: number }) {
  claudePaneInset.value = state.open ? `${state.width}px` : '0px';
}
</script>

<template>
  <IonApp class="oai-app-shell">
    <IonSplitPane :content-id="contentId" when="lg" class="oai-app-shell__split-pane">
      <!-- Sidebar (left nav) — always visible -->
      <OaiSidebar
        :nav-items="props.navItems"
        :product-slug="props.productSlug"
        :menu-id="props.menuId"
      />

      <!--
        IonPage must contain IonHeader + IonRouterOutlet as direct children
        (no wrapper divs) or Ionic's page transition system breaks.
        ClaudeCodePane is absolutely positioned on the right side.
      -->
      <IonPage
        :id="contentId"
        class="oai-app-shell__main"
        :style="{ '--claude-pane-inset': claudePaneInset }"
      >
        <!-- Top navigation header -->
        <IonHeader class="oai-app-shell__header">
          <OaiTopNav
            :product-name="props.productName"
            :home-url="props.homeUrl"
            :user-name="props.userName"
            :org-name="props.orgName"
            :show-crawler-bubble="props.showCrawlerBubble"
            :show-theme-toggle="props.showThemeToggle"
            :forge-api-url="props.forgeApiUrl"
            @sign-out="emit('signOut')"
          >
            <!-- Pass through optional center slot -->
            <template v-if="$slots.topNavCenter" #center>
              <slot name="topNavCenter" />
            </template>
          </OaiTopNav>
        </IonHeader>

        <!--
          useRouterOutlet=true: IonRouterOutlet renders child routes (Ionic routing).
          useRouterOutlet=false: IonContent wraps slot content (standard Vue routing).
        -->
        <IonRouterOutlet v-if="props.useRouterOutlet" />
        <IonContent v-else class="oai-app-shell__content">
          <slot />
        </IonContent>
      </IonPage>
    </IonSplitPane>

    <!--
      Claude Code Pane lives OUTSIDE Ionic's component tree (IonPage/IonSplitPane)
      to avoid DOM conflicts with Ionic's web components. Uses position: fixed
      on the right edge. The --claude-pane-inset CSS variable on IonPage shrinks
      the router outlet to make room.
    -->
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

.oai-app-shell__split-pane {
  --side-width: var(--oai-sidebar-width, 240px);
  --side-max-width: var(--oai-sidebar-width, 240px);
  --border: 1px solid var(--oai-border, #334155);
}

.oai-app-shell__main {
  /* IonPage fills the remaining width alongside the sidebar */
  --background: var(--oai-bg-page, #0f172a);
}

/*
 * When the Claude pane is open, shrink the child pages inside the router
 * outlet by adjusting their right edge. We target .ion-page (Ionic's class
 * for rendered pages) rather than ion-router-outlet itself, because Ionic
 * manages the outlet's positioning during page transitions — overriding it
 * causes "enteringEl is undefined" errors.
 */
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

.oai-app-shell__header {
  --background: var(--ion-toolbar-background, #1e293b);
  --border-color: var(--oai-border, #334155);
}
</style>
