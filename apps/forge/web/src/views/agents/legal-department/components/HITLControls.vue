<template>
  <div class="hitl-controls">
    <div class="controls-header">
      <ion-icon :icon="personCircleOutline" />
      <span>Attorney Review Required</span>
    </div>

    <div class="controls-description">
      Review the analysis above and take action. Your decision will be recorded for audit purposes.
    </div>

    <!-- Action Buttons -->
    <div class="action-buttons">
      <ion-button
        color="success"
        :disabled="disabled"
        @click="handleAction('approve')"
      >
        <ion-icon :icon="checkmarkCircle" slot="start" />
        Approve
      </ion-button>

      <ion-button
        color="danger"
        fill="outline"
        :disabled="disabled"
        @click="showRejectModal = true"
      >
        <ion-icon :icon="closeCircle" slot="start" />
        Reject
      </ion-button>

      <ion-button
        color="warning"
        fill="outline"
        :disabled="disabled"
        @click="showReanalysisModal = true"
      >
        <ion-icon :icon="refreshCircle" slot="start" />
        Request Re-analysis
      </ion-button>
    </div>

    <!-- Export Button (only show for document analysis, not text queries) -->
    <div v-if="showExport !== false" class="export-actions">
      <ion-button
        fill="clear"
        size="small"
        @click="$emit('export', 'json')"
      >
        <ion-icon :icon="downloadOutline" slot="start" />
        Export JSON
      </ion-button>
      <ion-button
        fill="clear"
        size="small"
        @click="$emit('export', 'pdf')"
      >
        <ion-icon :icon="documentOutline" slot="start" />
        Export PDF
      </ion-button>
    </div>

    <!-- Reject Modal -->
    <ion-modal :is-open="showRejectModal" @did-dismiss="showRejectModal = false">
      <ion-header>
        <ion-toolbar>
          <ion-title>Reject Analysis</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="showRejectModal = false">Close</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <p>Please provide a reason for rejection:</p>
        <ion-textarea
          v-model="rejectComment"
          placeholder="Reason for rejection..."
          :rows="5"
          fill="outline"
        />
        <ion-button
          expand="block"
          color="danger"
          :disabled="!rejectComment.trim()"
          @click="submitReject"
        >
          Reject Analysis
        </ion-button>
      </ion-content>
    </ion-modal>

    <!-- Request Re-analysis Modal -->
    <ion-modal :is-open="showReanalysisModal" @did-dismiss="showReanalysisModal = false">
      <ion-header>
        <ion-toolbar>
          <ion-title>Request Re-analysis</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="showReanalysisModal = false">Close</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <p>Provide additional guidance for re-analysis:</p>
        <ion-textarea
          v-model="reanalysisComment"
          placeholder="What should be reconsidered or analyzed differently..."
          :rows="5"
          fill="outline"
        />
        <ion-button
          expand="block"
          color="warning"
          :disabled="!reanalysisComment.trim()"
          @click="submitReanalysis"
        >
          Request Re-analysis
        </ion-button>
      </ion-content>
    </ion-modal>
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import {
  IonButton,
  IonIcon,
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonContent,
  IonTextarea,
} from '@ionic/vue';
import {
  personCircleOutline,
  checkmarkCircle,
  closeCircle,
  refreshCircle,
  downloadOutline,
  documentOutline,
} from 'ionicons/icons';
import type { HITLAction } from '../legalDepartmentTypes';

// Props
defineProps<{
  disabled?: boolean;
  showExport?: boolean;
}>();

// Emits
const emit = defineEmits<{
  (e: 'action', action: HITLAction, comment?: string): void;
  (e: 'export', format: 'json' | 'pdf'): void;
}>();

// State
const showRejectModal = ref(false);
const showReanalysisModal = ref(false);
const rejectComment = ref('');
const reanalysisComment = ref('');

// Methods
function handleAction(action: HITLAction) {
  emit('action', action);
}

function submitReject() {
  emit('action', 'reject', rejectComment.value);
  showRejectModal.value = false;
  rejectComment.value = '';
}

function submitReanalysis() {
  emit('action', 'request_reanalysis', reanalysisComment.value);
  showReanalysisModal.value = false;
  reanalysisComment.value = '';
}
</script>

<style scoped>
.hitl-controls {
  background: var(--ion-card-background, var(--ion-background-color));
  border-radius: 12px;
  padding: 20px;
  border: 1px solid var(--ion-color-light-shade);
  border-left: 4px solid var(--ion-color-primary);
}

.controls-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-weight: 600;
  font-size: 16px;
}

.controls-header ion-icon {
  font-size: 24px;
  color: var(--ion-color-primary);
}

.controls-description {
  color: var(--ion-color-medium);
  font-size: 14px;
  margin-bottom: 16px;
}

.action-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}

.action-buttons ion-button {
  flex: 1;
  min-width: 140px;
}

.export-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  border-top: 1px solid var(--ion-color-light-shade);
  padding-top: 12px;
}

@media (max-width: 600px) {
  .action-buttons {
    flex-direction: column;
  }

  .action-buttons ion-button {
    width: 100%;
  }
}
</style>
