<template>
  <ion-modal :is-open="isOpen" @will-dismiss="$emit('cancel')">
    <ion-header>
      <ion-toolbar>
        <ion-title>Delete Conversation</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="$emit('cancel')">
            <ion-icon :icon="closeOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <div class="delete-conversation-content">
        <!-- Warning Message -->
        <div class="warning-section">
          <ion-icon :icon="warningOutline" color="warning" class="warning-icon" />
          <h2>Are you sure you want to delete this conversation?</h2>
          <p class="conversation-info">
            <strong>{{ agentDisplayName }}</strong>
          </p>
          <p class="warning-text">
            This action cannot be undone and will delete all tasks, deliverables, and conversation data.
          </p>
          <p v-if="activeTasks > 0" class="active-tasks-warning">
            <ion-icon :icon="alertCircleOutline" color="danger" />
            This conversation has {{ activeTasks }} running task{{ activeTasks > 1 ? 's' : '' }} that will be cancelled.
          </p>
        </div>
        <!-- Deliverable Deletion Option -->
        <div v-if="hasDeliverables" class="deliverable-section">
          <ion-item lines="none" class="deliverable-checkbox">
            <ion-checkbox
              v-model="deleteDeliverables"
              slot="start"
            />
            <ion-label>
              <h3>Delete associated tasks and deliverables</h3>
              <p><strong>Required:</strong> You must delete associated tasks and deliverables when deleting this conversation. Unchecking this box will disable the delete button.</p>
            </ion-label>
          </ion-item>
        </div>
        <!-- Action Buttons -->
        <div class="button-section">
          <ion-button 
            fill="clear" 
            color="medium" 
            @click="$emit('cancel')"
            class="cancel-button"
          >
            Cancel
          </ion-button>
          <ion-button
            fill="solid"
            color="danger"
            @click="confirmDelete"
            :disabled="hasDeliverables && !deleteDeliverables"
            class="delete-button"
          >
            Delete Conversation
          </ion-button>
        </div>
      </div>
    </ion-content>
  </ion-modal>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonIcon,
  IonItem,
  IonCheckbox,
  IonLabel,
} from '@ionic/vue';
import {
  closeOutline,
  warningOutline,
  alertCircleOutline,
} from 'ionicons/icons';
interface Props {
  isOpen: boolean;
  agentDisplayName: string;
  activeTasks: number;
  hasDeliverables: boolean;
}
const props = defineProps<Props>();
const emit = defineEmits<{
  cancel: [];
  confirm: [deleteDeliverables: boolean];
}>();
const deleteDeliverables = ref(true);

watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    // Default checkbox to checked when modal opens
    // Users must delete associated tasks and deliverables with the conversation
    deleteDeliverables.value = true;
  }
});
const confirmDelete = () => {
  emit('confirm', deleteDeliverables.value);
};
</script>
<style scoped>
.delete-conversation-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 24px;
}
.warning-section {
  text-align: center;
  padding: 24px 0;
}
.warning-icon {
  font-size: 48px;
  margin-bottom: 16px;
}
.warning-section h2 {
  color: var(--ion-color-danger);
  margin-bottom: 12px;
  font-size: 1.2em;
  font-weight: 600;
}
.conversation-info {
  font-size: 1.1em;
  margin-bottom: 16px;
  color: var(--ion-color-primary);
}
.warning-text {
  color: var(--ion-color-medium);
  line-height: 1.5;
  margin-bottom: 16px;
}
.active-tasks-warning {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  /* Use Ionic theme contrast for readable text on danger background */
  background: var(--ion-color-danger);
  color: var(--ion-color-danger-contrast);
  font-weight: 600;
  padding: 12px;
  border-radius: 8px;
  margin-top: 16px;
  border: 1px solid var(--ion-color-danger-shade);
}
/* Ensure the alert icon is visible on the danger background */
.active-tasks-warning ion-icon {
  color: var(--ion-color-danger-contrast) !important;
}
.deliverable-section {
  border-top: 1px solid var(--ion-color-light-shade);
  border-bottom: 1px solid var(--ion-color-light-shade);
  padding: 16px 0;
}
.deliverable-checkbox {
  --padding-start: 0;
  --padding-end: 0;
}
.deliverable-checkbox ion-label h3 {
  color: var(--ion-color-dark);
  font-weight: 500;
  margin-bottom: 4px;
}
.deliverable-checkbox ion-label p {
  color: var(--ion-color-medium);
  font-size: 0.9em;
  line-height: 1.4;
}
.button-section {
  display: flex;
  gap: 12px;
  margin-top: auto;
  padding-top: 24px;
}
.cancel-button {
  flex: 1;
}
.delete-button {
  flex: 2;
}
@media (max-width: 768px) {
  .button-section {
    flex-direction: column;
  }
  .cancel-button,
  .delete-button {
    flex: none;
  }
}
</style>
