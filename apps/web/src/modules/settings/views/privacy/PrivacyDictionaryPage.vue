<template>
  <ion-page>
    <div class="detail-view">
      <div class="detail-header">
        <h2>Pseudonym Dictionary</h2>
        <div class="header-actions">
          <ion-button fill="outline" size="small" @click="openCreate">
            <ion-icon :icon="addOutline" slot="start" />
            Add Entry
          </ion-button>
          <ion-button fill="outline" size="small" @click="openImport">
            <ion-icon :icon="cloudUploadOutline" slot="start" />
            Import
          </ion-button>
          <ion-button
            fill="outline"
            size="small"
            :disabled="entries.length === 0"
            @click="exportCsv"
          >
            <ion-icon :icon="cloudDownloadOutline" slot="start" />
            Export
          </ion-button>
          <ion-button fill="clear" size="small" :disabled="loading" @click="fetchData">
            <ion-icon :icon="refreshOutline" slot="icon-only" />
          </ion-button>
        </div>
      </div>

      <div class="detail-body">
        <div v-if="loading" class="loading-state">
          <ion-spinner />
          <p>Loading dictionary...</p>
        </div>

        <div v-else class="page-content">
          <div class="warning-banner">
            <ion-icon :icon="warningOutline" />
            <span>
              These rows hold the real values that pseudonymization replaces.
              That is what makes the swap reversible — and what makes this page
              as sensitive as the data it protects.
            </span>
          </div>

          <div class="stats-banner">
            <div class="stat">
              <span class="stat-value">{{ entries.length }}</span>
              <span class="stat-label">Entries</span>
            </div>
            <div class="stat">
              <span class="stat-value">{{ activeCount }}</span>
              <span class="stat-label">Active</span>
            </div>
            <div class="stat">
              <span class="stat-value">{{ scopedCount }}</span>
              <span class="stat-label">Org scoped</span>
            </div>
            <div class="stat">
              <span class="stat-value">{{ categoryCount }}</span>
              <span class="stat-label">Categories</span>
            </div>
          </div>

          <div class="filter-row">
            <ion-searchbar
              v-model="search"
              placeholder="Search original values"
              :debounce="300"
              @ion-input="fetchData"
            />
            <ion-button
              fill="clear"
              size="small"
              :class="{ 'reveal-active': revealValues }"
              @click="revealValues = !revealValues"
            >
              <ion-icon :icon="revealValues ? eyeOffOutline : eyeOutline" slot="start" />
              {{ revealValues ? 'Hide values' : 'Reveal values' }}
            </ion-button>
          </div>

          <div v-if="entries.length === 0" class="empty-state">
            <ion-icon :icon="bookOutline" />
            <h3>No dictionary entries</h3>
            <p>
              Without entries, step one of the boundary pipeline is a no-op and
              only the regex patterns protect outbound messages.
            </p>
          </div>

          <div v-else class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Original Value</th>
                  <th>Pseudonym</th>
                  <th>Data Type</th>
                  <th>Category</th>
                  <th>Scope</th>
                  <th>Status</th>
                  <th>Last Used</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="entry in entries" :key="entry.id">
                  <td class="mono original-value">
                    {{ revealValues ? entry.originalValue : mask(entry.originalValue) }}
                  </td>
                  <td class="mono">{{ entry.pseudonym }}</td>
                  <td class="mono">{{ entry.dataType }}</td>
                  <td>{{ entry.category }}</td>
                  <td class="scope-cell">
                    <span v-if="entry.agentSlug" class="mono">
                      {{ entry.organizationSlug ?? '*' }} / {{ entry.agentSlug }}
                    </span>
                    <span v-else-if="entry.organizationSlug" class="mono">
                      {{ entry.organizationSlug }}
                    </span>
                    <span v-else class="muted">global</span>
                  </td>
                  <td>
                    <ion-badge :color="entry.isActive ? 'success' : 'medium'">
                      {{ entry.isActive ? 'Active' : 'Disabled' }}
                    </ion-badge>
                  </td>
                  <td class="muted">{{ formatDate(entry.lastUsedAt) }}</td>
                  <td class="row-actions">
                    <ion-button fill="clear" size="small" @click="openEdit(entry)">
                      <ion-icon :icon="createOutline" slot="icon-only" />
                    </ion-button>
                    <ion-button
                      fill="clear"
                      size="small"
                      color="danger"
                      @click="confirmDelete(entry)"
                    >
                      <ion-icon :icon="trashOutline" slot="icon-only" />
                    </ion-button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Create / edit -->
    <ion-modal :is-open="modalOpen" @did-dismiss="closeModal">
      <ion-header>
        <ion-toolbar>
          <ion-title>{{ editing ? 'Edit Entry' : 'Add Entry' }}</ion-title>
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
              v-model="form.originalValue"
              label="Original value"
              label-placement="stacked"
              placeholder="Acme Corporation"
            />
          </ion-item>
          <ion-item>
            <ion-input
              v-model="form.pseudonym"
              label="Pseudonym"
              label-placement="stacked"
              placeholder="COMPANY_1"
            />
          </ion-item>
          <p class="field-hint">
            Matching is case-insensitive. Pick a pseudonym that is unlikely to
            occur naturally in a reply, or reversal will hit the wrong text.
          </p>
          <ion-item>
            <ion-input
              v-model="form.dataType"
              label="Data type"
              label-placement="stacked"
              placeholder="name"
            />
          </ion-item>
          <ion-item>
            <ion-input
              v-model="form.category"
              label="Category"
              label-placement="stacked"
              placeholder="general"
            />
          </ion-item>
          <ion-item>
            <ion-input
              v-model="form.organizationSlug"
              label="Organization slug (optional)"
              label-placement="stacked"
              placeholder="Leave blank for all organizations"
            />
          </ion-item>
          <ion-item>
            <ion-input
              v-model="form.agentSlug"
              label="Agent slug (optional)"
              label-placement="stacked"
              placeholder="Leave blank for all agents in the org"
            />
          </ion-item>
          <p class="field-hint">
            Scope resolution is agent, then organization, then global — the most
            specific entry for a value wins.
          </p>
          <ion-item v-if="editing">
            <ion-toggle v-model="form.isActive">Active</ion-toggle>
          </ion-item>
        </div>

        <div class="modal-actions">
          <ion-button fill="outline" @click="closeModal">Cancel</ion-button>
          <ion-button :disabled="!canSave || saving" @click="save">
            <ion-spinner v-if="saving" name="crescent" slot="start" />
            {{ editing ? 'Save Changes' : 'Create Entry' }}
          </ion-button>
        </div>
      </ion-content>
    </ion-modal>

    <!-- Import -->
    <ion-modal :is-open="importOpen" @did-dismiss="importOpen = false">
      <ion-header>
        <ion-toolbar>
          <ion-title>Import Entries</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="importOpen = false">
              <ion-icon :icon="closeOutline" slot="icon-only" />
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <p class="field-hint">
          One entry per line as
          <code>originalValue,pseudonym,dataType,category</code>. Data type and
          category are optional.
        </p>
        <ion-textarea
          v-model="importText"
          :rows="12"
          class="mono"
          label="CSV"
          label-placement="stacked"
          placeholder="Acme Corporation,COMPANY_1,name,client"
        />
        <p v-if="importPreview.length" class="field-hint">
          {{ importPreview.length }} row{{ importPreview.length === 1 ? '' : 's' }} parsed.
        </p>
        <div v-if="importFailures.length" class="import-failures">
          <h4>Rejected rows</h4>
          <ul>
            <li v-for="f in importFailures" :key="f.index">
              Line {{ f.index + 1 }}: {{ f.reason }}
            </li>
          </ul>
        </div>
        <div class="modal-actions">
          <ion-button fill="outline" @click="importOpen = false">Cancel</ion-button>
          <ion-button :disabled="importPreview.length === 0 || saving" @click="runImport">
            <ion-spinner v-if="saving" name="crescent" slot="start" />
            Import {{ importPreview.length }}
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
  IonTextarea,
  IonToggle,
  IonSearchbar,
  alertController,
  toastController,
} from '@ionic/vue';
import {
  addOutline,
  refreshOutline,
  createOutline,
  trashOutline,
  closeOutline,
  eyeOutline,
  eyeOffOutline,
  warningOutline,
  bookOutline,
  cloudUploadOutline,
  cloudDownloadOutline,
} from 'ionicons/icons';
import {
  privacyApiService,
  type PrivacyDictionaryEntry,
  type CreateDictionaryEntryRequest,
} from '../../services/privacy-api.service';

const loading = ref(false);
const saving = ref(false);
const entries = ref<PrivacyDictionaryEntry[]>([]);
const search = ref('');
/** Originals are masked by default so the page is safe to have open. */
const revealValues = ref(false);
const modalOpen = ref(false);
const importOpen = ref(false);
const importText = ref('');
const importFailures = ref<Array<{ index: number; reason: string }>>([]);
const editing = ref<PrivacyDictionaryEntry | null>(null);

const form = ref({
  originalValue: '',
  pseudonym: '',
  dataType: 'name',
  category: 'general',
  organizationSlug: '',
  agentSlug: '',
  isActive: true,
});

const activeCount = computed(() => entries.value.filter((e) => e.isActive).length);
const scopedCount = computed(
  () => entries.value.filter((e) => e.organizationSlug !== null).length,
);
const categoryCount = computed(
  () => new Set(entries.value.map((e) => e.category)).size,
);

const canSave = computed(
  () =>
    form.value.originalValue.trim().length > 0 &&
    form.value.pseudonym.trim().length > 0,
);

const importPreview = computed<CreateDictionaryEntryRequest[]>(() =>
  importText.value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [originalValue = '', pseudonym = '', dataType, category] = line
        .split(',')
        .map((part) => part.trim());
      return {
        originalValue,
        pseudonym,
        dataType: dataType || undefined,
        category: category || undefined,
      };
    }),
);

/** Show enough to recognise a row without putting the value on screen. */
const mask = (value: string): string => {
  if (value.length <= 2) return '••';
  return `${value.slice(0, 1)}${'•'.repeat(Math.min(value.length - 2, 8))}${value.slice(-1)}`;
};

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString() : '—';

const notify = async (message: string, color: 'success' | 'danger') => {
  const toast = await toastController.create({ message, duration: 2500, color });
  await toast.present();
};

const fetchData = async () => {
  loading.value = true;
  try {
    entries.value = await privacyApiService.listDictionary(
      search.value.trim() ? { search: search.value.trim() } : undefined,
    );
  } catch (error) {
    await notify(
      error instanceof Error ? error.message : 'Failed to load dictionary',
      'danger',
    );
  } finally {
    loading.value = false;
  }
};

const resetForm = () => {
  form.value = {
    originalValue: '',
    pseudonym: '',
    dataType: 'name',
    category: 'general',
    organizationSlug: '',
    agentSlug: '',
    isActive: true,
  };
};

const openCreate = () => {
  editing.value = null;
  resetForm();
  modalOpen.value = true;
};

const openEdit = (entry: PrivacyDictionaryEntry) => {
  editing.value = entry;
  form.value = {
    originalValue: entry.originalValue,
    pseudonym: entry.pseudonym,
    dataType: entry.dataType,
    category: entry.category,
    organizationSlug: entry.organizationSlug ?? '',
    agentSlug: entry.agentSlug ?? '',
    isActive: entry.isActive,
  };
  modalOpen.value = true;
};

const closeModal = () => {
  modalOpen.value = false;
  editing.value = null;
};

const openImport = () => {
  importText.value = '';
  importFailures.value = [];
  importOpen.value = true;
};

const save = async () => {
  saving.value = true;
  try {
    const payload = {
      originalValue: form.value.originalValue,
      pseudonym: form.value.pseudonym,
      dataType: form.value.dataType,
      category: form.value.category,
      organizationSlug: form.value.organizationSlug.trim() || null,
      agentSlug: form.value.agentSlug.trim() || null,
    };

    if (editing.value) {
      await privacyApiService.updateDictionaryEntry(editing.value.id, {
        ...payload,
        isActive: form.value.isActive,
      });
      await notify('Entry updated', 'success');
    } else {
      await privacyApiService.createDictionaryEntry(payload);
      await notify('Entry created', 'success');
    }
    closeModal();
    await fetchData();
  } catch (error) {
    await notify(
      error instanceof Error ? error.message : 'Failed to save entry',
      'danger',
    );
  } finally {
    saving.value = false;
  }
};

const runImport = async () => {
  saving.value = true;
  importFailures.value = [];
  try {
    const result = await privacyApiService.importDictionary(importPreview.value);
    importFailures.value = result.failures;
    await notify(
      `Imported ${result.imported} entr${result.imported === 1 ? 'y' : 'ies'}` +
        (result.failures.length ? `, ${result.failures.length} rejected` : ''),
      result.failures.length ? 'danger' : 'success',
    );
    if (result.failures.length === 0) {
      importOpen.value = false;
    }
    await fetchData();
  } catch (error) {
    await notify(
      error instanceof Error ? error.message : 'Import failed',
      'danger',
    );
  } finally {
    saving.value = false;
  }
};

const exportCsv = () => {
  const csv = entries.value
    .map((e) =>
      [e.originalValue, e.pseudonym, e.dataType, e.category]
        .map((field) => (field.includes(',') ? `"${field}"` : field))
        .join(','),
    )
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `pseudonym-dictionary-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

const confirmDelete = async (entry: PrivacyDictionaryEntry) => {
  const alert = await alertController.create({
    header: 'Delete entry?',
    message:
      'Messages already sent keep their pseudonyms, but nothing new will be replaced for this value.',
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Delete',
        role: 'destructive',
        handler: () => {
          void (async () => {
            try {
              await privacyApiService.deleteDictionaryEntry(entry.id);
              await notify('Entry deleted', 'success');
              await fetchData();
            } catch (error) {
              await notify(
                error instanceof Error ? error.message : 'Failed to delete entry',
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
  flex-wrap: wrap;
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

.warning-banner {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.7rem 0.9rem;
  border-radius: 8px;
  background: rgba(var(--ion-color-warning-rgb), 0.12);
  border: 1px solid rgba(var(--ion-color-warning-rgb), 0.35);
  font-size: 0.85rem;
  color: var(--ion-text-color);
}

.warning-banner ion-icon {
  color: var(--ion-color-warning);
  font-size: 1.1rem;
  flex-shrink: 0;
  margin-top: 0.1rem;
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

.filter-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.filter-row ion-searchbar {
  flex: 1;
  padding: 0;
}

.reveal-active {
  --color: var(--ion-color-warning);
}

.table-container {
  background: var(--ion-card-background, white);
  border-radius: 10px;
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  overflow-x: auto;
}

.data-table {
  width: 100%;
  min-width: 940px;
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
  vertical-align: middle;
}

.data-table tr:last-child td {
  border-bottom: none;
}

.original-value {
  overflow-wrap: anywhere;
  max-width: 260px;
}

.scope-cell {
  white-space: nowrap;
}

.muted {
  color: var(--dark-text-muted, #888);
}

.mono {
  font-family: monospace;
  font-size: 0.8rem;
}

.row-actions {
  white-space: nowrap;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  text-align: center;
  color: var(--ion-color-medium);
}

.empty-state ion-icon {
  font-size: 2.5rem;
  margin-bottom: 0.5rem;
}

.empty-state h3 {
  margin: 0 0 0.25rem;
  font-size: 1rem;
}

.empty-state p {
  margin: 0;
  max-width: 34rem;
  font-size: 0.85rem;
}

.form-grid {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.field-hint {
  margin: 0.25rem 0 0.5rem;
  font-size: 0.8rem;
  color: var(--dark-text-muted, #888);
}

.import-failures {
  margin-top: 1rem;
  font-size: 0.8rem;
  color: var(--ion-color-danger);
}

.import-failures h4 {
  margin: 0 0 0.25rem;
  font-size: 0.85rem;
}

.import-failures ul {
  margin: 0;
  padding-left: 1.1rem;
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
