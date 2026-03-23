/**
 * View Mode composable — controls product visibility in the Command shell.
 *
 * Standard: shows Forge, Compose, Protocol Lab (core agent products)
 * Advanced: adds Pulse, Bridge, Admin (infrastructure/ops products)
 *
 * Persisted in localStorage so the choice survives page reloads.
 */

import { ref } from 'vue';

export type ViewMode = 'standard' | 'advanced';

/** Product slugs only visible in advanced mode */
const ADVANCED_SLUGS = new Set(['pulse', 'bridge', 'admin']);

const STORAGE_KEY = 'oai_view_mode';

// Shared reactive state — all consumers see the same value
const viewMode = ref<ViewMode>(
  (localStorage.getItem(STORAGE_KEY) as ViewMode) || 'standard'
);

export function useViewMode() {
  function setViewMode(mode: ViewMode) {
    viewMode.value = mode;
    localStorage.setItem(STORAGE_KEY, mode);
  }

  function isVisibleInCurrentMode(productSlug: string): boolean {
    if (viewMode.value === 'advanced') return true;
    return !ADVANCED_SLUGS.has(productSlug);
  }

  return {
    viewMode,
    setViewMode,
    isVisibleInCurrentMode,
  };
}
