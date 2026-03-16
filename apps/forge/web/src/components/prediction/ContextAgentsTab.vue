<template>
  <div class="context-agents-tab">

    <!-- Sub-tab bar: Analysts / Targets / Universes -->
    <div class="sub-tabs">
      <button
        v-for="t in subTabs"
        :key="t.key"
        class="sub-tab-btn"
        :class="{ 'sub-tab-btn--active': activeSubTab === t.key }"
        @click="activeSubTab = t.key"
      >
        {{ t.label }}
        <span class="sub-tab-count">{{ counts[t.key] }}</span>
      </button>
      <button class="sub-tab-refresh" @click="loadAll" :disabled="loading" title="Refresh">↻</button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="state-panel">
      <div class="spinner"></div>
      <span>Loading...</span>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="state-panel state-error">
      <span class="error-icon">!</span>
      <span>{{ error }}</span>
      <button class="btn btn-secondary" @click="loadAll">Retry</button>
    </div>

    <template v-else>

      <!-- ── ANALYSTS tab ── -->
      <div v-if="activeSubTab === 'analysts'">
        <div class="scope-filter">
          <button
            v-for="s in analystScopes"
            :key="s"
            class="scope-btn"
            :class="{ 'scope-btn--active': analystScope === s }"
            @click="analystScope = s"
          >
            {{ s === 'all' ? 'All' : s }}
            <span class="sub-tab-count">{{ scopeCount(s) }}</span>
          </button>
        </div>

        <div v-if="filteredAnalysts.length === 0" class="state-panel">
          <span>No analysts for this scope.</span>
        </div>

        <div v-else class="agents-list">
          <div
            v-for="analyst in filteredAnalysts"
            :key="analyst.id"
            class="agent-card"
            :class="{ 'agent-card--disabled': !analyst.is_enabled }"
          >
            <!-- Summary row -->
            <div class="agent-summary" @click="toggleExpand('analyst', analyst.id)">
              <div class="agent-main">
                <div class="agent-name-row">
                  <span class="agent-name">{{ analyst.name }}</span>
                  <code class="agent-slug">{{ analyst.slug }}</code>
                  <span class="scope-badge" :class="`scope-badge--${analyst.scope_level}`">
                    {{ analyst.scope_level }}
                  </span>
                  <span v-if="analyst.domain" class="domain-badge">{{ analyst.domain }}</span>
                  <span v-if="!analyst.is_enabled" class="disabled-badge">disabled</span>
                </div>
                <p class="agent-desc">{{ truncate(analyst.perspective, 120) }}</p>
              </div>
              <div class="expand-toggle">{{ expandedKey === `analyst-${analyst.id}` ? '▲' : '▼' }}</div>
            </div>

            <!-- Edit panel -->
            <div v-if="expandedKey === `analyst-${analyst.id}`" class="edit-panel">
              <div class="field">
                <label class="field-label">
                  Perspective / Persona
                  <span class="field-hint">{{ analystEdit[analyst.id]?.perspective.length ?? 0 }} chars</span>
                </label>
                <textarea
                  class="field-input context-editor"
                  rows="12"
                  v-model="analystEdit[analyst.id].perspective"
                ></textarea>
              </div>

              <div v-if="analystEdit[analyst.id]?.tierJson !== undefined" class="field">
                <label class="field-label">
                  Tier Instructions (JSON)
                  <span class="field-hint">gold · silver · bronze</span>
                </label>
                <textarea
                  class="field-input context-editor"
                  rows="14"
                  v-model="analystEdit[analyst.id].tierJson"
                  :class="{ 'field-input--error': analystEdit[analyst.id].tierJsonError }"
                ></textarea>
                <span v-if="analystEdit[analyst.id].tierJsonError" class="json-error">
                  Invalid JSON
                </span>
              </div>

              <div class="field field-row">
                <label class="field-label">Enabled</label>
                <input
                  type="checkbox"
                  v-model="analystEdit[analyst.id].is_enabled"
                  class="field-checkbox"
                />
              </div>

              <div class="edit-actions">
                <button class="btn btn-secondary" @click="cancelEdit">Cancel</button>
                <button
                  class="btn btn-primary"
                  @click="saveAnalyst(analyst)"
                  :disabled="saving === `analyst-${analyst.id}`"
                >
                  {{ saving === `analyst-${analyst.id}` ? 'Saving…' : 'Save' }}
                </button>
              </div>

              <div v-if="saveError[`analyst-${analyst.id}`]" class="save-feedback save-error-msg">
                {{ saveError[`analyst-${analyst.id}`] }}
              </div>
              <div v-if="saveSuccess === `analyst-${analyst.id}`" class="save-feedback save-success-msg">
                Saved successfully.
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── TARGETS tab ── -->
      <div v-if="activeSubTab === 'targets'">
        <div v-if="targets.length === 0" class="state-panel">
          <span>No targets found.</span>
        </div>

        <div v-else class="agents-list">
          <div v-for="target in targets" :key="target.id" class="agent-card">
            <div class="agent-summary" @click="toggleExpand('target', target.id)">
              <div class="agent-main">
                <div class="agent-name-row">
                  <span class="agent-name">{{ target.symbol }}</span>
                  <span class="agent-slug">{{ target.name }}</span>
                  <span v-if="!target.is_active" class="disabled-badge">inactive</span>
                </div>
                <p class="agent-desc">{{ truncate(target.context, 120) }}</p>
              </div>
              <div class="expand-toggle">{{ expandedKey === `target-${target.id}` ? '▲' : '▼' }}</div>
            </div>

            <div v-if="expandedKey === `target-${target.id}`" class="edit-panel">
              <div class="field">
                <label class="field-label">Name</label>
                <input class="field-input" type="text" v-model="targetEdit[target.id].name" />
              </div>
              <div class="field">
                <label class="field-label">
                  Context
                  <span class="field-hint">{{ targetEdit[target.id]?.context.length ?? 0 }} chars</span>
                </label>
                <textarea
                  class="field-input context-editor"
                  rows="10"
                  v-model="targetEdit[target.id].context"
                ></textarea>
              </div>

              <div class="edit-actions">
                <button class="btn btn-secondary" @click="cancelEdit">Cancel</button>
                <button
                  class="btn btn-primary"
                  @click="saveTarget(target)"
                  :disabled="saving === `target-${target.id}`"
                >
                  {{ saving === `target-${target.id}` ? 'Saving…' : 'Save' }}
                </button>
              </div>

              <div v-if="saveError[`target-${target.id}`]" class="save-feedback save-error-msg">
                {{ saveError[`target-${target.id}`] }}
              </div>
              <div v-if="saveSuccess === `target-${target.id}`" class="save-feedback save-success-msg">
                Saved successfully.
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── UNIVERSES tab ── -->
      <div v-if="activeSubTab === 'universes'">
        <div v-if="universes.length === 0" class="state-panel">
          <span>No universes found.</span>
        </div>
        <div v-else class="agents-list">
          <div v-for="u in universes" :key="u.id" class="agent-card agent-card--readonly">
            <div class="agent-summary no-expand">
              <div class="agent-main">
                <div class="agent-name-row">
                  <span class="agent-name">{{ u.name }}</span>
                  <span class="scope-badge scope-badge--runner">{{ u.domain }}</span>
                  <span v-if="!u.is_active" class="disabled-badge">inactive</span>
                </div>
                <p class="agent-desc">Org: {{ u.organization_slug }} · Agent: {{ u.agent_slug }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { apiService } from '@/services/apiService';

interface Analyst {
  id: string;
  slug: string;
  name: string;
  perspective: string;
  tier_instructions: Record<string, unknown>;
  scope_level: string;
  domain: string | null;
  universe_id: string | null;
  target_id: string | null;
  default_weight: number;
  is_enabled: boolean;
  analyst_type: string | null;
}

interface Target {
  id: string;
  universe_id: string;
  symbol: string;
  name: string;
  target_type: string;
  context: string;
  is_active: boolean;
}

interface Universe {
  id: string;
  name: string;
  domain: string;
  organization_slug: string;
  agent_slug: string;
  is_active: boolean;
}

interface AnalystEditState {
  perspective: string;
  tierJson: string;
  tierJsonError: boolean;
  is_enabled: boolean;
}

interface TargetEditState {
  name: string;
  context: string;
}

// ── State ─────────────────────────────────────────────────────────────────

const loading = ref(false);
const error = ref<string | null>(null);
const analysts = ref<Analyst[]>([]);
const targets = ref<Target[]>([]);
const universes = ref<Universe[]>([]);

const activeSubTab = ref<'analysts' | 'targets' | 'universes'>('analysts');
const analystScope = ref('all');

const expandedKey = ref<string | null>(null);
const analystEdit = ref<Record<string, AnalystEditState>>({});
const targetEdit = ref<Record<string, TargetEditState>>({});
const saving = ref<string | null>(null);
const saveError = ref<Record<string, string>>({});
const saveSuccess = ref<string | null>(null);

// ── Config ────────────────────────────────────────────────────────────────

const subTabs = [
  { key: 'analysts' as const, label: 'Analysts' },
  { key: 'targets' as const, label: 'Targets' },
  { key: 'universes' as const, label: 'Universes' },
];

const analystScopes = computed(() => {
  const scopes = ['all', ...new Set(analysts.value.map(a => a.scope_level))].sort();
  return scopes;
});

const counts = computed(() => ({
  analysts: analysts.value.length,
  targets: targets.value.length,
  universes: universes.value.length,
}));

const filteredAnalysts = computed(() => {
  if (analystScope.value === 'all') return analysts.value;
  return analysts.value.filter(a => a.scope_level === analystScope.value);
});

function scopeCount(scope: string): number {
  if (scope === 'all') return analysts.value.length;
  return analysts.value.filter(a => a.scope_level === scope).length;
}

// ── Data loading ──────────────────────────────────────────────────────────

async function loadAll() {
  loading.value = true;
  error.value = null;
  try {
    const [analystRes, targetRes, universeRes] = await Promise.all([
      apiService.get<{ data: Analyst[] }>('/api/prediction/context/analysts'),
      apiService.get<{ data: Target[] }>('/api/prediction/context/targets'),
      apiService.get<{ data: Universe[] }>('/api/prediction/context/universes'),
    ]);
    analysts.value = (analystRes as { data: Analyst[] }).data ?? [];
    targets.value = (targetRes as { data: Target[] }).data ?? [];
    universes.value = (universeRes as { data: Universe[] }).data ?? [];
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load';
  } finally {
    loading.value = false;
  }
}

// ── Expand / edit helpers ─────────────────────────────────────────────────

function toggleExpand(type: 'analyst' | 'target', id: string) {
  const key = `${type}-${id}`;
  if (expandedKey.value === key) {
    expandedKey.value = null;
    return;
  }

  if (type === 'analyst') {
    const a = analysts.value.find(x => x.id === id);
    if (!a) return;
    analystEdit.value[id] = {
      perspective: a.perspective,
      tierJson: JSON.stringify(a.tier_instructions, null, 2),
      tierJsonError: false,
      is_enabled: a.is_enabled,
    };
  } else {
    const t = targets.value.find(x => x.id === id);
    if (!t) return;
    targetEdit.value[id] = { name: t.name, context: t.context };
  }

  delete saveError.value[key];
  if (saveSuccess.value === key) saveSuccess.value = null;
  expandedKey.value = key;
}

function cancelEdit() {
  expandedKey.value = null;
}

// ── Save ──────────────────────────────────────────────────────────────────

async function saveAnalyst(analyst: Analyst) {
  const state = analystEdit.value[analyst.id];
  if (!state) return;

  // Validate tier JSON
  let tier_instructions: Record<string, unknown>;
  try {
    tier_instructions = JSON.parse(state.tierJson) as Record<string, unknown>;
    state.tierJsonError = false;
  } catch {
    state.tierJsonError = true;
    return;
  }

  const key = `analyst-${analyst.id}`;
  saving.value = key;
  delete saveError.value[key];
  saveSuccess.value = null;

  try {
    await apiService.patch(`/api/prediction/context/analysts/${analyst.id}`, {
      perspective: state.perspective,
      tier_instructions,
      is_enabled: state.is_enabled,
    });

    const idx = analysts.value.findIndex(a => a.id === analyst.id);
    if (idx !== -1) {
      analysts.value[idx] = {
        ...analysts.value[idx],
        perspective: state.perspective,
        tier_instructions,
        is_enabled: state.is_enabled,
      };
    }

    saveSuccess.value = key;
    setTimeout(() => { if (saveSuccess.value === key) saveSuccess.value = null; }, 3000);
  } catch (err) {
    saveError.value[key] = err instanceof Error ? err.message : 'Save failed';
  } finally {
    saving.value = null;
  }
}

async function saveTarget(target: Target) {
  const state = targetEdit.value[target.id];
  if (!state) return;

  const key = `target-${target.id}`;
  saving.value = key;
  delete saveError.value[key];
  saveSuccess.value = null;

  try {
    await apiService.patch(`/api/prediction/context/targets/${target.id}`, {
      name: state.name,
      context: state.context,
    });

    const idx = targets.value.findIndex(t => t.id === target.id);
    if (idx !== -1) {
      targets.value[idx] = { ...targets.value[idx], name: state.name, context: state.context };
    }

    saveSuccess.value = key;
    setTimeout(() => { if (saveSuccess.value === key) saveSuccess.value = null; }, 3000);
  } catch (err) {
    saveError.value[key] = err instanceof Error ? err.message : 'Save failed';
  } finally {
    saving.value = null;
  }
}

function truncate(text: string, max: number): string {
  if (!text || text.length <= max) return text ?? '';
  return text.slice(0, max) + '…';
}

onMounted(loadAll);
</script>

<style scoped>
.context-agents-tab {
  padding: 0;
}

/* Sub-tabs */
.sub-tabs {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  padding-bottom: 0.5rem;
}

.sub-tab-btn {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.9rem;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  background: none;
  color: var(--text-secondary, #6b7280);
  transition: all 0.15s;
}

.sub-tab-btn:hover {
  color: var(--text-primary, #111827);
  background: var(--hover-bg, #f9fafb);
}

.sub-tab-btn--active {
  background: var(--primary-color, #15803d);
  color: #fff;
  border-color: var(--primary-color, #15803d);
}

.sub-tab-count {
  font-size: 0.72rem;
  opacity: 0.75;
  font-weight: 400;
}

.sub-tab-refresh {
  margin-left: auto;
  padding: 0.3rem 0.6rem;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  background: none;
  cursor: pointer;
  font-size: 1rem;
  color: var(--text-secondary, #6b7280);
  transition: color 0.15s;
}

.sub-tab-refresh:hover:not(:disabled) {
  color: var(--text-primary, #111827);
}

.sub-tab-refresh:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Scope filter */
.scope-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 1rem;
}

.scope-btn {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.2rem 0.65rem;
  border-radius: 12px;
  border: 1px solid var(--border-color, #e5e7eb);
  font-size: 0.78rem;
  cursor: pointer;
  background: none;
  color: var(--text-secondary, #6b7280);
  transition: all 0.15s;
}

.scope-btn:hover { background: var(--hover-bg, #f9fafb); }
.scope-btn--active {
  background: var(--primary-color, #15803d);
  color: #fff;
  border-color: var(--primary-color, #15803d);
}

/* States */
.state-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 3rem;
  color: var(--text-secondary, #6b7280);
}

.state-error { color: #ef4444; }

.error-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--border-color, #e5e7eb);
  border-top-color: var(--primary-color, #15803d);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* Agent list */
.agents-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.agent-card {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  background: var(--card-bg, #ffffff);
  overflow: hidden;
}

.agent-card--disabled {
  opacity: 0.6;
}

.agent-card--readonly .agent-summary {
  cursor: default;
}

.agent-card--readonly .agent-summary:hover {
  background: none;
}

.agent-summary {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 0.85rem 1rem;
  cursor: pointer;
  transition: background 0.15s;
}

.agent-summary:hover {
  background: var(--hover-bg, #f9fafb);
}

.no-expand { cursor: default; }
.no-expand:hover { background: none; }

.agent-main { flex: 1; min-width: 0; }

.agent-name-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
  margin-bottom: 0.3rem;
}

.agent-name {
  font-weight: 600;
  font-size: 0.92rem;
  color: var(--text-primary, #111827);
}

.agent-slug {
  font-family: monospace;
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
  background: var(--hover-bg, #f3f4f6);
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
}

.scope-badge {
  font-size: 0.7rem;
  padding: 0.1rem 0.45rem;
  border-radius: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.scope-badge--runner { background: rgba(59, 130, 246, 0.12); color: #2563eb; }
.scope-badge--domain { background: rgba(139, 92, 246, 0.12); color: #7c3aed; }
.scope-badge--universe { background: rgba(245, 158, 11, 0.12); color: #d97706; }
.scope-badge--target { background: rgba(16, 185, 129, 0.12); color: #059669; }

.domain-badge {
  font-size: 0.7rem;
  padding: 0.1rem 0.4rem;
  border-radius: 8px;
  background: rgba(107, 114, 128, 0.1);
  color: var(--text-secondary, #6b7280);
}

.disabled-badge {
  font-size: 0.68rem;
  padding: 0.1rem 0.4rem;
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.agent-desc {
  margin: 0;
  font-size: 0.82rem;
  color: var(--text-secondary, #6b7280);
  line-height: 1.4;
}

.expand-toggle {
  font-size: 0.72rem;
  color: var(--text-secondary, #6b7280);
  flex-shrink: 0;
  padding-top: 0.1rem;
}

/* Edit panel */
.edit-panel {
  border-top: 1px solid var(--border-color, #e5e7eb);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  background: var(--hover-bg, #f9fafb);
}

.field { display: flex; flex-direction: column; gap: 0.3rem; }

.field-row {
  flex-direction: row;
  align-items: center;
  gap: 0.75rem;
}

.field-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary, #6b7280);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.field-hint {
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  opacity: 0.8;
}

.field-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  font-size: 0.875rem;
  background: var(--card-bg, #ffffff);
  color: var(--text-primary, #111827);
  box-sizing: border-box;
  resize: vertical;
  font-family: inherit;
  line-height: 1.5;
}

.field-input--error { border-color: #ef4444; }

.context-editor {
  font-family: ui-monospace, 'Cascadia Code', Menlo, monospace;
  font-size: 0.8rem;
  min-height: 180px;
}

.field-input:focus {
  outline: none;
  border-color: var(--primary-color, #15803d);
  box-shadow: 0 0 0 2px rgba(21, 128, 61, 0.12);
}

.field-checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.json-error {
  font-size: 0.78rem;
  color: #ef4444;
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.save-feedback { font-size: 0.82rem; text-align: right; }
.save-error-msg { color: #ef4444; }
.save-success-msg { color: var(--primary-color, #15803d); font-weight: 500; }

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 1rem;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-secondary {
  background: var(--card-bg, #ffffff);
  color: var(--text-primary, #111827);
  border: 1px solid var(--border-color, #e5e7eb);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--hover-bg, #f9fafb);
  border-color: #d1d5db;
}

.btn-primary {
  background: var(--primary-color, #15803d);
  color: #fff;
  border: 1px solid transparent;
}

.btn-primary:hover:not(:disabled) { background: #166534; }

/* Dark mode */
html.ion-palette-dark .agent-card,
html[data-theme="dark"] .agent-card {
  background: var(--dark-bg-secondary, #1f2937);
  border-color: var(--dark-border-subtle, #374151);
}

html.ion-palette-dark .agent-summary:hover,
html[data-theme="dark"] .agent-summary:hover {
  background: rgba(255, 255, 255, 0.04);
}

html.ion-palette-dark .agent-slug,
html[data-theme="dark"] .agent-slug {
  background: rgba(255, 255, 255, 0.08);
}

html.ion-palette-dark .edit-panel,
html[data-theme="dark"] .edit-panel {
  background: var(--dark-bg-primary, #111827);
  border-color: var(--dark-border-subtle, #374151);
}

html.ion-palette-dark .field-input,
html[data-theme="dark"] .field-input {
  background: var(--dark-bg-secondary, #1f2937);
  border-color: var(--dark-border-subtle, #374151);
  color: var(--dark-text-primary, #f7fafc);
}

html.ion-palette-dark .btn-secondary,
html[data-theme="dark"] .btn-secondary {
  background: var(--dark-bg-secondary, #1f2937);
  border-color: var(--dark-border-subtle, #374151);
  color: var(--dark-text-primary, #f7fafc);
}

html.ion-palette-dark .sub-tab-btn,
html[data-theme="dark"] .sub-tab-btn {
  border-color: var(--dark-border-subtle, #374151);
  color: var(--dark-text-subtle, #9ca3af);
}
</style>
