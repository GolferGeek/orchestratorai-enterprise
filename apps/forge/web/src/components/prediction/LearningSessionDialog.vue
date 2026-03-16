<template>
  <div v-if="isVisible" class="learning-session-overlay" @click.self="handleClose">
    <div class="learning-session-dialog">
      <!-- Header -->
      <div class="dialog-header">
        <div class="header-content">
          <h2>Learning Session</h2>
          <span class="analyst-name">{{ analystName }}</span>
        </div>
        <button class="close-btn" @click="handleClose">&times;</button>
      </div>

      <!-- Loading State -->
      <div v-if="isLoading" class="loading-state">
        <div class="spinner"></div>
        <p>Loading comparison data...</p>
      </div>

      <!-- Main Content -->
      <div v-else class="dialog-content">
        <!-- Comparison Report -->
        <div v-if="comparisonReport" class="comparison-section">
          <h3>Performance Comparison</h3>
          <div class="comparison-cards">
            <!-- User Fork -->
            <div class="fork-card user">
              <div class="fork-header">
                <span class="fork-label">Your Version</span>
                <span
                  v-if="comparisonReport.userFork"
                  class="pnl"
                  :class="{ positive: comparisonReport.userFork.totalPnl >= 0, negative: comparisonReport.userFork.totalPnl < 0 }"
                >
                  {{ formatPnl(comparisonReport.userFork.totalPnl) }}
                </span>
              </div>
              <div v-if="comparisonReport.userFork" class="fork-stats">
                <div class="stat">
                  <span class="label">Win Rate</span>
                  <span class="value">{{ formatPercent(comparisonReport.userFork.winRate) }}</span>
                </div>
                <div class="stat">
                  <span class="label">Trades</span>
                  <span class="value">{{ comparisonReport.userFork.winCount + comparisonReport.userFork.lossCount }}</span>
                </div>
              </div>
              <div v-else class="no-data">No data available</div>
            </div>

            <!-- Agent Fork -->
            <div class="fork-card agent">
              <div class="fork-header">
                <span class="fork-label">Agent's Version</span>
                <span
                  v-if="comparisonReport.agentFork"
                  class="pnl"
                  :class="{ positive: comparisonReport.agentFork.totalPnl >= 0, negative: comparisonReport.agentFork.totalPnl < 0 }"
                >
                  {{ formatPnl(comparisonReport.agentFork.totalPnl) }}
                </span>
              </div>
              <div v-if="comparisonReport.agentFork" class="fork-stats">
                <div class="stat">
                  <span class="label">Win Rate</span>
                  <span class="value">{{ formatPercent(comparisonReport.agentFork.winRate) }}</span>
                </div>
                <div class="stat">
                  <span class="label">Trades</span>
                  <span class="value">{{ comparisonReport.agentFork.winCount + comparisonReport.agentFork.lossCount }}</span>
                </div>
              </div>
              <div v-else class="no-data">No data available</div>
            </div>
          </div>

          <!-- Context Diffs -->
          <div v-if="comparisonReport.contextDiffs && comparisonReport.contextDiffs.length > 0" class="context-diffs">
            <h4>Context Differences</h4>
            <div class="diff-list">
              <div v-for="(diff, index) in comparisonReport.contextDiffs" :key="index" class="diff-item">
                <span class="diff-field">{{ diff.field }}</span>
                <div class="diff-values">
                  <div class="old-value">
                    <span class="label">Your version:</span>
                    <span class="value">{{ diff.userValue || '(empty)' }}</span>
                  </div>
                  <div class="new-value">
                    <span class="label">Agent's version:</span>
                    <span class="value">{{ diff.agentValue || '(empty)' }}</span>
                  </div>
                </div>
                <button class="adopt-btn" @click="adoptChange(diff)">Adopt This Change</button>
              </div>
            </div>
          </div>

          <!-- Divergent Predictions -->
          <div v-if="comparisonReport.divergentPredictions && comparisonReport.divergentPredictions.length > 0" class="divergent-predictions">
            <h4>Divergent Predictions ({{ comparisonReport.divergentPredictions.length }})</h4>
            <p class="subtitle">Cases where your version and the agent's version disagreed</p>
            <div class="prediction-list">
              <div v-for="pred in comparisonReport.divergentPredictions.slice(0, 5)" :key="pred.predictionId" class="prediction-item">
                <span class="symbol">{{ pred.targetSymbol }}</span>
                <div class="directions">
                  <span class="user-dir">You: {{ pred.userDirection }}</span>
                  <span class="agent-dir">Agent: {{ pred.agentDirection }}</span>
                </div>
                <span class="outcome" :class="getWinningFork(pred)">{{ getWinningForkLabel(pred) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Chat Interface -->
        <div class="chat-section">
          <h3>Learning Exchange</h3>
          <p class="section-subtitle">Ask questions to understand differences between versions</p>

          <!-- Exchange History -->
          <div class="exchange-history" ref="exchangeHistory">
            <div v-if="exchanges.length === 0" class="no-exchanges">
              <p>No exchanges yet. Start a conversation by asking a question below.</p>
            </div>
            <div
              v-for="exchange in exchanges"
              :key="exchange.id"
              class="exchange-item"
              :class="exchange.initiatedBy"
            >
              <div class="exchange-header">
                <span class="initiator">{{ exchange.initiatedBy === 'user' ? 'You' : 'Agent' }}</span>
                <span class="timestamp">{{ formatTimestamp(exchange.createdAt) }}</span>
              </div>
              <div class="question">
                <span class="q-label">Q:</span>
                {{ exchange.question }}
              </div>
              <div v-if="exchange.response" class="response">
                <span class="r-label">A:</span>
                {{ exchange.response }}
              </div>
              <div v-else class="pending-response">
                <span class="waiting">Awaiting response...</span>
              </div>
              <div v-if="exchange.outcome === 'pending'" class="exchange-actions">
                <button class="action-btn adopt" @click="setExchangeOutcome(exchange.id, 'adopted')">
                  Adopt Suggestion
                </button>
                <button class="action-btn note" @click="setExchangeOutcome(exchange.id, 'noted')">
                  Note for Later
                </button>
                <button class="action-btn reject" @click="setExchangeOutcome(exchange.id, 'rejected')">
                  Reject
                </button>
              </div>
              <div v-else-if="exchange.outcome" class="outcome-badge" :class="exchange.outcome">
                {{ formatOutcome(exchange.outcome) }}
              </div>
            </div>
          </div>

          <!-- Question Input -->
          <div class="question-input">
            <textarea
              v-model="newQuestion"
              placeholder="Ask a question about the differences (e.g., 'Why did you increase the weight for volume signals?')"
              rows="2"
              @keydown.enter.ctrl="askQuestion"
            ></textarea>
            <button
              class="send-btn"
              :disabled="!newQuestion.trim() || isSending"
              @click="askQuestion"
            >
              {{ isSending ? 'Sending...' : 'Ask' }}
            </button>
          </div>

          <!-- Suggested Questions -->
          <div v-if="suggestedQuestions.length > 0" class="suggested-questions">
            <span class="suggestion-label">Suggested:</span>
            <button
              v-for="(question, idx) in suggestedQuestions"
              :key="idx"
              class="suggestion-btn"
              @click="newQuestion = question"
            >
              {{ question }}
            </button>
          </div>
        </div>

        <!-- Pending Agent Questions -->
        <div v-if="pendingAgentQuestions.length > 0" class="agent-questions-section">
          <h3>Questions from Agent</h3>
          <p class="section-subtitle">The agent wants to learn from your decisions</p>
          <div class="agent-questions">
            <div v-for="q in pendingAgentQuestions" :key="q.id" class="agent-question">
              <div class="question-text">{{ q.question }}</div>
              <textarea
                v-model="agentResponses[q.id]"
                placeholder="Your response..."
                rows="2"
              ></textarea>
              <button
                class="respond-btn"
                :disabled="!agentResponses[q.id]?.trim()"
                @click="respondToAgent(q.id)"
              >
                Respond
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="dialog-footer">
        <button class="btn-secondary" @click="handleClose">Close Session</button>
        <button class="btn-primary" @click="endAndApply" :disabled="!hasChangesToApply">
          End Session & Apply Changes
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useLearningStore, type ExchangeOutcome } from '@/stores/learningStore';
import { predictionDashboardService } from '@/services/predictionDashboardService';

const props = defineProps<{
  isVisible: boolean;
  analystId: string;
  analystName: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'session-ended'): void;
}>();

const learningStore = useLearningStore();

// Local state
const isLoading = ref(false);
const isSending = ref(false);
const newQuestion = ref('');
const agentResponses = ref<Record<string, string>>({});
const exchangeHistory = ref<HTMLElement | null>(null);

// Computed
const comparisonReport = computed(() => learningStore.sessionComparisonReport);
const exchanges = computed(() => learningStore.sessionExchanges);
const pendingAgentQuestions = computed(() =>
  exchanges.value.filter(e => e.initiatedBy === 'agent' && !e.response)
);

const hasChangesToApply = computed(() =>
  exchanges.value.some(e => e.outcome === 'adopted')
);

const suggestedQuestions = computed(() => {
  const questions: string[] = [];
  if (comparisonReport.value?.contextDiffs?.length) {
    questions.push('What prompted you to change these rules?');
    questions.push('How has this change affected your accuracy?');
  }
  if (comparisonReport.value?.divergentPredictions?.length) {
    questions.push('Why did we disagree on these predictions?');
  }
  return questions.slice(0, 3);
});

// Methods
async function loadSession() {
  if (!props.analystId) return;

  isLoading.value = true;
  try {
    const response = await predictionDashboardService.startLearningSession(props.analystId);
    if (response.content) {
      learningStore.startLearningSession(props.analystId);
      if (response.content.comparisonReport) {
        learningStore.setComparisonReport(response.content.comparisonReport);
      }
      if (response.content.exchanges) {
        learningStore.setSessionExchanges(response.content.exchanges);
      }
    }
  } catch (error) {
    console.error('Failed to load learning session:', error);
  } finally {
    isLoading.value = false;
  }
}

async function askQuestion() {
  if (!newQuestion.value.trim() || isSending.value) return;

  isSending.value = true;
  try {
    const response = await predictionDashboardService.createLearningExchange({
      analystId: props.analystId,
      initiatedBy: 'user',
      question: newQuestion.value.trim(),
    });

    if (response.content) {
      learningStore.addSessionExchange(response.content);
      newQuestion.value = '';
      await nextTick();
      scrollToBottom();
    }
  } catch (error) {
    console.error('Failed to send question:', error);
  } finally {
    isSending.value = false;
  }
}

async function respondToAgent(exchangeId: string) {
  const response = agentResponses.value[exchangeId];
  if (!response?.trim()) return;

  try {
    const result = await predictionDashboardService.respondToExchange({
      exchangeId,
      response: response.trim(),
    });

    if (result.content) {
      learningStore.setExchangeResponse(exchangeId, response.trim());
      delete agentResponses.value[exchangeId];
    }
  } catch (error) {
    console.error('Failed to respond to agent:', error);
  }
}

async function setExchangeOutcome(exchangeId: string, outcome: 'rejected' | 'adopted' | 'noted') {
  try {
    const result = await predictionDashboardService.updateExchangeOutcome({
      exchangeId,
      outcome,
    });

    if (result.content) {
      learningStore.updateExchangeOutcome(exchangeId, outcome);
    }
  } catch (error) {
    console.error('Failed to update exchange outcome:', error);
  }
}

async function adoptChange(diff: { field: string; userValue?: string; agentValue?: string }) {
  // Create an exchange to record this adoption
  try {
    const response = await predictionDashboardService.createLearningExchange({
      analystId: props.analystId,
      initiatedBy: 'user',
      question: `Adopting agent's change to ${diff.field}: "${diff.agentValue}"`,
    });

    if (response.content) {
      // Immediately mark as adopted
      await predictionDashboardService.updateExchangeOutcome({
        exchangeId: response.content.id,
        outcome: 'adopted',
        adoptionDetails: { field: diff.field, value: diff.agentValue },
      });
      learningStore.addSessionExchange({
        ...response.content,
        outcome: 'adopted',
        adoptionDetails: { field: diff.field, value: diff.agentValue },
      });
    }
  } catch (error) {
    console.error('Failed to adopt change:', error);
  }
}

async function endAndApply() {
  try {
    await predictionDashboardService.endLearningSession(props.analystId);
    learningStore.endLearningSession();
    emit('session-ended');
    emit('close');
  } catch (error) {
    console.error('Failed to end session:', error);
  }
}

function handleClose() {
  emit('close');
}

function scrollToBottom() {
  if (exchangeHistory.value) {
    exchangeHistory.value.scrollTop = exchangeHistory.value.scrollHeight;
  }
}

function formatPnl(value: number): string {
  const formatted = Math.abs(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return value >= 0 ? `+${formatted}` : `-${formatted}`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatOutcome(outcome: ExchangeOutcome): string {
  const labels: Record<ExchangeOutcome, string> = {
    adopted: 'Adopted',
    rejected: 'Rejected',
    noted: 'Noted',
    pending: 'Pending',
  };
  return labels[outcome] || outcome;
}

function getWinningFork(pred: { userDirection: string; agentDirection: string; actualOutcome: string }): string {
  if (!pred.actualOutcome || pred.actualOutcome === 'pending') {
    return 'pending';
  }
  if (pred.userDirection === pred.actualOutcome) {
    return 'user';
  }
  if (pred.agentDirection === pred.actualOutcome) {
    return 'agent';
  }
  return 'pending';
}

function getWinningForkLabel(pred: { userDirection: string; agentDirection: string; actualOutcome: string }): string {
  const winner = getWinningFork(pred);
  if (winner === 'user') return 'You won';
  if (winner === 'agent') return 'Agent won';
  return 'Pending';
}

// Watch for visibility changes
watch(() => props.isVisible, (visible) => {
  if (visible) {
    loadSession();
  }
});
</script>

<style scoped>
.learning-session-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
}

.learning-session-dialog {
  width: 90%;
  max-width: 900px;
  max-height: 90vh;
  background: var(--card-bg, #ffffff);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  background: linear-gradient(135deg, #f0f9ff 0%, #faf5ff 100%);
}

.header-content h2 {
  margin: 0;
  font-size: 1.25rem;
  color: var(--text-primary, #111827);
}

.header-content .analyst-name {
  font-size: 0.875rem;
  color: var(--text-secondary, #6b7280);
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.75rem;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  line-height: 1;
}

.close-btn:hover {
  color: var(--text-primary, #111827);
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem;
  color: var(--text-secondary, #6b7280);
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border-color, #e5e7eb);
  border-top-color: var(--ion-color-secondary, #15803d);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.dialog-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

/* Comparison Section */
.comparison-section {
  margin-bottom: 2rem;
}

.comparison-section h3 {
  margin: 0 0 1rem 0;
  font-size: 1rem;
  color: var(--text-primary, #111827);
}

.comparison-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.fork-card {
  padding: 1rem;
  border-radius: 8px;
  border: 1px solid var(--border-color, #e5e7eb);
}

.fork-card.user {
  background: rgba(21, 128, 61, 0.06);
  border-color: rgba(21, 128, 61, 0.3);
}

.fork-card.agent {
  background: #f5f3ff;
  border-color: #ddd6fe;
}

.fork-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.fork-label {
  font-weight: 600;
  font-size: 0.875rem;
}

.fork-card.user .fork-label {
  color: #15803d;
}

.fork-card.agent .fork-label {
  color: #7c3aed;
}

.pnl {
  font-weight: 700;
  font-size: 1rem;
}

.pnl.positive {
  color: #059669;
}

.pnl.negative {
  color: #dc2626;
}

.fork-stats {
  display: flex;
  gap: 1.5rem;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.stat .label {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

.stat .value {
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--text-primary, #111827);
}

.no-data {
  font-size: 0.875rem;
  color: var(--text-secondary, #6b7280);
  font-style: italic;
}

/* Context Diffs */
.context-diffs {
  margin-bottom: 1.5rem;
}

.context-diffs h4 {
  margin: 0 0 0.75rem 0;
  font-size: 0.875rem;
  color: var(--text-secondary, #6b7280);
}

.diff-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.diff-item {
  padding: 1rem;
  background: var(--hover-bg, #f9fafb);
  border-radius: 8px;
  border: 1px solid var(--border-color, #e5e7eb);
}

.diff-field {
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--text-primary, #111827);
  display: block;
  margin-bottom: 0.5rem;
}

.diff-values {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.old-value,
.new-value {
  font-size: 0.8125rem;
}

.diff-values .label {
  display: block;
  font-size: 0.6875rem;
  color: var(--text-secondary, #6b7280);
  text-transform: uppercase;
  margin-bottom: 0.25rem;
}

.diff-values .value {
  color: var(--text-primary, #111827);
}

.adopt-btn {
  padding: 0.375rem 0.75rem;
  background: var(--ion-color-secondary, #15803d);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
}

.adopt-btn:hover {
  background: var(--ion-color-secondary-shade, #166534);
}

/* Divergent Predictions */
.divergent-predictions {
  margin-bottom: 1.5rem;
}

.divergent-predictions h4 {
  margin: 0 0 0.25rem 0;
  font-size: 0.875rem;
  color: var(--text-secondary, #6b7280);
}

.subtitle {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
  margin: 0 0 0.75rem 0;
}

.prediction-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.prediction-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 0.75rem;
  background: var(--hover-bg, #f9fafb);
  border-radius: 4px;
  font-size: 0.8125rem;
}

.prediction-item .symbol {
  font-weight: 600;
  min-width: 60px;
}

.directions {
  display: flex;
  gap: 0.75rem;
  flex: 1;
}

.user-dir {
  color: #15803d;
}

.agent-dir {
  color: #7c3aed;
}

.outcome {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  border-radius: 12px;
}

.outcome.user {
  background: rgba(21, 128, 61, 0.1);
  color: #15803d;
}

.outcome.agent {
  background: #ede9fe;
  color: #7c3aed;
}

/* Chat Section */
.chat-section {
  border-top: 1px solid var(--border-color, #e5e7eb);
  padding-top: 1.5rem;
}

.chat-section h3 {
  margin: 0 0 0.25rem 0;
  font-size: 1rem;
  color: var(--text-primary, #111827);
}

.section-subtitle {
  font-size: 0.8125rem;
  color: var(--text-secondary, #6b7280);
  margin: 0 0 1rem 0;
}

.exchange-history {
  max-height: 300px;
  overflow-y: auto;
  margin-bottom: 1rem;
  padding: 0.5rem;
  background: var(--hover-bg, #f9fafb);
  border-radius: 8px;
}

.no-exchanges {
  text-align: center;
  padding: 2rem;
  color: var(--text-secondary, #6b7280);
  font-size: 0.875rem;
}

.exchange-item {
  padding: 1rem;
  margin-bottom: 0.75rem;
  background: var(--card-bg, #ffffff);
  border-radius: 8px;
  border-left: 3px solid;
}

.exchange-item.user {
  border-left-color: var(--ion-color-secondary, #15803d);
}

.exchange-item.agent {
  border-left-color: #8b5cf6;
}

.exchange-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.initiator {
  font-weight: 600;
  font-size: 0.8125rem;
}

.exchange-item.user .initiator {
  color: #15803d;
}

.exchange-item.agent .initiator {
  color: #7c3aed;
}

.timestamp {
  font-size: 0.6875rem;
  color: var(--text-secondary, #6b7280);
}

.question,
.response {
  font-size: 0.875rem;
  line-height: 1.5;
  margin-bottom: 0.5rem;
}

.q-label,
.r-label {
  font-weight: 600;
  margin-right: 0.5rem;
}

.q-label {
  color: var(--text-secondary, #6b7280);
}

.r-label {
  color: #059669;
}

.pending-response {
  font-size: 0.8125rem;
  color: var(--text-secondary, #6b7280);
  font-style: italic;
}

.exchange-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.action-btn {
  padding: 0.375rem 0.75rem;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 4px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn.adopt {
  background: #d1fae5;
  border-color: #10b981;
  color: #059669;
}

.action-btn.adopt:hover {
  background: #a7f3d0;
}

.action-btn.note {
  background: #fef3c7;
  border-color: #f59e0b;
  color: #d97706;
}

.action-btn.note:hover {
  background: #fde68a;
}

.action-btn.reject {
  background: #fee2e2;
  border-color: #ef4444;
  color: #dc2626;
}

.action-btn.reject:hover {
  background: #fecaca;
}

.outcome-badge {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  border-radius: 12px;
  font-size: 0.6875rem;
  font-weight: 500;
  text-transform: uppercase;
  margin-top: 0.5rem;
}

.outcome-badge.adopted {
  background: #d1fae5;
  color: #059669;
}

.outcome-badge.rejected {
  background: #fee2e2;
  color: #dc2626;
}

.outcome-badge.noted {
  background: #fef3c7;
  color: #d97706;
}

/* Question Input */
.question-input {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.question-input textarea {
  flex: 1;
  padding: 0.75rem;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  font-size: 0.875rem;
  resize: none;
}

.question-input textarea:focus {
  outline: none;
  border-color: var(--ion-color-secondary, #15803d);
}

.send-btn {
  padding: 0.75rem 1.5rem;
  background: var(--ion-color-secondary, #15803d);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.send-btn:hover:not(:disabled) {
  background: var(--ion-color-secondary-shade, #166534);
}

.send-btn:disabled {
  background: rgba(21, 128, 61, 0.4);
  cursor: not-allowed;
}

/* Suggested Questions */
.suggested-questions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.suggestion-label {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

.suggestion-btn {
  padding: 0.375rem 0.75rem;
  background: var(--hover-bg, #f3f4f6);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 16px;
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  transition: all 0.2s;
}

.suggestion-btn:hover {
  background: #e5e7eb;
  color: var(--text-primary, #111827);
}

/* Agent Questions Section */
.agent-questions-section {
  border-top: 1px solid var(--border-color, #e5e7eb);
  padding-top: 1.5rem;
  margin-top: 1.5rem;
}

.agent-questions-section h3 {
  margin: 0 0 0.25rem 0;
  font-size: 1rem;
  color: #7c3aed;
}

.agent-questions {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1rem;
}

.agent-question {
  padding: 1rem;
  background: #f5f3ff;
  border-radius: 8px;
  border: 1px solid #ddd6fe;
}

.question-text {
  font-size: 0.875rem;
  color: var(--text-primary, #111827);
  margin-bottom: 0.75rem;
}

.agent-question textarea {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd6fe;
  border-radius: 4px;
  font-size: 0.8125rem;
  resize: none;
  margin-bottom: 0.5rem;
}

.respond-btn {
  padding: 0.375rem 0.75rem;
  background: #8b5cf6;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
}

.respond-btn:hover:not(:disabled) {
  background: #7c3aed;
}

.respond-btn:disabled {
  background: #c4b5fd;
  cursor: not-allowed;
}

/* Footer */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--border-color, #e5e7eb);
  background: var(--card-bg, #ffffff);
}

.btn-secondary {
  padding: 0.625rem 1.25rem;
  background: var(--hover-bg, #f3f4f6);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  font-size: 0.875rem;
  color: var(--text-primary, #111827);
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: #e5e7eb;
}

.btn-primary {
  padding: 0.625rem 1.25rem;
  background: linear-gradient(135deg, var(--ion-color-secondary, #15803d) 0%, #8b5cf6 100%);
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  color: white;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(21, 128, 61, 0.4);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

/* Dark mode */
html.ion-palette-dark .learning-session-dialog,
html[data-theme="dark"] .learning-session-dialog {
  --card-bg: #1f2937;
  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
  --border-color: #374151;
  --hover-bg: #374151;
}

html.ion-palette-dark .dialog-header,
html[data-theme="dark"] .dialog-header {
  background: linear-gradient(135deg, rgba(21, 128, 61, 0.15) 0%, #312e81 100%);
}

html.ion-palette-dark .fork-card.user,
html[data-theme="dark"] .fork-card.user {
  background: rgba(21, 128, 61, 0.15);
  border-color: var(--ion-color-secondary, #15803d);
}

html.ion-palette-dark .fork-card.agent,
html[data-theme="dark"] .fork-card.agent {
  background: #312e81;
  border-color: #8b5cf6;
}

html.ion-palette-dark .agent-question,
html[data-theme="dark"] .agent-question {
  background: #312e81;
  border-color: #8b5cf6;
}
</style>
