/**
 * Privacy Indicators Store
 *
 * Display preferences for the privacy badges on assistant messages. Purely
 * about what the viewer wants to see — the protection itself happens at the
 * LLM boundary on the server and is not affected by anything here.
 */
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

const STORAGE_KEY = 'oai.privacyIndicators';

export interface PrivacyIndicatorPreferences {
  /** Master switch for the whole badge row. */
  enabled: boolean;
  /** "N Pseudonyms" — dictionary values swapped before the provider call. */
  showPseudonyms: boolean;
  /** "N Redacted" — pattern matches replaced on top of the pseudonyms. */
  showRedactions: boolean;
  /** "N Flagged" — detected but not necessarily replaced. */
  showFlagged: boolean;
  /** "Local" / "External" — whether the message left the building. */
  showRouting: boolean;
  /** Renders the row smaller and without text labels. */
  compact: boolean;
}

const DEFAULTS: PrivacyIndicatorPreferences = {
  enabled: true,
  showPseudonyms: true,
  showRedactions: true,
  showFlagged: true,
  showRouting: true,
  compact: false,
};

function load(): PrivacyIndicatorPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    // Spread over defaults so a preference added later doesn't come back
    // undefined for someone with an older stored blob.
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<PrivacyIndicatorPreferences>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export const usePrivacyIndicatorsStore = defineStore('privacy-indicators', () => {
  const preferences = ref<PrivacyIndicatorPreferences>(load());

  watch(
    preferences,
    (value) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      } catch {
        // Storage can be unavailable (private mode, blocked site data). The
        // badges still work; the choice just doesn't survive a reload.
      }
    },
    { deep: true },
  );

  const enabled = computed(() => preferences.value.enabled);

  function setPreference<K extends keyof PrivacyIndicatorPreferences>(
    key: K,
    value: PrivacyIndicatorPreferences[K],
  ): void {
    preferences.value[key] = value;
  }

  function reset(): void {
    preferences.value = { ...DEFAULTS };
  }

  return { preferences, enabled, setPreference, reset };
});
