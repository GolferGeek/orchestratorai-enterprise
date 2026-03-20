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
          {{ displayProvider }} - {{ displayModel }}
        </span>
      </div>
      <div class="actions">
        <span class="change-label">Change</span>
        <ion-icon :icon="settingsOutline" class="settings-icon" />
      </div>
    </div>

    <LLMSelectorModal
      :is-open="isModalOpen"
      :agent-type="agentType"
      :media-type="mediaType"
      @dismiss="closeModal"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { IonIcon } from '@ionic/vue';
import { settingsOutline } from 'ionicons/icons';
import { useLLMStore } from '@/stores/llm.store';
import LLMSelectorModal from './LLMSelectorModal.vue';

interface Props {
  agentType?: string;
  mediaType?: 'image' | 'video';
}

const props = withDefaults(defineProps<Props>(), {
  agentType: undefined,
  mediaType: undefined,
});

const llmStore = useLLMStore();
const isModalOpen = ref(false);

onMounted(async () => {
  if (props.agentType) {
    await llmStore.loadForAgentType(props.agentType, props.mediaType);
  } else {
    await llmStore.fetchProvidersAndModels();
  }
});

const displayProvider = computed(
  () => llmStore.currentProvider?.displayName ?? llmStore.selectedProvider ?? 'Default',
);

const displayModel = computed(
  () => llmStore.currentModel?.displayName ?? llmStore.selectedModel ?? 'Auto',
);

function openModal(): void {
  isModalOpen.value = true;
}

function closeModal(): void {
  isModalOpen.value = false;
}
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
  min-height: 2.75rem;
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
  min-width: 0;
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

.actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.change-label {
  font-weight: 600;
  font-size: 0.85rem;
}

.settings-icon {
  font-size: 1.1rem;
  margin-left: 6px;
  flex-shrink: 0;
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
}
</style>
