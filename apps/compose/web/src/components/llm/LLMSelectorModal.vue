<template>
  <ion-modal :is-open="isOpen" @will-dismiss="$emit('dismiss')">
    <ion-header>
      <ion-toolbar>
        <ion-title>Select AI Model</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="$emit('dismiss')">
            <ion-icon :icon="closeOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div v-if="llmStore.loading" class="loading-state">
        Loading available models...
      </div>

      <div v-else class="selector-content">
        <p v-if="mediaTypeNotice" class="media-notice">
          {{ mediaTypeNotice }}
        </p>

        <!-- Provider selector -->
        <div class="field-group">
          <label class="field-label">Provider</label>
          <select
            v-model="localProvider"
            class="native-select"
            @change="onProviderChange"
          >
            <option value="" disabled>Select a provider</option>
            <option
              v-for="provider in llmStore.providersWithModels"
              :key="provider.name"
              :value="provider.name"
            >
              {{ provider.displayName
              }}<template v-if="provider.isLocal"> (local)</template>
            </option>
          </select>
        </div>

        <!-- Model selector -->
        <div class="field-group">
          <label class="field-label">Model</label>
          <select v-model="localModel" class="native-select">
            <option value="" disabled>Select a model</option>
            <option
              v-for="model in modelsForCurrentProvider"
              :key="model.modelName"
              :value="model.modelName"
            >
              {{ model.displayName
              }}<template v-if="model.isLocal"> (local)</template>
            </option>
          </select>
        </div>

        <!-- Action buttons -->
        <div class="button-row">
          <ion-button fill="clear" color="medium" @click="$emit('dismiss')">
            Cancel
          </ion-button>
          <ion-button
            fill="solid"
            color="primary"
            :disabled="!localProvider || !localModel"
            @click="applySelection"
          >
            <ion-icon slot="start" :icon="checkmarkOutline" />
            Apply
          </ion-button>
        </div>
      </div>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  toastController,
} from '@ionic/vue';
import { closeOutline, checkmarkOutline } from 'ionicons/icons';
import { useLLMStore } from '@/stores/llm.store';
import { useExecutionContextStore } from '@/stores/executionContextStore';

interface Props {
  isOpen: boolean;
  agentType?: string;
  mediaType?: 'image' | 'video';
}

const props = withDefaults(defineProps<Props>(), {
  agentType: undefined,
  mediaType: undefined,
});

const emit = defineEmits<{
  dismiss: [];
}>();

const llmStore = useLLMStore();
const executionContextStore = useExecutionContextStore();

const localProvider = ref<string>(llmStore.selectedProvider ?? '');
const localModel = ref<string>(llmStore.selectedModel ?? '');

const mediaTypeNotice = computed<string | undefined>(() => {
  if (props.agentType !== 'media') return undefined;
  if (props.mediaType === 'video') return 'Only video-generation models are shown.';
  return 'Only image-generation models are shown.';
});

const modelsForCurrentProvider = computed(() =>
  llmStore.modelsForProvider(localProvider.value),
);

watch(
  () => props.isOpen,
  async (open) => {
    if (!open) return;
    if (props.agentType) {
      await llmStore.loadForAgentType(props.agentType, props.mediaType);
    } else {
      await llmStore.fetchProvidersAndModels();
    }
    localProvider.value = llmStore.selectedProvider ?? '';
    localModel.value = llmStore.selectedModel ?? '';
  },
);

function onProviderChange(): void {
  localModel.value = '';
  const models = llmStore.modelsForProvider(localProvider.value);
  if (models.length > 0) {
    localModel.value = models[0].modelName;
  }
}

async function applySelection(): Promise<void> {
  llmStore.setProvider(localProvider.value);
  llmStore.setModel(localModel.value);

  // Update ExecutionContext so the invoke contract sends the selected provider/model
  if (executionContextStore.isInitialized) {
    executionContextStore.setLLM(localProvider.value, localModel.value);
  }

  const provider = llmStore.currentProvider;
  const model = llmStore.currentModel;
  const toast = await toastController.create({
    message: `Using ${provider?.displayName ?? localProvider.value} — ${model?.displayName ?? localModel.value}`,
    duration: 2000,
    color: 'success',
    position: 'bottom',
  });
  await toast.present();

  emit('dismiss');
}
</script>

<style scoped>
.selector-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.media-notice {
  background: var(--ion-color-warning-tint);
  color: var(--ion-color-dark);
  border: 1px solid var(--ion-color-warning);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 0.85rem;
  margin: 0;
}

.loading-state {
  color: var(--ion-color-medium);
  text-align: center;
  padding: 32px 0;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-weight: 500;
  font-size: 0.9rem;
  color: var(--ion-color-dark);
}

.native-select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--ion-color-medium);
  border-radius: 8px;
  background: var(--ion-background-color, #fff);
  color: var(--ion-color-dark);
  font-size: 0.95rem;
  appearance: auto;
}

.native-select:focus {
  outline: 2px solid var(--ion-color-primary);
  outline-offset: 1px;
  border-color: var(--ion-color-primary);
}

.button-row {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding-top: 8px;
}
</style>
