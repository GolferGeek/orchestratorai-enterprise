<template>
  <div class="stress-test-report">
    <div v-if="!report" class="empty-state">
      No stress-test report available.
    </div>

    <template v-else>
      <!-- Summary -->
      <div class="report-summary">
        <div class="summary-row">
          <div class="summary-stat">
            <div class="stat-value">{{ report.summary.overallStrength }}/10</div>
            <div class="stat-label">Overall Strength</div>
          </div>
          <div class="summary-stat">
            <div class="stat-value">{{ report.summary.totalRounds }}</div>
            <div class="stat-label">Debate Rounds</div>
          </div>
          <div class="summary-stat critical">
            <div class="stat-value">{{ report.summary.criticalWeaknesses }}</div>
            <div class="stat-label">Critical</div>
          </div>
          <div class="summary-stat moderate">
            <div class="stat-value">{{ report.summary.moderateWeaknesses }}</div>
            <div class="stat-label">Moderate</div>
          </div>
          <div class="summary-stat minor">
            <div class="stat-value">{{ report.summary.minorWeaknesses }}</div>
            <div class="stat-label">Minor</div>
          </div>
        </div>
        <div class="convergence-reason">{{ report.summary.convergenceReason }}</div>
      </div>

      <!-- Ranked Attacks -->
      <div v-if="report.attacks.length > 0" class="report-section">
        <h3>Ranked Attacks</h3>
        <div
          v-for="attack in report.attacks"
          :key="attack.id"
          class="attack-card"
          :class="[severityClass(attack.severity), decisionClass(attack.id)]"
        >
          <div class="attack-header">
            <div class="attack-info">
              <span class="severity-tag" :class="severityClass(attack.severity)">
                {{ attack.severity }}/10
              </span>
              <span class="attack-category">{{ attack.category }}</span>
              <span class="attack-section">{{ attack.briefSection }}</span>
            </div>
            <div v-if="interactive" class="attack-actions">
              <ion-button
                size="small"
                :fill="decisions[attack.id] === 'accept' ? 'solid' : 'outline'"
                color="success"
                @click="setDecision(attack.id, 'accept')"
              >
                Accept
              </ion-button>
              <ion-button
                size="small"
                :fill="decisions[attack.id] === 'reject' ? 'solid' : 'outline'"
                color="danger"
                @click="setDecision(attack.id, 'reject')"
              >
                Reject
              </ion-button>
            </div>
          </div>

          <div class="attack-description">{{ attack.description }}</div>

          <div class="attack-details">
            <div class="detail-row">
              <span class="detail-label">Red Team:</span>
              <span>{{ attack.redTeamReasoning }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Blue Team:</span>
              <span>{{ attack.blueTeamRebuttal }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Judge:</span>
              <span>{{ attack.judgeAssessment }}</span>
            </div>
            <div class="detail-row recommendation">
              <span class="detail-label">Recommendation:</span>
              <span>{{ attack.recommendation }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Weak Citations -->
      <div v-if="report.weakCitations.length > 0" class="report-section">
        <h3>Weak Citations</h3>
        <div
          v-for="cite in report.weakCitations"
          :key="cite.id"
          class="citation-card"
        >
          <div class="citation-original">{{ cite.originalCitation }}</div>
          <div class="citation-weakness">{{ cite.weakness }}</div>
          <div v-if="cite.suggestedReplacement" class="citation-replacement">
            Suggested: {{ cite.suggestedReplacement }}
          </div>
        </div>
      </div>

      <!-- Factual Gaps -->
      <div v-if="report.factualGaps.length > 0" class="report-section">
        <h3>Factual Gaps</h3>
        <div
          v-for="gap in report.factualGaps"
          :key="gap.id"
          class="gap-card"
        >
          <div class="gap-assertion">{{ gap.assertion }}</div>
          <div class="gap-description">{{ gap.gap }}</div>
          <div class="gap-evidence">Evidence needed: {{ gap.suggestedEvidence }}</div>
        </div>
      </div>

      <!-- Action Buttons (interactive mode) -->
      <div v-if="interactive" class="action-bar">
        <div class="decision-summary">
          {{ acceptedCount }} accepted, {{ rejectedCount }} rejected,
          {{ undecidedCount }} undecided
        </div>
        <div class="action-buttons">
          <ion-button
            color="primary"
            :disabled="acceptedCount === 0"
            @click="$emit('fortify', acceptedIds)"
          >
            Approve &amp; Fortify ({{ acceptedCount }})
          </ion-button>
          <ion-button color="medium" @click="$emit('approve-without')">
            Approve Without Changes
          </ion-button>
          <ion-button color="warning" @click="$emit('rerun')">
            Reject &amp; Re-run
          </ion-button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed } from 'vue';
import { IonButton } from '@ionic/vue';

interface RankedAttack {
  id: string;
  severity: number;
  category: string;
  description: string;
  briefSection: string;
  redTeamReasoning: string;
  blueTeamRebuttal: string;
  judgeAssessment: string;
  recommendation: string;
}

interface WeakCitation {
  id: string;
  originalCitation: string;
  weakness: string;
  suggestedReplacement: string | null;
}

interface FactualGap {
  id: string;
  assertion: string;
  gap: string;
  suggestedEvidence: string;
}

interface StressTestReport {
  attacks: RankedAttack[];
  weakCitations: WeakCitation[];
  factualGaps: FactualGap[];
  summary: {
    totalRounds: number;
    convergenceReason: string;
    overallStrength: number;
    criticalWeaknesses: number;
    moderateWeaknesses: number;
    minorWeaknesses: number;
  };
}

const props = defineProps<{
  report: StressTestReport | null;
  interactive?: boolean;
}>();

defineEmits<{
  fortify: [acceptedIds: string[]];
  'approve-without': [];
  rerun: [];
}>();

const decisions = reactive<Record<string, 'accept' | 'reject'>>({});

function setDecision(id: string, decision: 'accept' | 'reject') {
  if (decisions[id] === decision) {
    delete decisions[id];
  } else {
    decisions[id] = decision;
  }
}

function severityClass(severity: number): string {
  if (severity >= 8) return 'severity-critical';
  if (severity >= 5) return 'severity-moderate';
  return 'severity-low';
}

function decisionClass(id: string): string {
  if (decisions[id] === 'accept') return 'decision-accepted';
  if (decisions[id] === 'reject') return 'decision-rejected';
  return '';
}

const acceptedIds = computed(() =>
  Object.entries(decisions)
    .filter(([, d]) => d === 'accept')
    .map(([id]) => id),
);

const acceptedCount = computed(() => acceptedIds.value.length);
const rejectedCount = computed(
  () => Object.values(decisions).filter((d) => d === 'reject').length,
);
const undecidedCount = computed(
  () => (props.report?.attacks.length ?? 0) - Object.keys(decisions).length,
);
</script>

<style scoped>
.stress-test-report {
  padding: 16px;
}

.empty-state {
  color: var(--ion-color-medium);
  padding: 24px;
  text-align: center;
}

.report-summary {
  padding: 16px;
  border: 1px solid var(--ion-color-step-200);
  border-radius: 8px;
  margin-bottom: 16px;
}

.summary-row {
  display: flex;
  gap: 24px;
  justify-content: center;
  margin-bottom: 12px;
}

.summary-stat {
  text-align: center;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--ion-text-color);
}

.summary-stat.critical .stat-value {
  color: var(--ion-color-danger);
}

.summary-stat.moderate .stat-value {
  color: var(--ion-color-warning);
}

.summary-stat.minor .stat-value {
  color: var(--ion-color-success);
}

.stat-label {
  font-size: 11px;
  color: var(--ion-color-medium);
  text-transform: uppercase;
}

.convergence-reason {
  text-align: center;
  font-size: 13px;
  color: var(--ion-color-medium);
}

.report-section {
  margin-bottom: 20px;
}

.report-section h3 {
  font-size: 15px;
  margin: 0 0 10px;
  color: var(--ion-text-color);
}

.attack-card {
  border: 1px solid var(--ion-color-step-200);
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 10px;
  transition: border-color 0.2s;
}

.attack-card.severity-critical {
  border-left: 4px solid var(--ion-color-danger);
}

.attack-card.severity-moderate {
  border-left: 4px solid var(--ion-color-warning);
}

.attack-card.severity-low {
  border-left: 4px solid var(--ion-color-success);
}

.attack-card.decision-accepted {
  background: color-mix(in srgb, var(--ion-color-success) 8%, transparent);
}

.attack-card.decision-rejected {
  opacity: 0.5;
}

.attack-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.attack-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.severity-tag {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
}

.severity-tag.severity-critical {
  background: var(--ion-color-danger);
}

.severity-tag.severity-moderate {
  background: var(--ion-color-warning);
}

.severity-tag.severity-low {
  background: var(--ion-color-success);
}

.attack-category {
  font-size: 11px;
  text-transform: uppercase;
  color: var(--ion-color-medium);
  font-weight: 600;
}

.attack-section {
  font-size: 12px;
  color: var(--ion-color-medium);
}

.attack-actions {
  display: flex;
  gap: 4px;
}

.attack-description {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 10px;
  line-height: 1.5;
}

.attack-details {
  font-size: 12px;
}

.detail-row {
  margin-bottom: 6px;
  line-height: 1.4;
}

.detail-label {
  font-weight: 600;
  color: var(--ion-color-medium);
  margin-right: 4px;
}

.detail-row.recommendation {
  background: var(--ion-color-step-50);
  padding: 6px 8px;
  border-radius: 4px;
  margin-top: 8px;
}

.citation-card,
.gap-card {
  border: 1px solid var(--ion-color-step-200);
  border-radius: 6px;
  padding: 10px;
  margin-bottom: 8px;
  font-size: 13px;
}

.citation-original,
.gap-assertion {
  font-weight: 600;
  margin-bottom: 4px;
}

.citation-weakness,
.gap-description {
  color: var(--ion-color-medium);
  margin-bottom: 4px;
}

.citation-replacement,
.gap-evidence {
  font-size: 12px;
  color: var(--ion-color-primary);
}

.action-bar {
  position: sticky;
  bottom: 0;
  background: var(--ion-background-color);
  border-top: 1px solid var(--ion-color-step-200);
  padding: 12px 0;
  margin-top: 16px;
}

.decision-summary {
  text-align: center;
  font-size: 12px;
  color: var(--ion-color-medium);
  margin-bottom: 8px;
}

.action-buttons {
  display: flex;
  justify-content: center;
  gap: 8px;
}
</style>
