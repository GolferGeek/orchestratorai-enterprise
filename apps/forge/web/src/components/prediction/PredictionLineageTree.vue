<template>
  <div class="lineage-tree">
    <h3 class="tree-title">Prediction Lineage</h3>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <span>Loading lineage data...</span>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="error-state">
      <span class="error-icon">!</span>
      <span>{{ error }}</span>
      <button class="retry-btn" @click="loadDeepDive">Retry</button>
    </div>

    <!-- Invalid Data State - deepDive exists but missing prediction -->
    <div v-else-if="deepDive && !deepDive.prediction" class="error-state">
      <span class="error-icon">!</span>
      <span>Invalid response structure - missing prediction data</span>
      <pre class="debug-data">{{ JSON.stringify(deepDive, null, 2) }}</pre>
      <button class="retry-btn" @click="loadDeepDive">Retry</button>
    </div>

    <!-- Tree Content -->
    <div v-else-if="deepDive && deepDive.prediction" class="tree-content">
      <!-- Root: Prediction -->
      <div class="tree-node root">
        <div
          class="node-header clickable"
          :class="deepDive.prediction.direction || 'unknown'"
          @click="showNodeDetails('prediction', deepDive.prediction)"
        >
          <span class="node-icon prediction-icon">P</span>
          <span class="node-title">
            {{ (deepDive.prediction.direction || 'UNKNOWN').toUpperCase() }}
            <span class="confidence">({{ Math.round((deepDive.prediction.confidence || 0) * 100) }}%)</span>
          </span>
          <span class="node-status" :class="deepDive.prediction.status || 'unknown'">
            {{ deepDive.prediction.status || 'unknown' }}
          </span>
          <span class="click-hint">Click for details</span>
        </div>
        <div class="node-details">
          <div v-if="deepDive.prediction.magnitude" class="detail-item">
            <span class="detail-label">Magnitude:</span>
            <span class="detail-value">{{ deepDive.prediction.magnitude }}</span>
          </div>
          <div v-if="deepDive.prediction.timeframeHours" class="detail-item">
            <span class="detail-label">Timeframe:</span>
            <span class="detail-value">{{ deepDive.prediction.timeframeHours }}h</span>
          </div>
          <div v-if="deepDive.prediction.reasoning" class="detail-item reasoning">
            <span class="detail-label">Reasoning:</span>
            <span class="detail-value">{{ truncate(deepDive.prediction.reasoning, 150) }}</span>
          </div>
        </div>

        <!-- Stats Summary -->
        <div class="stats-summary">
          <span class="stat">{{ deepDive.stats.predictorCount }} predictors</span>
          <span class="stat">{{ deepDive.stats.signalCount }} signals</span>
          <span class="stat">{{ deepDive.stats.analystCount }} analysts</span>
        </div>

        <!-- Child: Predictors -->
        <div class="tree-children">
          <div
            v-for="predictor in deepDive.lineage.predictors"
            :key="predictor.id"
            class="tree-node predictor"
          >
            <div
              class="node-header clickable"
              :class="predictor.direction"
              @click="showNodeDetails('predictor', predictor)"
            >
              <span class="node-icon predictor-icon">Pr</span>
              <span class="node-title">
                Predictor
                <span class="direction-badge" :class="predictor.direction">
                  {{ predictor.direction.toUpperCase() }}
                </span>
              </span>
              <span class="strength-badge">
                Strength: {{ predictor.strength }}/10
              </span>
            </div>
            <div class="node-details">
              <div v-if="predictor.analystSlug" class="detail-item">
                <span class="detail-label">Analyst:</span>
                <span class="detail-value">{{ predictor.analystSlug }}</span>
              </div>
              <div v-if="predictor.reasoning" class="detail-item reasoning">
                <span class="detail-label">Reasoning:</span>
                <span class="detail-value">{{ truncate(predictor.reasoning, 100) }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Confidence:</span>
                <span class="detail-value">{{ Math.round(predictor.confidence * 100) }}%</span>
              </div>
            </div>

            <!-- Child: Signal -->
            <div v-if="predictor.signal" class="tree-children">
              <div class="tree-node signal">
                <div
                  class="node-header clickable"
                  :class="predictor.signal.direction"
                  @click="showNodeDetails('signal', predictor.signal)"
                >
                  <span class="node-icon signal-icon">S</span>
                  <span class="node-title">
                    Signal
                    <span class="direction-badge" :class="predictor.signal.direction">
                      {{ predictor.signal.direction.toUpperCase() }}
                    </span>
                  </span>
                  <span v-if="predictor.signal.urgency" class="urgency-badge" :class="predictor.signal.urgency">
                    {{ predictor.signal.urgency }}
                  </span>
                </div>
                <div class="node-details">
                  <div class="detail-item">
                    <span class="detail-label">Content:</span>
                    <span class="detail-value signal-content">{{ truncate(predictor.signal.content, 120) }}</span>
                  </div>
                  <div class="detail-item">
                    <span class="detail-label">Detected:</span>
                    <span class="detail-value">{{ formatDate(predictor.signal.detectedAt) }}</span>
                  </div>
                  <div v-if="predictor.signal.url" class="detail-item">
                    <span class="detail-label">Source:</span>
                    <a :href="predictor.signal.url" target="_blank" class="source-link" @click.stop>
                      {{ truncate(predictor.signal.url, 50) }}
                    </a>
                  </div>
                </div>

                <!-- Fingerprint (if exists) -->
                <div v-if="predictor.fingerprint" class="tree-children">
                  <div class="tree-node fingerprint">
                    <div
                      class="node-header clickable"
                      @click="showNodeDetails('fingerprint', predictor.fingerprint)"
                    >
                      <span class="node-icon fingerprint-icon">F</span>
                      <span class="node-title">Fingerprint</span>
                    </div>
                    <div class="node-details">
                      <div v-if="predictor.fingerprint.titleNormalized" class="detail-item">
                        <span class="detail-label">Title:</span>
                        <span class="detail-value">{{ truncate(predictor.fingerprint.titleNormalized, 60) }}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Source Article (if exists) -->
                <div v-if="predictor.sourceArticle" class="tree-children">
                  <div class="tree-node article">
                    <div
                      class="node-header clickable"
                      @click="showNodeDetails('article', predictor.sourceArticle)"
                    >
                      <span class="node-icon article-icon">A</span>
                      <span class="node-title">Source Article</span>
                      <a
                        v-if="predictor.sourceArticle.url"
                        :href="predictor.sourceArticle.url"
                        target="_blank"
                        class="external-link"
                        @click.stop
                      >
                        Open
                      </a>
                    </div>
                    <div class="node-details">
                      <div v-if="predictor.sourceArticle.title" class="detail-item">
                        <span class="detail-label">Title:</span>
                        <span class="detail-value">{{ truncate(predictor.sourceArticle.title, 80) }}</span>
                      </div>
                      <div v-if="predictor.sourceArticle.firstSeenAt" class="detail-item">
                        <span class="detail-label">First Seen:</span>
                        <span class="detail-value">{{ formatDate(predictor.sourceArticle.firstSeenAt) }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- No Signal (test data) -->
            <div v-else class="tree-children">
              <div class="tree-node no-data">
                <div class="node-header">
                  <span class="node-icon empty-icon">-</span>
                  <span class="node-title muted">No linked signal</span>
                  <span class="test-badge">Test Data</span>
                </div>
              </div>
            </div>
          </div>

          <!-- No Predictors -->
          <div v-if="deepDive.lineage.predictors.length === 0" class="tree-node no-data">
            <div class="node-header">
              <span class="node-icon empty-icon">!</span>
              <span class="node-title muted">No predictors found</span>
            </div>
          </div>
        </div>

        <!-- Threshold Evaluation -->
        <div v-if="deepDive.lineage.thresholdEvaluation" class="tree-node threshold">
          <div
            class="node-header clickable"
            :class="deepDive.lineage.thresholdEvaluation.passed ? 'passed' : 'failed'"
            @click="showNodeDetails('threshold', deepDive.lineage.thresholdEvaluation)"
          >
            <span class="node-icon threshold-icon">T</span>
            <span class="node-title">Threshold Evaluation</span>
            <span class="result-badge" :class="deepDive.lineage.thresholdEvaluation.passed ? 'passed' : 'failed'">
              {{ deepDive.lineage.thresholdEvaluation.passed ? 'PASSED' : 'FAILED' }}
            </span>
          </div>
          <div class="node-details threshold-details">
            <div class="threshold-row">
              <span class="threshold-label">Predictors:</span>
              <span class="threshold-value">
                {{ deepDive.lineage.thresholdEvaluation.actual_predictors ?? 0 }} /
                {{ deepDive.lineage.thresholdEvaluation.min_predictors ?? 0 }} min
              </span>
            </div>
            <div class="threshold-row">
              <span class="threshold-label">Strength:</span>
              <span class="threshold-value">
                {{ (deepDive.lineage.thresholdEvaluation.actual_combined_strength ?? 0).toFixed(1) }} /
                {{ deepDive.lineage.thresholdEvaluation.min_combined_strength ?? 0 }} min
              </span>
            </div>
            <div class="threshold-row">
              <span class="threshold-label">Consensus:</span>
              <span class="threshold-value">
                {{ Math.round((deepDive.lineage.thresholdEvaluation.actual_consensus ?? 0) * 100) }}% /
                {{ Math.round((deepDive.lineage.thresholdEvaluation.min_consensus ?? 0) * 100) }}% min
              </span>
            </div>
          </div>
        </div>

        <!-- LLM Ensemble -->
        <div v-if="deepDive.lineage.llmEnsemble?.tier_results" class="tree-node ensemble">
          <div
            class="node-header clickable"
            @click="showNodeDetails('ensemble', deepDive.lineage.llmEnsemble)"
          >
            <span class="node-icon ensemble-icon">E</span>
            <span class="node-title">LLM Ensemble</span>
            <span v-if="deepDive.lineage.llmEnsemble.agreement_level" class="agreement-badge">
              {{ Math.round(deepDive.lineage.llmEnsemble.agreement_level * 100) }}% agreement
            </span>
          </div>
          <div class="node-details">
            <div
              v-for="(result, tier) in deepDive.lineage.llmEnsemble.tier_results"
              :key="tier"
              class="tier-result"
            >
              <span class="tier-name">{{ tier }}:</span>
              <span class="tier-direction" :class="result.direction">
                {{ result.direction.toUpperCase() }}
              </span>
              <span class="tier-confidence">{{ Math.round(result.confidence * 100) }}%</span>
              <span class="tier-model">{{ result.provider }}/{{ result.model }}</span>
            </div>
          </div>
        </div>

        <!-- Analyst Assessments -->
        <div v-if="deepDive.lineage.analystAssessments?.length > 0" class="tree-node analysts">
          <div class="node-header">
            <span class="node-icon analyst-icon">An</span>
            <span class="node-title">Analyst Assessments ({{ deepDive.lineage.analystAssessments.length }})</span>
          </div>
          <div class="tree-children">
            <div
              v-for="assessment in deepDive.lineage.analystAssessments"
              :key="assessment.analystSlug"
              class="tree-node assessment"
            >
              <div
                class="node-header clickable"
                :class="assessment.direction"
                @click="showNodeDetails('assessment', assessment)"
              >
                <span class="node-icon">{{ assessment.tier.charAt(0).toUpperCase() }}</span>
                <span class="node-title">{{ assessment.analystSlug }}</span>
                <span class="direction-badge" :class="assessment.direction">
                  {{ assessment.direction.toUpperCase() }}
                </span>
                <span class="confidence-small">{{ Math.round(assessment.confidence * 100) }}%</span>
              </div>
              <div v-if="assessment.reasoning" class="node-details">
                <div class="detail-item reasoning">
                  <span class="detail-value">{{ truncate(assessment.reasoning, 100) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- No Data -->
    <div v-else class="empty-state">
      <span>No lineage data available</span>
    </div>

    <!-- Detail Modal -->
    <Teleport to="body">
      <div v-if="modalVisible" class="modal-overlay" @click="closeModal">
        <div class="modal-content" @click.stop>
          <div class="modal-header">
            <h3>{{ modalTitle }}</h3>
            <button class="close-btn" @click="closeModal">&times;</button>
          </div>
          <div class="modal-body">
            <!-- Prediction Details -->
            <template v-if="modalPrediction">
              <div class="modal-field">
                <span class="field-label">ID:</span>
                <span class="field-value mono">{{ modalPrediction.id }}</span>
              </div>
              <div class="modal-field">
                <span class="field-label">Direction:</span>
                <span class="field-value direction-badge" :class="modalPrediction.direction">
                  {{ modalPrediction.direction.toUpperCase() }}
                </span>
              </div>
              <div class="modal-field">
                <span class="field-label">Confidence:</span>
                <span class="field-value">{{ Math.round(modalPrediction.confidence * 100) }}%</span>
              </div>
              <div v-if="modalPrediction.magnitude" class="modal-field">
                <span class="field-label">Magnitude:</span>
                <span class="field-value">{{ modalPrediction.magnitude }}</span>
              </div>
              <div v-if="modalPrediction.timeframeHours" class="modal-field">
                <span class="field-label">Timeframe:</span>
                <span class="field-value">{{ modalPrediction.timeframeHours }} hours</span>
              </div>
              <div class="modal-field">
                <span class="field-label">Status:</span>
                <span class="field-value status-badge" :class="modalPrediction.status">{{ modalPrediction.status }}</span>
              </div>
              <div v-if="modalPrediction.predictedAt" class="modal-field">
                <span class="field-label">Predicted At:</span>
                <span class="field-value">{{ formatDate(modalPrediction.predictedAt) }}</span>
              </div>
              <div v-if="modalPrediction.expiresAt" class="modal-field">
                <span class="field-label">Expires At:</span>
                <span class="field-value">{{ formatDate(modalPrediction.expiresAt) }}</span>
              </div>
              <div v-if="modalPrediction.outcomeValue !== undefined && modalPrediction.outcomeValue !== null" class="modal-field">
                <span class="field-label">Outcome:</span>
                <span class="field-value">{{ modalPrediction.outcomeValue }}</span>
              </div>
              <div v-if="modalPrediction.reasoning" class="modal-field full-width">
                <span class="field-label">Reasoning:</span>
                <p class="field-value text-block">{{ modalPrediction.reasoning }}</p>
              </div>
              <div v-if="modalPrediction.resolutionNotes" class="modal-field full-width">
                <span class="field-label">Resolution Notes:</span>
                <p class="field-value text-block">{{ modalPrediction.resolutionNotes }}</p>
              </div>
            </template>

            <!-- Predictor Details -->
            <template v-else-if="modalPredictor">
              <div class="modal-field">
                <span class="field-label">ID:</span>
                <span class="field-value mono">{{ modalPredictor.id }}</span>
              </div>
              <div class="modal-field">
                <span class="field-label">Direction:</span>
                <span class="field-value direction-badge" :class="modalPredictor.direction">
                  {{ modalPredictor.direction.toUpperCase() }}
                </span>
              </div>
              <div class="modal-field">
                <span class="field-label">Strength:</span>
                <span class="field-value">{{ modalPredictor.strength }}/10</span>
              </div>
              <div class="modal-field">
                <span class="field-label">Confidence:</span>
                <span class="field-value">{{ Math.round(modalPredictor.confidence * 100) }}%</span>
              </div>
              <div v-if="modalPredictor.analystSlug" class="modal-field">
                <span class="field-label">Analyst:</span>
                <span class="field-value">{{ modalPredictor.analystSlug }}</span>
              </div>
              <div v-if="modalPredictor.createdAt" class="modal-field">
                <span class="field-label">Created:</span>
                <span class="field-value">{{ formatDate(modalPredictor.createdAt) }}</span>
              </div>
              <div v-if="modalPredictor.reasoning" class="modal-field full-width">
                <span class="field-label">Reasoning:</span>
                <p class="field-value text-block">{{ modalPredictor.reasoning }}</p>
              </div>
            </template>

            <!-- Signal Details -->
            <template v-else-if="modalSignal">
              <div class="modal-field">
                <span class="field-label">ID:</span>
                <span class="field-value mono">{{ modalSignal.id }}</span>
              </div>
              <div class="modal-field">
                <span class="field-label">Direction:</span>
                <span class="field-value direction-badge" :class="modalSignal.direction">
                  {{ modalSignal.direction.toUpperCase() }}
                </span>
              </div>
              <div v-if="modalSignal.urgency" class="modal-field">
                <span class="field-label">Urgency:</span>
                <span class="field-value urgency-badge" :class="modalSignal.urgency">{{ modalSignal.urgency }}</span>
              </div>
              <div v-if="modalSignal.sourceId" class="modal-field">
                <span class="field-label">Source ID:</span>
                <span class="field-value mono">{{ modalSignal.sourceId }}</span>
              </div>
              <div v-if="modalSignal.detectedAt" class="modal-field">
                <span class="field-label">Detected:</span>
                <span class="field-value">{{ formatDate(modalSignal.detectedAt) }}</span>
              </div>
              <div v-if="modalSignal.url" class="modal-field full-width">
                <span class="field-label">URL:</span>
                <a :href="modalSignal.url" target="_blank" class="field-value link">{{ modalSignal.url }}</a>
              </div>
              <div v-if="modalSignal.content" class="modal-field full-width">
                <span class="field-label">Content:</span>
                <p class="field-value text-block">{{ modalSignal.content }}</p>
              </div>
            </template>

            <!-- Fingerprint Details -->
            <template v-else-if="modalFingerprint">
              <div v-if="modalFingerprint.fingerprintHash" class="modal-field">
                <span class="field-label">Hash:</span>
                <span class="field-value mono">{{ modalFingerprint.fingerprintHash }}</span>
              </div>
              <div v-if="modalFingerprint.titleNormalized" class="modal-field full-width">
                <span class="field-label">Normalized Title:</span>
                <p class="field-value text-block">{{ modalFingerprint.titleNormalized }}</p>
              </div>
              <div v-if="modalFingerprint.keyPhrases?.length" class="modal-field full-width">
                <span class="field-label">Key Phrases:</span>
                <div class="tags-container">
                  <span v-for="phrase in modalFingerprint.keyPhrases" :key="phrase" class="tag">{{ phrase }}</span>
                </div>
              </div>
            </template>

            <!-- Article Details -->
            <template v-else-if="modalArticle">
              <div v-if="modalArticle.contentHash" class="modal-field">
                <span class="field-label">Content Hash:</span>
                <span class="field-value mono">{{ modalArticle.contentHash }}</span>
              </div>
              <div v-if="modalArticle.title" class="modal-field full-width">
                <span class="field-label">Title:</span>
                <p class="field-value">{{ modalArticle.title }}</p>
              </div>
              <div v-if="modalArticle.url" class="modal-field full-width">
                <span class="field-label">URL:</span>
                <a :href="modalArticle.url" target="_blank" class="field-value link">{{ modalArticle.url }}</a>
              </div>
              <div v-if="modalArticle.firstSeenAt" class="modal-field">
                <span class="field-label">First Seen:</span>
                <span class="field-value">{{ formatDate(modalArticle.firstSeenAt) }}</span>
              </div>
            </template>

            <!-- Threshold Details -->
            <template v-else-if="modalThreshold">
              <div class="modal-field">
                <span class="field-label">Passed:</span>
                <span class="field-value result-badge" :class="modalThreshold.passed ? 'passed' : 'failed'">
                  {{ modalThreshold.passed ? 'YES' : 'NO' }}
                </span>
              </div>
              <div class="threshold-grid">
                <div class="threshold-section">
                  <h4>Predictors</h4>
                  <div class="threshold-compare">
                    <span class="actual">{{ modalThreshold.actual_predictors ?? 0 }}</span>
                    <span class="separator">/</span>
                    <span class="required">{{ modalThreshold.min_predictors ?? 0 }} required</span>
                  </div>
                </div>
                <div class="threshold-section">
                  <h4>Combined Strength</h4>
                  <div class="threshold-compare">
                    <span class="actual">{{ (modalThreshold.actual_combined_strength ?? 0).toFixed(2) }}</span>
                    <span class="separator">/</span>
                    <span class="required">{{ modalThreshold.min_combined_strength ?? 0 }} required</span>
                  </div>
                </div>
                <div class="threshold-section">
                  <h4>Consensus</h4>
                  <div class="threshold-compare">
                    <span class="actual">{{ Math.round((modalThreshold.actual_consensus ?? 0) * 100) }}%</span>
                    <span class="separator">/</span>
                    <span class="required">{{ Math.round((modalThreshold.min_consensus ?? 0) * 100) }}% required</span>
                  </div>
                </div>
              </div>
            </template>

            <!-- Ensemble Details -->
            <template v-else-if="modalEnsemble">
              <div v-if="modalEnsemble.agreement_level !== undefined" class="modal-field">
                <span class="field-label">Agreement Level:</span>
                <span class="field-value">{{ Math.round(modalEnsemble.agreement_level * 100) }}%</span>
              </div>
              <div v-if="modalEnsemble.tiers_used?.length" class="modal-field">
                <span class="field-label">Tiers Used:</span>
                <span class="field-value">{{ modalEnsemble.tiers_used.join(', ') }}</span>
              </div>
              <div v-if="modalEnsemble.tier_results" class="tier-results-detail">
                <h4>Tier Results</h4>
                <div v-for="(result, tier) in modalEnsemble.tier_results" :key="tier" class="tier-detail">
                  <div class="tier-detail-header">
                    <span class="tier-name-large">{{ tier }}</span>
                    <span class="direction-badge" :class="result.direction">{{ result.direction.toUpperCase() }}</span>
                    <span class="confidence-value">{{ Math.round(result.confidence * 100) }}%</span>
                  </div>
                  <div class="tier-detail-model">
                    {{ result.provider }} / {{ result.model }}
                  </div>
                </div>
              </div>
            </template>

            <!-- Assessment Details -->
            <template v-else-if="modalAssessment">
              <div class="modal-field">
                <span class="field-label">Analyst:</span>
                <span class="field-value">{{ modalAssessment.analystSlug }}</span>
              </div>
              <div class="modal-field">
                <span class="field-label">Tier:</span>
                <span class="field-value">{{ modalAssessment.tier }}</span>
              </div>
              <div class="modal-field">
                <span class="field-label">Direction:</span>
                <span class="field-value direction-badge" :class="modalAssessment.direction">
                  {{ modalAssessment.direction.toUpperCase() }}
                </span>
              </div>
              <div class="modal-field">
                <span class="field-label">Confidence:</span>
                <span class="field-value">{{ Math.round(modalAssessment.confidence * 100) }}%</span>
              </div>
              <div v-if="modalAssessment.reasoning" class="modal-field full-width">
                <span class="field-label">Reasoning:</span>
                <p class="field-value text-block">{{ modalAssessment.reasoning }}</p>
              </div>
              <div v-if="modalAssessment.keyFactors?.length" class="modal-field full-width">
                <span class="field-label">Key Factors:</span>
                <ul class="factor-list">
                  <li v-for="factor in modalAssessment.keyFactors" :key="factor">{{ factor }}</li>
                </ul>
              </div>
              <div v-if="modalAssessment.risks?.length" class="modal-field full-width">
                <span class="field-label">Risks:</span>
                <ul class="risk-list">
                  <li v-for="risk in modalAssessment.risks" :key="risk">{{ risk }}</li>
                </ul>
              </div>
              <div v-if="modalAssessment.learningsApplied?.length" class="modal-field full-width">
                <span class="field-label">Learnings Applied:</span>
                <div class="tags-container">
                  <span v-for="learning in modalAssessment.learningsApplied" :key="learning" class="tag">
                    {{ learning }}
                  </span>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import { predictionDashboardService, type PredictionDeepDive } from '@/services/predictionDashboardService';

interface Props {
  predictionId: string;
}

const props = defineProps<Props>();

const isLoading = ref(false);
const error = ref<string | null>(null);
const deepDive = ref<PredictionDeepDive | null>(null);

// Modal state types
type ModalData =
  | PredictionDeepDive['prediction']
  | PredictionDeepDive['lineage']['predictors'][0]
  | NonNullable<PredictionDeepDive['lineage']['predictors'][0]['signal']>
  | NonNullable<PredictionDeepDive['lineage']['predictors'][0]['fingerprint']>
  | NonNullable<PredictionDeepDive['lineage']['predictors'][0]['sourceArticle']>
  | NonNullable<PredictionDeepDive['lineage']['thresholdEvaluation']>
  | NonNullable<PredictionDeepDive['lineage']['llmEnsemble']>
  | PredictionDeepDive['lineage']['analystAssessments'][0];

const modalVisible = ref(false);
const modalType = ref<string>('');
const modalData = ref<ModalData | null>(null);

const modalTitle = computed(() => {
  const titles: Record<string, string> = {
    prediction: 'Prediction Details',
    predictor: 'Predictor Details',
    signal: 'Signal Details',
    fingerprint: 'Fingerprint Details',
    article: 'Source Article Details',
    threshold: 'Threshold Evaluation Details',
    ensemble: 'LLM Ensemble Details',
    assessment: 'Analyst Assessment Details',
  };
  return titles[modalType.value] || 'Details';
});

// Type-safe modal data accessors
const modalPrediction = computed(() => {
  if (modalType.value === 'prediction' && modalData.value) {
    return modalData.value as PredictionDeepDive['prediction'];
  }
  return null;
});

const modalPredictor = computed(() => {
  if (modalType.value === 'predictor' && modalData.value) {
    return modalData.value as PredictionDeepDive['lineage']['predictors'][0];
  }
  return null;
});

const modalSignal = computed(() => {
  if (modalType.value === 'signal' && modalData.value) {
    return modalData.value as NonNullable<PredictionDeepDive['lineage']['predictors'][0]['signal']>;
  }
  return null;
});

const modalFingerprint = computed(() => {
  if (modalType.value === 'fingerprint' && modalData.value) {
    return modalData.value as NonNullable<PredictionDeepDive['lineage']['predictors'][0]['fingerprint']>;
  }
  return null;
});

const modalArticle = computed(() => {
  if (modalType.value === 'article' && modalData.value) {
    return modalData.value as NonNullable<PredictionDeepDive['lineage']['predictors'][0]['sourceArticle']>;
  }
  return null;
});

const modalThreshold = computed(() => {
  if (modalType.value === 'threshold' && modalData.value) {
    return modalData.value as NonNullable<PredictionDeepDive['lineage']['thresholdEvaluation']>;
  }
  return null;
});

const modalEnsemble = computed(() => {
  if (modalType.value === 'ensemble' && modalData.value) {
    return modalData.value as NonNullable<PredictionDeepDive['lineage']['llmEnsemble']>;
  }
  return null;
});

const modalAssessment = computed(() => {
  if (modalType.value === 'assessment' && modalData.value) {
    return modalData.value as PredictionDeepDive['lineage']['analystAssessments'][0];
  }
  return null;
});

const loadDeepDive = async () => {
  if (!props.predictionId) return;

  isLoading.value = true;
  error.value = null;

  try {
    const response = await predictionDashboardService.getPredictionDeepDive({
      id: props.predictionId
    });

    // DEBUG: Log the full response to see what we're getting
    console.log('[PredictionLineageTree] Deep dive response:', JSON.stringify(response, null, 2));

    // DashboardResponsePayload has content and metadata fields
    // success/error are part of outer JSON-RPC wrapper, not this payload
    if (response.content) {
      console.log('[PredictionLineageTree] Content received:', {
        prediction: response.content.prediction,
        lineage: response.content.lineage,
        stats: response.content.stats
      });
      deepDive.value = response.content;
    } else {
      console.log('[PredictionLineageTree] No content in response:', response);
      error.value = 'Failed to load lineage data - no content returned';
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unknown error';
  } finally {
    isLoading.value = false;
  }
};

const showNodeDetails = (type: string, data: ModalData) => {
  modalType.value = type;
  modalData.value = data;
  modalVisible.value = true;
};

const closeModal = () => {
  modalVisible.value = false;
  modalType.value = '';
  modalData.value = null;
};

const truncate = (text: string, maxLength: number): string => {
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
};

const formatDate = (dateStr: string): string => {
  if (!dateStr) return 'N/A';
  try {
    return new Date(dateStr).toLocaleString();
  } catch {
    return dateStr;
  }
};

onMounted(() => {
  loadDeepDive();
});

watch(() => props.predictionId, () => {
  loadDeepDive();
});
</script>

<style scoped>
.lineage-tree {
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 1rem;
}

.tree-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 1rem 0;
  color: var(--text-primary, #111827);
}

/* Loading & Error States */
.loading-state,
.error-state,
.empty-state {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  color: var(--text-secondary, #6b7280);
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border-color, #e5e7eb);
  border-top-color: var(--ion-color-secondary, #15803d);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-state {
  color: #dc2626;
}

.error-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: #fef2f2;
  color: #dc2626;
  border-radius: 50%;
  font-weight: bold;
  font-size: 0.75rem;
}

.retry-btn {
  margin-left: auto;
  padding: 0.25rem 0.5rem;
  background: var(--btn-secondary-bg, #f3f4f6);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
}

/* Tree Structure */
.tree-content {
  font-size: 0.875rem;
}

.tree-node {
  position: relative;
  margin-left: 0;
}

.tree-children {
  margin-left: 1.5rem;
  padding-left: 1rem;
  border-left: 2px solid var(--border-color, #e5e7eb);
}

.tree-children .tree-node {
  margin-top: 0.75rem;
}

/* Node Header */
.node-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background: var(--node-bg, #f9fafb);
  border-radius: 6px;
  border-left: 3px solid var(--node-accent, #6b7280);
}

.node-header.clickable {
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
}

.node-header.clickable:hover {
  background: var(--node-hover-bg, #f3f4f6);
  transform: translateX(2px);
}

.click-hint {
  font-size: 0.625rem;
  color: var(--text-secondary, #6b7280);
  margin-left: auto;
  opacity: 0;
  transition: opacity 0.15s;
}

.node-header.clickable:hover .click-hint {
  opacity: 1;
}

.node-header.up,
.node-header.bullish {
  --node-accent: #22c55e;
  --node-bg: rgba(34, 197, 94, 0.05);
  --node-hover-bg: rgba(34, 197, 94, 0.1);
}

.node-header.down,
.node-header.bearish {
  --node-accent: #ef4444;
  --node-bg: rgba(239, 68, 68, 0.05);
  --node-hover-bg: rgba(239, 68, 68, 0.1);
}

.node-header.flat,
.node-header.neutral {
  --node-accent: #6b7280;
  --node-bg: rgba(107, 114, 128, 0.05);
  --node-hover-bg: rgba(107, 114, 128, 0.1);
}

.node-header.passed {
  --node-accent: #22c55e;
}

.node-header.failed {
  --node-accent: #ef4444;
}

/* Node Icons */
.node-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  font-size: 0.625rem;
  font-weight: 700;
  color: white;
  flex-shrink: 0;
}

.prediction-icon { background: #15803d; }
.predictor-icon { background: #8b5cf6; }
.signal-icon { background: #f59e0b; }
.fingerprint-icon { background: #6366f1; }
.article-icon { background: #10b981; }
.threshold-icon { background: #6b7280; }
.ensemble-icon { background: #ec4899; }
.analyst-icon { background: #14b8a6; }
.empty-icon { background: #d1d5db; }

.node-title {
  font-weight: 500;
  color: var(--text-primary, #111827);
  flex: 1;
}

.node-title.muted {
  color: var(--text-secondary, #6b7280);
  font-style: italic;
}

/* External Link */
.external-link {
  font-size: 0.625rem;
  padding: 0.125rem 0.375rem;
  background: rgba(21, 128, 61, 0.1);
  color: #15803d;
  border-radius: 3px;
  text-decoration: none;
}

.external-link:hover {
  background: rgba(21, 128, 61, 0.2);
}

/* Source Link in Signal */
.source-link {
  color: #15803d;
  text-decoration: none;
  font-size: 0.75rem;
  word-break: break-all;
}

.source-link:hover {
  text-decoration: underline;
  color: #166534;
}

/* Badges */
.direction-badge,
.result-badge,
.test-badge,
.urgency-badge,
.status-badge {
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
}

.direction-badge.up,
.direction-badge.bullish {
  background: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

.direction-badge.down,
.direction-badge.bearish {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.direction-badge.flat,
.direction-badge.neutral {
  background: rgba(107, 114, 128, 0.1);
  color: #6b7280;
}

.result-badge.passed,
.status-badge.active {
  background: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

.result-badge.failed {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.status-badge.resolved {
  background: rgba(99, 102, 241, 0.1);
  color: #4f46e5;
}

.status-badge.expired {
  background: rgba(107, 114, 128, 0.1);
  color: #6b7280;
}

.test-badge {
  background: rgba(245, 158, 11, 0.1);
  color: #d97706;
}

.urgency-badge.high {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.urgency-badge.medium {
  background: rgba(245, 158, 11, 0.1);
  color: #d97706;
}

.urgency-badge.low {
  background: rgba(107, 114, 128, 0.1);
  color: #6b7280;
}

.strength-badge,
.confidence,
.confidence-small {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

.agreement-badge {
  font-size: 0.625rem;
  padding: 0.125rem 0.375rem;
  background: rgba(99, 102, 241, 0.1);
  color: #4f46e5;
  border-radius: 3px;
}

.node-status {
  font-size: 0.625rem;
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
  text-transform: uppercase;
  font-weight: 600;
}

.node-status.active {
  background: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

.node-status.resolved {
  background: rgba(99, 102, 241, 0.1);
  color: #4f46e5;
}

.node-status.expired {
  background: rgba(107, 114, 128, 0.1);
  color: #6b7280;
}

/* Node Details */
.node-details {
  padding: 0.5rem 0.5rem 0.5rem 2rem;
}

.detail-item {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
  font-size: 0.75rem;
}

.detail-item.reasoning {
  flex-direction: column;
}

.detail-label {
  color: var(--text-secondary, #6b7280);
  flex-shrink: 0;
  min-width: 80px;
}

.detail-value {
  color: var(--text-primary, #111827);
}

.detail-value.signal-content {
  font-style: italic;
  line-height: 1.4;
}

.detail-value.link {
  color: #15803d;
  text-decoration: none;
}

.detail-value.link:hover {
  text-decoration: underline;
}

.detail-value.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.tag {
  padding: 0.125rem 0.375rem;
  background: var(--tag-bg, #f3f4f6);
  border-radius: 3px;
  font-size: 0.625rem;
}

/* Stats Summary */
.stats-summary {
  display: flex;
  gap: 1rem;
  padding: 0.5rem;
  margin-top: 0.5rem;
  background: var(--stats-bg, #f9fafb);
  border-radius: 4px;
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

.stat {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

/* Threshold Details */
.threshold-details {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
}

.threshold-row {
  display: flex;
  flex-direction: column;
  font-size: 0.75rem;
}

.threshold-label {
  color: var(--text-secondary, #6b7280);
}

.threshold-value {
  font-weight: 500;
  color: var(--text-primary, #111827);
}

/* Tier Results */
.tier-result {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0;
  font-size: 0.75rem;
}

.tier-name {
  font-weight: 500;
  min-width: 50px;
  text-transform: capitalize;
}

.tier-direction {
  padding: 0.125rem 0.25rem;
  border-radius: 2px;
  font-size: 0.625rem;
  font-weight: 600;
}

.tier-direction.up { color: #16a34a; }
.tier-direction.down { color: #dc2626; }
.tier-direction.flat { color: #6b7280; }

.tier-confidence {
  color: var(--text-secondary, #6b7280);
}

.tier-model {
  font-size: 0.625rem;
  color: var(--text-secondary, #6b7280);
  margin-left: auto;
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 1rem;
}

.modal-content {
  background: var(--card-bg, #ffffff);
  border-radius: 12px;
  max-width: 600px;
  width: 100%;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.modal-header h3 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.close-btn:hover {
  color: var(--text-primary, #111827);
}

.modal-body {
  padding: 1.5rem;
  overflow-y: auto;
}

.modal-field {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
  align-items: flex-start;
}

.modal-field.full-width {
  flex-direction: column;
  gap: 0.5rem;
}

.field-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-secondary, #6b7280);
  text-transform: uppercase;
  min-width: 100px;
  flex-shrink: 0;
}

.field-value {
  color: var(--text-primary, #111827);
  font-size: 0.875rem;
}

.field-value.mono {
  font-family: monospace;
  font-size: 0.75rem;
  background: var(--code-bg, #f3f4f6);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.field-value.text-block {
  line-height: 1.6;
  white-space: pre-wrap;
  background: var(--code-bg, #f9fafb);
  padding: 0.75rem;
  border-radius: 6px;
  margin: 0;
}

.field-value.link {
  color: #15803d;
  text-decoration: none;
  word-break: break-all;
}

.field-value.link:hover {
  text-decoration: underline;
}

.tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.factor-list,
.risk-list {
  margin: 0;
  padding-left: 1.25rem;
}

.factor-list li,
.risk-list li {
  margin-bottom: 0.25rem;
  color: var(--text-primary, #111827);
}

.threshold-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-top: 1rem;
}

.threshold-section {
  background: var(--section-bg, #f9fafb);
  padding: 1rem;
  border-radius: 8px;
}

.threshold-section h4 {
  margin: 0 0 0.5rem 0;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-secondary, #6b7280);
  text-transform: uppercase;
}

.threshold-compare {
  display: flex;
  align-items: baseline;
  gap: 0.25rem;
}

.threshold-compare .actual {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.threshold-compare .separator {
  color: var(--text-secondary, #6b7280);
}

.threshold-compare .required {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

.tier-results-detail {
  margin-top: 1rem;
}

.tier-results-detail h4 {
  margin: 0 0 0.75rem 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.tier-detail {
  background: var(--section-bg, #f9fafb);
  padding: 0.75rem 1rem;
  border-radius: 6px;
  margin-bottom: 0.5rem;
}

.tier-detail-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.tier-name-large {
  font-weight: 600;
  text-transform: capitalize;
  min-width: 60px;
}

.confidence-value {
  margin-left: auto;
  font-weight: 500;
}

.tier-detail-model {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
  margin-top: 0.25rem;
}

/* Dark Mode */
html.ion-palette-dark .lineage-tree,
html[data-theme="dark"] .lineage-tree {
  --card-bg: #1f2937;
  --border-color: #374151;
  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
  --node-bg: rgba(255, 255, 255, 0.05);
  --node-hover-bg: rgba(255, 255, 255, 0.1);
  --stats-bg: rgba(255, 255, 255, 0.05);
  --tag-bg: #374151;
  --btn-secondary-bg: #374151;
  --code-bg: #374151;
  --section-bg: rgba(255, 255, 255, 0.05);
}
</style>
