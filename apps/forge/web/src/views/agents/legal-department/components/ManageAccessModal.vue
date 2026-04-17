<template>
  <ion-modal
    :is-open="isOpen"
    @will-dismiss="$emit('close')"
    @keydown.esc="$emit('close')"
    class="manage-access-modal"
  >
    <div class="ion-page">
      <ion-header>
        <ion-toolbar>
          <ion-title>Manage Access</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="$emit('close')">Cancel</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>

      <ion-content class="ion-padding">
        <p class="modal-description">
          Control who can view this Due Diligence Room.
        </p>

        <div class="ac-mode-row">
          <label class="ac-radio-label">
            <input
              type="radio"
              value="open"
              v-model="localMode"
            />
            <span>Open — visible to everyone in the org</span>
          </label>
          <label class="ac-radio-label">
            <input
              type="radio"
              value="allowlist"
              v-model="localMode"
            />
            <span>Restricted — only listed users</span>
          </label>
        </div>

        <div v-if="localMode === 'allowlist'" class="ac-picker-wrapper">
          <p class="ac-hint">
            Select which users can access this room. The creator is always included.
          </p>
          <OrgUserPicker
            :org-slug="orgSlug"
            v-model="localAllowedUserIds"
            :disabled-user-ids="[job.user_id]"
          />
        </div>

        <div v-if="error" class="error-message">{{ error }}</div>
      </ion-content>

      <ion-footer>
        <ion-toolbar>
          <div class="footer-actions">
            <ion-button fill="outline" @click="$emit('close')">Cancel</ion-button>
            <ion-button
              color="primary"
              :disabled="saving"
              @click="save"
            >
              <ion-spinner v-if="saving" name="dots" />
              <span v-else>Save</span>
            </ion-button>
          </div>
        </ion-toolbar>
      </ion-footer>
    </div>
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
  IonFooter,
  IonSpinner,
} from '@ionic/vue';
import {
  legalJobsService,
  type AgentJobRow,
  type ExecutionContextLike,
  type AccessControlMode,
} from '../legalJobsService';
import OrgUserPicker from './OrgUserPicker.vue';

const props = defineProps<{
  isOpen: boolean;
  job: AgentJobRow;
  orgSlug: string;
  currentUserId: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'updated'): void;
}>();

const localMode = ref<AccessControlMode>(props.job.access_control?.mode ?? 'open');
const localAllowedUserIds = ref<string[]>(
  props.job.access_control?.allowedUserIds?.slice() ?? [props.job.user_id],
);
const saving = ref(false);
const error = ref<string | null>(null);

// Reseed local state whenever the modal opens with a (possibly updated) job
watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      localMode.value = props.job.access_control?.mode ?? 'open';
      localAllowedUserIds.value =
        props.job.access_control?.allowedUserIds?.slice() ?? [props.job.user_id];
      error.value = null;
    }
  },
);

function buildContext(): ExecutionContextLike {
  return {
    orgSlug: props.orgSlug,
    userId: props.currentUserId,
    conversationId: props.job.conversation_id,
    agentSlug: 'legal-department',
    agentType: 'langgraph',
    provider: 'ollama',
    model: 'gemma4:e4b',
  };
}

async function save(): Promise<void> {
  saving.value = true;
  error.value = null;
  try {
    const accessControl =
      localMode.value === 'allowlist'
        ? {
            mode: 'allowlist' as const,
            // Ensure creator is always in the allowlist
            allowedUserIds: Array.from(
              new Set([props.job.user_id, ...localAllowedUserIds.value]),
            ),
          }
        : { mode: 'open' as const };

    await legalJobsService.updateAccessControl(
      props.job.id,
      buildContext(),
      accessControl,
    );
    emit('updated');
    emit('close');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Surface 403/404 messages clearly
    error.value = msg;
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.manage-access-modal {
  --backdrop-opacity: 0.6;
  --background: var(--ion-background-color, #fff);
  --width: 480px;
  --max-width: 95vw;
  --height: auto;
  --max-height: 80vh;
  --border-radius: 12px;
}

.modal-description {
  font-size: 0.9rem;
  color: var(--ion-color-medium);
  margin: 0 0 16px;
}

.ac-mode-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
}

.ac-radio-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.875rem;
  cursor: pointer;
}

.ac-radio-label input[type='radio'] {
  accent-color: var(--ion-color-primary);
  width: 16px;
  height: 16px;
}

.ac-hint {
  font-size: 0.8rem;
  color: var(--ion-color-medium);
  margin: 0 0 8px;
}

.ac-picker-wrapper {
  margin-top: 4px;
}

.error-message {
  color: var(--ion-color-danger);
  font-size: 0.875rem;
  margin-top: 12px;
}

.footer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 4px 8px;
}
</style>
