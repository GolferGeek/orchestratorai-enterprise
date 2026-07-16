<template>
  <div class="debate-round" :class="{ collapsed }">
    <div class="round-header" @click="collapsed = !collapsed">
      <div class="round-title">
        <ion-icon :icon="collapsed ? chevronForward : chevronDown" />
        <strong>Round {{ round.round }}</strong>
        <ion-badge v-if="highestSeverity >= 8" color="danger">
          Critical
        </ion-badge>
        <ion-badge v-else-if="highestSeverity >= 5" color="warning">
          Moderate
        </ion-badge>
        <ion-badge v-else color="success">Low</ion-badge>
      </div>
      <span class="round-meta">
        {{ round.blueTeamArguments.defenses.length }} defenses /
        {{ round.redTeamAttacks.attacks.length }} attacks
      </span>
    </div>

    <div v-if="!collapsed" class="round-body">
      <div class="teams-grid">
        <div class="team-column blue-team">
          <div class="team-label">
            <ion-icon :icon="shieldOutline" />
            Blue Team (Defense)
          </div>
          <div
            v-for="defense in round.blueTeamArguments.defenses"
            :key="defense.targetId + defense.agentRole"
            class="team-entry"
          >
            <div class="entry-role">{{ formatRole(defense.agentRole) }}</div>
            <div class="entry-target">Target: {{ defense.targetId }}</div>
            <div class="entry-content">{{ defense.defense }}</div>
            <div v-if="defense.confidence" class="entry-confidence">
              Confidence: {{ Math.round(defense.confidence * 100) }}%
            </div>
          </div>
          <div
            v-if="round.blueTeamArguments.defenses.length === 0"
            class="empty-team"
          >
            No defenses this round
          </div>
        </div>

        <div class="team-column red-team">
          <div class="team-label">
            <ion-icon :icon="flashOutline" />
            Red Team (Attack)
          </div>
          <div
            v-for="attack in round.redTeamAttacks.attacks"
            :key="attack.id"
            class="team-entry"
            :class="severityClass(attack.severity)"
          >
            <div class="entry-header">
              <span class="entry-role">{{
                formatRole(attack.agentRole)
              }}</span>
              <span class="severity-tag" :class="severityClass(attack.severity)">
                {{ attack.severity }}/10
              </span>
            </div>
            <div class="entry-target">Target: {{ attack.targetId }}</div>
            <div class="entry-content">{{ attack.attack }}</div>
            <div
              v-if="attack.strippedCitations && attack.strippedCitations.length"
              class="stripped-warning"
            >
              <ion-icon :icon="warningOutline" />
              {{ attack.strippedCitations.length }} citation(s) removed
              (unverified)
            </div>
          </div>
          <div
            v-if="round.redTeamAttacks.attacks.length === 0"
            class="empty-team"
          >
            No attacks this round
          </div>
        </div>
      </div>

      <div v-if="round.judgeScoring" class="judge-section">
        <div class="judge-label">
          <ion-icon :icon="scaleOutline" />
          Judge Assessment
          <span class="position-note">
            ({{ round.judgeScoring.positionOrder === 'blue-first' ? 'Blue presented first' : 'Red presented first' }})
          </span>
        </div>
        <div class="judge-summary">{{ round.judgeScoring.roundSummary }}</div>
        <div class="exchanges">
          <div
            v-for="ex in round.judgeScoring.exchanges"
            :key="ex.argumentId"
            class="exchange-row"
          >
            <div class="exchange-id">{{ ex.argumentId }}</div>
            <div class="exchange-scores">
              <div class="score-pair">
                <span class="score-label blue">Blue</span>
                <span class="score-values">
                  L:{{ ex.blueScore.legalSoundness }}
                  F:{{ ex.blueScore.factualSupport }}
                  C:{{ ex.blueScore.citationQuality }}
                  P:{{ ex.blueScore.persuasiveness }}
                </span>
              </div>
              <div class="score-pair">
                <span class="score-label red">Red</span>
                <span class="score-values">
                  L:{{ ex.redScore.legalSoundness }}
                  F:{{ ex.redScore.factualSupport }}
                  C:{{ ex.redScore.citationQuality }}
                  P:{{ ex.redScore.persuasiveness }}
                </span>
              </div>
            </div>
            <div class="exchange-severity">
              <span
                class="severity-tag"
                :class="severityClass(ex.overallSeverity)"
              >
                Severity: {{ ex.overallSeverity }}/10
              </span>
            </div>
            <div class="exchange-assessment">{{ ex.assessment }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { IonIcon, IonBadge } from '@ionic/vue';
import {
  chevronForward,
  chevronDown,
  shieldOutline,
  flashOutline,
  scaleOutline,
  warningOutline,
} from 'ionicons/icons';

interface DefenseEntry {
  agentRole: string;
  targetId: string;
  defense: string;
  confidence?: number;
  supportingAuthority?: string[];
}

interface AttackEntry {
  id: string;
  agentRole: string;
  targetId: string;
  attack: string;
  severity: number;
  category: string;
  counterAuthority?: string[];
  strippedCitations?: string[];
}

interface RubricScore {
  legalSoundness: number;
  factualSupport: number;
  citationQuality: number;
  persuasiveness: number;
}

interface ArgumentExchangeScore {
  argumentId: string;
  blueScore: RubricScore;
  redScore: RubricScore;
  overallSeverity: number;
  assessment: string;
}

interface JudgeScoring {
  round: number;
  exchanges: ArgumentExchangeScore[];
  roundSummary: string;
  highestSeverity: number;
  positionOrder: 'blue-first' | 'red-first';
}

interface DebateRound {
  round: number;
  blueTeamArguments: { defenses: DefenseEntry[]; summary: string };
  redTeamAttacks: { attacks: AttackEntry[]; summary: string };
  judgeScoring?: JudgeScoring;
}

const props = defineProps<{
  round: DebateRound;
  initialCollapsed?: boolean;
}>();

const collapsed = ref(props.initialCollapsed ?? false);

const highestSeverity = computed(() => {
  if (props.round.judgeScoring) {
    return props.round.judgeScoring.highestSeverity;
  }
  const attacks = props.round.redTeamAttacks.attacks;
  return attacks.length > 0 ? Math.max(...attacks.map((a) => a.severity)) : 0;
});

function severityClass(severity: number): string {
  if (severity >= 8) return 'severity-critical';
  if (severity >= 5) return 'severity-moderate';
  return 'severity-low';
}

function formatRole(role: string): string {
  return role
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
</script>

<style scoped>
.debate-round {
  border: 1px solid var(--ion-color-step-200);
  border-radius: 8px;
  margin-bottom: 12px;
  overflow: hidden;
}

.round-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  cursor: pointer;
  background: var(--ion-color-step-50);
}

.round-header:hover {
  background: var(--ion-color-step-100);
}

.round-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.round-meta {
  font-size: 12px;
  color: var(--ion-color-medium);
}

.round-body {
  padding: 14px;
}

.teams-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-bottom: 14px;
}

.team-column {
  border: 1px solid var(--ion-color-step-150);
  border-radius: 6px;
  padding: 10px;
}

.blue-team {
  border-left: 3px solid var(--ion-color-primary);
}

.red-team {
  border-left: 3px solid var(--ion-color-danger);
}

.team-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 10px;
  color: var(--ion-text-color);
}

.team-entry {
  padding: 8px 10px;
  margin-bottom: 8px;
  border-radius: 4px;
  background: var(--ion-color-step-50);
  font-size: 13px;
}

.team-entry.severity-critical {
  border-left: 3px solid var(--ion-color-danger);
}

.team-entry.severity-moderate {
  border-left: 3px solid var(--ion-color-warning);
}

.entry-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.entry-role {
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  color: var(--ion-color-medium);
  margin-bottom: 2px;
}

.entry-target {
  font-size: 11px;
  color: var(--ion-color-medium);
  margin-bottom: 4px;
}

.entry-content {
  line-height: 1.5;
}

.entry-confidence {
  font-size: 11px;
  color: var(--ion-color-medium);
  margin-top: 4px;
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

.stripped-warning {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--ion-color-warning);
}

.empty-team {
  color: var(--ion-color-medium);
  font-size: 13px;
  padding: 8px;
}

.judge-section {
  border-top: 1px solid var(--ion-color-step-200);
  padding-top: 12px;
}

.judge-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 8px;
}

.position-note {
  font-weight: 400;
  font-size: 11px;
  color: var(--ion-color-medium);
}

.judge-summary {
  font-size: 13px;
  margin-bottom: 10px;
  line-height: 1.5;
}

.exchange-row {
  padding: 8px 10px;
  margin-bottom: 6px;
  border-radius: 4px;
  background: var(--ion-color-step-50);
  font-size: 12px;
}

.exchange-id {
  font-weight: 600;
  margin-bottom: 4px;
}

.exchange-scores {
  display: flex;
  gap: 16px;
  margin-bottom: 4px;
}

.score-pair {
  display: flex;
  align-items: center;
  gap: 6px;
}

.score-label {
  font-weight: 600;
  font-size: 11px;
  padding: 1px 4px;
  border-radius: 3px;
}

.score-label.blue {
  background: var(--ion-color-primary);
  color: #fff;
}

.score-label.red {
  background: var(--ion-color-danger);
  color: #fff;
}

.score-values {
  font-family: monospace;
  font-size: 11px;
}

.exchange-severity {
  margin: 4px 0;
}

.exchange-assessment {
  font-size: 12px;
  line-height: 1.4;
  color: var(--ion-text-color);
}
</style>
