<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <div class="trading-dashboard">
        <!-- Header -->
        <header class="dashboard-header">
          <div class="header-left">
            <button class="back-button" @click="goBackToDashboard">
              <span class="back-icon">&larr;</span>
              Back to Dashboard
            </button>
            <h1>Trading Dashboard</h1>
            <p class="subtitle">Your portfolio and analyst performance</p>
          </div>
        </header>

        <!-- My Portfolio Section -->
        <section class="portfolio-section">
          <h2>My Portfolio</h2>

          <div v-if="portfolioLoading" class="loading-state">
            <div class="spinner"></div>
            <span>Loading portfolio...</span>
          </div>

          <div v-else-if="portfolioError" class="error-state">
            <span class="error-icon">!</span>
            <span>{{ portfolioError }}</span>
            <button class="btn btn-secondary" @click="loadPortfolio">Retry</button>
          </div>

          <div v-else-if="portfolio" class="portfolio-content">
            <!-- Balance Cards -->
            <div class="balance-grid">
              <div class="balance-card">
                <span class="label">Current Balance</span>
                <span class="value">${{ formatNumber(portfolio.portfolio.currentBalance) }}</span>
              </div>
              <div class="balance-card" :class="pnlClass(portfolio.summary.totalRealizedPnl)">
                <span class="label">Realized P&L</span>
                <span class="value">{{ formatPnl(portfolio.summary.totalRealizedPnl) }}</span>
              </div>
              <div class="balance-card" :class="pnlClass(portfolio.summary.totalUnrealizedPnl)">
                <span class="label">Unrealized P&L</span>
                <span class="value">{{ formatPnl(portfolio.summary.totalUnrealizedPnl) }}</span>
              </div>
              <div class="balance-card">
                <span class="label">Win Rate</span>
                <span class="value">{{ (portfolio.summary.winRate * 100).toFixed(1) }}%</span>
              </div>
            </div>

            <!-- Open Positions -->
            <div class="positions-section">
              <h3>Open Positions ({{ portfolio.openPositions.length }})</h3>
              <div v-if="portfolio.openPositions.length === 0" class="empty-positions">
                <p>No open positions. Use predictions to take positions!</p>
                <button class="btn btn-primary" @click="goToPredictions">
                  View Predictions
                </button>
              </div>
              <table v-else class="positions-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Direction</th>
                    <th>Qty</th>
                    <th>Entry</th>
                    <th>Current</th>
                    <th>P&L</th>
                    <th>P&L %</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="pos in portfolio.openPositions" :key="pos.id">
                    <td class="symbol">{{ pos.symbol }}</td>
                    <td>
                      <span class="direction-badge" :class="pos.direction">
                        {{ pos.direction.toUpperCase() }}
                      </span>
                    </td>
                    <td>{{ pos.quantity }}</td>
                    <td>${{ pos.entryPrice.toFixed(2) }}</td>
                    <td>${{ pos.currentPrice.toFixed(2) }}</td>
                    <td :class="pnlClass(pos.unrealizedPnl)">
                      {{ formatPnl(pos.unrealizedPnl) }}
                    </td>
                    <td :class="pnlClass(pos.unrealizedPnl)">
                      {{ formatPnlPercent(pos.unrealizedPnl, pos.entryPrice, pos.quantity) }}
                    </td>
                    <td>
                      <button
                        class="btn btn-small btn-danger"
                        @click="openCloseModal(pos)"
                        title="Close position"
                      >
                        Close
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Closed Positions History -->
            <div class="positions-section">
              <h3>Closed Positions ({{ closedPositions?.statistics?.totalClosed ?? 0 }})</h3>

              <div v-if="closedPositionsLoading" class="loading-state-small">
                <div class="spinner-small"></div>
                <span>Loading history...</span>
              </div>

              <div v-else-if="closedPositions && closedPositions.positions.length > 0">
                <!-- Statistics Bar -->
                <div class="stats-bar">
                  <span class="stat positive">
                    {{ closedPositions.statistics.wins }} Wins
                  </span>
                  <span class="stat negative">
                    {{ closedPositions.statistics.losses }} Losses
                  </span>
                  <span class="stat">
                    Win Rate: {{ (closedPositions.statistics.winRate * 100).toFixed(1) }}%
                  </span>
                  <span class="stat" :class="pnlClass(closedPositions.statistics.totalPnl)">
                    Total P&L: {{ formatPnl(closedPositions.statistics.totalPnl) }}
                  </span>
                </div>

                <table class="positions-table">
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Direction</th>
                      <th>Entry</th>
                      <th>Exit</th>
                      <th>P&L</th>
                      <th>P&L %</th>
                      <th>Closed At</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="pos in closedPositions.positions" :key="pos.id">
                      <td class="symbol">{{ pos.symbol }}</td>
                      <td>
                        <span class="direction-badge" :class="pos.direction">
                          {{ pos.direction.toUpperCase() }}
                        </span>
                      </td>
                      <td>${{ pos.entryPrice.toFixed(2) }}</td>
                      <td>${{ pos.exitPrice?.toFixed(2) ?? '-' }}</td>
                      <td :class="pnlClass(pos.realizedPnl)">
                        {{ formatPnl(pos.realizedPnl) }}
                      </td>
                      <td :class="pnlClass(pos.pnlPercent)">
                        {{ formatPercent(pos.pnlPercent) }}
                      </td>
                      <td>{{ formatDate(pos.closedAt) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div v-else class="empty-positions">
                <p>No closed positions yet. Close open positions to see history.</p>
              </div>
            </div>
          </div>
        </section>

        <!-- Close Position Modal -->
        <div v-if="closeModalOpen" class="modal-overlay" @click.self="closeCloseModal">
          <div class="modal-content">
            <h3>Close Position</h3>
            <p>Closing {{ selectedPosition?.symbol }} {{ selectedPosition?.direction?.toUpperCase() }} position</p>

            <div class="form-group">
              <label>Exit Price</label>
              <input
                type="number"
                v-model.number="exitPrice"
                step="0.01"
                min="0"
                placeholder="Enter exit price"
              />
            </div>

            <div v-if="selectedPosition && exitPrice > 0" class="preview-pnl">
              <span>Estimated P&L:</span>
              <span :class="pnlClass(estimatedPnl)">{{ formatPnl(estimatedPnl) }}</span>
            </div>

            <div class="modal-actions">
              <button class="btn btn-secondary" @click="closeCloseModal">Cancel</button>
              <button
                class="btn btn-danger"
                @click="confirmClosePosition"
                :disabled="closingPosition || exitPrice <= 0"
              >
                {{ closingPosition ? 'Closing...' : 'Confirm Close' }}
              </button>
            </div>

            <div v-if="closeError" class="error-message">{{ closeError }}</div>
          </div>
        </div>

        <!-- Today's Trade Queue Section -->
        <section class="queue-section">
          <h2>Today's Trade Queue</h2>
          <p class="section-desc">Trades queued for end-of-day settlement (5 PM ET)</p>

          <div v-if="queueLoading" class="loading-state-small">
            <div class="spinner-small"></div>
            <span>Loading queue...</span>
          </div>

          <div v-else-if="tradeQueue?.trades?.length">
            <table class="positions-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Direction</th>
                  <th>Qty</th>
                  <th>Queued At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="trade in tradeQueue.trades" :key="trade.id">
                  <td class="symbol">{{ trade.symbol }}</td>
                  <td>
                    <span class="direction-badge" :class="trade.direction">
                      {{ trade.direction.toUpperCase() }}
                    </span>
                  </td>
                  <td>{{ trade.quantity }}</td>
                  <td>{{ formatDate(trade.queuedAt) }}</td>
                  <td>
                    <button
                      class="btn btn-small btn-danger"
                      @click="cancelTrade(trade.id)"
                      :disabled="cancellingTradeId === trade.id"
                    >
                      {{ cancellingTradeId === trade.id ? 'Cancelling...' : 'Cancel' }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-else class="empty-positions">
            <p>No trades queued. Queue trades from active predictions.</p>
            <button class="btn btn-primary" @click="goToPredictions">
              View Predictions
            </button>
          </div>
        </section>

        <!-- Analyst Leaderboard Section -->
        <section class="leaderboard-section">
          <div class="leaderboard-header">
            <div>
              <h2>Analyst Leaderboard</h2>
              <p class="section-desc">Compare analyst performance across User, AI &amp; Arbitrator forks</p>
            </div>
          </div>

          <div v-if="leaderboardLoading" class="loading-state">
            <div class="spinner"></div>
            <span>Loading analysts...</span>
          </div>

          <div v-else-if="leaderboardError" class="error-state">
            <span class="error-icon">!</span>
            <span>{{ leaderboardError }}</span>
            <button class="btn btn-secondary" @click="loadLeaderboard">Retry</button>
          </div>

          <div v-else-if="leaderboard">
            <!-- Summary Stats Cards -->
            <div class="leaderboard-stats-grid">
              <div class="stat-card total">
                <div class="stat-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                  </svg>
                </div>
                <div class="stat-content">
                  <span class="stat-value">{{ leaderboard.summary.totalAnalysts }}</span>
                  <span class="stat-label">Total Analysts</span>
                </div>
              </div>
              <div class="stat-card agent">
                <div class="stat-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="10" rx="2"></rect>
                    <circle cx="12" cy="5" r="3"></circle>
                  </svg>
                </div>
                <div class="stat-content">
                  <span class="stat-value">{{ leaderboard.summary.agentOutperforming }}</span>
                  <span class="stat-label">Agent Winning</span>
                </div>
              </div>
              <div class="stat-card user">
                <div class="stat-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                </div>
                <div class="stat-content">
                  <span class="stat-value">{{ leaderboard.summary.userOutperforming }}</span>
                  <span class="stat-label">User Winning</span>
                </div>
              </div>
              <div class="stat-card tied">
                <div class="stat-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="8" y1="12" x2="16" y2="12"></line>
                  </svg>
                </div>
                <div class="stat-content">
                  <span class="stat-value">{{ leaderboard.summary.totalAnalysts - leaderboard.summary.agentOutperforming - leaderboard.summary.userOutperforming }}</span>
                  <span class="stat-label">Tied</span>
                </div>
              </div>
            </div>

            <!-- Analyst Cards -->
            <div class="analyst-cards">
              <div
                v-for="analyst in leaderboard.comparisons"
                :key="analyst.analyst_id"
                class="analyst-card"
                :class="[analyst.comparison_status, { expanded: expandedAnalystId === analyst.analyst_id }]"
              >
                <!-- Card Header -->
                <div class="analyst-card-header" @click="toggleAnalystPositions(analyst.analyst_id)">
                  <div class="analyst-avatar" :class="getAnalystAvatarClass(analyst.name)">
                    {{ getAnalystInitials(analyst.name) }}
                  </div>
                  <div class="analyst-details">
                    <span class="analyst-name">{{ analyst.name }}</span>
                    <span class="analyst-type" :title="analyst.perspective">{{ truncatePerspective(analyst.perspective) }}</span>
                  </div>
                  <span class="status-indicator" :class="analyst.comparison_status">
                    <span class="status-dot"></span>
                    {{ formatStatus(analyst.comparison_status) }}
                  </span>
                  <span class="expand-icon">{{ expandedAnalystId === analyst.analyst_id ? '&#9650;' : '&#9660;' }}</span>
                </div>

                <!-- Performance Comparison -->
                <div class="performance-grid three-col">
                  <div class="performance-block user-block">
                    <span class="perf-label">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                      </svg>
                      User Fork
                    </span>
                    <span class="perf-value" :class="pnlClass(analyst.user_pnl)">
                      {{ formatPnl(analyst.user_pnl) }}
                    </span>
                    <span class="perf-record">
                      <span class="wins">{{ analyst.user_win_count }}W</span>
                      <span class="separator">/</span>
                      <span class="losses">{{ analyst.user_loss_count }}L</span>
                    </span>
                  </div>
                  <div class="performance-block agent-block">
                    <span class="perf-label">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="11" width="18" height="10" rx="2"></rect>
                        <circle cx="12" cy="5" r="3"></circle>
                      </svg>
                      AI Fork
                    </span>
                    <span class="perf-value" :class="pnlClass(analyst.agent_pnl)">
                      {{ formatPnl(analyst.agent_pnl) }}
                    </span>
                    <span class="perf-record">
                      <span class="wins">{{ analyst.agent_win_count }}W</span>
                      <span class="separator">/</span>
                      <span class="losses">{{ analyst.agent_loss_count }}L</span>
                    </span>
                  </div>
                  <div class="performance-block arbitrator-block">
                    <span class="perf-label">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"></path>
                      </svg>
                      Arbitrator
                    </span>
                    <span class="perf-value" :class="pnlClass(analyst.arbitrator_pnl)">
                      {{ formatPnl(analyst.arbitrator_pnl) }}
                    </span>
                    <span class="perf-record">
                      <span class="wins">{{ analyst.arbitrator_win_count }}W</span>
                      <span class="separator">/</span>
                      <span class="losses">{{ analyst.arbitrator_loss_count }}L</span>
                    </span>
                  </div>
                </div>

                <!-- Difference Bar -->
                <div class="difference-section">
                  <div class="diff-bar-container">
                    <div class="diff-bar-bg"></div>
                    <div
                      class="diff-bar-fill"
                      :class="analyst.pnl_difference >= 0 ? 'user-ahead' : 'agent-ahead'"
                      :style="{ width: getDiffBarWidth(analyst.pnl_difference) + '%' }"
                    ></div>
                    <div class="diff-bar-center"></div>
                  </div>
                  <div class="diff-label">
                    <span>Difference:</span>
                    <span class="diff-value" :class="pnlClass(analyst.pnl_difference)">
                      {{ formatPnl(analyst.pnl_difference) }}
                    </span>
                  </div>
                </div>

                <!-- Expandable Positions Section -->
                <div v-if="expandedAnalystId === analyst.analyst_id" class="analyst-positions-panel">
                  <div v-if="analystPositionsLoading" class="loading-state-small">
                    <div class="spinner-small"></div>
                    <span>Loading positions...</span>
                  </div>

                  <div v-else-if="analystPositions">
                    <div
                      v-for="fork in analystPositions.forks"
                      :key="fork.forkType"
                      class="fork-positions-section"
                    >
                      <div class="fork-header">
                        <span class="fork-label" :class="'fork-' + fork.forkType">
                          {{ fork.forkType === 'user' ? 'User Fork' : fork.forkType === 'ai' ? 'AI Fork' : 'Arbitrator' }}
                        </span>
                        <span v-if="fork.portfolio" class="fork-balance">
                          Balance: ${{ formatNumber(fork.portfolio.currentBalance) }}
                        </span>
                        <span v-if="fork.portfolio" class="fork-pnl" :class="pnlClass(fork.portfolio.totalRealizedPnl)">
                          {{ formatPnl(fork.portfolio.totalRealizedPnl) }}
                        </span>
                        <span v-if="!fork.portfolio" class="fork-no-portfolio">No portfolio</span>
                      </div>

                      <div v-if="fork.openPositions.length === 0" class="no-positions">
                        No open positions
                      </div>

                      <table v-else class="positions-table compact">
                        <thead>
                          <tr>
                            <th>Symbol</th>
                            <th>Dir</th>
                            <th>Qty</th>
                            <th>Entry</th>
                            <th>Current</th>
                            <th>P&L</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="pos in fork.openPositions" :key="pos.id">
                            <td class="symbol">{{ pos.symbol }}</td>
                            <td>
                              <span class="direction-badge" :class="pos.direction">
                                {{ pos.direction === 'long' ? '↑' : '↓' }}
                              </span>
                            </td>
                            <td>{{ pos.quantity.toFixed(2) }}</td>
                            <td>${{ pos.entryPrice.toFixed(2) }}</td>
                            <td>${{ pos.currentPrice.toFixed(2) }}</td>
                            <td :class="pnlClass(pos.unrealizedPnl)">
                              {{ formatPnl(pos.unrealizedPnl) }}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { IonPage, IonContent } from '@ionic/vue';
import {
  predictionDashboardService,
  type UserPortfolioSummary,
  type AnalystForksSummary,
  type ClosedPositionsResult,
  type AnalystPositionsResult,
  type TradeQueueResult,
} from '@/services/predictionDashboardService';
import { useAgentsStore } from '@/stores/agentsStore';
import { useAuthStore } from '@/stores/rbacStore';

interface OpenPosition {
  id: string;
  symbol: string;
  direction: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
}

const router = useRouter();
const route = useRoute();
const agentsStore = useAgentsStore();
const authStore = useAuthStore();

// Get agentSlug from query parameter or default to 'us-tech-stocks'
const agentSlug = computed(() => (route.query.agentSlug as string) || 'us-tech-stocks');

// Look up the agent by slug to get its organizationSlug
const currentAgent = computed(() => {
  const slug = agentSlug.value;
  if (!slug) return null;
  return agentsStore.availableAgents.find(a => a.slug === slug || a.name === slug) || null;
});

// Get organization from agent (priority) or fall back to auth store
const effectiveOrg = computed(() => {
  // Priority 1: Agent's organizationSlug
  const agentOrg = currentAgent.value?.organizationSlug;
  if (agentOrg && agentOrg !== '*') {
    return Array.isArray(agentOrg) ? agentOrg[0] : agentOrg;
  }
  // Priority 2: Auth store's current organization (but not if it's '*')
  const authOrg = authStore.currentOrganization;
  if (authOrg && authOrg !== '*') {
    return authOrg;
  }
  // Fallback: Default org for the default agent
  return 'finance';
});

// Portfolio state
const portfolio = ref<UserPortfolioSummary | null>(null);
const portfolioLoading = ref(false);
const portfolioError = ref<string | null>(null);

// Closed positions state
const closedPositions = ref<ClosedPositionsResult | null>(null);
const closedPositionsLoading = ref(false);

// Close position modal state
const closeModalOpen = ref(false);
const selectedPosition = ref<OpenPosition | null>(null);
const exitPrice = ref(0);
const closingPosition = ref(false);
const closeError = ref<string | null>(null);

// Leaderboard state
const leaderboard = ref<AnalystForksSummary | null>(null);
const leaderboardLoading = ref(false);
const leaderboardError = ref<string | null>(null);

// Trade queue state
const tradeQueue = ref<TradeQueueResult | null>(null);
const queueLoading = ref(false);
const cancellingTradeId = ref<string | null>(null);

// Expandable analyst positions
const expandedAnalystId = ref<string | null>(null);
const analystPositions = ref<AnalystPositionsResult | null>(null);
const analystPositionsLoading = ref(false);

// Computed: estimated P&L for close modal
const estimatedPnl = computed(() => {
  if (!selectedPosition.value || exitPrice.value <= 0) return 0;
  const pos = selectedPosition.value;
  if (pos.direction === 'long') {
    return (exitPrice.value - pos.entryPrice) * pos.quantity;
  } else {
    return (pos.entryPrice - exitPrice.value) * pos.quantity;
  }
});

// Set service context and load data on mount
onMounted(() => {
  // Set the organization and agent slug for API calls
  predictionDashboardService.setOrgSlug(effectiveOrg.value);
  predictionDashboardService.setAgentSlug(agentSlug.value);

  loadPortfolio();
  loadClosedPositions();
  loadTradeQueue();
  loadLeaderboard();
});

async function loadPortfolio() {
  portfolioLoading.value = true;
  portfolioError.value = null;

  try {
    const response = await predictionDashboardService.getUserPortfolio();
    if (response.content) {
      portfolio.value = response.content;
    } else {
      portfolioError.value = 'Failed to load portfolio';
    }
  } catch (err) {
    portfolioError.value = err instanceof Error ? err.message : 'Failed to load portfolio';
  } finally {
    portfolioLoading.value = false;
  }
}

async function loadLeaderboard() {
  leaderboardLoading.value = true;
  leaderboardError.value = null;

  try {
    const response = await predictionDashboardService.getAnalystForksSummary();
    if (response.content) {
      leaderboard.value = response.content;
    } else {
      leaderboardError.value = 'Failed to load leaderboard';
    }
  } catch (err) {
    leaderboardError.value = err instanceof Error ? err.message : 'Failed to load leaderboard';
  } finally {
    leaderboardLoading.value = false;
  }
}

async function loadClosedPositions() {
  closedPositionsLoading.value = true;
  try {
    const response = await predictionDashboardService.getClosedPositions();
    if (response.content) {
      closedPositions.value = response.content;
    }
  } catch (err) {
    console.error('Failed to load closed positions:', err);
  } finally {
    closedPositionsLoading.value = false;
  }
}

async function loadTradeQueue() {
  queueLoading.value = true;
  try {
    const response = await predictionDashboardService.getTradeQueue();
    if (response.content) {
      tradeQueue.value = response.content;
    }
  } catch (err) {
    console.error('Failed to load trade queue:', err);
  } finally {
    queueLoading.value = false;
  }
}

async function cancelTrade(tradeId: string) {
  cancellingTradeId.value = tradeId;
  try {
    await predictionDashboardService.cancelQueuedTrade(tradeId);
    await loadTradeQueue();
  } catch (err) {
    console.error('Failed to cancel trade:', err);
  } finally {
    cancellingTradeId.value = null;
  }
}

function openCloseModal(position: OpenPosition) {
  selectedPosition.value = position;
  exitPrice.value = position.currentPrice; // Default to current price
  closeError.value = null;
  closeModalOpen.value = true;
}

function closeCloseModal() {
  closeModalOpen.value = false;
  selectedPosition.value = null;
  exitPrice.value = 0;
  closeError.value = null;
}

async function confirmClosePosition() {
  if (!selectedPosition.value || exitPrice.value <= 0) return;

  closingPosition.value = true;
  closeError.value = null;

  try {
    const response = await predictionDashboardService.closePosition(
      selectedPosition.value.id,
      exitPrice.value
    );

    if (response.content) {
      // Success - close modal and reload data
      closeCloseModal();
      await loadPortfolio();
      await loadClosedPositions();
    } else {
      closeError.value = 'Failed to close position';
    }
  } catch (err) {
    closeError.value = err instanceof Error ? err.message : 'Failed to close position';
  } finally {
    closingPosition.value = false;
  }
}

function goToPredictions() {
  router.push({
    name: 'PredictionDashboard',
    query: agentSlug.value ? { agentSlug: agentSlug.value } : undefined,
  });
}

function goBackToDashboard() {
  router.push({
    name: 'PredictionDashboard',
    query: agentSlug.value ? { agentSlug: agentSlug.value } : undefined,
  });
}

async function toggleAnalystPositions(analystId: string) {
  if (expandedAnalystId.value === analystId) {
    // Collapse
    expandedAnalystId.value = null;
    analystPositions.value = null;
    return;
  }

  expandedAnalystId.value = analystId;
  analystPositionsLoading.value = true;
  analystPositions.value = null;

  try {
    const response = await predictionDashboardService.getAnalystPositions(analystId);
    if (response.content) {
      analystPositions.value = response.content;
    }
  } catch (err) {
    console.error('Failed to load analyst positions:', err);
  } finally {
    analystPositionsLoading.value = false;
  }
}

// Formatting helpers
function formatNumber(value: number | null | undefined): string {
  if (value == null) return '0.00';
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPnl(value: number | null | undefined): string {
  const safeValue = value ?? 0;
  const sign = safeValue >= 0 ? '+' : '';
  return `${sign}$${formatNumber(safeValue)}`;
}

function pnlClass(value: number | null | undefined): string {
  if (value == null) return 'neutral';
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'neutral';
}

function formatStatus(status: string): string {
  switch (status) {
    case 'agent_winning': return 'Agent Winning';
    case 'user_winning': return 'User Winning';
    case 'tied': return 'Tied';
    case 'warning': return 'Warning';
    default: return status;
  }
}

function formatPnlPercent(pnl: number | null | undefined, entryPrice: number | null | undefined, quantity: number | null | undefined): string {
  if (pnl == null || entryPrice == null || quantity == null) return '0.00%';
  if (entryPrice <= 0 || quantity <= 0) return '0.00%';
  const percent = (pnl / (entryPrice * quantity)) * 100;
  const sign = percent >= 0 ? '+' : '';
  return `${sign}${percent.toFixed(2)}%`;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) return '+0.00%';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getAnalystInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

function getAnalystAvatarClass(name: string): string {
  const colors = ['purple', 'blue', 'green', 'orange', 'pink', 'teal', 'red', 'indigo'];
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

function truncatePerspective(perspective: string): string {
  if (!perspective) return '';
  const maxLen = 60;
  if (perspective.length <= maxLen) return perspective;
  return perspective.substring(0, maxLen).trim() + '...';
}

function getDiffBarWidth(diff: number): number {
  // Scale the difference to a percentage (max 50% from center)
  const maxDiff = 100; // Assume max $100 difference for scaling
  const absPercent = Math.min(Math.abs(diff) / maxDiff * 50, 50);
  return absPercent;
}
</script>

<style scoped>
.trading-dashboard {
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
}

.dashboard-header {
  margin-bottom: 2rem;
}

.header-left {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.back-button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0;
  background: none;
  border: none;
  font-size: 0.875rem;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  transition: color 0.2s;
}

.back-button:hover {
  color: var(--ion-color-secondary, #15803d);
}

.back-icon {
  font-size: 1rem;
}

.dashboard-header h1 {
  font-size: 2rem;
  font-weight: 600;
  margin: 0;
}

.subtitle {
  color: var(--ion-color-medium);
  margin-top: 0.5rem;
}

/* Portfolio Section */
.portfolio-section,
.queue-section,
.leaderboard-section {
  background: var(--ion-card-background);
  border-radius: 12px;
  padding: 1.25rem;
  margin-bottom: 1.5rem;
}

.portfolio-section h2,
.queue-section h2,
.leaderboard-section h2 {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0 0 0.25rem 0;
}

/* Balance Grid */
.balance-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.balance-card {
  background: var(--ion-background-color);
  border-radius: 8px;
  padding: 1rem;
  text-align: center;
  border: 1px solid var(--ion-border-color, #e5e7eb);
}

.balance-card .label {
  display: block;
  font-size: 0.85rem;
  color: var(--ion-color-medium);
  margin-bottom: 0.25rem;
}

.balance-card .value {
  font-size: 1.5rem;
  font-weight: 600;
}

.balance-card.positive .value { color: #22c55e; }
.balance-card.negative .value { color: #ef4444; }

/* Positions Table */
.positions-section h3 {
  font-size: 1rem;
  margin: 0 0 1rem 0;
}

.empty-positions {
  text-align: center;
  padding: 2rem;
  color: var(--ion-color-medium);
}

.positions-table,
.leaderboard-table {
  width: 100%;
  border-collapse: collapse;
}

.positions-table th,
.positions-table td,
.leaderboard-table th,
.leaderboard-table td {
  padding: 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--ion-border-color);
}

.positions-table th,
.leaderboard-table th {
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--ion-color-medium);
}

.symbol {
  font-weight: 600;
}

.direction-badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}

.direction-badge.long { background: #22c55e20; color: #22c55e; }
.direction-badge.short { background: #ef444420; color: #ef4444; }

/* P&L Colors */
.positive { color: #22c55e; }
.negative { color: #ef4444; }
.neutral { color: var(--ion-color-medium); }

/* Leaderboard Header */
.leaderboard-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.25rem;
}

.leaderboard-header h2 {
  margin: 0 0 0.25rem 0;
  font-size: 1.35rem;
}

.section-desc {
  margin: 0;
  font-size: 0.85rem;
  color: var(--ion-color-medium);
}

/* Leaderboard Stats Grid */
.leaderboard-stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}

@media (max-width: 768px) {
  .leaderboard-stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--ion-background-color);
  border-radius: 10px;
  border: 1px solid var(--ion-border-color, #e5e7eb);
  transition: transform 0.2s, box-shadow 0.2s;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.stat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  flex-shrink: 0;
}

.stat-card.total .stat-icon { background: #6b728020; color: #6b7280; }
.stat-card.agent .stat-icon { background: #15803d20; color: #15803d; }
.stat-card.user .stat-icon { background: #8b5cf620; color: #8b5cf6; }
.stat-card.tied .stat-icon { background: #f59e0b20; color: #f59e0b; }

.stat-content {
  display: flex;
  flex-direction: column;
}

.stat-card .stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.2;
}

.stat-card.agent .stat-value { color: #15803d; }
.stat-card.user .stat-value { color: #8b5cf6; }
.stat-card.tied .stat-value { color: #f59e0b; }

.stat-card .stat-label {
  font-size: 0.8rem;
  color: var(--ion-color-medium);
  font-weight: 500;
}

/* Analyst Cards */
.analyst-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
  gap: 1rem;
}

.analyst-card {
  background: var(--ion-background-color);
  border-radius: 10px;
  border: 1px solid var(--ion-border-color, #e5e7eb);
  padding: 1rem;
  cursor: pointer;
  transition: all 0.2s;
}

.analyst-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
  border-color: var(--ion-color-primary);
}

.analyst-card.agent_winning {
  border-left: 4px solid #15803d;
}

.analyst-card.user_winning {
  border-left: 4px solid #8b5cf6;
}

.analyst-card.tied {
  border-left: 4px solid #f59e0b;
}

/* Card Header */
.analyst-card-header {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  margin-bottom: 0.75rem;
}

.analyst-avatar {
  width: 38px;
  height: 38px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.9rem;
  color: white;
  flex-shrink: 0;
}

.analyst-avatar.purple { background: linear-gradient(135deg, #8b5cf6, #7c3aed); }
.analyst-avatar.blue { background: linear-gradient(135deg, #15803d, #166534); }
.analyst-avatar.green { background: linear-gradient(135deg, #22c55e, #16a34a); }
.analyst-avatar.orange { background: linear-gradient(135deg, #f59e0b, #d97706); }
.analyst-avatar.pink { background: linear-gradient(135deg, #ec4899, #db2777); }
.analyst-avatar.teal { background: linear-gradient(135deg, #14b8a6, #0d9488); }
.analyst-avatar.red { background: linear-gradient(135deg, #ef4444, #dc2626); }
.analyst-avatar.indigo { background: linear-gradient(135deg, #6366f1, #4f46e5); }

.analyst-details {
  flex: 1;
  min-width: 0;
}

.analyst-details .analyst-name {
  display: block;
  font-weight: 600;
  font-size: 1rem;
  color: var(--ion-text-color);
  margin-bottom: 0.125rem;
}

.analyst-type {
  display: block;
  font-size: 0.75rem;
  color: var(--ion-color-medium);
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  border-radius: 20px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.025em;
  white-space: nowrap;
}

.status-indicator.agent_winning { background: #15803d15; color: #15803d; }
.status-indicator.user_winning { background: #8b5cf615; color: #8b5cf6; }
.status-indicator.tied { background: #f59e0b15; color: #f59e0b; }
.status-indicator.warning { background: #ef444415; color: #ef4444; }

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

/* Performance Grid */
.performance-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.performance-grid.three-col {
  grid-template-columns: 1fr 1fr 1fr;
}

@media (max-width: 480px) {
  .performance-grid.three-col {
    grid-template-columns: 1fr;
  }
}

.performance-block {
  padding: 0.625rem 0.75rem;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.performance-block.user-block {
  background: #8b5cf608;
  border: 1px solid #8b5cf620;
}

.performance-block.agent-block {
  background: #15803d08;
  border: 1px solid #15803d20;
}

.performance-block.arbitrator-block {
  background: #14b8a608;
  border: 1px solid #14b8a620;
}

.perf-label {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.025em;
  color: var(--ion-color-medium);
}

.perf-label svg {
  opacity: 0.7;
}

.perf-value {
  font-size: 1.25rem;
  font-weight: 700;
}

.perf-record {
  font-size: 0.8rem;
  display: flex;
  gap: 0.25rem;
}

.perf-record .wins { color: #22c55e; font-weight: 600; }
.perf-record .losses { color: #ef4444; font-weight: 600; }
.perf-record .separator { color: var(--ion-color-medium); }

/* Difference Section */
.difference-section {
  padding-top: 0.75rem;
  border-top: 1px solid var(--ion-border-color, #e5e7eb);
}

.diff-bar-container {
  position: relative;
  height: 8px;
  margin-bottom: 0.5rem;
  border-radius: 4px;
  overflow: hidden;
}

.diff-bar-bg {
  position: absolute;
  inset: 0;
  background: var(--ion-border-color, #e5e7eb);
}

.diff-bar-center {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--ion-color-medium);
  transform: translateX(-50%);
  z-index: 2;
}

.diff-bar-fill {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: 4px;
  z-index: 1;
}

.diff-bar-fill.user-ahead {
  left: 50%;
  background: linear-gradient(90deg, #8b5cf6, #a78bfa);
}

.diff-bar-fill.agent-ahead {
  right: 50%;
  background: linear-gradient(-90deg, #15803d, #22c55e);
}

.diff-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8rem;
}

.diff-label > span:first-child {
  color: var(--ion-color-medium);
}

.diff-value {
  font-weight: 700;
}

/* Loading/Error States */
.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 2rem;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--ion-color-light);
  border-top-color: var(--ion-color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: #ef444420;
  color: #ef4444;
  border-radius: 50%;
  font-weight: bold;
}

/* Buttons */
.btn {
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-weight: 500;
  cursor: pointer;
  border: none;
}

.btn-primary {
  background: var(--ion-color-primary);
  color: white;
}

.btn-secondary {
  background: var(--ion-color-light);
  color: var(--ion-text-color);
}

.btn-small {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
}

.btn-danger {
  background: #ef4444;
  color: white;
}

.btn-danger:hover {
  background: #dc2626;
}

.btn-danger:disabled {
  background: #f87171;
  cursor: not-allowed;
}

/* Stats Bar */
.stats-bar {
  display: flex;
  gap: 1.5rem;
  margin-bottom: 1rem;
  padding: 0.75rem;
  background: var(--ion-background-color);
  border-radius: 8px;
}

.stats-bar .stat {
  font-size: 0.9rem;
  font-weight: 500;
}

/* Loading state small */
.loading-state-small {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  color: var(--ion-color-medium);
}

.spinner-small {
  width: 16px;
  height: 16px;
  border: 2px solid var(--ion-color-light);
  border-top-color: var(--ion-color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

/* Modal */
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
  z-index: 1000;
}

.modal-content {
  background: var(--ion-card-background);
  padding: 1.5rem;
  border-radius: 12px;
  min-width: 400px;
  max-width: 90vw;
}

.modal-content h3 {
  margin: 0 0 0.5rem 0;
}

.modal-content p {
  color: var(--ion-color-medium);
  margin-bottom: 1rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  font-size: 0.85rem;
  font-weight: 500;
  margin-bottom: 0.25rem;
}

.form-group input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--ion-border-color);
  border-radius: 6px;
  font-size: 1rem;
  background: var(--ion-background-color);
  color: var(--ion-text-color);
}

.preview-pnl {
  display: flex;
  justify-content: space-between;
  padding: 0.75rem;
  background: var(--ion-background-color);
  border-radius: 6px;
  margin-bottom: 1rem;
  font-weight: 500;
}

.modal-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
}

.error-message {
  margin-top: 1rem;
  padding: 0.5rem;
  background: #ef444420;
  color: #ef4444;
  border-radius: 6px;
  font-size: 0.85rem;
}

/* Expand icon */
.expand-icon {
  font-size: 0.75rem;
  color: var(--ion-color-medium);
  margin-left: 0.5rem;
}

.analyst-card.expanded {
  border-color: var(--ion-color-primary);
}

.analyst-card-header {
  cursor: pointer;
}

/* Analyst Positions Panel */
.analyst-positions-panel {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--ion-border-color, #e5e7eb);
}

.fork-positions-section {
  margin-bottom: 1rem;
}

.fork-positions-section:last-child {
  margin-bottom: 0;
}

.fork-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
  padding: 0.375rem 0.5rem;
  border-radius: 6px;
  background: var(--ion-background-color, #f9fafb);
}

.fork-label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
}

.fork-label.fork-user {
  background: rgba(21, 128, 61, 0.15);
  color: #15803d;
}

.fork-label.fork-ai {
  background: rgba(139, 92, 246, 0.15);
  color: #7c3aed;
}

.fork-label.fork-arbitrator {
  background: rgba(249, 115, 22, 0.15);
  color: #ea580c;
}

.fork-balance {
  font-size: 0.8rem;
  color: var(--ion-color-medium);
  margin-left: auto;
}

.fork-pnl {
  font-size: 0.8rem;
  font-weight: 600;
}

.fork-no-portfolio {
  font-size: 0.8rem;
  color: var(--ion-color-medium);
  font-style: italic;
  margin-left: auto;
}

.no-positions {
  font-size: 0.8rem;
  color: var(--ion-color-medium);
  padding: 0.5rem;
  text-align: center;
  font-style: italic;
}

.positions-table.compact {
  font-size: 0.8rem;
}

.positions-table.compact th,
.positions-table.compact td {
  padding: 0.375rem 0.5rem;
}

.loading-state-small {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  color: var(--ion-color-medium);
  font-size: 0.85rem;
}

.spinner-small {
  width: 16px;
  height: 16px;
  border: 2px solid var(--ion-color-light);
  border-top-color: var(--ion-color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
