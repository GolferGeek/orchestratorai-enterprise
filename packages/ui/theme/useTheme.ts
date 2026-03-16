/**
 * useTheme — OrchestratorAI Theme Composable
 *
 * Manages dark/light theme switching across the product suite.
 *
 * Strategy:
 *   - Persists theme preference to localStorage ('orchestratorai-theme')
 *   - Sets [data-theme="dark"|"light"] on document.documentElement (<html>)
 *   - Toggles .dark class on document.body for Ionic compatibility
 *   - Reads persisted preference on initialization (SSR-safe)
 *
 * CSS files pick up the change via:
 *   :root[data-theme="dark"], body.dark { ... }  — ionic-dark.css
 *   :root[data-theme="light"], body:not(.dark) { ... } — ionic-light.css
 *
 * Usage:
 *   import { useTheme } from '@orchestratorai/ui/theme'
 *
 *   const { theme, isDark, toggleTheme, setTheme } = useTheme()
 */

import { ref, computed, onMounted } from 'vue';

export type ThemeMode = 'dark' | 'light';

const STORAGE_KEY = 'orchestratorai-theme';
const DEFAULT_THEME: ThemeMode = 'dark';

/**
 * Apply a theme to the DOM.
 * This is called both at init time and on toggle — kept separate so it
 * can be called outside of a component setup context (e.g., in main.ts).
 */
function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  const body = document.body;

  root.setAttribute('data-theme', mode);

  if (mode === 'dark') {
    body.classList.add('dark');
  } else {
    body.classList.remove('dark');
  }
}

/**
 * Read the persisted theme from localStorage.
 * Returns the default theme if nothing is stored or if running in SSR context.
 */
function readPersistedTheme(): ThemeMode {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return DEFAULT_THEME;
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'dark' || stored === 'light') {
    return stored;
  }

  // Check system preference as fallback before defaulting to dark
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }

  return DEFAULT_THEME;
}

/**
 * Persist theme choice to localStorage.
 */
function persistTheme(mode: ThemeMode): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, mode);
  }
}

/**
 * useTheme composable.
 *
 * Designed to be called from any component or composable. The reactive
 * `theme` ref is the source of truth for the current mode. All DOM
 * manipulation is side-effectful and handled here — callers just read
 * `theme` and call `toggleTheme()` or `setTheme()`.
 */
export function useTheme() {
  const theme = ref<ThemeMode>(DEFAULT_THEME);
  const isDark = computed(() => theme.value === 'dark');
  const isLight = computed(() => theme.value === 'light');

  /**
   * Toggle between dark and light themes.
   */
  function toggleTheme(): void {
    setTheme(theme.value === 'dark' ? 'light' : 'dark');
  }

  /**
   * Explicitly set the theme to a specific mode.
   */
  function setTheme(mode: ThemeMode): void {
    theme.value = mode;
    applyTheme(mode);
    persistTheme(mode);
  }

  /**
   * Initialize theme from storage on mount.
   * Called in onMounted to ensure DOM is available.
   */
  function initTheme(): void {
    const persisted = readPersistedTheme();
    theme.value = persisted;
    applyTheme(persisted);
  }

  // Initialize on component mount (safe for SSR)
  onMounted(() => {
    initTheme();
  });

  return {
    /** Current theme mode — 'dark' | 'light' */
    theme,
    /** True when current theme is dark */
    isDark,
    /** True when current theme is light */
    isLight,
    /** Toggle between dark and light */
    toggleTheme,
    /** Explicitly set theme to a mode */
    setTheme,
    /** Initialize theme from storage (call in main.ts if needed before mount) */
    initTheme,
  };
}

/**
 * applyThemeEarly — Call this in main.ts BEFORE app.mount() to prevent
 * the flash of wrong theme (FOWT). This reads localStorage and applies
 * the data-theme attribute synchronously before Vue renders anything.
 *
 * Usage in main.ts:
 *   import { applyThemeEarly } from '@orchestratorai/ui/theme'
 *   applyThemeEarly()
 *   createApp(App).mount('#app')
 */
export function applyThemeEarly(): void {
  const persisted = readPersistedTheme();
  applyTheme(persisted);
}
