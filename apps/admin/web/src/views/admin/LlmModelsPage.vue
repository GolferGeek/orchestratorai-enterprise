<template>
  <ion-page>
  <div class="detail-view">
    <div class="detail-header">
      <h2>LLM Models</h2>
      <div class="header-actions">
        <ion-button fill="outline" size="small" @click="openAddModal">
          <ion-icon :icon="addOutline" slot="start" />
          Add Model
        </ion-button>
        <ion-button fill="clear" size="small" @click="fetchData" :disabled="loading">
          <ion-icon :icon="refreshOutline" slot="icon-only" />
        </ion-button>
      </div>
    </div>

    <div class="detail-body">
      <div class="loading-state" v-if="loading">
        <ion-spinner />
        <p>Loading models...</p>
      </div>

      <div class="empty-state" v-else-if="models.length === 0">
        <ion-icon :icon="hardwareChipOutline" />
        <h3>No Models Configured</h3>
        <p>Use "+ Add Model" to register your first LLM model.</p>
      </div>

      <div v-else class="master-detail-container">
        <!-- Master: Provider List -->
        <div class="master-panel">
          <div class="stats-banner">
            <div class="stat">
              <span class="stat-value">{{ providers.length }}</span>
              <span class="stat-label">Providers</span>
            </div>
            <div class="stat">
              <span class="stat-value">{{ models.length }}</span>
              <span class="stat-label">Models</span>
            </div>
            <div class="stat">
              <span class="stat-value">{{ enabledCount }}</span>
              <span class="stat-label">Enabled</span>
            </div>
          </div>

          <ion-list class="provider-list">
            <ion-item
              v-for="p in providers"
              :key="p.name"
              button
              @click="selectProvider(p.name)"
              :class="{ 'selected-provider': selectedProvider === p.name }"
            >
              <ion-label>
                <h2>{{ p.name }}</h2>
                <p>{{ p.modelCount }} model{{ p.modelCount !== 1 ? 's' : '' }} &middot; {{ p.usageCount.toLocaleString() }} calls</p>
              </ion-label>
              <ion-badge slot="end" :color="p.enabledCount === p.modelCount ? 'success' : 'medium'">
                {{ p.enabledCount }}/{{ p.modelCount }}
              </ion-badge>
            </ion-item>
          </ion-list>
        </div>

        <!-- Detail: Models for selected provider -->
        <div class="detail-panel" v-if="selectedProvider">
          <div class="provider-header">
            <h3>{{ selectedProvider }}</h3>
            <span class="provider-subtitle">{{ selectedModels.length }} model{{ selectedModels.length !== 1 ? 's' : '' }}</span>
          </div>

          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Context</th>
                  <th>Input $/1k</th>
                  <th>Output $/1k</th>
                  <th>Usage</th>
                  <th>Last Used</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="model in selectedModels" :key="model.id">
                  <td>
                    <div class="model-name">{{ model.displayName }}</div>
                    <div class="model-slug mono">{{ model.slug }}</div>
                  </td>
                  <td class="mono">{{ formatContext(model.contextWindow) }}</td>

                  <!-- Editable: Input cost -->
                  <td class="price-cell">
                    <span
                      v-if="editingPrice?.modelId !== model.id || editingPrice?.field !== 'input'"
                      class="mono price-display"
                      @click="startPriceEdit(model, 'input')"
                      title="Click to edit"
                    >${{ model.inputCostPer1k.toFixed(4) }}</span>
                    <input
                      v-else
                      class="price-input mono"
                      type="number"
                      step="0.0001"
                      min="0"
                      :value="editingPrice.value"
                      @input="editingPrice.value = ($event.target as HTMLInputElement).value"
                      @blur="commitPriceEdit(model)"
                      @keydown.enter="commitPriceEdit(model)"
                      @keydown.escape="cancelPriceEdit"
                      ref="priceInputRef"
                      autofocus
                    />
                  </td>

                  <!-- Editable: Output cost -->
                  <td class="price-cell">
                    <span
                      v-if="editingPrice?.modelId !== model.id || editingPrice?.field !== 'output'"
                      class="mono price-display"
                      @click="startPriceEdit(model, 'output')"
                      title="Click to edit"
                    >${{ model.outputCostPer1k.toFixed(4) }}</span>
                    <input
                      v-else
                      class="price-input mono"
                      type="number"
                      step="0.0001"
                      min="0"
                      :value="editingPrice.value"
                      @input="editingPrice.value = ($event.target as HTMLInputElement).value"
                      @blur="commitPriceEdit(model)"
                      @keydown.enter="commitPriceEdit(model)"
                      @keydown.escape="cancelPriceEdit"
                      ref="priceInputRef"
                      autofocus
                    />
                  </td>

                  <td>{{ model.usageCount.toLocaleString() }}</td>
                  <td>{{ model.lastUsedAt ? formatDate(model.lastUsedAt) : '-' }}</td>

                  <!-- Toggle: Enable/Disable -->
                  <td class="toggle-cell">
                    <label class="toggle-switch" :title="model.enabled ? 'Click to disable' : 'Click to enable'">
                      <input
                        type="checkbox"
                        :checked="model.enabled"
                        :disabled="savingModelId === model.id"
                        @change="toggleEnabled(model)"
                      />
                      <span class="toggle-slider"></span>
                    </label>
                    <span :class="['status-label', model.enabled ? 'status-active' : 'status-inactive']">
                      {{ savingModelId === model.id ? '...' : (model.enabled ? 'Enabled' : 'Disabled') }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Empty detail state -->
        <div class="detail-panel empty-details" v-else>
          <div class="empty-state">
            <ion-icon :icon="hardwareChipOutline" size="large" color="medium" />
            <h3>Select a provider</h3>
            <p>Choose a provider from the list to view its models</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Model Modal -->
    <ion-modal :is-open="showAddModal" @did-dismiss="closeAddModal" class="add-model-modal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Register New Model</h3>
          <ion-button fill="clear" size="small" @click="closeAddModal">
            <ion-icon :icon="closeOutline" slot="icon-only" />
          </ion-button>
        </div>

        <form class="add-model-form" @submit.prevent="submitAddModel">
          <div class="form-row">
            <label class="form-label">Model ID / Slug <span class="required">*</span></label>
            <input
              class="form-input mono"
              v-model="addForm.slug"
              placeholder="e.g. claude-3-5-sonnet-20241022"
              required
            />
          </div>

          <div class="form-row">
            <label class="form-label">Display Name <span class="required">*</span></label>
            <input
              class="form-input"
              v-model="addForm.displayName"
              placeholder="e.g. Claude 3.5 Sonnet"
              required
            />
          </div>

          <div class="form-row">
            <label class="form-label">Provider <span class="required">*</span></label>
            <div class="provider-input-group">
              <select class="form-input" v-model="addForm.provider" required>
                <option value="" disabled>Select existing provider...</option>
                <option v-for="p in providers" :key="p.name" :value="p.name">{{ p.name }}</option>
                <option value="__new__">+ Enter new provider</option>
              </select>
              <input
                v-if="addForm.provider === '__new__'"
                class="form-input"
                v-model="addForm.newProvider"
                placeholder="New provider name (e.g. openai)"
                required
              />
            </div>
          </div>

          <div class="form-row form-row-split">
            <div>
              <label class="form-label">Context Window (tokens) <span class="required">*</span></label>
              <input
                class="form-input mono"
                type="number"
                v-model.number="addForm.contextWindow"
                placeholder="200000"
                min="1"
                required
              />
            </div>
          </div>

          <div class="form-row form-row-split">
            <div>
              <label class="form-label">Input $/1k tokens <span class="required">*</span></label>
              <input
                class="form-input mono"
                type="number"
                step="0.0001"
                min="0"
                v-model.number="addForm.inputCostPer1k"
                placeholder="0.0030"
                required
              />
            </div>
            <div>
              <label class="form-label">Output $/1k tokens <span class="required">*</span></label>
              <input
                class="form-input mono"
                type="number"
                step="0.0001"
                min="0"
                v-model.number="addForm.outputCostPer1k"
                placeholder="0.0150"
                required
              />
            </div>
          </div>

          <div class="form-row form-row-toggle">
            <label class="form-label">Enable immediately</label>
            <label class="toggle-switch">
              <input type="checkbox" v-model="addForm.enabled" />
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div class="form-actions">
            <ion-button fill="outline" type="button" @click="closeAddModal">Cancel</ion-button>
            <ion-button type="submit" :disabled="addingModel">
              <ion-spinner v-if="addingModel" name="crescent" slot="start" />
              {{ addingModel ? 'Registering...' : 'Register Model' }}
            </ion-button>
          </div>
        </form>
      </div>
    </ion-modal>
  </div>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import {
  IonButton,
  IonIcon,
  IonSpinner,
  IonList,
  IonItem,
  IonLabel,
  IonBadge,
  IonModal,
  toastController,
  IonPage,
} from '@ionic/vue';
import { refreshOutline, hardwareChipOutline, addOutline, closeOutline } from 'ionicons/icons';
import {
  adminApiService,
  type LlmModel,
  type CreateLlmModelRequest,
} from '@/services/admin-api.service';
import { useLlmAnalyticsStore } from '@/stores/llm-analytics.store';

const store = useLlmAnalyticsStore();
const loading = ref(false);
const models = ref<LlmModel[]>([]);
const selectedProvider = ref<string | null>(null);
const savingModelId = ref<string | null>(null);

// ===================== Provider summary =====================

interface ProviderSummary {
  name: string;
  modelCount: number;
  enabledCount: number;
  usageCount: number;
}

const providers = computed<ProviderSummary[]>(() => {
  const map = new Map<string, ProviderSummary>();
  for (const m of models.value) {
    const existing = map.get(m.provider);
    if (existing) {
      existing.modelCount++;
      if (m.enabled) existing.enabledCount++;
      existing.usageCount += m.usageCount;
    } else {
      map.set(m.provider, {
        name: m.provider,
        modelCount: 1,
        enabledCount: m.enabled ? 1 : 0,
        usageCount: m.usageCount,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.usageCount - a.usageCount);
});

const enabledCount = computed(() => models.value.filter((m) => m.enabled).length);

const selectedModels = computed(() => {
  if (!selectedProvider.value) return [];
  return models.value
    .filter((m) => m.provider === selectedProvider.value)
    .sort((a, b) => b.usageCount - a.usageCount);
});

const selectProvider = (name: string) => {
  selectedProvider.value = name;
};

// ===================== Formatting =====================

const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString();

const formatContext = (tokens: number) => {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}k`;
  return tokens.toLocaleString();
};

// ===================== Data loading =====================

const fetchData = async () => {
  loading.value = true;
  store.setLoading(true);
  store.setError(null);
  try {
    const data = await adminApiService.getLlmModels();
    models.value = data;
    store.setModels(data);
    if (providers.value.length > 0 && !selectedProvider.value) {
      selectedProvider.value = providers.value[0].name;
    }
  } catch (err) {
    const msg = 'Failed to load LLM models';
    store.setError(msg);
    const toast = await toastController.create({ message: msg, duration: 3000, color: 'danger' });
    await toast.present();
    throw err;
  } finally {
    loading.value = false;
    store.setLoading(false);
  }
};

onMounted(() => {
  fetchData();
});

// ===================== Toggle enable/disable =====================

const toggleEnabled = async (model: LlmModel) => {
  savingModelId.value = model.id;
  const newEnabled = !model.enabled;
  try {
    const updated = await adminApiService.updateLlmModel(model.provider, model.slug, {
      enabled: newEnabled,
    });
    const idx = models.value.findIndex((m) => m.id === model.id);
    if (idx !== -1) {
      models.value[idx] = updated;
    }
    const label = newEnabled ? 'Enabled' : 'Disabled';
    const toast = await toastController.create({
      message: `${model.displayName} ${label}`,
      duration: 2000,
      color: newEnabled ? 'success' : 'medium',
    });
    await toast.present();
  } catch (err) {
    const toast = await toastController.create({
      message: `Failed to update ${model.displayName}`,
      duration: 3000,
      color: 'danger',
    });
    await toast.present();
    throw err;
  } finally {
    savingModelId.value = null;
  }
};

// ===================== Inline price editing =====================

interface PriceEdit {
  modelId: string;
  field: 'input' | 'output';
  value: string;
}

const editingPrice = ref<PriceEdit | null>(null);
const priceInputRef = ref<HTMLInputElement | null>(null);

const startPriceEdit = async (model: LlmModel, field: 'input' | 'output') => {
  const currentValue =
    field === 'input' ? model.inputCostPer1k : model.outputCostPer1k;
  editingPrice.value = { modelId: model.id, field, value: currentValue.toFixed(4) };
  await nextTick();
  priceInputRef.value?.focus();
  priceInputRef.value?.select();
};

const cancelPriceEdit = () => {
  editingPrice.value = null;
};

const commitPriceEdit = async (model: LlmModel) => {
  if (!editingPrice.value) return;
  const { field, value } = editingPrice.value;
  const parsed = parseFloat(value);

  if (isNaN(parsed) || parsed < 0) {
    const toast = await toastController.create({
      message: 'Invalid price — must be a non-negative number',
      duration: 2500,
      color: 'warning',
    });
    await toast.present();
    editingPrice.value = null;
    return;
  }

  const patch =
    field === 'input' ? { inputCostPer1k: parsed } : { outputCostPer1k: parsed };

  editingPrice.value = null;
  savingModelId.value = model.id;

  try {
    const updated = await adminApiService.updateLlmModel(model.provider, model.slug, patch);
    const idx = models.value.findIndex((m) => m.id === model.id);
    if (idx !== -1) {
      models.value[idx] = updated;
    }
    const toast = await toastController.create({
      message: 'Pricing updated',
      duration: 2000,
      color: 'success',
    });
    await toast.present();
  } catch (err) {
    const toast = await toastController.create({
      message: 'Failed to update pricing',
      duration: 3000,
      color: 'danger',
    });
    await toast.present();
    throw err;
  } finally {
    savingModelId.value = null;
  }
};

// ===================== Add Model modal =====================

const showAddModal = ref(false);
const addingModel = ref(false);

interface AddForm {
  slug: string;
  displayName: string;
  provider: string;
  newProvider: string;
  contextWindow: number;
  inputCostPer1k: number;
  outputCostPer1k: number;
  enabled: boolean;
}

const defaultAddForm = (): AddForm => ({
  slug: '',
  displayName: '',
  provider: providers.value[0]?.name ?? '',
  newProvider: '',
  contextWindow: 128000,
  inputCostPer1k: 0,
  outputCostPer1k: 0,
  enabled: true,
});

const addForm = ref<AddForm>(defaultAddForm());

const openAddModal = () => {
  addForm.value = defaultAddForm();
  showAddModal.value = true;
};

const closeAddModal = () => {
  showAddModal.value = false;
};

const submitAddModel = async () => {
  const providerValue =
    addForm.value.provider === '__new__'
      ? addForm.value.newProvider.trim()
      : addForm.value.provider;

  if (!providerValue) {
    const toast = await toastController.create({
      message: 'Provider name is required',
      duration: 2500,
      color: 'warning',
    });
    await toast.present();
    return;
  }

  const request: CreateLlmModelRequest = {
    slug: addForm.value.slug.trim(),
    displayName: addForm.value.displayName.trim(),
    provider: providerValue,
    contextWindow: addForm.value.contextWindow,
    inputCostPer1k: addForm.value.inputCostPer1k,
    outputCostPer1k: addForm.value.outputCostPer1k,
    enabled: addForm.value.enabled,
  };

  addingModel.value = true;
  try {
    const created = await adminApiService.createLlmModel(request);
    models.value.push(created);
    store.setModels(models.value);
    // Switch to the new model's provider
    selectedProvider.value = created.provider;
    closeAddModal();
    const toast = await toastController.create({
      message: `Model "${created.displayName}" registered`,
      duration: 2500,
      color: 'success',
    });
    await toast.present();
  } catch (err) {
    const toast = await toastController.create({
      message: 'Failed to register model',
      duration: 3000,
      color: 'danger',
    });
    await toast.present();
    throw err;
  } finally {
    addingModel.value = false;
  }
};
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

/* Master-Detail Layout */
.master-detail-container {
  display: grid;
  grid-template-columns: 320px 1fr;
  height: 100%;
  gap: 1rem;
  padding: 1rem;
}

.master-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
  background: var(--ion-background-color);
  border-radius: 8px;
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
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

.provider-list {
  background: transparent;
  padding: 0;
}

.provider-list ion-item {
  cursor: pointer;
  margin-bottom: 0.5rem;
  border-radius: 8px;
  --background: var(--ion-background-color);
  --border-color: var(--ion-border-color, var(--ion-color-light-shade));
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  transition: all 0.2s ease;
}

.provider-list ion-item:hover {
  --background: var(--ion-color-step-50, var(--ion-color-light-tint));
  transform: translateX(2px);
}

.provider-list ion-item.selected-provider {
  --background: var(--ion-color-primary);
  --color: white;
  border-color: var(--ion-color-primary-shade);
  box-shadow: 0 2px 8px rgba(var(--ion-color-primary-rgb), 0.3);
}

.provider-list ion-item.selected-provider ion-label h2,
.provider-list ion-item.selected-provider ion-label p {
  color: white;
}

/* Detail Panel */
.detail-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
  background: var(--ion-background-color);
  border-radius: 8px;
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  padding: 1rem;
}

.detail-panel.empty-details {
  justify-content: center;
  align-items: center;
}

.provider-header {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
}

.provider-header h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--ion-text-color, #333);
}

.provider-subtitle {
  font-size: 0.85rem;
  color: var(--dark-text-muted, #888);
}

.table-container {
  background: var(--ion-card-background, white);
  border-radius: 10px;
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  overflow: hidden;
}

.data-table {
  width: 100%;
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

.model-name {
  font-weight: 500;
}

.model-slug {
  font-size: 0.75rem;
  color: var(--dark-text-muted, #888);
  margin-top: 0.1rem;
}

.mono {
  font-family: monospace;
  font-size: 0.8rem;
}

/* Editable price cells */
.price-cell {
  min-width: 90px;
}

.price-display {
  cursor: pointer;
  display: inline-block;
  padding: 0.15rem 0.35rem;
  border-radius: 4px;
  border: 1px dashed transparent;
  transition: all 0.15s ease;
}

.price-display:hover {
  border-color: var(--ion-color-primary);
  background: rgba(var(--ion-color-primary-rgb), 0.08);
  color: var(--ion-color-primary);
}

.price-input {
  width: 80px;
  padding: 0.15rem 0.35rem;
  background: var(--ion-background-color);
  color: var(--ion-text-color);
  border: 1px solid var(--ion-color-primary);
  border-radius: 4px;
  font-size: 0.8rem;
  outline: none;
  box-shadow: 0 0 0 2px rgba(var(--ion-color-primary-rgb), 0.2);
}

/* Toggle switch */
.toggle-cell {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  white-space: nowrap;
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
  flex-shrink: 0;
  cursor: pointer;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}

.toggle-slider {
  position: absolute;
  inset: 0;
  background: var(--ion-color-medium, #92949c);
  border-radius: 20px;
  transition: background 0.2s ease;
}

.toggle-slider::before {
  content: '';
  position: absolute;
  width: 14px;
  height: 14px;
  left: 3px;
  top: 3px;
  background: white;
  border-radius: 50%;
  transition: transform 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.toggle-switch input:checked + .toggle-slider {
  background: var(--ion-color-success, #10b981);
}

.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(16px);
}

.toggle-switch input:disabled + .toggle-slider {
  opacity: 0.5;
  cursor: not-allowed;
}

.status-label {
  font-size: 0.75rem;
  font-weight: 600;
}

.status-active {
  color: #10b981;
}

.status-inactive {
  color: var(--ion-color-medium, #92949c);
}

/* Add Model Modal */
.add-model-modal {
  --width: 560px;
  --height: auto;
  --max-height: 90vh;
  --border-radius: 12px;
}

.modal-content {
  background: var(--ion-background-color);
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  overflow-y: auto;
  max-height: 90vh;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--ion-text-color);
}

.add-model-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.form-row-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.form-row-split > div {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.form-row-toggle {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.form-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--dark-text-muted, #888);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.required {
  color: var(--ion-color-danger, #ef4444);
}

.form-input {
  padding: 0.5rem 0.75rem;
  background: var(--ion-input-background, var(--ion-color-step-50));
  color: var(--ion-text-color);
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  border-radius: 6px;
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.15s ease;
  width: 100%;
  box-sizing: border-box;
}

.form-input:focus {
  border-color: var(--ion-color-primary);
  box-shadow: 0 0 0 2px rgba(var(--ion-color-primary-rgb), 0.2);
}

.provider-input-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
}

.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--ion-color-medium);
}

.empty-state ion-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.empty-state h3 {
  margin: 0 0 0.5rem;
  color: var(--ion-text-color, #555);
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  color: var(--ion-color-medium);
}

@media (max-width: 992px) {
  .master-detail-container {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }

  .master-panel {
    max-height: 40vh;
  }

  .form-row-split {
    grid-template-columns: 1fr;
  }
}
</style>
