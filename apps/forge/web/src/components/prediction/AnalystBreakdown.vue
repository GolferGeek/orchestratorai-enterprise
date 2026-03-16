<template>
  <div class="analyst-breakdown">
    <h3 class="section-title">
      Analyst Assessments
      <span class="count">({{ assessments.length }})</span>
    </h3>
    <div v-if="assessments.length === 0" class="empty-message">
      No analyst assessments available.
    </div>
    <div v-else class="assessments-grid">
      <div
        v-for="assessment in groupedAssessments"
        :key="assessment.analystSlug + assessment.tier"
        class="assessment-card"
        :class="assessment.direction"
      >
        <div class="card-header">
          <div class="analyst-info">
            <span class="analyst-name">{{ assessment.analystName }}</span>
            <span class="tier-badge" :class="assessment.tier">
              {{ assessment.tier.toUpperCase() }}
            </span>
          </div>
          <div class="direction-confidence">
            <span class="direction" :class="assessment.direction">
              {{ assessment.direction.toUpperCase() }}
            </span>
            <span class="confidence">
              {{ Math.round(assessment.confidence * 100) }}%
            </span>
          </div>
        </div>
        <p class="reasoning">{{ assessment.reasoning }}</p>
      </div>
    </div>

    <!-- Summary by Tier -->
    <div v-if="assessments.length > 0" class="tier-summary">
      <h4>Summary by Tier</h4>
      <div class="tier-rows">
        <div v-for="tier in ['gold', 'silver', 'bronze']" :key="tier" class="tier-row">
          <span class="tier-label" :class="tier">{{ tier.toUpperCase() }}</span>
          <div class="tier-votes">
            <span
              v-for="(count, direction) in getVotesByTier(tier)"
              :key="direction"
              class="vote-chip"
              :class="direction"
            >
              {{ direction }}: {{ count }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Assessment {
  analystSlug: string;
  analystName: string;
  tier: 'gold' | 'silver' | 'bronze';
  direction: string;
  confidence: number;
  reasoning: string;
}

interface Props {
  assessments: Assessment[];
}

const props = defineProps<Props>();

const groupedAssessments = computed(() => {
  // Sort by tier (gold first) then by confidence
  return [...props.assessments].sort((a, b) => {
    const tierOrder = { gold: 0, silver: 1, bronze: 2 };
    if (tierOrder[a.tier] !== tierOrder[b.tier]) {
      return tierOrder[a.tier] - tierOrder[b.tier];
    }
    return b.confidence - a.confidence;
  });
});

function getVotesByTier(tier: string): Record<string, number> {
  const votes: Record<string, number> = {};
  for (const assessment of props.assessments) {
    if (assessment.tier === tier) {
      votes[assessment.direction] = (votes[assessment.direction] || 0) + 1;
    }
  }
  return votes;
}
</script>

<style scoped>
.analyst-breakdown {
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

.empty-message {
  color: var(--text-secondary, #6b7280);
  font-size: 0.875rem;
  font-style: italic;
}

.assessments-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 0.75rem;
}

.assessment-card {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  padding: 0.75rem;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.5rem;
}

.analyst-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.analyst-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.tier-badge {
  font-size: 0.625rem;
  font-weight: 600;
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
  width: fit-content;
}

.tier-badge.gold {
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.2), rgba(184, 134, 11, 0.2));
  color: #b8860b;
}

.tier-badge.silver {
  background: linear-gradient(135deg, rgba(192, 192, 192, 0.2), rgba(128, 128, 128, 0.2));
  color: #6b7280;
}

.tier-badge.bronze {
  background: linear-gradient(135deg, rgba(205, 127, 50, 0.2), rgba(139, 69, 19, 0.2));
  color: #8b4513;
}

.direction-confidence {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.125rem;
}

.direction {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
}

.direction.up,
.direction.bullish {
  background-color: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

.direction.down,
.direction.bearish {
  background-color: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.direction.flat,
.direction.neutral {
  background-color: rgba(107, 114, 128, 0.1);
  color: #6b7280;
}

.confidence {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

.reasoning {
  font-size: 0.8125rem;
  color: var(--text-primary, #111827);
  margin: 0;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tier-summary {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color, #e5e7eb);
}

.tier-summary h4 {
  font-size: 0.875rem;
  font-weight: 600;
  margin: 0 0 0.75rem 0;
  color: var(--text-primary, #111827);
}

.tier-rows {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.tier-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.tier-label {
  font-size: 0.625rem;
  font-weight: 600;
  width: 50px;
  text-align: center;
  padding: 0.125rem 0;
  border-radius: 3px;
}

.tier-label.gold {
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.2), rgba(184, 134, 11, 0.2));
  color: #b8860b;
}

.tier-label.silver {
  background: linear-gradient(135deg, rgba(192, 192, 192, 0.2), rgba(128, 128, 128, 0.2));
  color: #6b7280;
}

.tier-label.bronze {
  background: linear-gradient(135deg, rgba(205, 127, 50, 0.2), rgba(139, 69, 19, 0.2));
  color: #8b4513;
}

.tier-votes {
  display: flex;
  gap: 0.5rem;
}

.vote-chip {
  font-size: 0.75rem;
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
}

.vote-chip.up,
.vote-chip.bullish {
  background-color: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

.vote-chip.down,
.vote-chip.bearish {
  background-color: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.vote-chip.flat,
.vote-chip.neutral {
  background-color: rgba(107, 114, 128, 0.1);
  color: #6b7280;
}

html.ion-palette-dark .analyst-breakdown,
html[data-theme="dark"] .analyst-breakdown {
  --card-bg: #1f2937;
  --border-color: #374151;
  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
}
</style>
