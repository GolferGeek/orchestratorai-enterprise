<template>
  <ion-modal :is-open="isOpen" @willDismiss="onDismiss" class="analyst-cards-modal">
    <ion-header>
      <ion-toolbar>
        <ion-title>
          <span class="modal-title">
            <span class="target-symbol">{{ targetSymbol }}</span>
            <span class="target-name">{{ targetName }}</span>
          </span>
        </ion-title>
        <ion-buttons slot="end">
          <ion-button @click="onDismiss">
            <ion-icon :icon="closeOutline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="modal-intro">
        <p>Each analyst brings a different perspective. Click any card to see their detailed analysis.</p>
      </div>

      <div class="analyst-cards-grid">
        <div
          v-for="prediction in sortedPredictions"
          :key="prediction.id"
          class="analyst-card"
          :class="[getDirectionClass(prediction.direction), getAnalystClass(prediction.analystSlug)]"
          @click="openForkModal(prediction)"
        >
          <div class="card-header">
            <div class="analyst-info">
              <span class="analyst-name">{{ formatAnalystName(prediction.analystSlug) }}</span>
              <span class="analyst-style">{{ getAnalystStyle(prediction.analystSlug) }}</span>
            </div>
            <div class="direction-badge" :class="getDirectionClass(prediction.direction)">
              {{ getDirectionArrow(prediction.direction) }}
              {{ formatDirection(prediction.direction) }}
            </div>
          </div>

          <div class="card-body">
            <div class="confidence-section">
              <span class="confidence-label">Confidence</span>
              <div class="confidence-bar">
                <div
                  class="confidence-fill"
                  :style="{ width: `${(prediction.confidence || 0) * 100}%` }"
                ></div>
              </div>
              <span class="confidence-value">{{ Math.round((prediction.confidence || 0) * 100) }}%</span>
            </div>

            <div v-if="prediction.magnitude" class="magnitude-section">
              <span class="magnitude-label">Magnitude:</span>
              <span class="magnitude-value">{{ prediction.magnitude }}</span>
            </div>

            <div v-if="prediction.reasoning" class="reasoning-preview">
              {{ truncate(prediction.reasoning, 100) }}
            </div>
          </div>

          <div class="card-footer">
            <span class="view-analysis">{{ prediction.analystSlug === 'arbitrator' ? 'View Arbitration →' : 'View 3-Way Analysis →' }}</span>
          </div>
        </div>
      </div>

      <div class="modal-footer-info">
        <div class="timeframe-info" v-if="timeframe">
          <span class="info-label">Timeframe:</span>
          <span class="info-value">{{ timeframe }}</span>
        </div>
        <div class="date-info" v-if="generatedAt">
          <span class="info-label">Generated:</span>
          <span class="info-value">{{ formatDate(generatedAt) }}</span>
        </div>
      </div>
    </ion-content>

    <!-- Fork Analysis Modal (Level 3) -->
    <AnalystAssessmentsModal
      :is-open="isForkModalOpen"
      :prediction-id="selectedPredictionId"
      @dismiss="closeForkModal"
    />
  </ion-modal>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
} from '@ionic/vue';
import { closeOutline } from 'ionicons/icons';
import type { Prediction } from '@/services/predictionDashboardService';
import AnalystAssessmentsModal from './AnalystAssessmentsModal.vue';

interface Props {
  isOpen: boolean;
  predictions: Prediction[];
}

const props = defineProps<Props>();
const emit = defineEmits<{
  dismiss: [];
}>();

// Fork modal state
const isForkModalOpen = ref(false);
const selectedPredictionId = ref<string | null>(null);

// Get target info from first prediction
const targetSymbol = computed(() => props.predictions[0]?.targetSymbol || 'N/A');
const targetName = computed(() => props.predictions[0]?.targetName || '');
const timeframe = computed(() => props.predictions[0]?.timeframe || '');
const generatedAt = computed(() => props.predictions[0]?.generatedAt || '');

// Check if a prediction represents a flat-only analyst (both user and AI forks are flat)
function isFlatOnlyAnalyst(p: Prediction): boolean {
  const ensemble = (p as unknown as Record<string, unknown>).analystEnsemble as {
    user_fork?: { is_flat?: boolean; direction?: string };
    ai_fork?: { is_flat?: boolean; direction?: string };
    active_forks?: string[];
  } | undefined;
  if (!ensemble) return false;

  // Use active_forks if available (new format)
  if (ensemble.active_forks) {
    return ensemble.active_forks.length === 0;
  }

  // Fallback: check is_flat flags on individual forks
  const userFlat = !ensemble.user_fork || ensemble.user_fork.is_flat === true;
  const aiFlat = !ensemble.ai_fork || ensemble.ai_fork.is_flat === true;
  return userFlat && aiFlat;
}

// Sort predictions by analyst order (excluding flat-only analysts)
const sortedPredictions = computed(() => {
  const order = ['fundamental-fred', 'technical-tina', 'sentiment-sally', 'aggressive-alex', 'cautious-carl', 'arbitrator'];
  return [...props.predictions]
    .filter(p => p.analystSlug)
    .filter(p => !isFlatOnlyAnalyst(p))
    .sort((a, b) => {
      return order.indexOf(a.analystSlug || '') - order.indexOf(b.analystSlug || '');
    });
});

function onDismiss() {
  emit('dismiss');
}

function openForkModal(prediction: Prediction) {
  selectedPredictionId.value = prediction.id;
  isForkModalOpen.value = true;
}

function closeForkModal() {
  isForkModalOpen.value = false;
  selectedPredictionId.value = null;
}

function formatAnalystName(slug: string | null | undefined): string {
  if (!slug) return 'Unknown';
  const nameMap: Record<string, string> = {
    'fundamental-fred': 'Fundamental Fred',
    'technical-tina': 'Technical Tina',
    'sentiment-sally': 'Sentiment Sally',
    'aggressive-alex': 'Aggressive Alex',
    'cautious-carl': 'Cautious Carl',
    'arbitrator': 'Arbitrator',
  };
  return nameMap[slug] || slug;
}

function getAnalystStyle(slug: string | null | undefined): string {
  if (!slug) return '';
  const styleMap: Record<string, string> = {
    'fundamental-fred': 'Value & Fundamentals',
    'technical-tina': 'Charts & Patterns',
    'sentiment-sally': 'Market Sentiment',
    'aggressive-alex': 'High Risk/Reward',
    'cautious-carl': 'Risk Management',
    'arbitrator': 'Consensus & Final Decision',
  };
  return styleMap[slug] || '';
}

function getDirectionClass(direction: string | undefined): string {
  const dir = direction?.toLowerCase();
  if (dir === 'up' || dir === 'bullish') return 'direction-up';
  if (dir === 'down' || dir === 'bearish') return 'direction-down';
  return 'direction-neutral';
}

function getAnalystClass(slug: string | null | undefined): string {
  if (!slug) return '';
  const classMap: Record<string, string> = {
    'fundamental-fred': 'analyst-fred',
    'technical-tina': 'analyst-tina',
    'sentiment-sally': 'analyst-sally',
    'aggressive-alex': 'analyst-alex',
    'cautious-carl': 'analyst-carl',
    'arbitrator': 'analyst-arbitrator',
  };
  return classMap[slug] || '';
}

function getDirectionArrow(direction: string | undefined): string {
  const dir = direction?.toLowerCase();
  if (dir === 'up' || dir === 'bullish') return '↑';
  if (dir === 'down' || dir === 'bearish') return '↓';
  return '→';
}

function formatDirection(direction: string | undefined): string {
  const dir = direction?.toLowerCase();
  if (dir === 'up' || dir === 'bullish') return 'BULLISH';
  if (dir === 'down' || dir === 'bearish') return 'BEARISH';
  return 'NEUTRAL';
}

function truncate(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
</script>

<style scoped>
.analyst-cards-modal {
  --height: 90%;
  --border-radius: 16px;
}

.modal-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.target-symbol {
  font-weight: 700;
  font-size: 1.125rem;
}

.target-name {
  font-size: 0.875rem;
  color: var(--ion-color-medium);
}

.modal-intro {
  text-align: center;
  margin-bottom: 1.5rem;
  padding: 0 1rem;
}

.modal-intro p {
  margin: 0;
  font-size: 0.875rem;
  color: var(--ion-color-medium);
}

.analyst-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
  padding: 0 0.5rem;
}

.analyst-card {
  background: var(--ion-background-color);
  border-radius: 12px;
  padding: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 2px solid var(--ion-color-light-shade);
}

.analyst-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

/* Analyst-specific border colors */
.analyst-card.analyst-fred {
  border-color: rgba(21, 128, 61, 0.4);
}

.analyst-card.analyst-tina {
  border-color: rgba(236, 72, 153, 0.4);
}

.analyst-card.analyst-sally {
  border-color: rgba(34, 197, 94, 0.4);
}

.analyst-card.analyst-alex {
  border-color: rgba(249, 115, 22, 0.4);
}

.analyst-card.analyst-carl {
  border-color: rgba(107, 114, 128, 0.4);
}

.analyst-card.analyst-arbitrator {
  border-color: rgba(139, 92, 246, 0.4);
}

.analyst-card .card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
}

.analyst-info {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.analyst-name {
  font-weight: 700;
  font-size: 1rem;
  color: var(--ion-color-dark);
}

.analyst-style {
  font-size: 0.625rem;
  color: var(--ion-color-medium);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.direction-badge {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.375rem 0.625rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 700;
}

.direction-badge.direction-up {
  background: rgba(34, 197, 94, 0.15);
  color: #16a34a;
}

.direction-badge.direction-down {
  background: rgba(239, 68, 68, 0.15);
  color: #dc2626;
}

.direction-badge.direction-neutral {
  background: rgba(107, 114, 128, 0.15);
  color: #6b7280;
}

.analyst-card .card-body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.confidence-section {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.confidence-label {
  font-size: 0.625rem;
  color: var(--ion-color-medium);
  text-transform: uppercase;
  min-width: 60px;
}

.confidence-bar {
  flex: 1;
  height: 8px;
  background: var(--ion-color-light);
  border-radius: 4px;
  overflow: hidden;
}

.confidence-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--ion-color-secondary, #15803d), var(--ion-color-secondary-shade, #166534));
  border-radius: 4px;
  transition: width 0.3s ease;
}

.confidence-value {
  font-size: 0.875rem;
  font-weight: 700;
  min-width: 40px;
  text-align: right;
}

.magnitude-section {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
}

.magnitude-label {
  color: var(--ion-color-medium);
}

.magnitude-value {
  font-weight: 600;
  text-transform: uppercase;
}

.reasoning-preview {
  font-size: 0.75rem;
  color: var(--ion-color-medium-shade);
  line-height: 1.4;
  padding: 0.5rem;
  background: var(--ion-color-light);
  border-radius: 6px;
}

.analyst-card .card-footer {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--ion-color-light-shade);
  text-align: center;
}

.view-analysis {
  font-size: 0.75rem;
  color: var(--ion-color-primary);
  font-weight: 600;
  opacity: 0.7;
  transition: opacity 0.15s ease;
}

.analyst-card:hover .view-analysis {
  opacity: 1;
}

.modal-footer-info {
  display: flex;
  justify-content: center;
  gap: 2rem;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--ion-color-light-shade);
}

.timeframe-info,
.date-info {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
}

.info-label {
  color: var(--ion-color-medium);
}

.info-value {
  font-weight: 600;
  color: var(--ion-color-dark);
}

/* Dark mode */
html.ion-palette-dark .analyst-card,
html[data-theme="dark"] .analyst-card {
  background: rgba(255, 255, 255, 0.03);
  border-color: rgba(255, 255, 255, 0.1);
}

html.ion-palette-dark .analyst-card:hover,
html[data-theme="dark"] .analyst-card:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

html.ion-palette-dark .reasoning-preview,
html[data-theme="dark"] .reasoning-preview {
  background: rgba(255, 255, 255, 0.05);
}
</style>
