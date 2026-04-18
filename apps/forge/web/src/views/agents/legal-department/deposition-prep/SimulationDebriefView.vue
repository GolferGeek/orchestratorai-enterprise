<template>
  <div class="simulation-debrief">
    <div class="privilege-banner">
      Attorney work product — not subject to production in discovery.
    </div>

    <div class="disclaimer">
      This simulation reflects one possible cross-examination strategy, not a guarantee of what will occur.
    </div>

    <section class="debrief-section">
      <h3>Full Transcript</h3>
      <div class="transcript-table">
        <div class="transcript-header">
          <span class="col-turn">Turn</span>
          <span class="col-qa">Question / Answer</span>
          <span class="col-scores">Scores</span>
        </div>
        <div
          v-for="entry in debrief.transcript"
          :key="entry.question.turn"
          class="transcript-row"
          :class="damageClass(entry.score.damage)"
        >
          <span class="col-turn">{{ entry.question.turn }}</span>
          <div class="col-qa">
            <p class="question-text"><strong>Q:</strong> {{ entry.question.question }}</p>
            <p class="answer-text"><strong>A:</strong> {{ entry.answer.answer }}</p>
            <span class="move-badge">{{ entry.question.move }}</span>
          </div>
          <div class="col-scores">
            <div class="score-row">
              <span class="score-label">Evasion</span>
              <span class="score-value">{{ entry.score.evasion }}/10</span>
            </div>
            <div class="score-row">
              <span class="score-label">Consistency</span>
              <span class="score-value">{{ entry.score.consistency }}/10</span>
            </div>
            <div class="score-row">
              <span class="score-label">Damage</span>
              <span class="score-value" :class="damageClass(entry.score.damage)">{{ entry.score.damage }}/10</span>
            </div>
            <p class="coaching-note-inline">{{ entry.score.coachingNote }}</p>
          </div>
        </div>
      </div>
    </section>

    <section v-if="debrief.weakestMoments.length > 0" class="debrief-section weakest-moments">
      <h3>5 Weakest Moments</h3>
      <div
        v-for="(moment, idx) in sortedWeakestMoments"
        :key="idx"
        class="weak-moment-card"
      >
        <div class="weak-moment-header">
          <span class="weak-turn">Turn {{ moment.turn }}</span>
          <span class="damage-badge" :class="damageClass(moment.damage)">Damage {{ moment.damage }}/10</span>
        </div>
        <p class="coaching-note">{{ moment.coachingNote }}</p>
      </div>
    </section>

    <section v-if="debrief.patterns.length > 0" class="debrief-section">
      <h3>Behavioral Patterns</h3>
      <ul class="patterns-list">
        <li v-for="(pattern, idx) in debrief.patterns" :key="idx">{{ pattern }}</li>
      </ul>
    </section>

    <section v-if="debrief.coachingRecommendations.length > 0" class="debrief-section">
      <h3>Coaching Recommendations</h3>
      <ol class="recommendations-list">
        <li v-for="(rec, idx) in debrief.coachingRecommendations" :key="idx">{{ rec }}</li>
      </ol>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface TurnScore {
  turn: number;
  evasion: number;
  consistency: number;
  damage: number;
  coachingNote: string;
}

interface SimulationQuestion {
  turn: number;
  question: string;
  topic: string;
  move: string;
}

interface SimulationAnswer {
  turn: number;
  answer: string;
  submittedAt: string;
}

interface SimulationDebrief {
  transcript: Array<{
    question: SimulationQuestion;
    answer: SimulationAnswer;
    score: TurnScore;
  }>;
  weakestMoments: TurnScore[];
  patterns: string[];
  coachingRecommendations: string[];
  disclaimerText: string;
}

const props = defineProps<{ debrief: SimulationDebrief }>();

const sortedWeakestMoments = computed(() =>
  [...props.debrief.weakestMoments].sort((a, b) => b.damage - a.damage),
);

function damageClass(damage: number): string {
  if (damage >= 7) return 'damage-high';
  if (damage >= 4) return 'damage-medium';
  return 'damage-low';
}
</script>

<style scoped>
.simulation-debrief {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.privilege-banner {
  background: #1a1a2e;
  color: #e0e0e0;
  padding: 0.5rem 1rem;
  border-left: 4px solid #7c3aed;
  font-size: 0.85rem;
  font-style: italic;
}

.disclaimer {
  color: #9ca3af;
  font-size: 0.85rem;
  font-style: italic;
}

.debrief-section h3 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  color: #e5e7eb;
}

.transcript-table {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.transcript-header {
  display: grid;
  grid-template-columns: 3rem 1fr 10rem;
  gap: 1rem;
  font-size: 0.75rem;
  text-transform: uppercase;
  color: #6b7280;
  padding: 0 0.5rem;
}

.transcript-row {
  display: grid;
  grid-template-columns: 3rem 1fr 10rem;
  gap: 1rem;
  padding: 0.75rem 0.5rem;
  border-radius: 0.375rem;
  border-left: 4px solid transparent;
}

.transcript-row.damage-high { border-left-color: #ef4444; background: rgba(239,68,68,0.05); }
.transcript-row.damage-medium { border-left-color: #f59e0b; background: rgba(245,158,11,0.05); }
.transcript-row.damage-low { border-left-color: #22c55e; background: rgba(34,197,94,0.05); }

.col-turn {
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  color: #9ca3af;
}

.question-text, .answer-text {
  margin: 0 0 0.25rem;
  font-size: 0.9rem;
  line-height: 1.4;
}

.move-badge {
  font-size: 0.7rem;
  background: #374151;
  color: #9ca3af;
  padding: 0.1rem 0.4rem;
  border-radius: 9999px;
}

.score-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  margin-bottom: 0.15rem;
}

.score-label { color: #9ca3af; }
.score-value.damage-high { color: #ef4444; font-weight: 600; }
.score-value.damage-medium { color: #f59e0b; font-weight: 600; }
.score-value.damage-low { color: #22c55e; }

.coaching-note-inline {
  font-size: 0.75rem;
  color: #9ca3af;
  margin-top: 0.5rem;
  font-style: italic;
}

.weakest-moments { }

.weak-moment-card {
  background: rgba(239,68,68,0.08);
  border: 1px solid rgba(239,68,68,0.2);
  border-radius: 0.375rem;
  padding: 0.75rem;
  margin-bottom: 0.5rem;
}

.weak-moment-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.weak-turn { font-weight: 600; color: #e5e7eb; }

.damage-badge {
  font-size: 0.75rem;
  padding: 0.1rem 0.5rem;
  border-radius: 9999px;
}
.damage-badge.damage-high { background: rgba(239,68,68,0.2); color: #ef4444; }
.damage-badge.damage-medium { background: rgba(245,158,11,0.2); color: #f59e0b; }
.damage-badge.damage-low { background: rgba(34,197,94,0.2); color: #22c55e; }

.coaching-note {
  font-size: 0.85rem;
  color: #d1d5db;
  margin: 0;
}

.patterns-list, .recommendations-list {
  padding-left: 1.25rem;
  color: #d1d5db;
  font-size: 0.9rem;
  line-height: 1.8;
}
</style>
