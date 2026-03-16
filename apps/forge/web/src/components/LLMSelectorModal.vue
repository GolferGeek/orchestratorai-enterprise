<template>
  <ion-modal :is-open="isOpen" @will-dismiss="$emit('close')">
    <ion-header>
      <ion-toolbar>
        <ion-title>Select LLM Model</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="$emit('close')">
            <ion-icon :icon="closeOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-list>
        <ion-list-header>
          <ion-label>Provider</ion-label>
        </ion-list-header>
        <ion-item v-for="provider in providers" :key="provider.id">
          <ion-radio-group :value="selectedProvider" @ionChange="selectedProvider = $event.detail.value">
            <ion-radio :value="provider.id">{{ provider.displayName }}</ion-radio>
          </ion-radio-group>
        </ion-item>
      </ion-list>

      <ion-list v-if="filteredModels.length > 0">
        <ion-list-header>
          <ion-label>Model</ion-label>
        </ion-list-header>
        <ion-item v-for="model in filteredModels" :key="model.id">
          <ion-radio-group :value="selectedModel" @ionChange="selectedModel = $event.detail.value">
            <ion-radio :value="model.id">{{ model.displayName }}</ion-radio>
          </ion-radio-group>
        </ion-item>
      </ion-list>

      <ion-button expand="block" @click="handleSelect" :disabled="!selectedProvider || !selectedModel">
        Select
      </ion-button>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  IonModal, IonHeader, IonToolbar, IonTitle, IonContent,
  IonList, IonListHeader, IonItem, IonLabel, IonButton,
  IonButtons, IonIcon, IonRadio, IonRadioGroup,
} from '@ionic/vue';
import { closeOutline } from 'ionicons/icons';
import type { LLMProvider, LLMModel } from '@/services/llmService';

const props = defineProps<{
  isOpen: boolean;
  providers?: LLMProvider[];
  models?: LLMModel[];
  currentProvider?: string;
  currentModel?: string;
}>();

const emit = defineEmits<{
  close: [];
  select: [provider: string, model: string];
}>();

const selectedProvider = ref(props.currentProvider || '');
const selectedModel = ref(props.currentModel || '');

const filteredModels = computed(() =>
  (props.models || []).filter((m) => m.providerId === selectedProvider.value),
);

function handleSelect() {
  emit('select', selectedProvider.value, selectedModel.value);
  emit('close');
}
</script>
