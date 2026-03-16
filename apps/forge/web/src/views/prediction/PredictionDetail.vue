<template>
  <ion-page>
    <ion-content ref="contentRef" :fullscreen="true">
      <div class="prediction-detail">
        <!-- Header -->
        <header class="detail-header">
      <button class="back-button" @click="goBack">
        <span class="icon">&larr;</span>
        Back to Dashboard
      </button>
      <div v-if="prediction" class="header-info">
        <h1>
          {{ prediction.targetSymbol }}
          <span class="target-name">{{ prediction.targetName }}</span>
        </h1>
        <div class="header-badges">
          <span class="status-badge" :class="`status-${prediction.status}`">
            {{ prediction.status }}
          </span>
          <LLMComparisonBadge
            v-if="prediction.llmEnsembleResults"
            :llm-ensemble-results="prediction.llmEnsembleResults"
          />
        </div>
      </div>
    </header>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <span>Loading prediction details...</span>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="error-state">
      <span class="error-icon">!</span>
      <span>{{ error }}</span>
      <button class="btn btn-secondary" @click="loadPredictionData">Try Again</button>
    </div>

    <!-- Prediction Not Found -->
    <div v-else-if="!prediction" class="empty-state">
      <span class="empty-icon">&#128269;</span>
      <h3>Prediction Not Found</h3>
      <p>The requested prediction could not be found.</p>
      <button class="btn btn-secondary" @click="goBack">Go Back</button>
    </div>

    <!-- Main Content -->
    <div v-else class="detail-content">
      <!-- Summary Section -->
      <section class="summary-section">
        <div class="direction-card" :class="prediction.direction || 'unknown'">
          <span class="direction-icon">{{ directionIcon }}</span>
          <div class="direction-info">
            <span class="direction-label">{{ (prediction.direction || 'UNKNOWN').toUpperCase() }}</span>
            <span class="confidence">{{ Math.round((prediction.confidence || 0) * 100) }}% confidence</span>
          </div>
        </div>
        <div class="summary-grid">
          <div v-if="prediction.magnitude" class="summary-item">
            <span class="item-label">Magnitude</span>
            <span class="item-value">{{ prediction.magnitude.toString().toUpperCase() }}</span>
          </div>
          <div v-if="prediction.timeframe" class="summary-item">
            <span class="item-label">Timeframe</span>
            <span class="item-value">{{ prediction.timeframe }}</span>
          </div>
          <div v-if="prediction.entryValue" class="summary-item">
            <span class="item-label">Entry Value</span>
            <span class="item-value">${{ prediction.entryValue.toFixed(2) }}</span>
          </div>
          <div v-if="prediction.exitValue" class="summary-item">
            <span class="item-label">Exit Value</span>
            <span class="item-value">${{ prediction.exitValue.toFixed(2) }}</span>
          </div>
          <div class="summary-item">
            <span class="item-label">Generated</span>
            <span class="item-value">{{ formatDate(prediction.generatedAt) }}</span>
          </div>
          <div v-if="prediction.expiresAt" class="summary-item">
            <span class="item-label">Expires</span>
            <span class="item-value">{{ formatDate(prediction.expiresAt) }}</span>
          </div>
        </div>
      </section>

      <!-- Actions Section -->
      <section class="actions-section">
        <h3>Actions</h3>
        <div class="actions-grid">
          <button
            v-if="canTakePosition"
            class="action-card action-card-primary"
            @click="openTakePositionModal"
          >
            <span class="action-icon">&#128176;</span>
            <div class="action-content">
              <span class="action-label">Take Position</span>
              <span class="action-description">Create a position based on this prediction</span>
            </div>
          </button>
          <button class="action-card" @click="createLearningFromPrediction">
            <span class="action-icon">&#128161;</span>
            <div class="action-content">
              <span class="action-label">Create Learning</span>
              <span class="action-description">Create a learning rule based on this prediction</span>
            </div>
          </button>
          <button class="action-card" @click="viewMissedOpportunities">
            <span class="action-icon">&#128269;</span>
            <div class="action-content">
              <span class="action-label">Missed Opportunities</span>
              <span class="action-description">View related unpredicted moves</span>
            </div>
          </button>
          <button class="action-card" @click="viewTargetAnalysts">
            <span class="action-icon">&#128101;</span>
            <div class="action-content">
              <span class="action-label">View Analysts</span>
              <span class="action-description">See analysts for this target</span>
            </div>
          </button>
        </div>
      </section>

      <!-- Full Lineage Tree View -->
      <PredictionLineageTree :prediction-id="predictionId" />

      <!-- Take Position Modal -->
      <TakePositionModal
        :is-open="isTakePositionModalOpen"
        :prediction="predictionForModal"
        @close="closeTakePositionModal"
        @trade-queued="handleTradeQueued"
      />
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
import LLMComparisonBadge from '@/components/prediction/LLMComparisonBadge.vue';
import PredictionLineageTree from '@/components/prediction/PredictionLineageTree.vue';
import TakePositionModal from '@/components/prediction/TakePositionModal.vue';

const route = useRoute();
const router = useRouter();
const store = usePredictionStore();

const isLoading = ref(false);
const error = ref<string | null>(null);

// Take Position Modal state
const isTakePositionModalOpen = ref(false);

// Interface for the modal's prediction format
interface PredictionInfo {
  id: string;
  symbol: string;
  direction: 'bullish' | 'bearish';
  confidence: number;
  magnitudePercent?: number;
  rationale?: string;
}

// Map categorical magnitude to percentage
function magnitudeToPercent(magnitude?: number | string): number | undefined {
  if (!magnitude) return undefined;
  const mag = String(magnitude).toLowerCase();
  switch (mag) {
    case 'small': return 2;
    case 'medium': return 5;
    case 'large': return 10;
    default: return typeof magnitude === 'number' ? magnitude : undefined;
  }
}

// Map prediction to the format expected by TakePositionModal
const predictionForModal = computed((): PredictionInfo | null => {
  const pred = prediction.value;
  if (!pred) return null;

  // Only allow positions for directional predictions
  if (pred.direction !== 'up' && pred.direction !== 'down') return null;

  return {
    id: pred.id,
    symbol: pred.targetSymbol || '',
    direction: pred.direction === 'up' ? 'bullish' : 'bearish',
    confidence: pred.confidence || 0,
    magnitudePercent: magnitudeToPercent(pred.magnitude),
    rationale: pred.rationale || `${pred.direction.toUpperCase()} prediction with ${Math.round((pred.confidence || 0) * 100)}% confidence`,
  };
});

// Can take position if prediction is active and directional
const canTakePosition = computed(() => {
  const pred = prediction.value;
  if (!pred) return false;
  return pred.status === 'active' && (pred.direction === 'up' || pred.direction === 'down');
});

const predictionId = computed(() => route.params.id as string);
const prediction = computed(() => store.selectedPrediction);

const directionIcon = computed(() => {
  switch (prediction.value?.direction) {
    case 'up':
      return '\u2191';
    case 'down':
      return '\u2193';
    default:
      return '\u2194';
  }
});

async function loadPredictionData() {
  if (!predictionId.value) return;

  isLoading.value = true;
  error.value = null;

  try {
    // Check if we already have the prediction in store
    let pred = store.getPredictionById(predictionId.value);

    if (!pred) {
      // Load from API
      const response = await predictionDashboardService.getPrediction({
        id: predictionId.value,
      });
      if (response.content) {
        store.addPrediction(response.content);
        pred = response.content;
      }
    }

    if (pred) {
      store.selectPrediction(pred.id);
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load prediction';
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

function createLearningFromPrediction() {
  if (!prediction.value) return;

  const pred = prediction.value;
  const suggestedContent = buildSuggestedLearningContent();

  router.push({
    name: 'LearningsManagement',
    query: {
      prefill: 'true',
      targetId: pred.targetId,
      scopeLevel: 'target',
      suggestedTitle: `Learning from ${pred.targetSymbol} prediction (${pred.direction})`,
      suggestedContent,
      learningType: 'pattern',
    },
  });
}

function buildSuggestedLearningContent(): string {
  if (!prediction.value) return '';

  const pred = prediction.value;
  const parts: string[] = [];

  parts.push(`Based on prediction for ${pred.targetSymbol} (${pred.targetName}).`);
  parts.push(`Direction: ${pred.direction || 'unknown'}, Confidence: ${Math.round((pred.confidence || 0) * 100)}%`);

  if (pred.magnitude) {
    parts.push(`Magnitude: ${pred.magnitude}`);
  }

  if (pred.timeframe) {
    parts.push(`Timeframe: ${pred.timeframe}`);
  }

  parts.push(`\nGenerated: ${formatDate(pred.generatedAt)}`);

  return parts.join('\n');
}

function viewMissedOpportunities() {
  router.push({ name: 'MissedOpportunities' });
}

function viewTargetAnalysts() {
  router.push({ name: 'AnalystManagement' });
}

function openTakePositionModal() {
  if (canTakePosition.value) {
    isTakePositionModalOpen.value = true;
  }
}

function closeTakePositionModal() {
  isTakePositionModalOpen.value = false;
}

function handleTradeQueued(result: { tradeId: string; symbol: string }) {
  console.log('Trade queued:', result);
  // Modal closes automatically after success
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

// Content ref for scroll control
const contentRef = ref<InstanceType<typeof IonContent> | null>(null);

// Watch for route changes
watch(predictionId, () => {
  loadPredictionData();
});

onMounted(async () => {
  // Scroll to top when page loads
  if (contentRef.value) {
    await contentRef.value.$el.scrollToTop(0);
  }
  loadPredictionData();
});
</script>

<style scoped>
.prediction-detail {
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

.status-badge {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.status-active {
  background-color: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

.status-resolved {
  background-color: rgba(21, 128, 61, 0.1);
  color: #166534;
}

.status-expired {
  background-color: rgba(107, 114, 128, 0.1);
  color: #6b7280;
}

.status-cancelled {
  background-color: rgba(239, 68, 68, 0.1);
  color: #dc2626;
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

.spinner.small {
  width: 20px;
  height: 20px;
  border-width: 2px;
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
 
}

.btn-secondary:hover {

}

/* Content */
.detail-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.summary-section {
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 1.5rem;
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.direction-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-radius: 8px;
  min-width: 180px;
}

.direction-card.up {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(22, 163, 74, 0.1));
  border: 2px solid #22c55e;
}

.direction-card.down {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(220, 38, 38, 0.1));
  border: 2px solid #ef4444;
}

.direction-card.flat {
  background: linear-gradient(135deg, rgba(107, 114, 128, 0.1), rgba(75, 85, 99, 0.1));
  border: 2px solid #6b7280;
}

.direction-icon {
  font-size: 2rem;
}

.direction-card.up .direction-icon {
  color: #16a34a;
}

.direction-card.down .direction-icon {
  color: #dc2626;
}

.direction-card.flat .direction-icon {
  color: #6b7280;
}

.direction-info {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.direction-label {
  font-size: 1.125rem;
  font-weight: 700;
}

.direction-card.up .direction-label {
  color: #16a34a;
}

.direction-card.down .direction-label {
  color: #dc2626;
}

.direction-card.flat .direction-label {
  color: #6b7280;
}

.confidence {
  font-size: 0.875rem;
  color: var(--text-secondary, #6b7280);
}

/* Actions Section */
.actions-section {
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 1rem;
}

.actions-section h3 {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-secondary, #6b7280);
  text-transform: uppercase;
  margin: 0 0 0.75rem 0;
  letter-spacing: 0.05em;
}

.actions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.75rem;
}

.action-card {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem;
  background: var(--action-card-bg, #f9fafb);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
}

.action-card:hover {
  background: var(--action-card-hover, #f3f4f6);
  border-color: var(--ion-color-secondary, #15803d);
  transform: translateY(-1px);
}

.action-card-primary {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(22, 163, 74, 0.15));
  border-color: #22c55e;
}

.action-card-primary:hover {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(22, 163, 74, 0.2));
  border-color: #16a34a;
}

.action-card-primary .action-label {
  color: #16a34a;
}

.action-icon {
  font-size: 1.25rem;
  flex-shrink: 0;
}

.action-content {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.action-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.action-description {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
  line-height: 1.3;
}

.summary-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 1rem;
}

.summary-item {
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
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.loading-snapshot {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  color: var(--text-secondary, #6b7280);
  font-size: 0.875rem;
}

.no-snapshot {
  padding: 1rem;
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  color: var(--text-secondary, #6b7280);
  font-style: italic;
}

.no-snapshot p {
  margin: 0;
}

/* Rejected Signals */
.rejected-signals {
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 1rem;
}

.section-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 1rem 0;
  color: var(--text-primary, #111827);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.count {
  font-weight: 400;
  color: var(--text-secondary, #6b7280);
}

.signals-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.signal-item {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  padding: 0.75rem;
  border-left: 4px solid #ef4444;
}

.signal-header {
  margin-bottom: 0.5rem;
}

.signal-reason {
  font-size: 0.75rem;
  font-weight: 600;
  color: #dc2626;
  text-transform: uppercase;
}

.signal-content {
  font-size: 0.875rem;
  color: var(--text-primary, #111827);
  margin: 0;
  line-height: 1.5;
}

/* Dark mode */
html.ion-palette-dark .prediction-detail,
html[data-theme="dark"] .prediction-detail {
    --text-primary: #f9fafb;
    --text-secondary: #9ca3af;
    --border-color: #374151;
    --card-bg: #1f2937;
    --btn-secondary-bg: #374151;
    --btn-secondary-text: #f9fafb;
    --btn-secondary-hover: #4b5563;
    --action-card-bg: #374151;
    --action-card-hover: #4b5563;
  }
</style>
