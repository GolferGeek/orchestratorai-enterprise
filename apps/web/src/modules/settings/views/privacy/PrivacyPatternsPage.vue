<template>
  <ion-page>
    <div class="detail-view">
      <div class="detail-header">
        <h2>PII Patterns</h2>
        <div class="header-actions">
          <ion-button fill="outline" size="small" @click="openCreate">
            <ion-icon :icon="addOutline" slot="start" />
            Add Pattern
          </ion-button>
          <ion-button fill="clear" size="small" :disabled="loading" @click="fetchData">
            <ion-icon :icon="refreshOutline" slot="icon-only" />
          </ion-button>
        </div>
      </div>

      <div class="detail-body">
        <div v-if="loading" class="loading-state">
          <ion-spinner />
          <p>Loading patterns...</p>
        </div>

        <div v-else class="page-content">
          <div class="stats-banner">
            <div class="stat">
              <span class="stat-value">{{ patterns.length }}</span>
              <span class="stat-label">Patterns</span>
            </div>
            <div class="stat">
              <span class="stat-value">{{ activeCount }}</span>
              <span class="stat-label">Active</span>
            </div>
            <div class="stat">
              <span class="stat-value">{{ showstopperCount }}</span>
              <span class="stat-label">Showstopper</span>
            </div>
            <div class="stat">
              <span class="stat-value">{{ customCount }}</span>
              <span class="stat-label">Custom</span>
            </div>
          </div>

          <p class="page-note">
            Patterns run on the already-pseudonymized message, just before it
            leaves for an external provider. <strong>Showstopper</strong>
            patterns block the request outright; <strong>flagger</strong>
            patterns are redacted and restored in the reply.
          </p>

          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Data Type</th>
                  <th>Pattern</th>
                  <th>Replacement</th>
                  <th>Severity</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="pattern in patterns" :key="pattern.id">
                  <td>
                    <div class="pattern-name">{{ pattern.name }}</div>
                    <div v-if="pattern.description" class="pattern-description">
                      {{ pattern.description }}
                    </div>
                  </td>
                  <td class="mono">{{ pattern.dataType }}</td>
                  <td class="mono pattern-regex">{{ pattern.patternRegex }}</td>
                  <td class="mono">{{ pattern.replacement }}</td>
                  <td>
                    <ion-badge
                      :color="pattern.severity === 'showstopper' ? 'danger' : 'warning'"
                    >
                      {{ pattern.severity ?? 'unset' }}
                    </ion-badge>
                  </td>
                  <td class="mono">{{ pattern.priority }}</td>
                  <td>
                    <ion-badge :color="pattern.isActive ? 'success' : 'medium'">
                      {{ pattern.isActive ? 'Active' : 'Disabled' }}
                    </ion-badge>
                    <ion-badge v-if="pattern.isBuiltIn" color="medium" class="built-in-badge">
                      Built in
                    </ion-badge>
                  </td>
                  <td class="row-actions">
                    <template v-if="!pattern.isBuiltIn">
                      <ion-button fill="clear" size="small" @click="openEdit(pattern)">
                        <ion-icon :icon="createOutline" slot="icon-only" />
                      </ion-button>
                      <ion-button
                        fill="clear"
                        size="small"
                        color="danger"
                        @click="confirmDelete(pattern)"
                      >
                        <ion-icon :icon="trashOutline" slot="icon-only" />
                      </ion-button>
                    </template>
                    <span v-else class="locked-note" title="Built-in patterns cannot be edited">
                      <ion-icon :icon="lockClosedOutline" />
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Create / edit modal -->
    <ion-modal :is-open="modalOpen" @did-dismiss="closeModal">
      <ion-header>
        <ion-toolbar>
          <ion-title>{{ editing ? 'Edit Pattern' : 'Add Pattern' }}</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="closeModal">
              <ion-icon :icon="closeOutline" slot="icon-only" />
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <div class="form-grid">
          <ion-item>
            <ion-input
              v-model="form.name"
              label="Name"
              label-placement="stacked"
              placeholder="Internal Project Codename"
            />
          </ion-item>

          <ion-item>
            <ion-select
              v-model="form.dataType"
              label="Data Type"
              label-placement="stacked"
              interface="popover"
            >
              <ion-select-option v-for="t in dataTypes" :key="t" :value="t">
                {{ t }}
              </ion-select-option>
            </ion-select>
          </ion-item>

          <ion-item>
            <ion-select
              v-model="form.severity"
              label="Severity"
              label-placement="stacked"
              interface="popover"
            >
              <ion-select-option value="flagger">
                flagger — redact and restore
              </ion-select-option>
              <ion-select-option value="showstopper">
                showstopper — block the request
              </ion-select-option>
            </ion-select>
          </ion-item>

          <ion-item>
            <ion-input
              v-model="form.patternRegex"
              label="Regex"
              label-placement="stacked"
              placeholder="\bPROJECT-[A-Z]{4}\b"
              class="mono"
            />
          </ion-item>
          <p v-if="regexError" class="field-error">{{ regexError }}</p>
          <p v-else class="field-hint">
            Compiled with the <code>gi</code> flags. Validated here and again by
            the API before it is stored.
          </p>

          <ion-item>
            <ion-input
              v-model="form.description"
              label="Description"
              label-placement="stacked"
              placeholder="What this pattern is for"
            />
          </ion-item>

          <ion-item>
            <ion-input
              v-model.number="form.priority"
              type="number"
              label="Priority"
              label-placement="stacked"
              placeholder="50"
            />
          </ion-item>

          <ion-item v-if="editing">
            <ion-toggle v-model="form.isActive">Active</ion-toggle>
          </ion-item>
        </div>

        <!-- Live tester so an operator sees what the regex catches before saving -->
        <div class="tester">
          <h4>Try it</h4>
          <ion-textarea
            v-model="testText"
            :rows="3"
            label="Sample text"
            label-placement="stacked"
            placeholder="Paste text to check this pattern against"
          />
          <div v-if="testMatches.length" class="test-matches">
            <ion-chip v-for="(m, i) in testMatches" :key="i" color="warning">
              {{ m }}
            </ion-chip>
          </div>
          <p v-else-if="testText.trim()" class="field-hint">No matches.</p>
        </div>

        <div class="modal-actions">
          <ion-button fill="outline" @click="closeModal">Cancel</ion-button>
          <ion-button :disabled="!canSave || saving" @click="save">
            <ion-spinner v-if="saving" name="crescent" slot="start" />
            {{ editing ? 'Save Changes' : 'Create Pattern' }}
          </ion-button>
        </div>
      </ion-content>
    </ion-modal>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  IonPage,
  IonButton,
  IonIcon,
  IonSpinner,
  IonBadge,
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonContent,
  IonItem,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonTextarea,
  IonToggle,
  IonChip,
  alertController,
  toastController,
} from '@ionic/vue';
import {
  addOutline,
  refreshOutline,
  createOutline,
  trashOutline,
  closeOutline,
  lockClosedOutline,
} from 'ionicons/icons';
import {
  privacyApiService,
  type PrivacyPattern,
  type PiiDataType,
  type PatternSeverity,
} from '../../services/privacy-api.service';

const dataTypes: PiiDataType[] = [
  'email',
  'phone',
  'name',
  'address',
  'ip_address',
  'username',
  'credit_card',
  'ssn',
  'custom',
];

const loading = ref(false);
const saving = ref(false);
const patterns = ref<PrivacyPattern[]>([]);
const modalOpen = ref(false);
const editing = ref<PrivacyPattern | null>(null);
const testText = ref('');

const form = ref<{
  name: string;
  dataType: PiiDataType;
  severity: PatternSeverity;
  patternRegex: string;
  description: string;
  priority: number;
  isActive: boolean;
}>({
  name: '',
  dataType: 'custom',
  severity: 'flagger',
  patternRegex: '',
  description: '',
  priority: 50,
  isActive: true,
});

const activeCount = computed(() => patterns.value.filter((p) => p.isActive).length);
const showstopperCount = computed(
  () => patterns.value.filter((p) => p.severity === 'showstopper').length,
);
const customCount = computed(() => patterns.value.filter((p) => !p.isBuiltIn).length);

/** Compile the draft regex so the operator sees the error before saving. */
const regexError = computed(() => {
  if (!form.value.patternRegex.trim()) return null;
  try {
    new RegExp(form.value.patternRegex, 'gi');
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid regex';
  }
});

const testMatches = computed(() => {
  if (regexError.value || !form.value.patternRegex.trim() || !testText.value) {
    return [];
  }
  try {
    const re = new RegExp(form.value.patternRegex, 'gi');
    return [...testText.value.matchAll(re)].map((m) => m[0]).slice(0, 25);
  } catch {
    return [];
  }
});

const canSave = computed(
  () =>
    form.value.name.trim().length > 0 &&
    form.value.patternRegex.trim().length > 0 &&
    !regexError.value,
);

const notify = async (message: string, color: 'success' | 'danger') => {
  const toast = await toastController.create({ message, duration: 2500, color });
  await toast.present();
};

const fetchData = async () => {
  loading.value = true;
  try {
    patterns.value = await privacyApiService.listPatterns();
  } catch (error) {
    await notify(
      error instanceof Error ? error.message : 'Failed to load patterns',
      'danger',
    );
  } finally {
    loading.value = false;
  }
};

const resetForm = () => {
  form.value = {
    name: '',
    dataType: 'custom',
    severity: 'flagger',
    patternRegex: '',
    description: '',
    priority: 50,
    isActive: true,
  };
  testText.value = '';
};

const openCreate = () => {
  editing.value = null;
  resetForm();
  modalOpen.value = true;
};

const openEdit = (pattern: PrivacyPattern) => {
  editing.value = pattern;
  form.value = {
    name: pattern.name,
    dataType: (pattern.dataType as PiiDataType) ?? 'custom',
    severity: (pattern.severity as PatternSeverity) ?? 'flagger',
    patternRegex: pattern.patternRegex,
    description: pattern.description ?? '',
    priority: pattern.priority,
    isActive: pattern.isActive,
  };
  testText.value = '';
  modalOpen.value = true;
};

const closeModal = () => {
  modalOpen.value = false;
  editing.value = null;
};

const save = async () => {
  saving.value = true;
  try {
    if (editing.value) {
      await privacyApiService.updatePattern(editing.value.id, {
        name: form.value.name,
        dataType: form.value.dataType,
        severity: form.value.severity,
        patternRegex: form.value.patternRegex,
        description: form.value.description,
        priority: form.value.priority,
        isActive: form.value.isActive,
      });
      await notify('Pattern updated', 'success');
    } else {
      await privacyApiService.createPattern({
        name: form.value.name,
        dataType: form.value.dataType,
        severity: form.value.severity,
        patternRegex: form.value.patternRegex,
        description: form.value.description,
        priority: form.value.priority,
      });
      await notify('Pattern created', 'success');
    }
    closeModal();
    await fetchData();
  } catch (error) {
    await notify(
      error instanceof Error ? error.message : 'Failed to save pattern',
      'danger',
    );
  } finally {
    saving.value = false;
  }
};

const confirmDelete = async (pattern: PrivacyPattern) => {
  const alert = await alertController.create({
    header: 'Delete pattern?',
    message: `"${pattern.name}" will stop being applied to outbound messages.`,
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Delete',
        role: 'destructive',
        handler: () => {
          void (async () => {
            try {
              await privacyApiService.deletePattern(pattern.id);
              await notify('Pattern deleted', 'success');
              await fetchData();
            } catch (error) {
              await notify(
                error instanceof Error ? error.message : 'Failed to delete pattern',
                'danger',
              );
            }
          })();
        },
      },
    ],
  });
  await alert.present();
};

onMounted(fetchData);
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
  align-items: center;
}

.detail-body {
  flex: 1;
  overflow-y: auto;
}

.page-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
}

.stats-banner {
  display: flex;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: linear-gradient(135deg, #4a6fa1 0%, #2c4a7c 100%);
  border-radius: 8px;
  color: white;
}

.stats-banner .stat {
  text-align: center;
  flex: 1;
}

.stats-banner .stat-value {
  display: block;
  font-size: 1.25rem;
  font-weight: 700;
}

.stats-banner .stat-label {
  font-size: 0.7rem;
  opacity: 0.9;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.page-note {
  margin: 0;
  font-size: 0.85rem;
  color: var(--dark-text-muted, #888);
}

.table-container {
  background: var(--ion-card-background, white);
  border-radius: 10px;
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  overflow-x: auto;
}

.data-table {
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
}

.data-table th {
  background: var(--ion-toolbar-background, var(--ion-color-light));
  padding: 0.6rem 0.75rem;
  text-align: left;
  font-weight: 600;
  font-size: 0.8rem;
  color: var(--dark-text-muted, #555);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
}

.data-table td {
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  font-size: 0.85rem;
  color: var(--ion-text-color);
  vertical-align: top;
}

.data-table tr:last-child td {
  border-bottom: none;
}

.pattern-name {
  font-weight: 500;
  overflow-wrap: anywhere;
}

.pattern-description {
  font-size: 0.75rem;
  color: var(--dark-text-muted, #888);
  margin-top: 0.1rem;
  overflow-wrap: anywhere;
}

.pattern-regex {
  max-width: 260px;
  overflow-wrap: anywhere;
}

.mono {
  font-family: monospace;
  font-size: 0.8rem;
}

.built-in-badge {
  margin-left: 0.35rem;
}

.row-actions {
  white-space: nowrap;
}

.locked-note {
  color: var(--dark-text-muted, #888);
  font-size: 0.9rem;
}

.form-grid {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.field-error {
  margin: 0.25rem 0 0.5rem;
  font-size: 0.8rem;
  color: var(--ion-color-danger);
  font-family: monospace;
}

.field-hint {
  margin: 0.25rem 0 0.5rem;
  font-size: 0.8rem;
  color: var(--dark-text-muted, #888);
}

.tester {
  margin-top: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
}

.tester h4 {
  margin: 0 0 0.5rem;
  font-size: 0.95rem;
  font-weight: 600;
}

.test-matches {
  margin-top: 0.5rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.5rem;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  color: var(--ion-color-medium);
}
</style>
