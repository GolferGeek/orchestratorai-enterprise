<template>
  <ion-page>
  <div class="detail-view">
    <div class="detail-header">
      <h2>System Configuration</h2>
      <div class="header-actions">
        <ion-button fill="clear" size="small" @click="refreshData" :disabled="loading">
          <ion-icon :icon="refreshOutline" slot="icon-only" />
        </ion-button>
      </div>
    </div>

    <div class="detail-body">
      <div v-if="loading" class="loading-state">
        <ion-spinner />
        <p>Loading configuration...</p>
      </div>

      <template v-else>
        <div v-if="configs.length === 0" class="empty-state">
          <ion-icon :icon="settingsOutline" />
          <h3>No Configuration Keys</h3>
          <p>System configuration will appear here once available.</p>
        </div>

        <div v-else class="config-list">
          <div
            v-for="config in configs"
            :key="config.key"
            class="config-item"
          >
            <div class="config-key-row">
              <span class="config-key mono">{{ config.key }}</span>
              <ion-button fill="clear" size="small" @click="startEdit(config)">
                <ion-icon :icon="createOutline" slot="icon-only" />
              </ion-button>
            </div>
            <div v-if="config.description" class="config-description">{{ config.description }}</div>
            <div class="config-value">
              <pre>{{ JSON.stringify(config.value, null, 2) }}</pre>
            </div>
            <div class="config-updated">Last updated: {{ formatDateTime(config.updatedAt) }}</div>
          </div>
        </div>
      </template>

      <!-- Edit Modal -->
      <ion-modal :is-open="showEditModal" @didDismiss="closeEditModal">
        <ion-header>
          <ion-toolbar>
            <ion-title>Edit: {{ editingConfig?.key }}</ion-title>
            <ion-buttons slot="end">
              <ion-button @click="closeEditModal">Cancel</ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-header>
        <ion-content class="ion-padding" v-if="editingConfig">
          <div class="form-container">
            <ion-item>
              <ion-label position="stacked">Key</ion-label>
              <ion-input :value="editingConfig.key" readonly />
            </ion-item>
            <ion-item>
              <ion-label position="stacked">Value (JSON)</ion-label>
              <ion-textarea v-model="editValueJson" auto-grow :rows="6" placeholder="e.g. &quot;value&quot; or {&quot;key&quot;:&quot;val&quot;}" />
            </ion-item>
            <p v-if="editJsonError" class="json-error">{{ editJsonError }}</p>
            <div class="form-actions">
              <ion-button expand="block" :disabled="saving || !!editJsonError" @click="saveConfig">
                {{ saving ? 'Saving...' : 'Save' }}
              </ion-button>
            </div>
          </div>
        </ion-content>
      </ion-modal>

      <ion-loading :is-open="loading" message="Loading..." />
    </div>
  </div>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  IonButton,
  IonIcon,
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonItem,
  IonLabel,
  IonInput,
  IonTextarea,
  IonLoading,
  IonSpinner,
  toastController,
  IonPage,
} from '@ionic/vue';
import { refreshOutline, settingsOutline, createOutline } from 'ionicons/icons';
import { authApiService, type SystemConfig } from '@/services/auth-api.service';

const configs = ref<SystemConfig[]>([]);
const loading = ref(false);
const saving = ref(false);
const showEditModal = ref(false);
const editingConfig = ref<SystemConfig | null>(null);
const editValueJson = ref('');

const editJsonError = computed(() => {
  if (!editValueJson.value.trim()) return null;
  try {
    JSON.parse(editValueJson.value);
    return null;
  } catch {
    return 'Invalid JSON';
  }
});

const fetchConfigs = async () => {
  loading.value = true;
  try {
    configs.value = await authApiService.listSystemConfig();
  } catch (error) {
    console.error('Failed to fetch system config:', error);
    configs.value = [];
    const toast = await toastController.create({
      message: 'Failed to load system configuration',
      duration: 3000,
      color: 'danger',
    });
    await toast.present();
  } finally {
    loading.value = false;
  }
};

const refreshData = () => fetchConfigs();

const startEdit = (config: SystemConfig) => {
  editingConfig.value = config;
  editValueJson.value = JSON.stringify(config.value, null, 2);
  showEditModal.value = true;
};

const closeEditModal = () => {
  showEditModal.value = false;
  editingConfig.value = null;
  editValueJson.value = '';
};

const saveConfig = async () => {
  if (!editingConfig.value || editJsonError.value) return;
  saving.value = true;
  try {
    const parsed = JSON.parse(editValueJson.value);
    const updated = await authApiService.updateSystemConfig(editingConfig.value.key, parsed);
    const idx = configs.value.findIndex((c) => c.key === updated.key);
    if (idx !== -1) {
      configs.value[idx] = updated;
    }
    closeEditModal();
    const toast = await toastController.create({
      message: 'Configuration updated',
      duration: 2000,
      color: 'success',
    });
    await toast.present();
  } catch (error) {
    console.error('Failed to update config:', error);
    const toast = await toastController.create({
      message: 'Failed to update configuration',
      duration: 3000,
      color: 'danger',
    });
    await toast.present();
  } finally {
    saving.value = false;
  }
};

const formatDateTime = (dateStr: string) => {
  if (!dateStr) return 'Unknown';
  return new Date(dateStr).toLocaleString();
};

onMounted(() => {
  fetchConfigs();
});
</script>

<style scoped>
.detail-view {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  background: var(--ion-toolbar-background, var(--ion-color-light));
}

.detail-header h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--ion-text-color, #333);
}

.header-actions {
  display: flex;
  gap: 0.25rem;
}

.detail-body {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 3rem;
  color: var(--dark-text-muted, #888);
}

.empty-state {
  text-align: center;
  padding: 3rem;
  color: var(--dark-text-muted, #888);
}

.empty-state ion-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
  color: var(--ion-color-medium);
}

.empty-state h3 {
  margin: 0 0 0.5rem;
  color: var(--ion-text-color, #555);
}

.config-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.config-item {
  background: var(--ion-card-background, white);
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  border-radius: 10px;
  padding: 1rem;
}

.config-key-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.config-key {
  font-family: monospace;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--ion-color-primary);
}

.mono {
  font-family: monospace;
}

.config-description {
  font-size: 0.85rem;
  color: var(--dark-text-muted, #777);
  margin-bottom: 0.5rem;
}

.config-value pre {
  background: var(--ion-color-light);
  padding: 0.75rem;
  border-radius: 6px;
  font-size: 0.85rem;
  overflow-x: auto;
  margin: 0 0 0.5rem;
}

.config-updated {
  font-size: 0.8rem;
  color: var(--dark-text-muted, #aaa);
}

.form-container {
  padding: 0.5rem;
}

.form-container ion-item {
  margin-bottom: 0.5rem;
}

.json-error {
  color: var(--ion-color-danger);
  font-size: 0.85rem;
  margin: 0.25rem 0 0 1rem;
}

.form-actions {
  margin-top: 1.5rem;
}
</style>
