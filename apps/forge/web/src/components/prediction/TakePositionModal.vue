<template>
  <ion-modal :is-open="isOpen" @didDismiss="closeModal">
    <ion-header>
      <ion-toolbar>
        <ion-title>Queue EOD Trade</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="closeModal">Close</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="take-position-form">
        <!-- Prediction Summary -->
        <div v-if="prediction" class="prediction-summary">
          <div class="symbol-header">
            <span class="symbol">{{ prediction.symbol }}</span>
            <span class="direction-badge" :class="prediction.direction">
              {{ prediction.direction.toUpperCase() }}
            </span>
          </div>
          <p class="prediction-rationale">{{ prediction.rationale || 'No rationale provided' }}</p>
          <div class="prediction-meta">
            <span>Confidence: {{ (prediction.confidence * 100).toFixed(0) }}%</span>
            <span>Magnitude: {{ prediction.magnitudePercent?.toFixed(1) || '?' }}%</span>
          </div>
        </div>

        <!-- Position Size Recommendation -->
        <div v-if="sizeRecommendation && sizeRecommendation.currentPrice" class="size-recommendation">
          <h3>Recommended Position</h3>
          <div class="recommendation-grid">
            <div class="rec-item">
              <span class="label">Quantity</span>
              <span class="value">{{ sizeRecommendation.recommendedQuantity ?? 0 }}</span>
            </div>
            <div class="rec-item">
              <span class="label">Entry Price</span>
              <span class="value">${{ sizeRecommendation.currentPrice?.toFixed(2) ?? '-.--' }}</span>
            </div>
            <div class="rec-item">
              <span class="label">Risk Amount</span>
              <span class="value">${{ sizeRecommendation.riskAmount?.toFixed(2) ?? '-.--' }}</span>
            </div>
            <div class="rec-item">
              <span class="label">Risk/Reward</span>
              <span class="value">{{ sizeRecommendation.riskRewardRatio?.toFixed(2) ?? '-' }}</span>
            </div>
          </div>
          <p v-if="sizeRecommendation.reasoning" class="reasoning">{{ sizeRecommendation.reasoning }}</p>
        </div>

        <!-- Size recommendation error/unavailable -->
        <div v-else-if="sizeRecommendation && !sizeRecommendation.currentPrice" class="size-unavailable">
          <p>Position size recommendation unavailable. Enter quantity manually below.</p>
        </div>

        <div v-else-if="loadingSize" class="loading-size">
          <div class="spinner"></div>
          <span>Calculating recommended size...</span>
        </div>

        <!-- Trade Details -->
        <div class="manual-inputs">
          <h3>Trade Details</h3>
          <p class="eod-note">Trade will execute at today's closing price (5 PM ET)</p>

          <div class="input-group">
            <label for="quantity">Quantity</label>
            <input
              id="quantity"
              v-model.number="quantity"
              type="number"
              min="1"
              placeholder="Enter quantity"
            />
          </div>
        </div>

        <!-- Error Message -->
        <div v-if="error" class="error-message">
          {{ error }}
        </div>

        <!-- Success Message -->
        <div v-if="success" class="success-message">
          Trade queued for end-of-day settlement!
        </div>

        <!-- Actions -->
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="closeModal" :disabled="submitting">
            Cancel
          </button>
          <button
            class="btn btn-primary"
            @click="submitPosition"
            :disabled="!canSubmit || submitting"
          >
            {{ submitting ? 'Queuing...' : 'Queue for EOD' }}
          </button>
        </div>
      </div>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
} from '@ionic/vue';
import {
  predictionDashboardService,
  type PositionSizeRecommendation,
} from '@/services/predictionDashboardService';

interface PredictionInfo {
  id: string;
  symbol: string;
  direction: 'bullish' | 'bearish';
  confidence: number;
  magnitudePercent?: number;
  rationale?: string;
}

const props = defineProps<{
  isOpen: boolean;
  prediction: PredictionInfo | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'tradeQueued', result: { tradeId: string; symbol: string }): void;
}>();

// Form state
const quantity = ref<number | null>(null);
const sizeRecommendation = ref<PositionSizeRecommendation | null>(null);
const loadingSize = ref(false);
const submitting = ref(false);
const error = ref<string | null>(null);
const success = ref(false);

// Computed
const canSubmit = computed(() => {
  return quantity.value && quantity.value > 0 && !submitting.value && !success.value;
});

// Watch for prediction changes to load size recommendation
watch(
  () => props.prediction,
  async (newPrediction) => {
    if (newPrediction) {
      await loadSizeRecommendation(newPrediction.id);
    } else {
      resetForm();
    }
  },
  { immediate: true }
);

async function loadSizeRecommendation(predictionId: string) {
  loadingSize.value = true;
  sizeRecommendation.value = null;
  error.value = null;

  try {
    const response = await predictionDashboardService.calculatePositionSize(predictionId);
    if (response.content && response.content.currentPrice != null) {
      sizeRecommendation.value = response.content;
      // Pre-fill recommended quantity
      quantity.value = response.content.recommendedQuantity || 1;
    } else {
      // API returned but without required data - user can still enter manually
      console.warn('Size recommendation missing required data:', response);
    }
  } catch (err) {
    console.error('Failed to load size recommendation:', err);
    // Don't show error to user - they can still enter quantity manually
  } finally {
    loadingSize.value = false;
  }
}

async function submitPosition() {
  if (!props.prediction || !quantity.value) return;

  submitting.value = true;
  error.value = null;
  success.value = false;

  try {
    const response = await predictionDashboardService.queueTrade({
      id: props.prediction.id,
      quantity: quantity.value,
    });

    if (response.content) {
      success.value = true;
      emit('tradeQueued', {
        tradeId: response.content.queueEntry.id,
        symbol: response.content.queueEntry.symbol,
      });

      // Close modal after short delay
      setTimeout(() => {
        closeModal();
      }, 1500);
    } else {
      error.value = 'Failed to queue trade';
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to queue trade';
  } finally {
    submitting.value = false;
  }
}

function closeModal() {
  resetForm();
  emit('close');
}

function resetForm() {
  quantity.value = null;
  sizeRecommendation.value = null;
  error.value = null;
  success.value = false;
}
</script>

<style scoped>
.take-position-form {
  max-width: 500px;
  margin: 0 auto;
}

.prediction-summary {
  background: var(--ion-background-color);
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1.5rem;
}

.symbol-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.symbol {
  font-size: 1.5rem;
  font-weight: 700;
}

.direction-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 600;
}

.direction-badge.bullish { background: #22c55e20; color: #22c55e; }
.direction-badge.bearish { background: #ef444420; color: #ef4444; }

.prediction-rationale {
  color: var(--ion-color-medium);
  font-size: 0.9rem;
  margin: 0.5rem 0;
}

.prediction-meta {
  display: flex;
  gap: 1rem;
  font-size: 0.85rem;
  color: var(--ion-color-medium);
}

/* Size Recommendation */
.size-recommendation {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(22, 163, 74, 0.15));
  border: 1px solid rgba(34, 197, 94, 0.3);
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1.5rem;
}

.size-recommendation h3 {
  margin: 0 0 0.75rem 0;
  font-size: 1rem;
  color: #16a34a;
  font-weight: 600;
}

.recommendation-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}

.rec-item {
  display: flex;
  flex-direction: column;
}

.rec-item .label {
  font-size: 0.75rem;
  color: #6b7280;
  font-weight: 500;
  text-transform: uppercase;
}

.rec-item .value {
  font-size: 1.1rem;
  font-weight: 600;
  color: #111827;
}

.reasoning {
  font-size: 0.85rem;
  color: #374151;
  margin-top: 0.75rem;
  font-style: italic;
  line-height: 1.4;
}

.size-unavailable {
  background: var(--ion-color-warning-tint);
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1.5rem;
}

.size-unavailable p {
  margin: 0;
  color: var(--ion-color-warning-shade);
  font-size: 0.9rem;
}

/* Loading Size */
.loading-size {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  color: var(--ion-color-medium);
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--ion-color-light);
  border-top-color: var(--ion-color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Trade Details */
.manual-inputs h3 {
  margin: 0 0 0.25rem 0;
  font-size: 1rem;
}

.eod-note {
  color: var(--ion-color-medium);
  font-size: 0.85rem;
  margin: 0 0 1rem 0;
}

.input-group {
  margin-bottom: 1rem;
}

.input-group label {
  display: block;
  font-size: 0.85rem;
  font-weight: 500;
  margin-bottom: 0.25rem;
}

.input-group input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--ion-border-color);
  border-radius: 6px;
  font-size: 1rem;
  background: var(--ion-background-color);
}

.input-group input:focus {
  outline: none;
  border-color: var(--ion-color-primary);
}

/* Messages */
.error-message {
  background: #ef444420;
  color: #ef4444;
  padding: 0.75rem;
  border-radius: 6px;
  margin-bottom: 1rem;
}

.success-message {
  background: #22c55e20;
  color: #22c55e;
  padding: 0.75rem;
  border-radius: 6px;
  margin-bottom: 1rem;
}

/* Actions */
.modal-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  padding-top: 1rem;
}

.btn {
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  font-weight: 500;
  cursor: pointer;
  border: none;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--ion-color-primary);
  color: white;
}

.btn-secondary {
  background: var(--ion-color-light);
  color: var(--ion-text-color);
}
</style>
