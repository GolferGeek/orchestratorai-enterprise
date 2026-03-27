<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import {
  IonMenu,
  IonContent,
  IonList,
  IonItem,
  IonIcon,
  IonLabel,
  IonBadge,
  IonMenuToggle,
  IonAccordionGroup,
  IonAccordion,
} from '@ionic/vue';
import {
  chevronDownOutline,
  hammerOutline,
  layersOutline,
  pulseOutline,
  gitBranchOutline,
  shieldCheckmarkOutline,
  gridOutline,
  navigateOutline,
  swapHorizontalOutline,
  flaskOutline,
} from 'ionicons/icons';
import {
  PRODUCT_REGISTRY,
  PRODUCT_CATEGORIES,
  PRODUCT_SLUGS,
  type ProductSlug,
  type ProductCategory,
} from '@orchestrator-ai/transport-types';

export interface NavItem {
  label: string;
  icon?: string;
  path?: string;
  children?: NavItem[];
  badge?: string | number;
  external?: boolean;
}

interface ProductLink {
  label: string;
  port: number;
  slug: string;
  icon: string;
  category?: ProductCategory;
  webUrl?: string;
}

interface ProductGroup {
  key: ProductCategory;
  label: string;
  products: ProductLink[];
}

interface Props {
  navItems: NavItem[];
  productSlug: string;
  menuId?: string;
  contentId?: string;
  /** When true, the default slot replaces the nav items list. Set by OaiAppShell when a #sidebar slot is provided. */
  hasCustomSidebar?: boolean;
  /** Product slugs to hide from the switcher dropdown (e.g. advanced-only products) */
  hiddenSlugs?: string[];
}

const props = withDefaults(defineProps<Props>(), {
  hasCustomSidebar: false,
  menuId: 'oai-sidebar',
  contentId: 'main-content',
  hiddenSlugs: () => [],
});

const route = useRoute();
const switcherOpen = ref(false);

// Map ionicon names from registry to actual icon imports
const ioniconMap: Record<string, string> = {
  'grid-outline': gridOutline,
  'hammer-outline': hammerOutline,
  'layers-outline': layersOutline,
  'git-branch-outline': gitBranchOutline,
  'pulse-outline': pulseOutline,
  'navigate-outline': navigateOutline,
  'shield-checkmark-outline': shieldCheckmarkOutline,
  'swap-horizontal-outline': swapHorizontalOutline,
  'flask-outline': flaskOutline,
};

// Build product list from registry.
// Gateway mode: detected when accessed via non-localhost (Cloudflare tunnel) OR VITE_GATEWAY_MODE is set.
// Products live at /<slug>/ paths. In local dev, webUrl is undefined → falls back to localhost:<port>.
const gatewayMode = !!import.meta.env.VITE_GATEWAY_MODE ||
  (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1');

const allProducts: ProductLink[] = (
  ['command', ...PRODUCT_SLUGS] as ProductSlug[]
).filter(slug => PRODUCT_REGISTRY[slug] != null)
.map(slug => {
  const def = PRODUCT_REGISTRY[slug];
  return {
    label: def.displayName,
    port: def.webPort,
    slug: def.slug,
    icon: ioniconMap[def.ionicon] ?? gridOutline,
    category: def.category,
    webUrl: gatewayMode ? (slug === 'command' ? '/' : `/${slug}/`) : undefined,
  };
});

const currentProduct = computed(() =>
  allProducts.find((p) => p.slug === props.productSlug)
);

const otherProductGroups = computed<ProductGroup[]>(() => {
  const hidden = new Set(props.hiddenSlugs);
  const others = allProducts.filter((p) => p.slug !== props.productSlug && !hidden.has(p.slug));
  return PRODUCT_CATEGORIES
    .map(cat => ({
      key: cat.key,
      label: cat.label,
      products: others.filter(p => p.category === cat.key),
    }))
    .filter(g => g.products.length > 0);
});

function isItemActive(item: NavItem): boolean {
  if (!item.path) return false;
  return route.path === item.path || route.path.startsWith(item.path + '/');
}

function hasActiveChild(item: NavItem): boolean {
  if (!item.children) return false;
  return item.children.some((child) => isItemActive(child));
}

function getProductSwitchUrl(product: ProductLink): string {
  // Gateway mode: same-origin paths, no sso_token needed (localStorage is shared)
  if (product.webUrl) {
    return product.webUrl;
  }
  // Local dev: different ports, pass sso_token via hash fragment (not query param)
  // Hash fragments are never sent to servers, proxies, or Referer headers
  const base = `http://localhost:${product.port}`;
  const token = localStorage.getItem('authToken');
  return token ? `${base}#sso_token=${token}` : base;
}

function toggleSwitcher() {
  switcherOpen.value = !switcherOpen.value;
}

function closeSwitcher() {
  switcherOpen.value = false;
}
</script>

<template>
  <IonMenu
    :menu-id="props.menuId"
    :content-id="props.contentId"
    class="oai-sidebar"
    side="start"
    type="overlay"
  >
    <!-- Product switcher — pinned to top of sidebar -->
    <div class="oai-sidebar__header">
      <button
        class="oai-sidebar__switcher-trigger"
        :class="{ 'oai-sidebar__switcher-trigger--open': switcherOpen }"
        @click="toggleSwitcher"
      >
        <IonIcon
          :icon="currentProduct?.icon ?? swapHorizontalOutline"
          class="oai-sidebar__switcher-trigger-icon"
        />
        <span class="oai-sidebar__switcher-trigger-label">
          {{ currentProduct?.label ?? 'Switch Product' }}
        </span>
        <IonIcon
          :icon="chevronDownOutline"
          class="oai-sidebar__switcher-chevron"
          :class="{ 'oai-sidebar__switcher-chevron--open': switcherOpen }"
        />
      </button>

      <!-- Flyout panel — drops down from the trigger -->
      <Transition name="switcher-slide">
        <div v-if="switcherOpen" class="oai-sidebar__switcher-panel">
          <template v-for="group in otherProductGroups" :key="group.key">
            <div class="oai-sidebar__switcher-group-label">{{ group.label }}</div>
            <a
              v-for="product in group.products"
              :key="product.slug"
              :href="getProductSwitchUrl(product)"
              class="oai-sidebar__switcher-link"
              @click="closeSwitcher"
            >
              <IonIcon :icon="product.icon" class="oai-sidebar__switcher-link-icon" />
              <span class="oai-sidebar__switcher-link-label">{{ product.label }}</span>
              <span class="oai-sidebar__switcher-link-port">:{{ product.port }}</span>
            </a>
          </template>
        </div>
      </Transition>
    </div>

    <div class="oai-sidebar__divider" />

    <IonContent class="oai-sidebar__content">
      <!-- Custom sidebar content (replaces nav items when provided) -->
      <slot v-if="props.hasCustomSidebar" />

      <!-- Primary nav (default when no slot content) -->
      <IonList v-else lines="none" class="oai-sidebar__list">
        <template v-for="item in props.navItems" :key="item.label">
          <!-- Item with children — collapsible accordion -->
          <IonAccordionGroup
            v-if="item.children && item.children.length > 0"
            class="oai-sidebar__accordion"
            :value="hasActiveChild(item) ? item.label : undefined"
          >
            <IonAccordion :value="item.label" class="oai-sidebar__accordion-item">
              <IonItem slot="header" class="oai-sidebar__item" :class="{ 'oai-sidebar__item--active': hasActiveChild(item) }">
                <IonIcon v-if="item.icon" slot="start" :icon="item.icon" class="oai-sidebar__item-icon" />
                <IonLabel class="oai-sidebar__item-label">{{ item.label }}</IonLabel>
                <IonBadge v-if="item.badge" slot="end" class="oai-sidebar__badge">{{ item.badge }}</IonBadge>
              </IonItem>
              <div slot="content" class="oai-sidebar__children">
                <IonMenuToggle v-for="child in item.children" :key="child.label" :auto-hide="false">
                  <IonItem
                    v-if="child.path"
                    :router-link="child.path"
                    router-direction="root"
                    class="oai-sidebar__item oai-sidebar__item--child"
                    :class="{ 'oai-sidebar__item--active': isItemActive(child) }"
                    lines="none"
                    :detail="false"
                  >
                    <IonIcon v-if="child.icon" slot="start" :icon="child.icon" class="oai-sidebar__item-icon" />
                    <IonLabel class="oai-sidebar__item-label">{{ child.label }}</IonLabel>
                    <IonBadge v-if="child.badge" slot="end" class="oai-sidebar__badge">{{ child.badge }}</IonBadge>
                  </IonItem>
                </IonMenuToggle>
              </div>
            </IonAccordion>
          </IonAccordionGroup>

          <!-- Flat item (no children) -->
          <IonMenuToggle v-else :auto-hide="false">
            <!-- External URL or cross-product path — use href for full navigation -->
            <IonItem
              v-if="item.path && (item.path.startsWith('http') || item.external)"
              :href="item.path"
              class="oai-sidebar__item"
              lines="none"
              :detail="false"
            >
              <IonIcon v-if="item.icon" slot="start" :icon="item.icon" class="oai-sidebar__item-icon" />
              <IonLabel class="oai-sidebar__item-label">{{ item.label }}</IonLabel>
              <IonBadge v-if="item.badge" slot="end" class="oai-sidebar__badge">{{ item.badge }}</IonBadge>
            </IonItem>
            <!-- Internal route — use router-link -->
            <IonItem
              v-else-if="item.path"
              :router-link="item.path"
              router-direction="root"
              class="oai-sidebar__item"
              :class="{ 'oai-sidebar__item--active': isItemActive(item) }"
              lines="none"
              :detail="false"
            >
              <IonIcon v-if="item.icon" slot="start" :icon="item.icon" class="oai-sidebar__item-icon" />
              <IonLabel class="oai-sidebar__item-label">{{ item.label }}</IonLabel>
              <IonBadge v-if="item.badge" slot="end" class="oai-sidebar__badge">{{ item.badge }}</IonBadge>
            </IonItem>
            <div v-else class="oai-sidebar__section-label">
              {{ item.label }}
            </div>
          </IonMenuToggle>
        </template>
      </IonList>

    </IonContent>

  </IonMenu>
</template>

<style scoped>
.oai-sidebar {
  --width: var(--oai-sidebar-width, 240px);
  --background: var(--oai-sidebar-bg, #1e293b);
  --border-right: 1px solid var(--oai-sidebar-border, #334155);
}

/* Force the menu's inner container to be flex so footer pins to bottom */
.oai-sidebar :deep(.menu-inner) {
  display: flex !important;
  flex-direction: column !important;
}

.oai-sidebar__content {
  --background: var(--oai-sidebar-bg, #1e293b);
  --padding-start: 0;
  --padding-end: 0;
  --padding-top: 0;
  --padding-bottom: 0;
  flex: 1;
  min-height: 0;
}

.oai-sidebar__list {
  background: transparent;
  padding: var(--oai-space-3, 0.75rem) var(--oai-space-2, 0.5rem);
  flex: 1;
}

/* Nav items */
.oai-sidebar__item {
  --background: transparent;
  --background-hover: var(--oai-sidebar-item-hover, rgba(59, 130, 246, 0.08));
  --background-activated: var(--oai-sidebar-item-active, rgba(59, 130, 246, 0.15));
  --color: var(--oai-sidebar-item-color, #94a3b8);
  --color-hover: var(--oai-text-primary, #e2e8f0);
  --border-radius: var(--oai-radius, 8px);
  --inner-padding-end: var(--oai-space-3, 0.75rem);
  --min-height: 40px;
  border-radius: var(--oai-radius, 8px);
  margin-bottom: 2px;
  transition: background-color var(--oai-transition, 150ms ease),
              color var(--oai-transition, 150ms ease);
}

.oai-sidebar__item--active {
  --background: var(--oai-sidebar-item-active, rgba(59, 130, 246, 0.15));
  --color: var(--oai-sidebar-item-color-active, #3b82f6);
}

.oai-sidebar__item--child {
  --padding-start: calc(var(--oai-space-4, 1rem) + var(--oai-space-4, 1rem));
  --min-height: 36px;
}

.oai-sidebar__item-icon {
  font-size: 1rem;
  color: var(--oai-sidebar-icon-color, #64748b);
  transition: color var(--oai-transition, 150ms ease);
}

.oai-sidebar__item--active .oai-sidebar__item-icon {
  color: var(--oai-sidebar-icon-color-active, #3b82f6);
}

.oai-sidebar__item-label {
  font-size: var(--oai-font-size-sm, 0.875rem);
  font-weight: var(--oai-font-weight-medium, 500);
}

.oai-sidebar__badge {
  --background: var(--oai-badge-primary-bg, rgba(59, 130, 246, 0.15));
  --color: var(--oai-badge-primary-color, #60a5fa);
  font-size: 0.65rem;
  padding: 2px 6px;
  border-radius: var(--oai-radius-full, 9999px);
}

/* Accordion */
.oai-sidebar__accordion {
  --background: transparent;
  --border-color: transparent;
}

.oai-sidebar__accordion-item {
  --background: transparent;
  --border-color: transparent;
}

.oai-sidebar__children {
  padding-left: var(--oai-space-2, 0.5rem);
  background: transparent;
}

/* Header — product switcher, pinned to top */
.oai-sidebar__header {
  padding: var(--oai-space-3, 0.75rem) var(--oai-space-2, 0.5rem);
  flex-shrink: 0;
  position: relative;
  background: var(--oai-sidebar-bg, #1e293b);
}

/* Section label */
.oai-sidebar__section-label {
  display: flex;
  align-items: center;
  gap: var(--oai-space-2, 0.5rem);
  font-size: var(--oai-font-size-xs, 0.75rem);
  font-weight: var(--oai-font-weight-medium, 500);
  color: var(--oai-sidebar-section-label, #475569);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: var(--oai-space-2, 0.5rem) var(--oai-space-3, 0.75rem);
  margin: 0;
}

.oai-sidebar__divider {
  height: 1px;
  background: var(--oai-sidebar-divider, #334155);
  margin: 0 var(--oai-space-2, 0.5rem);
}

/* Switcher trigger button */
.oai-sidebar__switcher-trigger {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--oai-sidebar-divider, #334155);
  border-radius: var(--oai-radius, 8px);
  background: var(--oai-sidebar-bg, #1e293b);
  color: var(--oai-sidebar-item-color, #94a3b8);
  cursor: pointer;
  transition: all 150ms ease;
  font-size: 1rem;
  font-weight: 600;
  font-family: inherit;
}

.oai-sidebar__switcher-trigger:hover {
  background: var(--oai-sidebar-item-hover, rgba(59, 130, 246, 0.08));
  border-color: rgba(59, 130, 246, 0.3);
  color: var(--oai-text-primary, #e2e8f0);
}

.oai-sidebar__switcher-trigger--open {
  background: var(--oai-sidebar-item-hover, rgba(59, 130, 246, 0.08));
  border-color: rgba(59, 130, 246, 0.4);
  color: var(--oai-text-primary, #e2e8f0);
}

.oai-sidebar__switcher-trigger-icon {
  font-size: 1.125rem;
  color: var(--oai-sidebar-icon-color-active, #3b82f6);
  flex-shrink: 0;
}

.oai-sidebar__switcher-trigger-label {
  flex: 1;
  text-align: left;
}

.oai-sidebar__switcher-chevron {
  font-size: 0.75rem;
  flex-shrink: 0;
  transition: transform 200ms ease;
  opacity: 0.5;
}

.oai-sidebar__switcher-chevron--open {
  transform: rotate(180deg);
  opacity: 1;
}

/* Flyout panel — drops down from the trigger */
.oai-sidebar__switcher-panel {
  position: absolute;
  top: calc(100% + 0.25rem);
  left: 0.5rem;
  right: 0.5rem;
  background: var(--oai-sidebar-bg, #1e293b);
  border: 1px solid rgba(59, 130, 246, 0.25);
  border-radius: var(--oai-radius, 8px);
  padding: 0.375rem;
  box-shadow:
    0 4px 24px rgba(0, 0, 0, 0.35),
    0 0 0 1px rgba(59, 130, 246, 0.1);
  z-index: 100;
  max-height: 320px;
  overflow-y: auto;
}

/* Slide transition */
.switcher-slide-enter-active,
.switcher-slide-leave-active {
  transition: all 200ms cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: top center;
}

.switcher-slide-enter-from,
.switcher-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.97);
}

/* Group labels inside the flyout */
.oai-sidebar__switcher-group-label {
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--oai-sidebar-section-label, #475569);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0.5rem 0.625rem 0.25rem;
}

.oai-sidebar__switcher-group-label:not(:first-child) {
  margin-top: 0.25rem;
  border-top: 1px solid var(--oai-sidebar-divider, #334155);
  padding-top: 0.5rem;
}

/* Product links inside the flyout */
.oai-sidebar__switcher-link {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.625rem;
  border-radius: 6px;
  color: var(--oai-sidebar-item-color, #94a3b8);
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 500;
  transition: all 120ms ease;
}

.oai-sidebar__switcher-link:hover {
  background: var(--oai-sidebar-item-hover, rgba(59, 130, 246, 0.08));
  color: var(--oai-text-primary, #e2e8f0);
}

.oai-sidebar__switcher-link:active {
  background: var(--oai-sidebar-item-active, rgba(59, 130, 246, 0.15));
}

.oai-sidebar__switcher-link-icon {
  font-size: 1rem;
  color: var(--oai-sidebar-icon-color, #64748b);
  flex-shrink: 0;
}

.oai-sidebar__switcher-link:hover .oai-sidebar__switcher-link-icon {
  color: var(--oai-sidebar-icon-color-active, #3b82f6);
}

.oai-sidebar__switcher-link-label {
  flex: 1;
}

.oai-sidebar__switcher-link-port {
  font-size: 0.6875rem;
  color: var(--oai-sidebar-section-label, #475569);
  font-family: var(--oai-font-family-mono, monospace);
}
</style>
