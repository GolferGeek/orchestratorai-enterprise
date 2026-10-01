<template>
  <div class="model-picker">
    <div class="current">
      <span class="label">Runs on</span>
      <span v-if="current" class="value mono">{{ current.model }} <span class="via">via {{ current.provider }}</span></span>
      <span v-else class="value muted">No model set</span>
    </div>

    <div class="choose">
      <label class="label" for="agent-model-select">Change to</label>
      <select id="agent-model-select" v-model="choice" :disabled="loading || saving || models.length === 0">
        <option value="">Choose a {{ kindLabel }} model…</option>
        <optgroup v-for="group in groups" :key="group.vendor" :label="group.vendor">
          <option v-for="m in group.models" :key="m.providerName + '|' + m.modelName" :value="m.providerName + '|' + m.modelName">
            {{ m.displayName }}{{ m.pricePerImage !== undefined ? ` — $${m.pricePerImage.toFixed(3)} per image` : '' }}
          </option>
        </optgroup>
      </select>
      <div class="actions">
        <button type="button" class="primary" :disabled="!choice || saving || isCurrent" @click="save">
          {{ saving ? 'Saving…' : 'Save model' }}
        </button>
        <button type="button" :disabled="refreshing" @click="refresh">
          {{ refreshing ? 'Refreshing…' : 'Refresh the list from OpenRouter' }}
        </button>
      </div>
    </div>

    <p v-if="loading" class="muted">Loading {{ kindLabel }} models…</p>
    <p v-else-if="models.length === 0 && !error" class="muted">The catalog has no {{ kindLabel }} models. Refresh the list from OpenRouter.</p>
    <p v-if="notice" class="notice">{{ notice }}</p>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  apiErrorMessage,
  platformAdminService,
  type AgentRegistryEntry,
  type CatalogModel,
  type CatalogModelType,
} from '../services/platform-admin.service';

/**
 * The model an agent runs on, chosen from the model catalog (refreshed from
 * OpenRouter) and limited to what the agent makes: images, video or text.
 */
const props = defineProps<{ agent: AgentRegistryEntry }>();
const emit = defineEmits<{ saved: [agent: AgentRegistryEntry] }>();

const models = ref<CatalogModel[]>([]);
const choice = ref('');
const loading = ref(false);
const saving = ref(false);
const refreshing = ref(false);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);

const modelType = computed<CatalogModelType>(() => {
  if (props.agent.agentType !== 'media') return 'text-generation';
  return props.agent.config.mediaType === 'video' ? 'video-generation' : 'image-generation';
});
const kindLabel = computed(() => ({ 'text-generation': 'text', 'image-generation': 'image', 'video-generation': 'video' })[modelType.value]);
const current = computed(() => props.agent.llmConfig);
const isCurrent = computed(() => !!current.value && choice.value === `${current.value.provider}|${current.value.model}`);

const groups = computed(() => {
  const byVendor = new Map<string, CatalogModel[]>();
  for (const m of models.value) byVendor.set(m.vendor, [...(byVendor.get(m.vendor) ?? []), m]);
  return [...byVendor.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([vendor, list]) => ({ vendor, models: list.sort((a, b) => a.displayName.localeCompare(b.displayName)) }));
});

async function load() {
  loading.value = true;
  error.value = null;
  try {
    models.value = await platformAdminService.getCatalogModels(modelType.value);
    if (current.value) choice.value = `${current.value.provider}|${current.value.model}`;
  } catch (e) {
    error.value = `Could not load the model list: ${apiErrorMessage(e)}`;
  } finally {
    loading.value = false;
  }
}

async function save() {
  const [provider, ...rest] = choice.value.split('|');
  const model = rest.join('|');
  if (!provider || !model) return;
  saving.value = true;
  error.value = null;
  notice.value = null;
  try {
    const updated = await platformAdminService.setAgentModel(props.agent.slug, provider, model);
    notice.value = `${props.agent.name} now runs on ${model}.`;
    emit('saved', updated);
  } catch (e) {
    error.value = apiErrorMessage(e);
  } finally {
    saving.value = false;
  }
}

async function refresh() {
  refreshing.value = true;
  error.value = null;
  notice.value = null;
  try {
    const result = await platformAdminService.refreshModelCatalog();
    notice.value = `Catalog refreshed: ${result.models} models from ${result.vendors.length} makers${result.deactivated ? `, ${result.deactivated} withdrawn` : ''}.`;
    await load();
  } catch (e) {
    error.value = `Could not refresh the catalog: ${apiErrorMessage(e)}`;
  } finally {
    refreshing.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.model-picker {
  display: grid;
  gap: 0.75rem;
}
.current,
.choose {
  display: grid;
  gap: 0.35rem;
}
.label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ion-color-medium, #6b7280);
}
.value {
  font-size: 0.95rem;
}
.via {
  color: var(--ion-color-medium, #6b7280);
  font-size: 0.85rem;
}
.mono {
  font-family: ui-monospace, Menlo, monospace;
}
select {
  max-width: 34rem;
  width: 100%;
  padding: 0.45rem 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade, #d1d5db));
  background: var(--ion-background-color, #fff);
  color: var(--ion-text-color, #111827);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.25rem;
}
button {
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade, #d1d5db));
  background: transparent;
  color: var(--ion-text-color, #111827);
  cursor: pointer;
}
button.primary {
  background: var(--ion-color-primary, #2563eb);
  border-color: var(--ion-color-primary, #2563eb);
  color: var(--ion-color-primary-contrast, #fff);
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
button:focus-visible,
select:focus-visible {
  outline: 2px solid var(--ion-color-primary, #2563eb);
  outline-offset: 2px;
}
.muted {
  color: var(--ion-color-medium, #6b7280);
  margin: 0;
}
.notice {
  color: var(--ion-color-success, #15803d);
  margin: 0;
}
.error {
  color: var(--ion-color-danger, #b91c1c);
  margin: 0;
}
</style>
