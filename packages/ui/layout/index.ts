/**
 * @orchestratorai/ui/layout
 *
 * Ionic-based layout shell components for OrchestratorAI Enterprise products.
 *
 * Usage:
 *   import { OaiAppShell, OaiTopNav, OaiSidebar } from '@orchestratorai/ui/layout'
 *
 * Or from the shared UI package root:
 *   import { OaiAppShell } from '@orchestratorai/ui'
 *
 * Typical setup in a product's App.vue:
 *   <OaiAppShell
 *     product-name="Forge"
 *     product-slug="forge"
 *     :nav-items="navItems"
 *     :user-name="authStore.userName"
 *     :org-name="authStore.orgName"
 *     @sign-out="authStore.signOut()"
 *   />
 */

export { default as OaiAppShell } from './OaiAppShell.vue';
export { default as OaiTopNav } from './OaiTopNav.vue';
export { default as OaiSidebar } from './OaiSidebar.vue';
export { default as ThemeToggle } from './ThemeToggle.vue';
export { default as CrawlerBubble } from './CrawlerBubble.vue';
export { default as UserMenu } from './UserMenu.vue';
export type { NavItem } from './OaiSidebar.vue';
