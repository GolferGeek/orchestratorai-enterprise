<template>
  <div class="compact-llm-control">
    <div
      class="compact-display"
      role="button"
      tabindex="0"
      aria-label="Change AI provider and model"
      title="Click to change AI provider and model"
      @click="openModal"
      @keydown.enter.prevent="openModal"
      @keydown.space.prevent="openModal"
    >
      <div class="llm-info">
        <span class="provider-model">
          {{ currentProvider }} - {{ currentModel }}
        </span>
        <div class="cidafm-preview">
          <span
            v-for="modifier in firstTwoModifiers"
            :key="modifier"
            class="modifier-tag"
          >
            {{ modifier }}
          </span>
          <span v-if="additionalModifiersCount > 0" class="more-count">
            +{{ additionalModifiersCount }}
          </span>
        </div>
      </div>
      <div class="actions">
        <span class="change-label">Change</span>
        <ion-icon :icon="settingsOutline" class="settings-icon" />
      </div>
    </div>

    <!-- Unified LLM Selector Modal -->
    <LLMSelectorModal
      :is-open="isModalOpen"
      mode="select"
      title="Change Language Model"
      description="Select your preferred AI provider and model for this conversation."
      @dismiss="closeModal"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { IonIcon } from "@ionic/vue";
import { settingsOutline } from "ionicons/icons";
import { useLLMPreferencesStore } from "@/stores/llmPreferencesStore";
import { useUserPreferencesStore } from "@/stores/userPreferencesStore";
import LLMSelectorModal from "./LLMSelectorModal.vue";

const llmStore = useLLMPreferencesStore();
const userPreferencesStore = useUserPreferencesStore();
const isModalOpen = ref(false);

onMounted(async () => {
  // Ensure preferences are ready
  await userPreferencesStore.initializePreferences();

  // Always ensure the LLM catalog is loaded (idempotent)
  // This avoids cases where a prior selection exists but provider/model lists are empty
  try {
    // Load policy first so filtering is correct if enforced
    await llmStore.initializeSovereignMode?.();

    await llmStore.initialize({
      preferredProvider: userPreferencesStore.preferredProvider,
      preferredModel: userPreferencesStore.preferredModel,
    });

    // Warm the system model selection cache so Converse can use it immediately
    await llmStore.ensureSystemModelSelection?.();
  } catch {
    // Swallow initialization errors here; modal handles errors explicitly
  }

  // Keep user preferences in sync with current selection
  if (llmStore.selectedProvider?.name && llmStore.selectedModel?.modelName) {
    userPreferencesStore.setLLMPreferences(
      llmStore.selectedProvider.name,
      llmStore.selectedModel.modelName,
    );
  }
});

// Computed properties for display - llmStore is the live source of truth
const currentProvider = computed(
  () =>
    llmStore.selectedProvider?.name ||
    userPreferencesStore.preferredProvider ||
    "Default",
);

const currentModel = computed(
  () =>
    llmStore.selectedModel?.name ||
    userPreferencesStore.preferredModel ||
    "Auto",
);

const allModifiers = computed(() => [
  ...llmStore.selectedCIDAFMCommands,
  ...llmStore.customModifiers,
]);

const firstTwoModifiers = computed(() => allModifiers.value.slice(0, 2));

const additionalModifiersCount = computed(() =>
  Math.max(0, allModifiers.value.length - 2),
);

// Modal controls
const openModal = () => {
  isModalOpen.value = true;
};

const closeModal = () => {
  isModalOpen.value = false;
};
</script>

<style scoped>
.compact-llm-control {
  width: 100%;
}

.compact-display {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: var(--ion-color-step-75);
  border: 1px solid var(--ion-color-primary);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 2.75rem; /* 44px minimum touch target */
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

.compact-display:hover {
  background: var(--ion-color-primary-tint);
  border-color: var(--ion-color-primary);
}

.compact-display:focus {
  outline: 2px solid var(--ion-color-primary);
  outline-offset: 2px;
}

.llm-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0; /* Allow text truncation */
  text-align: left;
  justify-content: center;
}

.provider-model {
  font-weight: 500;
  font-size: 0.9rem;
  color: var(--ion-color-dark);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
}

.cidafm-preview {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-wrap: wrap;
}

.modifier-tag {
  background: var(--ion-color-primary);
  color: var(--ion-color-primary-contrast);
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 0.7rem;
  font-weight: 500;
  white-space: nowrap;
}

.more-count {
  background: var(--ion-color-medium);
  color: var(--ion-color-medium-contrast);
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 0.7rem;
  font-weight: 500;
}

.settings-icon {
  font-size: 1.1rem;
  margin-left: 6px;
  flex-shrink: 0;
}

.actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.change-label {
  font-weight: 600;
  font-size: 0.85rem;
}



.modal-content {
  --padding-top: 16px;
  --padding-bottom: 16px;
  --padding-start: 16px;
  --padding-end: 16px;
}

.settings-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* Dark theme support */
.theme-dark .compact-display {
  background: var(--ion-color-step-100);
  border-color: var(--ion-color-step-200);
}

.theme-dark .compact-display:hover {
  background: var(--ion-color-step-150);
  border-color: var(--ion-color-step-250);
}

.theme-dark .provider-model {
  color: var(--ion-color-light);
}

/* Mobile responsive */
@media (max-width: 768px) {
  .compact-display {
    padding: 8px 12px;
  }

  .provider-model {
    font-size: 0.85rem;
  }

  .modifier-tag,
  .more-count {
    font-size: 0.65rem;
    padding: 1px 4px;
  }
}
</style>
