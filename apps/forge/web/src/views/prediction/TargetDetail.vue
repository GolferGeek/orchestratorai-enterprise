<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <div class="target-detail">
    <!-- Header -->
    <header class="detail-header">
      <button class="back-button" @click="goBack">
        <span class="icon">&larr;</span>
        Back to Dashboard
      </button>
      <div v-if="target" class="header-info">
        <h1>
          {{ target.symbol }}
          <span class="target-name">{{ target.name }}</span>
        </h1>
        <div class="header-badges">
          <span class="type-badge">{{ target.targetType }}</span>
          <span class="status-badge" :class="target.active ? 'active' : 'inactive'">
            {{ target.active ? 'Active' : 'Inactive' }}
          </span>
        </div>
      </div>
    </header>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <span>Loading target details...</span>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="error-state">
      <span class="error-icon">!</span>
      <span>{{ error }}</span>
      <button class="btn btn-secondary" @click="loadTargetData">Try Again</button>
    </div>

    <!-- Target Not Found -->
    <div v-else-if="!target" class="empty-state">
      <span class="empty-icon">&#128269;</span>
      <h3>Target Not Found</h3>
      <p>The requested target could not be found.</p>
      <button class="btn btn-secondary" @click="goBack">Go Back</button>
    </div>

    <!-- Main Content -->
    <div v-else class="detail-content">
      <!-- Target Info -->
      <section class="info-section">
        <h2>Target Information</h2>
        <div class="info-grid">
          <div class="info-item">
            <span class="item-label">Symbol</span>
            <span class="item-value">{{ target.symbol }}</span>
          </div>
          <div class="info-item">
            <span class="item-label">Name</span>
            <span class="item-value">{{ target.name }}</span>
          </div>
          <div class="info-item">
            <span class="item-label">Type</span>
            <span class="item-value">{{ target.targetType }}</span>
          </div>
          <div class="info-item">
            <span class="item-label">Universe</span>
            <span class="item-value">{{ universe?.name || target.universeId }}</span>
          </div>
          <div class="info-item">
            <span class="item-label">Created</span>
            <span class="item-value">{{ formatDate(target.createdAt) }}</span>
          </div>
          <div class="info-item">
            <span class="item-label">Updated</span>
            <span class="item-value">{{ formatDate(target.updatedAt) }}</span>
          </div>
        </div>

        <!-- Context -->
        <div v-if="target.context" class="context-section">
          <h3>Analysis Context</h3>
          <pre class="context-content">{{ target.context }}</pre>
        </div>

        <!-- LLM Config Override -->
        <div v-if="hasLlmOverride" class="llm-override-section">
          <h3>LLM Configuration Override</h3>
          <pre class="config-content">{{ JSON.stringify(target.llmConfigOverride, null, 2) }}</pre>
        </div>
      </section>

      <!-- Predictions for this Target -->
      <section class="predictions-section">
        <h2>
          Predictions
          <span class="count">({{ targetPredictions.length }})</span>
        </h2>
        <div v-if="targetPredictions.length === 0" class="empty-message">
          No predictions have been generated for this target yet.
        </div>
        <div v-else class="predictions-grid">
          <PredictionCard
            v-for="prediction in targetPredictions"
            :key="prediction.id"
            :prediction="prediction"
            @select="onPredictionSelect"
          />
        </div>
      </section>

      <!-- Note: Signals section removed - predictors are now created directly from articles -->
    </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { IonPage, IonContent } from '@ionic/vue';
import { usePredictionStore } from '@/stores/predictionStore';
import { predictionDashboardService } from '@/services/predictionDashboardService';
import PredictionCard from '@/components/prediction/PredictionCard.vue';

const route = useRoute();
const router = useRouter();
const store = usePredictionStore();

const isLoading = ref(false);
const error = ref<string | null>(null);

// Note: Signals removed - predictors are now created directly from articles via the SignalGeneratorRunner;

const targetId = computed(() => route.params.id as string);
const target = computed(() => store.selectedTarget);
const universe = computed(() =>
  target.value ? store.getUniverseById(target.value.universeId) : null
);
const targetPredictions = computed(() =>
  targetId.value ? store.getPredictionsForTarget(targetId.value) : []
);
const hasLlmOverride = computed(
  () => target.value?.llmConfigOverride && Object.keys(target.value.llmConfigOverride).length > 0
);

async function loadTargetData() {
  if (!targetId.value) return;

  isLoading.value = true;
  error.value = null;

  try {
    // Check if we already have the target in store
    let t = store.getTargetById(targetId.value);

    if (!t) {
      // Load from API
      const response = await predictionDashboardService.getTarget({
        id: targetId.value,
      });
      if (response.content) {
        store.addTarget(response.content);
        t = response.content;
      }
    }

    if (t) {
      store.selectTarget(t.id);

      // Load predictions for this target
      const predictionsRes = await predictionDashboardService.listPredictions(
        { targetId: t.id },
        { pageSize: 20 }
      );
      if (predictionsRes.content) {
        // Add to store
        for (const pred of predictionsRes.content) {
          store.addPrediction(pred);
        }
      }
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load target';
  } finally {
    isLoading.value = false;
  }
}

function goBack() {
  const agentSlug = route.query.agentSlug as string;
  router.push({
    name: 'PredictionDashboard',
    query: agentSlug ? { agentSlug } : undefined,
  });
}

function onPredictionSelect(id: string) {
  router.push({ name: 'PredictionDetail', params: { id } });
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

watch(targetId, () => {
  loadTargetData();
});

onMounted(() => {
  loadTargetData();
});
</script>

<style scoped>
.target-detail {
  padding: 1.5rem;
  max-width: 1200px;
  margin: 0 auto;
}

.detail-header {
  margin-bottom: 1.5rem;
}

.back-button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0;
  background: none;
  border: none;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  font-size: 0.875rem;
  transition: color 0.2s;
}

.back-button:hover {
  color: var(--ion-color-secondary, #15803d);
}

.header-info {
  margin-top: 0.75rem;
}

.header-info h1 {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
  margin: 0;
}

.target-name {
  font-weight: 400;
  color: var(--text-secondary, #6b7280);
  margin-left: 0.5rem;
}

.header-badges {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.type-badge {
  font-size: 0.75rem;
  font-weight: 500;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  background-color: rgba(21, 128, 61, 0.1);
  color: #166534;
}

.status-badge {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.status-badge.active {
  background-color: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

.status-badge.inactive {
  background-color: rgba(107, 114, 128, 0.1);
  color: #6b7280;
}

/* States */
.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  gap: 1rem;
  color: var(--text-secondary, #6b7280);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color, #e5e7eb);
  border-top-color: var(--ion-color-secondary, #15803d);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border-radius: 50%;
  font-weight: bold;
}

.empty-icon {
  font-size: 3rem;
}

.empty-state h3 {
  margin: 0;
  color: var(--text-primary, #111827);
}

.empty-state p {
  margin: 0;
  text-align: center;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-secondary {
  background-color: var(--btn-secondary-bg, #f3f4f6);
  color: var(--btn-secondary-text, #374151);
}

.btn-secondary:hover {
  background-color: var(--btn-secondary-hover, #e5e7eb);
}

/* Content */
.detail-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.info-section,
.predictions-section {
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 1.5rem;
}

.info-section h2,
.predictions-section h2 {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
  margin: 0 0 1rem 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.count {
  font-weight: 400;
  color: var(--text-secondary, #6b7280);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 1rem;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.item-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-secondary, #6b7280);
  text-transform: uppercase;
}

.item-value {
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--text-primary, #111827);
}

.context-section,
.llm-override-section {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border-color, #e5e7eb);
}

.context-section h3,
.llm-override-section h3 {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
  margin: 0 0 0.75rem 0;
}

.context-content,
.config-content {
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 0.8125rem;
  background: var(--code-bg, #f3f4f6);
  border-radius: 6px;
  padding: 0.75rem;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-primary, #111827);
}

.empty-message {
  color: var(--text-secondary, #6b7280);
  font-size: 0.875rem;
  font-style: italic;
}

.predictions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
}

/* Dark mode */
html.ion-palette-dark .target-detail,
html[data-theme="dark"] .target-detail {
    --text-primary: #f9fafb;
    --text-secondary: #9ca3af;
    --border-color: #374151;
    --card-bg: #1f2937;
    --code-bg: #111827;
    --btn-secondary-bg: #374151;
    --btn-secondary-text: #f9fafb;
    --btn-secondary-hover: #4b5563;
  }
</style>
