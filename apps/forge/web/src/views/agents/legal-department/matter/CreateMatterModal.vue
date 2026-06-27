<template>
  <ion-modal :is-open="isOpen" @did-dismiss="$emit('close')">
    <ion-header>
      <ion-toolbar>
        <ion-title>New Matter</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="$emit('close')">Cancel</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ion-list>
        <ion-item>
          <ion-label position="stacked">Matter Name *</ion-label>
          <ion-input v-model="form.name" placeholder="e.g. Smith v. Jones" clear-input />
        </ion-item>

        <ion-item>
          <ion-label position="stacked">Client Name *</ion-label>
          <ion-input v-model="form.clientName" placeholder="e.g. Smith Corp" clear-input />
        </ion-item>

        <ion-item>
          <ion-label position="stacked">Matter Type *</ion-label>
          <ion-select v-model="form.matterType" placeholder="Select type">
            <ion-select-option value="litigation">Litigation</ion-select-option>
            <ion-select-option value="transaction">Transaction</ion-select-option>
            <ion-select-option value="regulatory">Regulatory</ion-select-option>
            <ion-select-option value="advisory">Advisory</ion-select-option>
            <ion-select-option value="other">Other</ion-select-option>
          </ion-select>
        </ion-item>

        <ion-item>
          <ion-label position="stacked">Jurisdiction</ion-label>
          <ion-input v-model="form.jurisdiction" placeholder="e.g. NY, Federal" clear-input />
        </ion-item>

        <ion-item>
          <ion-label position="stacked">Opposing Parties (comma-separated)</ion-label>
          <ion-input v-model="opposingPartiesRaw" placeholder="Jones LLC, Smith Inc" clear-input />
        </ion-item>

        <ion-item>
          <ion-label position="stacked">Description</ion-label>
          <ion-textarea
            v-model="form.description"
            placeholder="Brief description of the matter..."
            :auto-grow="true"
            :rows="3"
          />
        </ion-item>
      </ion-list>

      <div v-if="submitError" class="error-msg">{{ submitError }}</div>

      <ion-button
        expand="block"
        :disabled="!isValid || submitting"
        class="ion-margin-top"
        @click="submit"
      >
        <ion-spinner v-if="submitting" name="crescent" slot="start" />
        Create Matter
      </ion-button>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  IonModal, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonButton, IonList, IonItem, IonLabel, IonInput,
  IonSelect, IonSelectOption, IonTextarea, IonSpinner,
} from '@ionic/vue';
import { legalJobsService, type MatterRow } from '../legalJobsService';

const props = defineProps<{
  isOpen: boolean;
  orgSlug: string;
  context: {
    orgSlug: string;
    userId: string;
    conversationId: string;
    agentSlug: string;
    agentType: string;
    provider: string;
    model: string;
  } | null;
}>();

const emit = defineEmits<{
  close: [];
  created: [matter: MatterRow];
}>();

const form = ref({
  name: '',
  clientName: '',
  matterType: '',
  jurisdiction: '',
  description: '',
});
const opposingPartiesRaw = ref('');
const submitting = ref(false);
const submitError = ref<string | null>(null);

const isValid = computed(
  () =>
    form.value.name.trim().length > 0 &&
    form.value.clientName.trim().length > 0 &&
    form.value.matterType.length > 0 &&
    props.context !== null,
);

async function submit() {
  if (!isValid.value || !props.context) return;
  submitting.value = true;
  submitError.value = null;
  try {
    const opposingParties = opposingPartiesRaw.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const matter = await legalJobsService.createMatter({
      context: props.context,
      name: form.value.name.trim(),
      clientName: form.value.clientName.trim(),
      matterType: form.value.matterType,
      jurisdiction: form.value.jurisdiction.trim(),
      opposingParties,
      assignedUserIds: [],
      description: form.value.description.trim() || undefined,
    });

    form.value = { name: '', clientName: '', matterType: '', jurisdiction: '', description: '' };
    opposingPartiesRaw.value = '';
    emit('created', matter);
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : 'Failed to create matter';
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.error-msg {
  color: var(--ion-color-danger);
  padding: 8px 16px;
  font-size: 0.875rem;
}
</style>
