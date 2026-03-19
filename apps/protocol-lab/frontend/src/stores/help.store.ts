import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { HELP_ENTRIES, type HelpEntry } from '../content/help';

export const useHelpStore = defineStore('help', () => {
  const activeEntryId = ref<string | null>(null);
  const helpModeActive = ref(false);
  const recentlyViewed = ref<string[]>([]);

  const entries = computed<HelpEntry[]>(() => HELP_ENTRIES);

  const activeEntry = computed<HelpEntry | null>(() => {
    if (!activeEntryId.value) return null;
    return HELP_ENTRIES.find((e) => e.id === activeEntryId.value) ?? null;
  });

  function openHelp(id: string) {
    activeEntryId.value = id;
    // Add to recently viewed, keeping last 5, no duplicates
    recentlyViewed.value = [
      id,
      ...recentlyViewed.value.filter((rid) => rid !== id),
    ].slice(0, 5);
  }

  function closeHelp() {
    activeEntryId.value = null;
  }

  function toggleHelpMode() {
    helpModeActive.value = !helpModeActive.value;
  }

  function searchHelp(query: string): HelpEntry[] {
    if (!query.trim()) return [];
    const lower = query.toLowerCase();
    return HELP_ENTRIES.filter(
      (entry) =>
        entry.title.toLowerCase().includes(lower) ||
        entry.oneLiner.toLowerCase().includes(lower) ||
        entry.sections.some(
          (s) =>
            s.heading.toLowerCase().includes(lower) ||
            s.content.toLowerCase().includes(lower),
        ),
    );
  }

  return {
    entries,
    activeEntryId,
    activeEntry,
    helpModeActive,
    recentlyViewed,
    openHelp,
    closeHelp,
    toggleHelpMode,
    searchHelp,
  };
});
