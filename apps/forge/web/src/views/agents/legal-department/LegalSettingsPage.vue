<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-menu-button />
        </ion-buttons>
        <ion-title>Legal — Settings</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content :fullscreen="true" class="ion-padding">
      <h2>Document Onboarding — Model Roles</h2>
      <p class="hint">
        Pick the (provider, model) the worker uses for each role. Workhorse
        runs the heavy specialist analysis. Thinking handles synthesis,
        routing, and report generation. Image is reserved for vision-based
        extraction of scanned PDFs and photos.
      </p>

      <div v-if="loading" class="loading">
        <ion-spinner name="crescent" /> Loading…
      </div>
      <div v-else-if="error" class="error">{{ error }}</div>
      <div v-else class="role-grid">
        <div v-for="row in roles" :key="row.role" class="role-card" :class="{ disabled: row.role === 'image' }">
          <h3>{{ roleLabel(row.role) }}</h3>
          <p class="role-hint">{{ roleHint(row.role) }}</p>

          <ion-item lines="none">
            <ion-label>Provider</ion-label>
            <ion-select
              :value="draft[row.role]?.provider ?? ''"
              :disabled="row.role === 'image'"
              interface="popover"
              @ion-change="onProviderChange(row.role, $event)"
            >
              <ion-select-option value="ollama">Ollama</ion-select-option>
              <ion-select-option value="openai">OpenAI</ion-select-option>
              <ion-select-option value="anthropic">Anthropic</ion-select-option>
            </ion-select>
          </ion-item>

          <ion-item lines="none">
            <ion-label>Model</ion-label>
            <ion-input
              :value="draft[row.role]?.model ?? ''"
              :disabled="row.role === 'image'"
              :placeholder="row.role === 'image' ? '(coming soon)' : 'gemma4:e4b'"
              @ion-input="onModelInput(row.role, $event)"
            />
          </ion-item>

          <div class="actions">
            <ion-button
              size="small"
              :disabled="row.role === 'image' || !isDirty(row.role) || saving === row.role"
              @click="save(row.role)"
            >
              <ion-spinner v-if="saving === row.role" name="dots" />
              <span v-else>Save</span>
            </ion-button>
            <span v-if="row.role === 'image'" class="reserved">Reserved — vision pipeline pending</span>
          </div>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonMenuButton,
  IonItem,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonInput,
  IonButton,
  IonSpinner,
} from '@ionic/vue';
import {
  legalJobsService,
  type CapabilityModelConfigRow,
  type CapabilityRole,
} from './legalJobsService';

const CAPABILITY = 'document-onboarding';

const roles = ref<CapabilityModelConfigRow[]>([]);
const draft = reactive<
  Record<CapabilityRole, { provider: string | null; model: string | null }>
>({
  workhorse: { provider: null, model: null },
  thinking: { provider: null, model: null },
  image: { provider: null, model: null },
});
const original = reactive<
  Record<CapabilityRole, { provider: string | null; model: string | null }>
>({
  workhorse: { provider: null, model: null },
  thinking: { provider: null, model: null },
  image: { provider: null, model: null },
});

const loading = ref(true);
const saving = ref<CapabilityRole | null>(null);
const error = ref<string | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const rows = await legalJobsService.getCapabilityModels(CAPABILITY);
    roles.value = rows;
    for (const row of rows) {
      draft[row.role] = { provider: row.provider, model: row.model };
      original[row.role] = { provider: row.provider, model: row.model };
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

function isDirty(role: CapabilityRole): boolean {
  return (
    draft[role].provider !== original[role].provider ||
    draft[role].model !== original[role].model
  );
}

function onProviderChange(role: CapabilityRole, event: CustomEvent): void {
  const value = (event.detail as { value: string }).value;
  draft[role].provider = value || null;
}

function onModelInput(role: CapabilityRole, event: CustomEvent): void {
  const value = (event.detail as { value: string }).value;
  draft[role].model = value || null;
}

async function save(role: CapabilityRole): Promise<void> {
  saving.value = role;
  error.value = null;
  try {
    await legalJobsService.putCapabilityModel(
      CAPABILITY,
      role,
      draft[role].provider,
      draft[role].model,
    );
    original[role] = { ...draft[role] };
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    saving.value = null;
  }
}

function roleLabel(role: string): string {
  return (
    {
      workhorse: 'Workhorse',
      thinking: 'Thinking',
      image: 'Image',
    }[role] ?? role
  );
}

function roleHint(role: string): string {
  return (
    {
      workhorse: 'Heavy lifting: extraction and 8-specialist analysis.',
      thinking: 'Synthesis, routing, and final report generation.',
      image: 'Vision-based extraction for scanned PDFs and photos.',
    }[role] ?? ''
  );
}

onMounted(() => {
  void load();
});
</script>

<style scoped>
.hint {
  color: var(--ion-color-medium);
  font-size: 0.9em;
  max-width: 720px;
}

.loading,
.error {
  padding: 24px;
}

.error {
  color: var(--ion-color-danger);
}

.role-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.role-card {
  background: var(--ion-background-color);
  border: 1px solid var(--ion-color-step-150);
  border-radius: 8px;
  padding: 16px;
}

.role-card.disabled {
  opacity: 0.6;
}

.role-card h3 {
  margin: 0 0 4px;
}

.role-hint {
  font-size: 0.85em;
  color: var(--ion-color-medium);
  margin: 0 0 12px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.reserved {
  font-size: 0.8em;
  color: var(--ion-color-medium);
}
</style>
