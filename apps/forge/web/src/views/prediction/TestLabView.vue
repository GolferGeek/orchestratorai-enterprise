<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <div class="test-lab">
    <header class="management-header">
      <div class="header-left">
        <button class="back-button" @click="goBackToDashboard">
          <span class="back-icon">&larr;</span>
          Back to Dashboard
        </button>
        <h1>Test Lab</h1>
      </div>
      <div class="header-actions">
        <input
          ref="importInput"
          type="file"
          accept=".json"
          style="display: none"
          @change="handleImportFile"
        />
        <button class="btn btn-secondary" @click="triggerImport">
          Import JSON
        </button>
        <button class="btn btn-primary" @click="openCreateModal">
          + New Scenario
        </button>
      </div>
    </header>

    <!-- Stats Banner -->
    <div class="stats-banner">
      <div class="stat-item">
        <span class="stat-value">{{ scenarios.length }}</span>
        <span class="stat-label">Total Scenarios</span>
      </div>
      <div class="stat-item active">
        <span class="stat-value">{{ activeScenarios.length }}</span>
        <span class="stat-label">Active</span>
      </div>
      <div class="stat-item running">
        <span class="stat-value">{{ runningScenarios.length }}</span>
        <span class="stat-label">Running</span>
      </div>
      <div class="stat-item completed">
        <span class="stat-value">{{ completedScenarios.length }}</span>
        <span class="stat-label">Completed</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">{{ totalTestData }}</span>
        <span class="stat-label">Test Records</span>
      </div>
    </div>

    <!-- Guided Workflows Section (Phase 4.5) -->
    <div class="guided-workflows">
      <h3>Quick Start Templates</h3>
      <div class="workflow-cards">
        <div
          v-for="workflow in guidedWorkflows"
          :key="workflow.id"
          class="workflow-card"
          @click="applyWorkflow(workflow)"
        >
          <span class="workflow-icon">{{ workflow.icon }}</span>
          <h4>{{ workflow.name }}</h4>
          <p>{{ workflow.description }}</p>
          <span class="workflow-badge">{{ workflow.dataCount }} items</span>
        </div>
      </div>
    </div>

    <!-- Filter Tabs -->
    <div class="filter-tabs">
      <button
        class="filter-tab"
        :class="{ active: selectedStatus === 'all' }"
        @click="selectedStatus = 'all'"
      >
        All
      </button>
      <button
        v-for="status in statuses"
        :key="status"
        class="filter-tab"
        :class="{ active: selectedStatus === status }"
        @click="selectedStatus = status"
      >
        {{ formatStatus(status) }}
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <span>Loading test scenarios...</span>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="error-state">
      <span class="error-icon">!</span>
      <span>{{ error }}</span>
      <button class="btn btn-secondary" @click="loadScenarios">Try Again</button>
    </div>

    <!-- Empty State -->
    <div v-else-if="filteredScenarios.length === 0" class="empty-state">
      <span class="empty-icon">&#128300;</span>
      <h3>No Test Scenarios</h3>
      <p>Create a new test scenario to start injecting test data into the prediction pipeline.</p>
      <button class="btn btn-primary" @click="openCreateModal">Create First Scenario</button>
    </div>

    <!-- Scenarios Grid -->
    <div v-else class="scenarios-grid">
      <div
        v-for="scenario in filteredScenarios"
        :key="scenario.id"
        class="scenario-card"
        :class="{ selected: selectedScenarioId === scenario.id }"
        @click="selectScenario(scenario.id)"
      >
        <div class="scenario-header">
          <h3>{{ scenario.name }}</h3>
          <span class="status-badge" :class="scenario.status">
            {{ formatStatus(scenario.status) }}
          </span>
        </div>
        <p class="scenario-description">{{ scenario.description || 'No description' }}</p>
        <div class="scenario-meta">
          <span class="injection-points">
            {{ scenario.injection_points?.length || 0 }} injection points
          </span>
          <span class="data-count">
            {{ getTotalDataCount(scenario) }} records
          </span>
        </div>
        <div class="scenario-actions">
          <button class="btn btn-sm btn-secondary" @click.stop="viewScenario(scenario)">
            View
          </button>
          <button
            class="btn btn-sm btn-primary"
            @click.stop="openGenerateModal(scenario)"
            :disabled="scenario.status !== 'active'"
          >
            Generate
          </button>
          <button
            class="btn btn-sm btn-secondary"
            @click.stop="exportScenario(scenario)"
            title="Export as JSON"
          >
            Export
          </button>
          <button
            class="btn btn-sm btn-warning"
            @click.stop="confirmCleanup(scenario)"
          >
            Cleanup
          </button>
          <button class="btn btn-sm btn-danger" @click.stop="confirmDelete(scenario)">
            Delete
          </button>
        </div>
      </div>
    </div>

    <!-- Create Scenario Modal -->
    <div v-if="showCreateModal" class="modal-overlay" @click.self="closeCreateModal">
      <div class="modal-content">
        <header class="modal-header">
          <h2>Create Test Scenario</h2>
          <button class="close-btn" @click="closeCreateModal">&times;</button>
        </header>

        <div class="modal-body">
          <div class="form-group">
            <label for="scenario-name">Name</label>
            <input
              id="scenario-name"
              v-model="newScenario.name"
              type="text"
              placeholder="e.g., Fed Rate Hike Test"
            />
          </div>

          <div class="form-group">
            <label for="scenario-description">Description</label>
            <textarea
              id="scenario-description"
              v-model="newScenario.description"
              placeholder="Describe what this test scenario is for..."
              rows="3"
            ></textarea>
          </div>

          <div class="form-group">
            <label>Injection Points</label>
            <div class="checkbox-grid">
              <label
                v-for="point in injectionPoints"
                :key="point"
                class="checkbox-item"
              >
                <input
                  type="checkbox"
                  :value="point"
                  v-model="newScenario.injection_points"
                />
                <span>{{ formatInjectionPoint(point) }}</span>
              </label>
            </div>
          </div>

          <div class="form-group">
            <label for="target-select">Target (Optional)</label>
            <select id="target-select" v-model="newScenario.target_id">
              <option value="">No specific target</option>
              <option v-for="target in targets" :key="target.id" :value="target.id">
                {{ target.name }} ({{ target.symbol }})
              </option>
            </select>
          </div>
        </div>

        <footer class="modal-footer">
          <button class="btn btn-secondary" @click="closeCreateModal">Cancel</button>
          <button
            class="btn btn-primary"
            @click="createScenario"
            :disabled="!canCreate"
          >
            Create Scenario
          </button>
        </footer>
      </div>
    </div>

    <!-- Generate Data Modal -->
    <div v-if="showGenerateModal" class="modal-overlay" @click.self="closeGenerateModal">
      <div class="modal-content">
        <header class="modal-header">
          <h2>Generate Test Data</h2>
          <button class="close-btn" @click="closeGenerateModal">&times;</button>
        </header>

        <div class="modal-body">
          <p class="scenario-context">
            Generating for: <strong>{{ generatingScenario?.name }}</strong>
          </p>

          <div class="form-group">
            <label>Data Type</label>
            <div class="radio-group">
              <label class="radio-item">
                <input type="radio" value="signals" v-model="generateConfig.type" />
                <span>Signals</span>
              </label>
              <label class="radio-item">
                <input type="radio" value="predictions" v-model="generateConfig.type" />
                <span>Predictions</span>
              </label>
              <label class="radio-item">
                <input type="radio" value="articles" v-model="generateConfig.type" />
                <span>Articles</span>
              </label>
            </div>
          </div>

          <div class="form-group">
            <label for="generate-count">Count</label>
            <input
              id="generate-count"
              type="number"
              v-model.number="generateConfig.count"
              min="1"
              max="100"
            />
          </div>

          <div v-if="generateConfig.type === 'signals'" class="form-group">
            <label>Sentiment Distribution</label>
            <div class="distribution-inputs">
              <div class="distribution-item">
                <label>Bullish</label>
                <input
                  type="number"
                  v-model.number="generateConfig.distribution.bullish"
                  min="0"
                  max="1"
                  step="0.1"
                />
              </div>
              <div class="distribution-item">
                <label>Bearish</label>
                <input
                  type="number"
                  v-model.number="generateConfig.distribution.bearish"
                  min="0"
                  max="1"
                  step="0.1"
                />
              </div>
              <div class="distribution-item">
                <label>Neutral</label>
                <input
                  type="number"
                  v-model.number="generateConfig.distribution.neutral"
                  min="0"
                  max="1"
                  step="0.1"
                />
              </div>
            </div>
          </div>

          <div v-if="generateConfig.type === 'predictions'" class="form-group">
            <label for="accuracy-rate">Accuracy Rate (0-1)</label>
            <input
              id="accuracy-rate"
              type="number"
              v-model.number="generateConfig.accuracy_rate"
              min="0"
              max="1"
              step="0.05"
            />
          </div>

          <div v-if="generateConfig.type === 'articles'" class="form-group">
            <label for="topic">Topic</label>
            <input
              id="topic"
              type="text"
              v-model="generateConfig.topic"
              placeholder="e.g., Bitcoin, Apple earnings"
            />
          </div>
        </div>

        <footer class="modal-footer">
          <button class="btn btn-secondary" @click="closeGenerateModal">Cancel</button>
          <button
            class="btn btn-primary"
            @click="generateData"
            :disabled="isExecuting"
          >
            {{ isExecuting ? 'Generating...' : 'Generate' }}
          </button>
        </footer>
      </div>
    </div>

    <!-- Tier Runner Panel (when scenario selected) -->
    <div v-if="selectedScenario" class="tier-runner-panel">
      <h3>Run Pipeline Tiers</h3>
      <p class="panel-description">
        Execute prediction pipeline tiers against test data in "{{ selectedScenario.name }}"
      </p>
      <div class="tier-buttons">
        <button
          class="btn btn-tier"
          @click="runTier('signal-detection')"
          :disabled="isRunningTier"
        >
          Signal Detection
        </button>
        <button
          class="btn btn-tier"
          @click="runTier('prediction-generation')"
          :disabled="isRunningTier"
        >
          Prediction Generation
        </button>
        <button
          class="btn btn-tier"
          @click="runTier('evaluation')"
          :disabled="isRunningTier"
        >
          Evaluation
        </button>
      </div>
      <div v-if="lastTierResult" class="tier-result" :class="{ success: lastTierResult.success, error: !lastTierResult.success }">
        <strong>{{ lastTierResult.tier }}</strong>:
        {{ lastTierResult.success ? 'Success' : 'Failed' }} -
        {{ lastTierResult.itemsProcessed }} processed,
        {{ lastTierResult.itemsCreated }} created
        <span v-if="lastTierResult.errors?.length">({{ lastTierResult.errors.length }} errors)</span>
      </div>
    </div>

    <!-- Live Monitor Panel (Phase 4.7) -->
    <div class="live-monitor-panel" :class="{ expanded: liveMonitorEnabled }">
      <div class="monitor-header" @click="toggleLiveMonitor">
        <h3>
          <span class="monitor-indicator" :class="{ active: liveMonitorEnabled }"></span>
          Live Monitor
        </h3>
        <span class="toggle-icon">{{ liveMonitorEnabled ? '▼' : '▲' }}</span>
      </div>
      <div v-if="liveMonitorEnabled" class="monitor-content">
        <div class="monitor-controls">
          <button class="btn btn-sm btn-secondary" @click="clearLiveMonitor">
            Clear
          </button>
          <span class="event-count">{{ liveMonitorEvents.length }} events</span>
        </div>
        <div class="monitor-events">
          <div
            v-for="event in liveMonitorEvents"
            :key="event.id"
            class="monitor-event"
            :class="event.type"
          >
            <span class="event-time">{{ formatEventTime(event.timestamp) }}</span>
            <span class="event-type-badge">{{ event.type }}</span>
            <span class="event-message">{{ event.message }}</span>
          </div>
          <div v-if="liveMonitorEvents.length === 0" class="no-events">
            No events recorded yet. Events will appear here when running tier operations.
          </div>
        </div>
      </div>
    </div>

    <!-- Historical Replay Section (Phase 8) -->
    <div class="historical-replay-section">
      <div class="section-header">
        <h2>Historical Replay Tests</h2>
        <button class="btn btn-primary" @click="openCreateReplayModal">
          + New Replay Test
        </button>
      </div>
      <p class="section-description">
        Validate learnings by replaying historical data through test instruments. Production data is never deleted -
        all replay outputs are isolated as test data.
      </p>

      <!-- Running Test Banner - CRITICAL VISIBILITY -->
      <div v-if="runningReplayTest" class="running-test-banner">
        <div class="banner-icon">
          <div class="spinner-small"></div>
        </div>
        <div class="banner-content">
          <strong>Replay Test Running: {{ runningReplayTest.name }}</strong>
          <span>Test instruments are processing historical data. All outputs are marked as test data.</span>
        </div>
        <span class="banner-badge">TEST MODE</span>
      </div>

      <!-- Replay Tests Loading/Empty State -->
      <div v-if="isLoadingReplayTests" class="loading-state">
        <div class="spinner"></div>
        <span>Loading replay tests...</span>
      </div>

      <div v-else-if="replayTests.length === 0" class="empty-state compact">
        <span class="empty-icon">🔄</span>
        <h4>No Replay Tests</h4>
        <p>Create a replay test to validate how learnings improve predictions on historical data.</p>
      </div>

      <!-- Replay Tests Grid -->
      <div v-else class="replay-tests-grid">
        <div
          v-for="test in replayTests"
          :key="test.id"
          class="replay-test-card"
          :class="{ selected: selectedReplayTestId === test.id }"
          @click="selectReplayTest(test.id)"
        >
          <div class="replay-test-header">
            <h4>{{ test.name }}</h4>
            <span class="status-badge" :class="test.status">
              {{ formatReplayStatus(test.status) }}
            </span>
          </div>
          <p class="replay-test-description">{{ test.description || 'No description' }}</p>
          <div class="replay-test-meta">
            <span class="depth-badge">{{ formatRollbackDepth(test.rollback_depth) }}</span>
            <span class="rollback-date">To: {{ formatDate(test.rollback_to) }}</span>
          </div>

          <!-- Results Summary (if completed) -->
          <div v-if="test.status === 'completed' && test.results" class="replay-results-summary">
            <div class="result-item">
              <span class="result-label">Original Accuracy</span>
              <span class="result-value">{{ formatPercent(test.original_accuracy_pct) }}</span>
            </div>
            <div class="result-item positive">
              <span class="result-label">Replay Accuracy</span>
              <span class="result-value">{{ formatPercent(test.replay_accuracy_pct) }}</span>
            </div>
            <div class="result-item" :class="{ positive: (test.total_pnl_improvement ?? 0) > 0, negative: (test.total_pnl_improvement ?? 0) < 0 }">
              <span class="result-label">P&L Improvement</span>
              <span class="result-value">{{ formatCurrency(test.total_pnl_improvement) }}</span>
            </div>
          </div>

          <div class="replay-test-actions">
            <button
              v-if="test.status === 'pending'"
              class="btn btn-sm btn-primary"
              @click.stop="runReplayTest(test.id)"
              :disabled="isRunningReplayTest"
            >
              {{ isRunningReplayTest ? 'Running...' : 'Run Test' }}
            </button>
            <button
              v-if="test.status === 'completed'"
              class="btn btn-sm btn-secondary"
              @click.stop="viewReplayResults(test)"
            >
              View Results
            </button>
            <button
              class="btn btn-sm btn-danger"
              @click.stop="confirmDeleteReplayTest(test)"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Replay Test Modal -->
    <div v-if="showCreateReplayModal" class="modal-overlay" @click.self="closeCreateReplayModal">
      <div class="modal-content modal-lg">
        <header class="modal-header">
          <h2>Create Replay Test</h2>
          <button class="close-btn" @click="closeCreateReplayModal">&times;</button>
        </header>

        <div class="modal-body">
          <div class="form-group">
            <label for="replay-name">Name</label>
            <input
              id="replay-name"
              v-model="newReplayTest.name"
              type="text"
              placeholder="e.g., Q4 Learnings Validation"
            />
          </div>

          <div class="form-group">
            <label for="replay-description">Description</label>
            <textarea
              id="replay-description"
              v-model="newReplayTest.description"
              placeholder="Describe what you're testing..."
              rows="2"
            ></textarea>
          </div>

          <div class="form-group">
            <label for="rollback-to">Roll Back To</label>
            <input
              id="rollback-to"
              v-model="newReplayTest.rollbackTo"
              type="datetime-local"
            />
            <span class="form-hint">Historical data from this point will be replayed through test instruments</span>
          </div>

          <div class="form-group">
            <label>Rollback Depth</label>
            <div class="rollback-depth-options">
              <label
                v-for="depth in rollbackDepthOptions"
                :key="depth.value"
                class="depth-option"
                :class="{ selected: newReplayTest.rollbackDepth === depth.value }"
              >
                <input
                  type="radio"
                  :value="depth.value"
                  v-model="newReplayTest.rollbackDepth"
                />
                <div class="depth-content">
                  <strong>{{ depth.label }}</strong>
                  <span>{{ depth.description }}</span>
                </div>
              </label>
            </div>
          </div>

          <div class="form-group">
            <label for="replay-universe">Universe</label>
            <select id="replay-universe" v-model="newReplayTest.universeId">
              <option value="">Select a universe...</option>
              <option v-for="universe in universes" :key="universe.id" :value="universe.id">
                {{ universe.name }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label>Preview Affected Records</label>
            <button
              class="btn btn-secondary btn-sm"
              @click="previewAffectedRecords"
              :disabled="!canPreview || isPreviewingReplay"
            >
              {{ isPreviewingReplay ? 'Loading...' : 'Preview Impact' }}
            </button>
            <div v-if="previewRecords" class="preview-results">
              <div class="preview-summary">
                <strong>{{ previewRecords.total_records }}</strong> records will be affected
              </div>
              <div class="preview-by-table">
                <div v-for="table in previewRecords.by_table" :key="table.table_name" class="preview-table-item">
                  <span class="table-name">{{ formatTableName(table.table_name) }}</span>
                  <span class="table-count">{{ table.row_count }} rows</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <footer class="modal-footer">
          <button class="btn btn-secondary" @click="closeCreateReplayModal">Cancel</button>
          <button
            class="btn btn-primary"
            @click="createReplayTest"
            :disabled="!canCreateReplayTest || isExecuting"
          >
            {{ isExecuting ? 'Creating...' : 'Create Replay Test' }}
          </button>
        </footer>
      </div>
    </div>

    <!-- Replay Results Modal -->
    <div v-if="showReplayResultsModal" class="modal-overlay" @click.self="closeReplayResultsModal">
      <div class="modal-content modal-xl">
        <header class="modal-header">
          <h2>Replay Test Results: {{ selectedReplayTest?.name }}</h2>
          <button class="close-btn" @click="closeReplayResultsModal">&times;</button>
        </header>

        <div class="modal-body">
          <!-- Summary Stats -->
          <div v-if="selectedReplayTest?.results" class="results-summary-grid">
            <div class="summary-card">
              <span class="summary-label">Total Comparisons</span>
              <span class="summary-value">{{ selectedReplayTest.total_comparisons }}</span>
            </div>
            <div class="summary-card">
              <span class="summary-label">Direction Matches</span>
              <span class="summary-value">{{ selectedReplayTest.direction_matches }}</span>
            </div>
            <div class="summary-card">
              <span class="summary-label">Original Accuracy</span>
              <span class="summary-value">{{ formatPercent(selectedReplayTest.original_accuracy_pct) }}</span>
            </div>
            <div class="summary-card highlight">
              <span class="summary-label">Replay Accuracy</span>
              <span class="summary-value">{{ formatPercent(selectedReplayTest.replay_accuracy_pct) }}</span>
            </div>
            <div class="summary-card" :class="{ positive: selectedReplayTest.improvements > selectedReplayTest.total_comparisons / 2 }">
              <span class="summary-label">Improvements</span>
              <span class="summary-value">{{ selectedReplayTest.improvements }}</span>
            </div>
            <div class="summary-card" :class="{ positive: (selectedReplayTest.total_pnl_improvement ?? 0) > 0, negative: (selectedReplayTest.total_pnl_improvement ?? 0) < 0 }">
              <span class="summary-label">P&L Improvement</span>
              <span class="summary-value">{{ formatCurrency(selectedReplayTest.total_pnl_improvement) }}</span>
            </div>
          </div>

          <!-- Detailed Results Table -->
          <div v-if="replayResultsDetails.length > 0" class="results-table-container">
            <h4>Per-Prediction Comparison</h4>
            <table class="results-table">
              <thead>
                <tr>
                  <th>Target</th>
                  <th>Original Direction</th>
                  <th>Replay Direction</th>
                  <th>Actual</th>
                  <th>Original Correct</th>
                  <th>Replay Correct</th>
                  <th>Improved</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="result in replayResultsDetails" :key="result.id">
                  <td>{{ result.target_id?.substring(0, 8) }}...</td>
                  <td>
                    <span class="direction-badge" :class="result.original_direction">
                      {{ result.original_direction || '-' }}
                    </span>
                  </td>
                  <td>
                    <span class="direction-badge" :class="result.replay_direction">
                      {{ result.replay_direction || '-' }}
                    </span>
                  </td>
                  <td>-</td>
                  <td>
                    <span v-if="result.original_correct !== null" :class="{ 'correct': result.original_correct, 'incorrect': !result.original_correct }">
                      {{ result.original_correct ? '✓' : '✗' }}
                    </span>
                    <span v-else>-</span>
                  </td>
                  <td>
                    <span v-if="result.replay_correct !== null" :class="{ 'correct': result.replay_correct, 'incorrect': !result.replay_correct }">
                      {{ result.replay_correct ? '✓' : '✗' }}
                    </span>
                    <span v-else>-</span>
                  </td>
                  <td>
                    <span v-if="result.improvement !== null" :class="{ 'improved': result.improvement, 'not-improved': !result.improvement }">
                      {{ result.improvement ? '📈' : '📉' }}
                    </span>
                    <span v-else>-</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <footer class="modal-footer">
          <button class="btn btn-secondary" @click="closeReplayResultsModal">Close</button>
        </footer>
      </div>
    </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { IonPage, IonContent } from '@ionic/vue';
import { useTestScenarioStore } from '@/stores/testScenarioStore';
import { usePredictionStore } from '@/stores/predictionStore';
import {
  predictionDashboardService,
  type TestScenarioSummary,
  type InjectionPoint,
  type TestScenarioStatus,
  type TestScenarioExport,
  type ReplayTest as _ReplayTest,
  type ReplayTestSummary,
  type RollbackDepth,
  type ReplayTestResult,
  type ReplayAffectedRecords,
} from '@/services/predictionDashboardService';

const router = useRouter();
const route = useRoute();
const store = useTestScenarioStore();
const predictionStore = usePredictionStore();

function goBackToDashboard() {
  const agentSlug = route.query.agentSlug as string;
  router.push({
    name: 'PredictionDashboard',
    query: agentSlug ? { agentSlug } : undefined,
  });
}

// State
const showCreateModal = ref(false);
const showGenerateModal = ref(false);
const selectedStatus = ref<TestScenarioStatus | 'all'>('all');
const generatingScenario = ref<TestScenarioSummary | null>(null);
const importInput = ref<HTMLInputElement | null>(null);

const newScenario = ref({
  name: '',
  description: '',
  injection_points: ['signals', 'predictors'] as InjectionPoint[],
  target_id: '',
});

const generateConfig = ref({
  type: 'signals' as 'signals' | 'predictions' | 'articles',
  count: 10,
  distribution: { bullish: 0.4, bearish: 0.4, neutral: 0.2 },
  accuracy_rate: 0.7,
  topic: '',
});

const statuses: TestScenarioStatus[] = ['active', 'running', 'completed', 'failed', 'archived'];

const injectionPoints: InjectionPoint[] = [
  'signals',
  'predictors',
  'predictions',
  'evaluations',
  'analysts',
  'learnings',
  'learning_queue',
  'sources',
];

// Historical Replay State (Phase 8)
const showCreateReplayModal = ref(false);
const showReplayResultsModal = ref(false);
const replayResultsDetails = ref<ReplayTestResult[]>([]);
const previewRecords = ref<{ total_records: number; by_table: ReplayAffectedRecords[] } | null>(null);
const isPreviewingReplay = ref(false);

const newReplayTest = ref({
  name: '',
  description: '',
  rollbackTo: '',
  rollbackDepth: 'predictions' as RollbackDepth,
  universeId: '',
});

const rollbackDepthOptions = [
  {
    value: 'predictions' as RollbackDepth,
    label: 'Predictions Only',
    description: 'Fastest - only predictions rolled back',
  },
  {
    value: 'predictors' as RollbackDepth,
    label: 'Predictions + Predictors',
    description: 'Test signal processing changes',
  },
  {
    value: 'signals' as RollbackDepth,
    label: 'Full Pipeline',
    description: 'Test entire pipeline from signals',
  },
];

// Guided Workflows (Phase 4.5)
interface GuidedWorkflow {
  id: string;
  name: string;
  description: string;
  icon: string;
  dataCount: number;
  injection_points: InjectionPoint[];
  config: {
    generateType?: 'signals' | 'predictions' | 'articles';
    count?: number;
    distribution?: { bullish: number; bearish: number; neutral: number };
    accuracy_rate?: number;
  };
}

const guidedWorkflows: GuidedWorkflow[] = [
  {
    id: 'bullish-signals',
    name: 'Bullish Signal Flood',
    description: 'Generate a batch of bullish signals to test positive prediction flow',
    icon: '📈',
    dataCount: 20,
    injection_points: ['signals', 'predictors', 'predictions'],
    config: {
      generateType: 'signals',
      count: 20,
      distribution: { bullish: 0.8, bearish: 0.1, neutral: 0.1 },
    },
  },
  {
    id: 'bearish-signals',
    name: 'Bearish Signal Test',
    description: 'Generate bearish signals to test negative prediction handling',
    icon: '📉',
    dataCount: 20,
    injection_points: ['signals', 'predictors', 'predictions'],
    config: {
      generateType: 'signals',
      count: 20,
      distribution: { bullish: 0.1, bearish: 0.8, neutral: 0.1 },
    },
  },
  {
    id: 'mixed-signals',
    name: 'Mixed Signal Chaos',
    description: 'Generate diverse signals to test consensus detection',
    icon: '🎲',
    dataCount: 30,
    injection_points: ['signals', 'predictors', 'predictions'],
    config: {
      generateType: 'signals',
      count: 30,
      distribution: { bullish: 0.33, bearish: 0.33, neutral: 0.34 },
    },
  },
  {
    id: 'accuracy-test',
    name: 'Accuracy Evaluation',
    description: 'Generate predictions with known outcomes for accuracy testing',
    icon: '🎯',
    dataCount: 15,
    injection_points: ['predictions', 'evaluations'],
    config: {
      generateType: 'predictions',
      count: 15,
      accuracy_rate: 0.7,
    },
  },
];

// Computed
const scenarios = computed(() => store.scenarios);
const selectedScenarioId = computed(() => store.selectedScenarioId);
const selectedScenario = computed(() => store.selectedScenario);
const activeScenarios = computed(() => store.activeScenarios);
const runningScenarios = computed(() => store.runningScenarios);
const completedScenarios = computed(() => store.completedScenarios);
const totalTestData = computed(() => store.totalTestData);
const isLoading = computed(() => store.isLoading);
const isExecuting = computed(() => store.isExecuting);
const isRunningTier = computed(() => store.isRunningTier);
const error = computed(() => store.error);
const lastTierResult = computed(() => store.lastTierResult);
const targets = computed(() => predictionStore.targets);

// Live Monitor (Phase 4.7)
const liveMonitorEvents = computed(() => store.liveMonitorEvents);
const liveMonitorEnabled = computed(() => store.liveMonitorEnabled);

const filteredScenarios = computed(() => {
  if (selectedStatus.value === 'all') {
    return scenarios.value;
  }
  return scenarios.value.filter((s) => s.status === selectedStatus.value);
});

const canCreate = computed(() => {
  return (
    newScenario.value.name.trim() !== '' &&
    newScenario.value.injection_points.length > 0
  );
});

// Historical Replay Computed (Phase 8)
const replayTests = computed(() => store.replayTests);
const selectedReplayTestId = computed(() => store.selectedReplayTestId);
const selectedReplayTest = computed(() => store.selectedReplayTest);
const isLoadingReplayTests = computed(() => store.isLoadingReplayTests);
const isRunningReplayTest = computed(() => store.isRunningReplayTest);
const runningReplayTest = computed(() => store.runningReplayTest);
const universes = computed(() => predictionStore.universes);

const canPreview = computed(() => {
  return (
    newReplayTest.value.rollbackTo !== '' &&
    newReplayTest.value.universeId !== ''
  );
});

const canCreateReplayTest = computed(() => {
  return (
    newReplayTest.value.name.trim() !== '' &&
    newReplayTest.value.rollbackTo !== '' &&
    newReplayTest.value.universeId !== ''
  );
});

// Methods
function formatStatus(status: TestScenarioStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatInjectionPoint(point: InjectionPoint): string {
  return point
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getTotalDataCount(scenario: TestScenarioSummary): number {
  if (!scenario.data_counts) return 0;
  return Object.values(scenario.data_counts).reduce((sum, count) => sum + (count || 0), 0);
}

function openCreateModal() {
  newScenario.value = {
    name: '',
    description: '',
    injection_points: ['signals', 'predictors'],
    target_id: '',
  };
  showCreateModal.value = true;
}

function closeCreateModal() {
  showCreateModal.value = false;
}

function openGenerateModal(scenario: TestScenarioSummary) {
  generatingScenario.value = scenario;
  generateConfig.value = {
    type: 'signals',
    count: 10,
    distribution: { bullish: 0.4, bearish: 0.4, neutral: 0.2 },
    accuracy_rate: 0.7,
    topic: '',
  };
  showGenerateModal.value = true;
}

function closeGenerateModal() {
  showGenerateModal.value = false;
  generatingScenario.value = null;
}

function selectScenario(id: string) {
  store.selectScenario(store.selectedScenarioId === id ? null : id);
}

async function loadScenarios() {
  store.setLoading(true);
  store.clearError();
  try {
    const response = await predictionDashboardService.getTestScenarioSummaries();
    store.setScenarios(response.content || []);
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Failed to load scenarios');
  } finally {
    store.setLoading(false);
  }
}

async function createScenario() {
  store.setExecuting(true);
  try {
    const response = await predictionDashboardService.createTestScenario({
      name: newScenario.value.name,
      description: newScenario.value.description || undefined,
      injection_points: newScenario.value.injection_points,
      target_id: newScenario.value.target_id || undefined,
    });
    if (response.content) {
      store.addScenario({ ...response.content, data_counts: {} });
    }
    closeCreateModal();
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Failed to create scenario');
  } finally {
    store.setExecuting(false);
  }
}

function viewScenario(scenario: TestScenarioSummary) {
  store.selectScenario(scenario.id);
  store.setCurrentScenario(scenario);
}

async function generateData() {
  if (!generatingScenario.value) return;

  store.setExecuting(true);
  try {
    await predictionDashboardService.generateTestData({
      scenarioId: generatingScenario.value.id,
      type: generateConfig.value.type,
      config: {
        count: generateConfig.value.count,
        target_id: generatingScenario.value.target_id || undefined,
        distribution: generateConfig.value.type === 'signals' ? generateConfig.value.distribution : undefined,
        accuracy_rate: generateConfig.value.type === 'predictions' ? generateConfig.value.accuracy_rate : undefined,
        topic: generateConfig.value.type === 'articles' ? generateConfig.value.topic : undefined,
      },
    });
    closeGenerateModal();
    await loadScenarios(); // Refresh to get updated counts
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Failed to generate test data');
  } finally {
    store.setExecuting(false);
  }
}

async function runTier(tier: 'signal-detection' | 'prediction-generation' | 'evaluation') {
  if (!selectedScenarioId.value) return;

  store.setRunningTier(true);
  store.clearLastTierResult();
  try {
    const response = await predictionDashboardService.runTestTier({
      scenarioId: selectedScenarioId.value,
      tier,
    });
    if (response.content) {
      store.setLastTierResult({
        tier: response.content.tier,
        success: response.content.success,
        itemsProcessed: response.content.items_processed,
        itemsCreated: response.content.items_created,
        errors: response.content.errors,
      });
    }
    await loadScenarios(); // Refresh counts
  } catch (err) {
    store.setLastTierResult({
      tier,
      success: false,
      itemsProcessed: 0,
      itemsCreated: 0,
      errors: [err instanceof Error ? err.message : 'Unknown error'],
    });
  } finally {
    store.setRunningTier(false);
  }
}

async function confirmCleanup(scenario: TestScenarioSummary) {
  if (!confirm(`Are you sure you want to clean up all test data for "${scenario.name}"?`)) {
    return;
  }

  store.setExecuting(true);
  try {
    await predictionDashboardService.cleanupTestData({ scenarioId: scenario.id });
    await loadScenarios();
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Failed to cleanup test data');
  } finally {
    store.setExecuting(false);
  }
}

async function confirmDelete(scenario: TestScenarioSummary) {
  if (!confirm(`Are you sure you want to delete "${scenario.name}"? This will also delete all associated test data.`)) {
    return;
  }

  store.setExecuting(true);
  try {
    await predictionDashboardService.deleteTestScenario({ id: scenario.id });
    store.removeScenario(scenario.id);
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Failed to delete scenario');
  } finally {
    store.setExecuting(false);
  }
}

// Phase 4.5: Guided Workflows
async function applyWorkflow(workflow: GuidedWorkflow) {
  // Create a new scenario based on the workflow template
  store.setExecuting(true);
  try {
    const response = await predictionDashboardService.createTestScenario({
      name: `${workflow.name} - ${new Date().toLocaleDateString()}`,
      description: workflow.description,
      injection_points: workflow.injection_points,
    });

    if (response.content && workflow.config.generateType) {
      // Generate the test data
      await predictionDashboardService.generateTestData({
        scenarioId: response.content.id,
        type: workflow.config.generateType,
        config: {
          count: workflow.config.count || 10,
          distribution: workflow.config.distribution,
          accuracy_rate: workflow.config.accuracy_rate,
        },
      });

      // Log to live monitor
      store.addLiveMonitorEvent({
        type: 'signal',
        message: `Applied workflow "${workflow.name}" - created scenario with ${workflow.config.count} items`,
      });
    }

    await loadScenarios();
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Failed to apply workflow');
    store.addLiveMonitorEvent({
      type: 'error',
      message: `Failed to apply workflow "${workflow.name}": ${err instanceof Error ? err.message : 'Unknown error'}`,
    });
  } finally {
    store.setExecuting(false);
  }
}

// Phase 4.6: Export/Import JSON
async function exportScenario(scenario: TestScenarioSummary) {
  store.setExecuting(true);
  try {
    const response = await predictionDashboardService.exportTestScenario({
      id: scenario.id,
      includeData: true,
    });

    if (response.content) {
      const dataStr = JSON.stringify(response.content, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `test-scenario-${scenario.name.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      store.addLiveMonitorEvent({
        type: 'signal',
        message: `Exported scenario "${scenario.name}" as JSON`,
      });
    }
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Failed to export scenario');
    store.addLiveMonitorEvent({
      type: 'error',
      message: `Failed to export scenario: ${err instanceof Error ? err.message : 'Unknown error'}`,
    });
  } finally {
    store.setExecuting(false);
  }
}

function triggerImport() {
  importInput.value?.click();
}

async function handleImportFile(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  store.setExecuting(true);
  try {
    const text = await file.text();
    const data = JSON.parse(text) as TestScenarioExport;

    const response = await predictionDashboardService.importTestScenario({
      data,
      newName: `${data.scenario.name} (imported)`,
    });

    if (response.content) {
      store.addScenario({ ...response.content, data_counts: {} });
      store.addLiveMonitorEvent({
        type: 'signal',
        message: `Imported scenario "${response.content.name}" from JSON`,
      });
    }

    await loadScenarios();
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Failed to import scenario');
    store.addLiveMonitorEvent({
      type: 'error',
      message: `Failed to import scenario: ${err instanceof Error ? err.message : 'Unknown error'}`,
    });
  } finally {
    store.setExecuting(false);
    // Reset the input
    if (target) target.value = '';
  }
}

// Phase 4.7: Live Monitor
function toggleLiveMonitor() {
  store.toggleLiveMonitor();
}

function clearLiveMonitor() {
  store.clearLiveMonitorEvents();
}

function formatEventTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// Phase 8: Historical Replay Methods
async function loadReplayTests() {
  store.setLoadingReplayTests(true);
  try {
    const response = await predictionDashboardService.listReplayTests();
    store.setReplayTests(response.content || []);
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Failed to load replay tests');
  } finally {
    store.setLoadingReplayTests(false);
  }
}

function openCreateReplayModal() {
  newReplayTest.value = {
    name: '',
    description: '',
    rollbackTo: '',
    rollbackDepth: 'predictions',
    universeId: '',
  };
  previewRecords.value = null;
  showCreateReplayModal.value = true;
}

function closeCreateReplayModal() {
  showCreateReplayModal.value = false;
  previewRecords.value = null;
}

function closeReplayResultsModal() {
  showReplayResultsModal.value = false;
  replayResultsDetails.value = [];
}

function selectReplayTest(id: string) {
  store.selectReplayTest(store.selectedReplayTestId === id ? null : id);
}

async function previewAffectedRecords() {
  if (!canPreview.value) return;

  isPreviewingReplay.value = true;
  try {
    const response = await predictionDashboardService.previewReplayTest({
      rollbackDepth: newReplayTest.value.rollbackDepth,
      rollbackTo: new Date(newReplayTest.value.rollbackTo).toISOString(),
      universeId: newReplayTest.value.universeId,
    });
    if (response.content) {
      previewRecords.value = {
        total_records: response.content.total_records,
        by_table: response.content.by_table,
      };
    }
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Failed to preview affected records');
  } finally {
    isPreviewingReplay.value = false;
  }
}

async function createReplayTest() {
  if (!canCreateReplayTest.value) return;

  store.setExecuting(true);
  try {
    const response = await predictionDashboardService.createReplayTest({
      name: newReplayTest.value.name,
      description: newReplayTest.value.description || undefined,
      rollbackDepth: newReplayTest.value.rollbackDepth,
      rollbackTo: new Date(newReplayTest.value.rollbackTo).toISOString(),
      universeId: newReplayTest.value.universeId,
    });
    if (response.content) {
      // Convert ReplayTest to ReplayTestSummary with default values
      const testSummary: ReplayTestSummary = {
        ...response.content,
        total_comparisons: 0,
        direction_matches: 0,
        original_correct_count: 0,
        replay_correct_count: 0,
        improvements: 0,
        original_accuracy_pct: null,
        replay_accuracy_pct: null,
        total_pnl_original: null,
        total_pnl_replay: null,
        total_pnl_improvement: null,
        avg_confidence_diff: null,
      };
      store.addReplayTest(testSummary);
      store.addLiveMonitorEvent({
        type: 'signal',
        message: `Created replay test "${response.content.name}"`,
      });
    }
    closeCreateReplayModal();
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Failed to create replay test');
    store.addLiveMonitorEvent({
      type: 'error',
      message: `Failed to create replay test: ${err instanceof Error ? err.message : 'Unknown error'}`,
    });
  } finally {
    store.setExecuting(false);
  }
}

async function runReplayTest(testId: string) {
  store.setRunningReplayTest(true);
  try {
    const response = await predictionDashboardService.runReplayTest({ id: testId });
    if (response.content) {
      store.updateReplayTest(testId, response.content);
      store.addLiveMonitorEvent({
        type: 'prediction',
        message: `Completed replay test with ${response.content.results?.total_comparisons || 0} comparisons`,
      });
    }
    await loadReplayTests();
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Failed to run replay test');
    store.addLiveMonitorEvent({
      type: 'error',
      message: `Failed to run replay test: ${err instanceof Error ? err.message : 'Unknown error'}`,
    });
  } finally {
    store.setRunningReplayTest(false);
  }
}

async function viewReplayResults(test: { id: string; name: string }) {
  store.selectReplayTest(test.id);
  showReplayResultsModal.value = true;

  try {
    const response = await predictionDashboardService.getReplayTestResults({ id: test.id });
    replayResultsDetails.value = response.content?.results || [];
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Failed to load replay results');
  }
}

async function confirmDeleteReplayTest(test: { id: string; name: string }) {
  if (!confirm(`Are you sure you want to delete replay test "${test.name}"?`)) {
    return;
  }

  store.setExecuting(true);
  try {
    await predictionDashboardService.deleteReplayTest({ id: test.id });
    store.removeReplayTest(test.id);
    store.addLiveMonitorEvent({
      type: 'signal',
      message: `Deleted replay test "${test.name}"`,
    });
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Failed to delete replay test');
  } finally {
    store.setExecuting(false);
  }
}

// Formatting helpers for replay
function formatReplayStatus(status: string): string {
  const statusMap: Record<string, string> = {
    pending: 'Pending',
    snapshot_created: 'Ready',
    running: 'Running',
    completed: 'Completed',
    failed: 'Failed',
    restored: 'Restored',
  };
  return statusMap[status] || status;
}

function formatRollbackDepth(depth: string): string {
  const depthMap: Record<string, string> = {
    predictions: 'Predictions',
    predictors: 'Predictors',
    signals: 'Full Pipeline',
  };
  return depthMap[depth] || depth;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return `${value.toFixed(1)}%`;
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  const prefix = value >= 0 ? '+' : '';
  return `${prefix}$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTableName(tableName: string): string {
  return tableName
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Lifecycle
onMounted(async () => {
  await Promise.all([loadScenarios(), loadReplayTests()]);
});
</script>

<style scoped>
/* =============================================================================
   TEST LAB - Main container and layout
   ============================================================================= */

.test-lab {
  padding: 1.5rem 2rem;
  padding-top: calc(env(safe-area-inset-top, 0px) + 3.5rem);
  max-width: 1400px;
  margin: 0 auto;
}

/* Header */
.management-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  gap: 1rem;
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.back-button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0;
  background: none;
  border: none;
  font-size: 0.875rem;
  color: var(--ion-color-medium, #78716c);
  cursor: pointer;
  transition: color 0.2s;
}

.back-button:hover {
  color: var(--ion-color-primary, #8b5a3c);
}

html[data-theme="dark"] .back-button {
  color: var(--dark-text-muted, #a0aec0);
}

html[data-theme="dark"] .back-button:hover {
  color: var(--ion-color-primary-tint, #a16c4a);
}

.back-icon {
  font-size: 1rem;
}

.management-header h1 {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--ion-color-dark, #3c2415);
  margin: 0;
}

html[data-theme="dark"] .management-header h1 {
  color: var(--dark-text-primary, #f7fafc);
}

.header-actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

/* =============================================================================
   STATS BANNER - Summary metrics with Ionic theme colors
   ============================================================================= */

.stats-banner {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 1rem;
  margin-bottom: 2rem;
  padding: 1.25rem;
  background: var(--ion-card-background, #ffffff);
  border-radius: 12px;
  border: 1px solid var(--ion-color-light-shade, #e5e5e5);
}

html[data-theme="dark"] .stats-banner {
  background: var(--dark-bg-tertiary, #2d3748);
  border-color: var(--dark-border-subtle, #374151);
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0.75rem;
  border-radius: 8px;
  text-align: center;
}

.stat-value {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--ion-color-dark, #3c2415);
  line-height: 1.2;
}

html[data-theme="dark"] .stat-value {
  color: var(--dark-text-primary, #f7fafc);
}

.stat-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--ion-color-medium, #78716c);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-top: 0.25rem;
}

html[data-theme="dark"] .stat-label {
  color: var(--dark-text-muted, #a0aec0);
}

/* Colored stat values */
.stat-item.active .stat-value {
  color: var(--ion-color-primary, #8b5a3c);
}

.stat-item.running .stat-value {
  color: var(--ion-color-warning-shade, #e0ac08);
}

.stat-item.completed .stat-value {
  color: var(--ion-color-success, #22c55e);
}

/* =============================================================================
   FILTER TABS - Status filtering with Ionic theme colors
   ============================================================================= */

.filter-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.filter-tab {
  padding: 0.5rem 1.125rem;
  border: 1px solid var(--ion-color-light-shade, #e5e5e5);
  border-radius: 999px;
  background: var(--ion-color-light, #fdf8f6);
  color: var(--ion-color-medium, #78716c);
  cursor: pointer;
  transition: all 0.2s ease;
  text-transform: capitalize;
  font-size: 0.875rem;
  font-weight: 500;
}

.filter-tab:hover {
  background: var(--ion-color-light-shade, #f7ede7);
  border-color: var(--ion-color-medium-tint, #a8a29e);
}

.filter-tab.active {
  background: var(--ion-color-primary, #8b5a3c);
  color: #ffffff;
  border-color: var(--ion-color-primary, #8b5a3c);
}

html[data-theme="dark"] .filter-tab {
  background: var(--dark-bg-quaternary, #374151);
  border-color: var(--dark-border-subtle, #374151);
  color: var(--dark-text-muted, #a0aec0);
}

html[data-theme="dark"] .filter-tab:hover {
  background: var(--dark-border-primary, #4a5568);
  border-color: var(--dark-border-primary, #4a5568);
  color: var(--dark-text-secondary, #e2e8f0);
}

html[data-theme="dark"] .filter-tab.active {
  background: var(--ion-color-primary, #8b5a3c);
  color: #ffffff;
  border-color: var(--ion-color-primary, #8b5a3c);
}

/* Loading/Error/Empty States */
.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  text-align: center;
  gap: 1rem;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--ion-color-light);
  border-top-color: var(--ion-color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-icon,
.empty-icon {
  font-size: 3rem;
}

.error-state {
  color: var(--ion-color-danger);
}

/* =============================================================================
   SCENARIOS GRID - Card-based layout with Ionic theme colors
   ============================================================================= */

.scenarios-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 1.25rem;
}

.scenario-card {
  background: var(--ion-card-background, #ffffff);
  border-radius: 12px;
  padding: 1.25rem;
  border: 1px solid var(--ion-color-light-shade, #e5e5e5);
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  min-height: 180px;
}

.scenario-card:hover {
  border-color: var(--ion-color-primary, #8b5a3c);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.scenario-card.selected {
  border-color: var(--ion-color-primary, #8b5a3c);
  border-width: 2px;
  box-shadow: 0 4px 16px rgba(139, 90, 60, 0.2);
}

/* Dark mode card styling */
html[data-theme="dark"] .scenario-card {
  background: var(--dark-bg-tertiary, #2d3748);
  border-color: var(--dark-border-subtle, #374151);
}

html[data-theme="dark"] .scenario-card:hover {
  border-color: var(--ion-color-primary-tint, #a16c4a);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.scenario-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.scenario-header h3 {
  font-size: 1.0625rem;
  font-weight: 600;
  margin: 0;
  color: var(--ion-text-color, #333333);
  line-height: 1.3;
}

html[data-theme="dark"] .scenario-header h3 {
  color: var(--dark-text-primary, #f7fafc);
}

/* Status Badges - Using Ionic theme colors */
.status-badge {
  padding: 0.3rem 0.625rem;
  border-radius: 999px;
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  white-space: nowrap;
  flex-shrink: 0;
}

.status-badge.active {
  background: rgba(139, 90, 60, 0.15);
  color: var(--ion-color-primary, #8b5a3c);
  border: 1px solid rgba(139, 90, 60, 0.3);
}

.status-badge.running {
  background: rgba(255, 196, 9, 0.15);
  color: var(--ion-color-warning-shade, #e0ac08);
  border: 1px solid rgba(255, 196, 9, 0.3);
}

.status-badge.completed {
  background: rgba(34, 197, 94, 0.15);
  color: var(--ion-color-success-shade, #15803d);
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.status-badge.failed {
  background: rgba(235, 68, 90, 0.15);
  color: var(--ion-color-danger, #eb445a);
  border: 1px solid rgba(235, 68, 90, 0.3);
}

.status-badge.archived {
  background: rgba(120, 113, 108, 0.15);
  color: var(--ion-color-medium, #78716c);
  border: 1px solid rgba(120, 113, 108, 0.3);
}

.scenario-description {
  font-size: 0.875rem;
  color: var(--ion-color-medium, #78716c);
  margin-bottom: 0.875rem;
  line-height: 1.5;
  flex: 1;
}

html[data-theme="dark"] .scenario-description {
  color: var(--dark-text-muted, #a0aec0);
}

.scenario-meta {
  display: flex;
  gap: 1.25rem;
  font-size: 0.8125rem;
  color: var(--ion-color-medium, #78716c);
  margin-bottom: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--ion-color-light-shade, #e5e5e5);
}

html[data-theme="dark"] .scenario-meta {
  color: var(--dark-text-subtle, #9ca3af);
  border-top-color: var(--dark-border-subtle, #374151);
}

.scenario-meta span {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.scenario-actions {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.5rem;
  margin-top: auto;
}

/* =============================================================================
   BUTTONS - Consistent styling with Ionic theme colors
   ============================================================================= */

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  font-size: 0.875rem;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
}

.btn-sm {
  padding: 0.4rem 0.625rem;
  font-size: 0.75rem;
  border-radius: 5px;
}

/* Primary button - Brown (brand color) */
.btn-primary {
  background: var(--ion-color-primary, #8b5a3c);
  color: #ffffff;
  border: 1px solid var(--ion-color-primary, #8b5a3c);
}

.btn-primary:hover:not(:disabled) {
  background: var(--ion-color-primary-shade, #6d4428);
  border-color: var(--ion-color-primary-shade, #6d4428);
}

/* Secondary button - Light/Neutral */
.btn-secondary {
  background: var(--ion-color-light, #f4f4f5);
  color: var(--ion-color-dark, #3c2415);
  border: 1px solid var(--ion-color-light-shade, #e5e5e5);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--ion-color-light-shade, #e5e5e5);
  border-color: var(--ion-color-medium-tint, #a8a29e);
}

html[data-theme="dark"] .btn-secondary {
  background: var(--dark-bg-quaternary, #374151);
  color: var(--dark-text-secondary, #e2e8f0);
  border-color: var(--dark-border-subtle, #374151);
}

html[data-theme="dark"] .btn-secondary:hover:not(:disabled) {
  background: var(--dark-border-primary, #4a5568);
  border-color: var(--dark-border-primary, #4a5568);
}

/* Warning button - Yellow/Amber */
.btn-warning {
  background: rgba(255, 196, 9, 0.15);
  color: var(--ion-color-warning-shade, #e0ac08);
  border: 1px solid rgba(255, 196, 9, 0.4);
}

.btn-warning:hover:not(:disabled) {
  background: rgba(255, 196, 9, 0.25);
  border-color: var(--ion-color-warning, #ffc409);
}

/* Danger button - Red */
.btn-danger {
  background: rgba(235, 68, 90, 0.15);
  color: var(--ion-color-danger, #eb445a);
  border: 1px solid rgba(235, 68, 90, 0.4);
}

.btn-danger:hover:not(:disabled) {
  background: rgba(235, 68, 90, 0.25);
  border-color: var(--ion-color-danger, #eb445a);
}

/* Success button - Green */
.btn-success {
  background: var(--ion-color-success, #22c55e);
  color: #ffffff;
  border: 1px solid var(--ion-color-success, #22c55e);
}

.btn-success:hover:not(:disabled) {
  background: var(--ion-color-success-shade, #15803d);
  border-color: var(--ion-color-success-shade, #15803d);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn:focus {
  outline: 2px solid var(--ion-color-primary-tint, #a16c4a);
  outline-offset: 2px;
}

/* =============================================================================
   MODAL SYSTEM - Clean, symmetric design using Ionic theme colors
   ============================================================================= */

/* Overlay - dark backdrop */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 1rem;
}

/* Modal container */
.modal-content {
  background: var(--ion-card-background, var(--dark-bg-tertiary, #2d3748));
  border-radius: 16px;
  width: 100%;
  max-width: 500px;
  max-height: calc(100vh - 2rem);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow:
    0 0 0 1px var(--dark-border-subtle, rgba(55, 65, 81, 0.5)),
    0 20px 50px rgba(0, 0, 0, 0.5),
    0 0 80px rgba(var(--ion-color-primary-rgb, 139, 90, 60), 0.1);
}

/* Modal header */
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem 1.5rem;
  background: var(--dark-bg-secondary, #1f2937);
  border-bottom: 1px solid var(--dark-border-subtle, #374151);
  flex-shrink: 0;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--dark-text-primary, #f7fafc);
  letter-spacing: -0.01em;
}

.close-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--dark-bg-quaternary, #374151);
  border: 1px solid var(--dark-border-subtle, #374151);
  border-radius: 8px;
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
  color: var(--dark-text-muted, #a0aec0);
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: var(--dark-border-primary, #4a5568);
  color: var(--dark-text-primary, #f7fafc);
  border-color: var(--dark-border-primary, #4a5568);
}

/* Modal body - scrollable */
.modal-body {
  padding: 1.5rem;
  overflow-y: auto;
  flex: 1;
  background: var(--ion-card-background, var(--dark-bg-tertiary, #2d3748));
  color: var(--dark-text-secondary, #e2e8f0);
}

/* Modal footer */
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1.25rem 1.5rem;
  background: var(--dark-bg-secondary, #1f2937);
  border-top: 1px solid var(--dark-border-subtle, #374151);
  flex-shrink: 0;
}

/* Modal size variants */
.modal-lg {
  max-width: 640px;
}

.modal-xl {
  max-width: 900px;
}

/* =============================================================================
   FORM SYSTEM - Consistent inputs using Ionic theme colors
   ============================================================================= */

.form-group {
  margin-bottom: 1.25rem;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group > label {
  display: block;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--dark-text-primary, #f7fafc);
  letter-spacing: 0.01em;
}

/* Text inputs, textareas, selects */
.form-group input[type="text"],
.form-group input[type="datetime-local"],
.form-group input[type="number"],
.form-group input[type="email"],
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 0.75rem 1rem;
  font-size: 0.9375rem;
  line-height: 1.5;
  color: var(--dark-text-primary, #f7fafc);
  background: var(--dark-bg-primary, #1a1a1a);
  border: 1px solid var(--dark-border-secondary, #4b5563);
  border-radius: 8px;
  transition: all 0.2s ease;
}

.form-group input::placeholder,
.form-group textarea::placeholder {
  color: var(--dark-text-muted, #a0aec0);
}

.form-group input:hover,
.form-group textarea:hover,
.form-group select:hover {
  border-color: var(--dark-border-primary, #4a5568);
}

.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus {
  outline: none;
  border-color: var(--ion-color-primary, #8b5a3c);
  box-shadow: 0 0 0 3px rgba(var(--ion-color-primary-rgb, 139, 90, 60), 0.2);
}

.form-group textarea {
  resize: vertical;
  min-height: 80px;
}

.form-group select {
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23a0aec0' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 1rem center;
  padding-right: 2.5rem;
}

.form-group select option {
  background: var(--dark-bg-secondary, #1f2937);
  color: var(--dark-text-primary, #f7fafc);
  padding: 0.5rem;
}

/* Checkbox grid */
.checkbox-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 0.75rem;
}

.checkbox-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--dark-text-secondary, #e2e8f0);
  cursor: pointer;
}

.checkbox-item input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--ion-color-primary, #8b5a3c);
  cursor: pointer;
}

/* Radio group */
.radio-group {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.radio-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--dark-text-secondary, #e2e8f0);
  cursor: pointer;
}

.radio-item input[type="radio"] {
  width: 18px;
  height: 18px;
  accent-color: var(--ion-color-primary, #8b5a3c);
  cursor: pointer;
}

.distribution-inputs {
  display: flex;
  gap: 1rem;
}

.distribution-item {
  flex: 1;
}

.distribution-item label {
  font-size: 0.75rem;
}

.distribution-item input {
  width: 100%;
}

/* Tier Runner Panel */
.tier-runner-panel {
  margin-top: 2rem;
  padding: 1.5rem;
  background: var(--ion-card-background);
  border-radius: 8px;
  border: 2px solid var(--ion-color-primary-tint);
}

.tier-runner-panel h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1.125rem;
}

.panel-description {
  color: var(--ion-color-medium);
  margin-bottom: 1rem;
}

.tier-buttons {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}

.btn-tier {
  background: var(--ion-color-secondary);
  color: var(--ion-color-secondary-contrast);
  padding: 0.75rem 1.5rem;
}

.btn-tier:hover:not(:disabled) {
  background: var(--ion-color-secondary-shade);
}

.tier-result {
  padding: 0.75rem;
  border-radius: 6px;
  font-size: 0.875rem;
}

.tier-result.success {
  background: var(--ion-color-success-tint);
  color: var(--ion-color-success-shade);
}

.tier-result.error {
  background: var(--ion-color-danger-tint);
  color: var(--ion-color-danger);
}

.scenario-context {
  background: var(--ion-color-light);
  padding: 0.75rem;
  border-radius: 6px;
  margin-bottom: 1rem;
}

/* Header Actions */
.header-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

/* =============================================================================
   GUIDED WORKFLOWS - Quick start templates with Ionic theme colors
   ============================================================================= */

.guided-workflows {
  margin-bottom: 2rem;
  padding: 1.25rem;
  background: var(--ion-card-background, #ffffff);
  border-radius: 12px;
  border: 1px solid var(--ion-color-light-shade, #e5e5e5);
}

html[data-theme="dark"] .guided-workflows {
  background: var(--dark-bg-tertiary, #2d3748);
  border-color: var(--dark-border-subtle, #374151);
}

.guided-workflows h3 {
  margin: 0 0 1rem 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--ion-color-dark, #3c2415);
}

html[data-theme="dark"] .guided-workflows h3 {
  color: var(--dark-text-primary, #f7fafc);
}

.workflow-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1rem;
}

.workflow-card {
  padding: 1.125rem;
  background: var(--ion-color-light, #fdf8f6);
  border: 1px solid var(--ion-color-light-shade, #e5e5e5);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.workflow-card:hover {
  border-color: var(--ion-color-primary, #8b5a3c);
  box-shadow: 0 4px 12px rgba(139, 90, 60, 0.12);
  transform: translateY(-2px);
}

html[data-theme="dark"] .workflow-card {
  background: var(--dark-bg-quaternary, #374151);
  border-color: var(--dark-border-subtle, #374151);
}

html[data-theme="dark"] .workflow-card:hover {
  border-color: var(--ion-color-primary-tint, #a16c4a);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.workflow-icon {
  font-size: 1.75rem;
  display: block;
  margin-bottom: 0.625rem;
}

.workflow-card h4 {
  margin: 0 0 0.375rem 0;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--ion-color-dark, #3c2415);
}

html[data-theme="dark"] .workflow-card h4 {
  color: var(--dark-text-primary, #f7fafc);
}

.workflow-card p {
  margin: 0 0 0.625rem 0;
  font-size: 0.8125rem;
  color: var(--ion-color-medium, #78716c);
  line-height: 1.4;
}

html[data-theme="dark"] .workflow-card p {
  color: var(--dark-text-muted, #a0aec0);
}

.workflow-badge {
  display: inline-block;
  padding: 0.25rem 0.625rem;
  background: rgba(139, 90, 60, 0.12);
  color: var(--ion-color-primary, #8b5a3c);
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  border: 1px solid rgba(139, 90, 60, 0.2);
}

html[data-theme="dark"] .workflow-badge {
  background: rgba(161, 108, 74, 0.2);
  color: var(--ion-color-primary-tint, #a16c4a);
  border-color: rgba(161, 108, 74, 0.3);
}

/* Live Monitor Panel (Phase 4.7) */
.live-monitor-panel {
  margin-top: 2rem;
  background: var(--ion-card-background);
  border-radius: 8px;
  border: 1px solid var(--ion-border-color);
  overflow: hidden;
}

.monitor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: var(--ion-color-dark);
  color: var(--ion-color-dark-contrast);
  cursor: pointer;
  user-select: none;
}

.monitor-header h3 {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.monitor-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ion-color-medium);
}

.monitor-indicator.active {
  background: var(--ion-color-success);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.toggle-icon {
  font-size: 0.75rem;
}

.monitor-content {
  padding: 1rem;
}

.monitor-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.event-count {
  font-size: 0.75rem;
  color: var(--ion-color-medium);
}

.monitor-events {
  max-height: 200px;
  overflow-y: auto;
  background: var(--ion-background-color);
  border-radius: 4px;
  padding: 0.5rem;
}

.monitor-event {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0;
  font-size: 0.75rem;
  border-bottom: 1px solid var(--ion-border-color);
}

.monitor-event:last-child {
  border-bottom: none;
}

.event-time {
  color: var(--ion-color-medium);
  font-family: monospace;
  flex-shrink: 0;
}

.event-type-badge {
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  flex-shrink: 0;
}

.monitor-event.signal .event-type-badge { background: var(--ion-color-primary-tint); color: var(--ion-color-primary); }
.monitor-event.predictor .event-type-badge { background: var(--ion-color-secondary-tint); color: var(--ion-color-secondary); }
.monitor-event.prediction .event-type-badge { background: var(--ion-color-tertiary-tint); color: var(--ion-color-tertiary); }
.monitor-event.outcome .event-type-badge { background: var(--ion-color-success-tint); color: var(--ion-color-success); }
.monitor-event.evaluation .event-type-badge { background: var(--ion-color-warning-tint); color: var(--ion-color-warning-shade); }
.monitor-event.learning .event-type-badge { background: #e8f4fc; color: #0077b6; }
.monitor-event.error .event-type-badge { background: var(--ion-color-danger-tint); color: var(--ion-color-danger); }

.event-message {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.no-events {
  text-align: center;
  padding: 1rem;
  color: var(--ion-color-medium);
  font-size: 0.75rem;
}

/* Historical Replay Section (Phase 8) */
.historical-replay-section {
  margin-top: 2rem;
  padding: 1.5rem;
  background: var(--ion-card-background);
  border-radius: 8px;
  border: 2px solid var(--ion-color-tertiary-tint);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.section-header h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.section-description {
  color: var(--ion-color-medium);
  margin-bottom: 1.5rem;
  font-size: 0.875rem;
}

/* Running Test Banner - High Visibility */
.running-test-banner {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.5rem;
  background: linear-gradient(135deg, var(--ion-color-warning-tint), var(--ion-color-warning));
  border-radius: 8px;
  margin-bottom: 1.5rem;
  color: var(--ion-color-warning-contrast);
  animation: pulse-banner 2s ease-in-out infinite;
}

@keyframes pulse-banner {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.9; }
}

.banner-icon {
  flex-shrink: 0;
}

.spinner-small {
  width: 24px;
  height: 24px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.banner-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.banner-content strong {
  font-size: 1rem;
  font-weight: 600;
}

.banner-content span {
  font-size: 0.875rem;
  opacity: 0.9;
}

.banner-badge {
  background: rgba(0, 0, 0, 0.2);
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.empty-state.compact {
  padding: 2rem;
}

.empty-state.compact h4 {
  margin: 0.5rem 0 0.25rem;
  font-size: 1rem;
}

.empty-state.compact p {
  margin: 0;
  font-size: 0.875rem;
  color: var(--ion-color-medium);
}

/* Replay Tests Grid */
.replay-tests-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1rem;
}

.replay-test-card {
  background: var(--ion-background-color);
  border-radius: 8px;
  padding: 1rem;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
}

.replay-test-card:hover {
  border-color: var(--ion-color-tertiary-tint);
}

.replay-test-card.selected {
  border-color: var(--ion-color-tertiary);
  box-shadow: 0 0 0 3px rgba(var(--ion-color-tertiary-rgb), 0.2);
}

.replay-test-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.replay-test-header h4 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.replay-test-description {
  font-size: 0.875rem;
  color: var(--ion-color-medium);
  margin-bottom: 0.75rem;
  line-height: 1.4;
}

.replay-test-meta {
  display: flex;
  gap: 1rem;
  margin-bottom: 0.75rem;
  font-size: 0.75rem;
}

.depth-badge {
  padding: 0.125rem 0.5rem;
  background: var(--ion-color-tertiary-tint);
  color: var(--ion-color-tertiary);
  border-radius: 12px;
  font-weight: 600;
}

.rollback-date {
  color: var(--ion-color-medium);
}

/* Replay Results Summary */
.replay-results-summary {
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem;
  background: var(--ion-color-light);
  border-radius: 6px;
  margin-bottom: 0.75rem;
}

.result-item {
  flex: 1;
  text-align: center;
}

.result-label {
  display: block;
  font-size: 0.65rem;
  color: var(--ion-color-medium);
  text-transform: uppercase;
  margin-bottom: 0.25rem;
}

.result-value {
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
}

.result-item.positive .result-value {
  color: var(--ion-color-success);
}

.result-item.negative .result-value {
  color: var(--ion-color-danger);
}

.replay-test-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

/* Status badges for replay */
.status-badge.pending { background: rgba(var(--ion-color-medium-rgb, 120, 113, 108), 0.2); color: var(--ion-color-medium-tint, #a8a29e); }
.status-badge.snapshot_created { background: rgba(var(--ion-color-primary-rgb, 139, 90, 60), 0.2); color: var(--ion-color-primary-tint, #a16c4a); }
.status-badge.restored { background: rgba(var(--ion-color-secondary-rgb, 21, 128, 61), 0.2); color: var(--ion-color-secondary-tint, #22c55e); }

/* =============================================================================
   ROLLBACK DEPTH OPTIONS - Selectable cards for depth choice
   ============================================================================= */

.rollback-depth-options {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.depth-option {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1rem;
  background: var(--dark-bg-primary, #1a1a1a);
  border: 2px solid var(--dark-border-subtle, #374151);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.depth-option:hover {
  border-color: var(--ion-color-tertiary-tint, #eab308);
  background: rgba(var(--ion-color-tertiary-rgb, 202, 138, 4), 0.05);
}

.depth-option.selected {
  border-color: var(--ion-color-tertiary, #ca8a04);
  background: rgba(var(--ion-color-tertiary-rgb, 202, 138, 4), 0.1);
}

.depth-option input[type="radio"] {
  width: 20px;
  height: 20px;
  margin-top: 2px;
  accent-color: var(--ion-color-tertiary, #ca8a04);
  cursor: pointer;
  flex-shrink: 0;
}

.depth-content {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
}

.depth-content strong {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--dark-text-primary, #f7fafc);
}

.depth-content span {
  font-size: 0.8125rem;
  color: var(--dark-text-muted, #a0aec0);
  line-height: 1.4;
}

/* =============================================================================
   FORM HINTS & HELPER TEXT
   ============================================================================= */

.form-hint {
  display: block;
  margin-top: 0.5rem;
  font-size: 0.8125rem;
  color: var(--dark-text-muted, #a0aec0);
  line-height: 1.4;
}

/* =============================================================================
   PREVIEW RESULTS - Impact preview display
   ============================================================================= */

.preview-results {
  margin-top: 1rem;
  padding: 1rem;
  background: var(--dark-bg-primary, #1a1a1a);
  border-radius: 10px;
  border: 1px solid var(--dark-border-subtle, #374151);
}

.preview-summary {
  margin-bottom: 0.75rem;
  font-size: 0.9375rem;
  color: var(--dark-text-secondary, #e2e8f0);
}

.preview-summary strong {
  color: var(--ion-color-tertiary-tint, #eab308);
  font-weight: 700;
}

.preview-by-table {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.preview-table-item {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem;
  background: var(--dark-bg-quaternary, #374151);
  border: 1px solid var(--dark-border-subtle, #374151);
  border-radius: 6px;
  font-size: 0.8125rem;
}

.table-name {
  font-weight: 500;
  color: var(--dark-text-secondary, #e2e8f0);
}

.table-count {
  color: var(--dark-text-muted, #a0aec0);
}

/* =============================================================================
   RESULTS SUMMARY GRID - Modal results display
   ============================================================================= */

.results-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.summary-card {
  padding: 1rem;
  background: var(--dark-bg-primary, #1a1a1a);
  border: 1px solid var(--dark-border-subtle, #374151);
  border-radius: 10px;
  text-align: center;
}

.summary-card.highlight {
  background: rgba(var(--ion-color-tertiary-rgb, 202, 138, 4), 0.1);
  border-color: rgba(var(--ion-color-tertiary-rgb, 202, 138, 4), 0.3);
}

.summary-card.positive {
  background: rgba(var(--ion-color-success-rgb, 34, 197, 94), 0.1);
  border-color: rgba(var(--ion-color-success-rgb, 34, 197, 94), 0.3);
}

.summary-card.negative {
  background: rgba(var(--ion-color-danger-rgb, 235, 68, 90), 0.1);
  border-color: rgba(var(--ion-color-danger-rgb, 235, 68, 90), 0.3);
}

.summary-label {
  display: block;
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--dark-text-muted, #a0aec0);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
}

.summary-value {
  display: block;
  font-size: 1.375rem;
  font-weight: 700;
  color: var(--dark-text-primary, #f7fafc);
}

.summary-card.positive .summary-value {
  color: var(--ion-color-success, #22c55e);
}

.summary-card.negative .summary-value {
  color: var(--ion-color-danger, #eb445a);
}

.summary-card.highlight .summary-value {
  color: var(--ion-color-tertiary-tint, #eab308);
}

/* =============================================================================
   RESULTS TABLE - Detailed comparison table
   ============================================================================= */

.results-table-container {
  overflow-x: auto;
}

.results-table-container h4 {
  margin: 0 0 1rem 0;
  font-size: 1rem;
  color: var(--dark-text-primary, #f7fafc);
}

.results-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.results-table th,
.results-table td {
  padding: 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--dark-border-subtle, #374151);
}

.results-table th {
  background: var(--dark-bg-secondary, #1f2937);
  color: var(--dark-text-muted, #a0aec0);
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.results-table td {
  color: var(--dark-text-secondary, #e2e8f0);
}

.results-table tbody tr:hover {
  background: var(--dark-bg-quaternary, #374151);
}

/* Direction badges */
.direction-badge {
  display: inline-block;
  padding: 0.25rem 0.625rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}

.direction-badge.up,
.direction-badge.long {
  background: rgba(var(--ion-color-success-rgb, 34, 197, 94), 0.15);
  color: var(--ion-color-success-tint, #4ade80);
}

.direction-badge.down,
.direction-badge.short {
  background: rgba(var(--ion-color-danger-rgb, 235, 68, 90), 0.15);
  color: var(--ion-color-danger-tint, #ed576b);
}

.direction-badge.neutral {
  background: rgba(var(--ion-color-medium-rgb, 120, 113, 108), 0.15);
  color: var(--ion-color-medium-tint, #a8a29e);
}

/* Correctness indicators */
.correct {
  color: var(--ion-color-success, #22c55e);
  font-weight: 600;
}

.incorrect {
  color: var(--ion-color-danger, #eb445a);
  font-weight: 600;
}

.improved {
  color: var(--ion-color-success, #22c55e);
}

.not-improved {
  color: var(--ion-color-danger, #eb445a);
}
</style>
