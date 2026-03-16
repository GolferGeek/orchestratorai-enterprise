<template>
  <div class="settings-component">
    <!-- Scope Selector -->
    <div class="settings-section">
      <h4>Select Scope</h4>
      <select v-model="selectedScopeId" class="scope-select" @change="handleScopeChange">
        <option v-for="s in scopes" :key="s.id" :value="s.id">
          {{ s.name }} ({{ s.domain }})
        </option>
      </select>
    </div>

    <!-- Current Scope Settings -->
    <div v-if="scope" class="settings-section">
      <h4>Scope Configuration</h4>

      <div class="config-group">
        <label>Name</label>
        <input
          type="text"
          :value="scope.name"
          @change="handleUpdate('name', ($event.target as HTMLInputElement).value)"
        />
      </div>

      <div class="config-group">
        <label>Domain</label>
        <input type="text" :value="scope.domain" disabled />
      </div>

      <div class="config-group">
        <label>Description</label>
        <textarea
          :value="scope.description"
          rows="3"
          @change="handleUpdate('description', ($event.target as HTMLTextAreaElement).value)"
        ></textarea>
      </div>
    </div>

    <!-- Threshold Configuration -->
    <div v-if="scope?.thresholdConfig" class="settings-section">
      <h4>Threshold Configuration</h4>

      <div class="config-row">
        <label>Alert Threshold</label>
        <span>{{ formatPercent(scope.thresholdConfig.alertThreshold) }}</span>
      </div>

      <div class="config-row">
        <label>Debate Threshold</label>
        <span>{{ formatPercent(scope.thresholdConfig.debateThreshold) }}</span>
      </div>

      <div class="config-row">
        <label>Stale Days</label>
        <span>{{ scope.thresholdConfig.staleDays }} days</span>
      </div>
    </div>

    <!-- Analysis Configuration -->
    <div class="settings-section">
      <h4>Analysis Configuration</h4>

      <div class="config-row toggle-row">
        <label>Risk Radar</label>
        <div class="toggle-wrapper">
          <label class="toggle">
            <input
              type="checkbox"
              :checked="getRiskRadarEnabled()"
              @change="handleToggleRiskRadar"
            />
            <span class="toggle-slider"></span>
          </label>
          <span :class="getRiskRadarEnabled() ? 'enabled' : 'disabled'">
            {{ getRiskRadarEnabled() ? 'Enabled' : 'Disabled' }}
          </span>
        </div>
      </div>

      <div class="config-row toggle-row">
        <label>Debate System</label>
        <div class="toggle-wrapper">
          <label class="toggle">
            <input
              type="checkbox"
              :checked="getDebateEnabled()"
              @change="handleToggleDebate"
            />
            <span class="toggle-slider"></span>
          </label>
          <span :class="getDebateEnabled() ? 'enabled' : 'disabled'">
            {{ getDebateEnabled() ? 'Enabled' : 'Disabled' }}
          </span>
        </div>
      </div>

      <div class="config-row toggle-row">
        <label>Learning Loop</label>
        <div class="toggle-wrapper">
          <label class="toggle">
            <input
              type="checkbox"
              :checked="getLearningEnabled()"
              @change="handleToggleLearning"
            />
            <span class="toggle-slider"></span>
          </label>
          <span :class="getLearningEnabled() ? 'enabled' : 'disabled'">
            {{ getLearningEnabled() ? 'Enabled' : 'Disabled' }}
          </span>
        </div>
      </div>

      <p class="config-hint">
        Note: Risk Radar can also be enabled globally via the RISK_RADAR_ENABLED environment variable.
      </p>
    </div>

    <!-- LLM Configuration -->
    <div class="settings-section">
      <h4>LLM Configuration</h4>

      <div class="config-group">
        <label>Provider</label>
        <select
          :value="getLlmProvider()"
          @change="handleLlmProviderChange"
          class="config-select"
        >
          <option value="ollama">Ollama (Local)</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="google">Google</option>
        </select>
      </div>

      <div class="config-group">
        <label>Model</label>
        <input
          type="text"
          :value="getLlmModel()"
          @change="handleLlmModelChange"
          placeholder="e.g., GPT-OSS:20B, gpt-4, claude-3-opus"
        />
      </div>

      <div class="config-group">
        <label>Temperature</label>
        <input
          type="number"
          :value="getLlmTemperature()"
          @change="handleLlmTemperatureChange"
          min="0"
          max="2"
          step="0.1"
          placeholder="0.7"
        />
      </div>

      <p class="config-hint">
        Defaults: Provider = ollama, Model = GPT-OSS:20B. Override with DEFAULT_LLM_PROVIDER and DEFAULT_LLM_MODEL env vars.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { RiskScope } from '@/types/risk-agent';

interface Props {
  scope: RiskScope | null;
  scopes: RiskScope[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'select-scope', scopeId: string): void;
  (e: 'update-scope', updates: Record<string, unknown>): void;
}>();

const selectedScopeId = ref(props.scope?.id || '');

watch(() => props.scope, (newScope) => {
  if (newScope) {
    selectedScopeId.value = newScope.id;
  }
});

function handleScopeChange() {
  if (selectedScopeId.value) {
    emit('select-scope', selectedScopeId.value);
  }
}

function handleUpdate(field: string, value: unknown) {
  emit('update-scope', { [field]: value });
}

function formatPercent(value: number): string {
  // Handle both 0-1 and 0-100 scales
  const normalized = value > 1 ? value / 100 : value;
  return (normalized * 100).toFixed(0) + '%';
}

// Analysis config helpers
function getRiskRadarEnabled(): boolean {
  return props.scope?.analysisConfig?.riskRadar?.enabled ?? false;
}

function getDebateEnabled(): boolean {
  return props.scope?.analysisConfig?.debate?.enabled ?? false;
}

function getLearningEnabled(): boolean {
  return props.scope?.analysisConfig?.learning?.enabled ?? false;
}

function handleToggleRiskRadar(event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  emit('update-scope', {
    analysisConfig: {
      ...props.scope?.analysisConfig,
      riskRadar: {
        ...props.scope?.analysisConfig?.riskRadar,
        enabled: checked,
      },
    },
  });
}

function handleToggleDebate(event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  emit('update-scope', {
    analysisConfig: {
      ...props.scope?.analysisConfig,
      debate: {
        ...props.scope?.analysisConfig?.debate,
        enabled: checked,
      },
    },
  });
}

function handleToggleLearning(event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  emit('update-scope', {
    analysisConfig: {
      ...props.scope?.analysisConfig,
      learning: {
        ...props.scope?.analysisConfig?.learning,
        enabled: checked,
      },
    },
  });
}

// LLM config helpers
function getLlmProvider(): string {
  return props.scope?.llmConfig?.provider ?? 'ollama';
}

function getLlmModel(): string {
  return props.scope?.llmConfig?.model ?? 'GPT-OSS:20B';
}

function getLlmTemperature(): number {
  return props.scope?.llmConfig?.temperature ?? 0.7;
}

function handleLlmProviderChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  emit('update-scope', {
    llmConfig: {
      ...props.scope?.llmConfig,
      provider: value,
    },
  });
}

function handleLlmModelChange(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  emit('update-scope', {
    llmConfig: {
      ...props.scope?.llmConfig,
      model: value,
    },
  });
}

function handleLlmTemperatureChange(event: Event) {
  const value = parseFloat((event.target as HTMLInputElement).value) || 0.7;
  emit('update-scope', {
    llmConfig: {
      ...props.scope?.llmConfig,
      temperature: value,
    },
  });
}
</script>

<style scoped>
.settings-component {
  max-width: 600px;
}

.settings-section {
  background: var(--ion-card-background, #fff);
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.settings-section h4 {
  margin: 0 0 1rem;
  font-size: 1rem;
  border-bottom: 1px solid var(--ion-border-color, #e0e0e0);
  padding-bottom: 0.5rem;
}

.scope-select {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--ion-border-color, #e0e0e0);
  border-radius: 4px;
  font-size: 0.875rem;
}

.config-group {
  margin-bottom: 1rem;
}

.config-group label {
  display: block;
  font-size: 0.75rem;
  color: var(--ion-color-medium, #666);
  margin-bottom: 0.25rem;
}

.config-group input,
.config-group textarea {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--ion-border-color, #e0e0e0);
  border-radius: 4px;
  font-size: 0.875rem;
}

.config-group input:disabled {
  background: var(--ion-color-light, #f4f5f8);
}

.config-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--ion-border-color, #e0e0e0);
}

.config-row:last-child {
  border-bottom: none;
}

.config-row label {
  font-size: 0.875rem;
  color: var(--ion-color-medium, #666);
}

.config-row span {
  font-size: 0.875rem;
  font-weight: 500;
}

.config-row span.enabled {
  color: var(--ion-color-success, #2dd36f);
}

.config-row span.disabled {
  color: var(--ion-color-medium, #666);
}

.toggle-row {
  flex-wrap: wrap;
}

.toggle-wrapper {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

/* Toggle switch styles */
.toggle {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 26px;
}

.toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--ion-color-medium, #92949c);
  transition: 0.3s;
  border-radius: 26px;
}

.toggle-slider:before {
  position: absolute;
  content: "";
  height: 20px;
  width: 20px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.3s;
  border-radius: 50%;
}

.toggle input:checked + .toggle-slider {
  background-color: var(--ion-color-primary, #3880ff);
}

.toggle input:checked + .toggle-slider:before {
  transform: translateX(22px);
}

.config-select {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--ion-border-color, #e0e0e0);
  border-radius: 4px;
  font-size: 0.875rem;
  background: var(--ion-card-background, #fff);
}

.config-hint {
  margin: 0.75rem 0 0;
  padding: 0.5rem;
  background: var(--ion-color-light, #f4f5f8);
  border-radius: 4px;
  font-size: 0.75rem;
  color: var(--ion-color-medium, #666);
  line-height: 1.4;
}

/* Light mode only: ensure inputs/selects have light background and dark text */
html:not(.ion-palette-dark):not([data-theme="dark"]) .settings-component .scope-select,
html:not(.ion-palette-dark):not([data-theme="dark"]) .settings-component .config-select,
html:not(.ion-palette-dark):not([data-theme="dark"]) .settings-component .config-group input,
html:not(.ion-palette-dark):not([data-theme="dark"]) .settings-component .config-group textarea {
  background: #fff;
  color: #222;
}

/* Dark mode */
html.ion-palette-dark .settings-component .settings-section,
html[data-theme="dark"] .settings-component .settings-section {
  background: var(--dark-bg-tertiary, #2d3748);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

html.ion-palette-dark .settings-component .settings-section h4,
html[data-theme="dark"] .settings-component .settings-section h4 {
  color: var(--dark-text-primary, #f7fafc);
  border-bottom-color: var(--dark-border-subtle, #374151);
}

html.ion-palette-dark .settings-component .scope-select,
html[data-theme="dark"] .settings-component .scope-select,
html.ion-palette-dark .settings-component .config-select,
html[data-theme="dark"] .settings-component .config-select,
html.ion-palette-dark .settings-component .config-group input,
html[data-theme="dark"] .settings-component .config-group input,
html.ion-palette-dark .settings-component .config-group textarea,
html[data-theme="dark"] .settings-component .config-group textarea {
  background: var(--dark-bg-quaternary, #374151);
  border-color: var(--dark-border-primary, #4a5568);
  color: var(--dark-text-primary, #f7fafc);
}

html.ion-palette-dark .settings-component .config-group input:disabled,
html[data-theme="dark"] .settings-component .config-group input:disabled {
  background: var(--dark-bg-secondary, #1f2937);
  color: var(--dark-text-muted, #a0aec0);
}

html.ion-palette-dark .settings-component .config-group label,
html[data-theme="dark"] .settings-component .config-group label,
html.ion-palette-dark .settings-component .config-row label,
html[data-theme="dark"] .settings-component .config-row label {
  color: var(--dark-text-muted, #a0aec0);
}

html.ion-palette-dark .settings-component .config-row,
html[data-theme="dark"] .settings-component .config-row {
  border-bottom-color: var(--dark-border-subtle, #374151);
}

html.ion-palette-dark .settings-component .config-row span,
html[data-theme="dark"] .settings-component .config-row span {
  color: var(--dark-text-primary, #f7fafc);
}

html.ion-palette-dark .settings-component .config-row span.enabled,
html[data-theme="dark"] .settings-component .config-row span.enabled {
  color: #86efac;
}

html.ion-palette-dark .settings-component .config-row span.disabled,
html[data-theme="dark"] .settings-component .config-row span.disabled {
  color: var(--dark-text-muted, #a0aec0);
}

html.ion-palette-dark .settings-component .config-hint,
html[data-theme="dark"] .settings-component .config-hint {
  background: var(--dark-bg-quaternary, #374151);
  color: var(--dark-text-muted, #a0aec0);
}

html.ion-palette-dark .settings-component .toggle-slider,
html[data-theme="dark"] .settings-component .toggle-slider {
  background-color: var(--dark-border-primary, #4a5568);
}
</style>
