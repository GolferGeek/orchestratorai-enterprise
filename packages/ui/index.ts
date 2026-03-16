/**
 * @orchestratorai/ui
 *
 * Shared Vue 3 UI component library for OrchestratorAI Enterprise products.
 * Components are raw Vue SFCs — imported and bundled by the consuming product's Vite build.
 *
 * Usage:
 *   import { OaiAppShell, ClaudeCodePane } from '@orchestratorai/ui'
 */

// ============================================================
// Layout — Ionic-based shell components
// ============================================================

/** Master layout component — wrap every authenticated product page with this */
export { default as OaiAppShell } from './layout/OaiAppShell.vue';

/** Top navigation toolbar — product name/icon, center slot, right actions */
export { default as OaiTopNav } from './layout/OaiTopNav.vue';

/** Sidebar navigation — IonMenu + IonList with nested accordion support */
export { default as OaiSidebar } from './layout/OaiSidebar.vue';

/** Theme toggle button — dark/light via useTheme() */
export { default as ThemeToggle } from './layout/ThemeToggle.vue';

/** Crawler/support chat bubble — guest-mode JSON-RPC chat to Forge API */
export { default as CrawlerBubble } from './layout/CrawlerBubble.vue';

/** User avatar menu — name, org, sign-out action */
export { default as UserMenu } from './layout/UserMenu.vue';

/** NavItem type for OaiSidebar and OaiAppShell */
export type { NavItem } from './layout/OaiSidebar.vue';

// ============================================================
// Claude Code Pane — shared dev tool for all products
// ============================================================
export { default as ClaudeCodePane } from './claude-pane/ClaudeCodePane.vue';
export { default as ClaudePaneToolProgress } from './claude-pane/ClaudePaneToolProgress.vue';
export { useClaudePane } from './claude-pane/useClaudePane';
export { ClaudePaneApiService, getToolVerb, TOOL_VERBS } from './claude-pane/claudePaneService';
export type { OutputEntry, PanelState } from './claude-pane/useClaudePane';
export type { ClaudeCommand, ClaudeSkill, ClaudeMessage, ActiveTool } from './claude-pane/claudePaneService';

// ============================================================
// Theme — composable + early-apply helper
// (CSS files are imported by consuming apps from @orchestratorai/ui/theme/*)
// ============================================================
export { useTheme, applyThemeEarly } from './theme/useTheme';
export type { ThemeMode } from './theme/useTheme';

// ============================================================
// Primitive UI components — OAI design system
// ============================================================
export {
  OaiCard,
  OaiButton,
  OaiInput,
  OaiSelect,
  OaiSearchBar,
  OaiBadge,
  OaiStatusDot,
  OaiModal,
  OaiTabs,
  OaiPageHeader,
  OaiTable,
  OaiEmptyState,
  OaiLoadingSpinner,
  useToast,
} from './components';
export type {
  ToastVariant,
  SelectOption,
  Tab,
  TableColumn,
} from './components';
