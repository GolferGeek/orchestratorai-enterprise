/**
 * View Mode composable — controls product visibility in the Command shell.
 *
 * Standard: shows Agents and Workflows.
 * Advanced: adds Ambient, Secure Conversations, and Administration.
 *
 * Persisted in localStorage so the choice survives page reloads.
 */

import { ref, computed } from 'vue';

export type ViewMode = 'standard' | 'advanced';

/** Product slugs only visible in advanced mode. Protocol Lab stays outside the starter runtime. */
const ADVANCED_SLUGS = new Set(['pulse', 'bridge', 'admin']);
const STARTER_HIDDEN_SLUGS = new Set(['protocol-lab']);
const ADVANCED_SLUGS_ARRAY = [...ADVANCED_SLUGS];

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
    if (STARTER_HIDDEN_SLUGS.has(productSlug)) return false;
    if (viewMode.value === 'advanced') return true;
    return !ADVANCED_SLUGS.has(productSlug);
  }

  /** Slugs to hide from the product switcher dropdown in standard mode */
  const hiddenSlugs = computed(() => {
    const hidden = new Set(STARTER_HIDDEN_SLUGS);
    if (viewMode.value === 'standard') {
      ADVANCED_SLUGS_ARRAY.forEach((slug) => hidden.add(slug));
    }
    return [...hidden];
  });

  return {
    viewMode,
    setViewMode,
    isVisibleInCurrentMode,
    hiddenSlugs,
  };
}
