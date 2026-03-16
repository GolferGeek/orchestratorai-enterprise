/**
 * @orchestratorai/ui — Primitive Components
 *
 * All OAI primitive UI components. Import individually or through
 * the package root '@orchestratorai/ui'.
 */

// Card
export { default as OaiCard } from './OaiCard.vue';

// Button
export { default as OaiButton } from './OaiButton.vue';

// Form controls
export { default as OaiInput } from './OaiInput.vue';
export { default as OaiSelect } from './OaiSelect.vue';
export { default as OaiSearchBar } from './OaiSearchBar.vue';

// Status & labels
export { default as OaiBadge } from './OaiBadge.vue';
export { default as OaiStatusDot } from './OaiStatusDot.vue';

// Overlays
export { default as OaiModal } from './OaiModal.vue';

// Navigation
export { default as OaiTabs } from './OaiTabs.vue';
export { default as OaiPageHeader } from './OaiPageHeader.vue';

// Data display
export { default as OaiTable } from './OaiTable.vue';

// Feedback & states
export { default as OaiEmptyState } from './OaiEmptyState.vue';
export { default as OaiLoadingSpinner } from './OaiLoadingSpinner.vue';

// Toast composable
export { useToast } from './OaiToast';
export type { ToastVariant } from './OaiToast';

// Component prop types
export type { SelectOption } from './OaiSelect.vue';
export type { Tab } from './OaiTabs.vue';
export type { TableColumn } from './OaiTable.vue';
