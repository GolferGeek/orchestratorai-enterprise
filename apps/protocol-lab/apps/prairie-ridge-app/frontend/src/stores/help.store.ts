import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { CodeReference } from '@agent-communication/shared-protocols';

export const useHelpStore = defineStore('help', () => {
  // Drawer state
  const drawerOpen = ref(false);

  // Scenario guide state
  const activeScenarioGuide = ref<number | null>(null);

  // Provider popover state
  const activeProvider = ref<string | null>(null);
  const popoverX = ref(0);
  const popoverY = ref(0);

  // Code viewer state
  const activeCodeRef = ref<CodeReference | null>(null);

  function toggleDrawer() {
    drawerOpen.value = !drawerOpen.value;
  }

  function openDrawer() {
    drawerOpen.value = true;
  }

  function closeDrawer() {
    drawerOpen.value = false;
  }

  function toggleScenarioGuide(scenarioId: number) {
    activeScenarioGuide.value =
      activeScenarioGuide.value === scenarioId ? null : scenarioId;
  }

  function closeScenarioGuide() {
    activeScenarioGuide.value = null;
  }

  function showProvider(providerId: string, x: number, y: number) {
    activeProvider.value = providerId;
    popoverX.value = x;
    popoverY.value = y;
  }

  function closeProvider() {
    activeProvider.value = null;
  }

  function showCode(codeRef: CodeReference) {
    activeCodeRef.value = codeRef;
    // Close the provider popover when showing code
    activeProvider.value = null;
  }

  function closeCode() {
    activeCodeRef.value = null;
  }

  function closeAll() {
    drawerOpen.value = false;
    activeScenarioGuide.value = null;
    activeProvider.value = null;
    activeCodeRef.value = null;
  }

  return {
    drawerOpen,
    activeScenarioGuide,
    activeProvider,
    popoverX,
    popoverY,
    activeCodeRef,
    toggleDrawer,
    openDrawer,
    closeDrawer,
    toggleScenarioGuide,
    closeScenarioGuide,
    showProvider,
    closeProvider,
    showCode,
    closeCode,
    closeAll,
  };
});
