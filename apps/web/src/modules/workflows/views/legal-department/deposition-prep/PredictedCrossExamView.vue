<template>
  <div class="predicted-cross-exam-view">
    <div v-if="!questions || questions.length === 0" class="empty-state">
      No predicted cross-examination questions available.
    </div>

    <template v-else>
      <div class="cx-header">
        <div class="cx-summary">
          <span class="question-count">{{ questions.length }} predicted questions</span>
          <span
            v-for="cat in categoryOrder"
            :key="cat"
            class="category-count"
            :class="`cat-${cat}`"
          >
            {{ categoryCounts[cat] ?? 0 }} {{ categoryLabel(cat) }}
          </span>
        </div>
      </div>

      <div v-for="cat in categoryOrder" :key="cat" class="category-section">
        <div v-if="byCategory[cat]?.length" class="category-header" :class="`cat-${cat}`">
          <span class="category-icon">{{ categoryIcon(cat) }}</span>
          <h3>{{ categoryLabel(cat) }}</h3>
          <span class="category-badge">{{ byCategory[cat]?.length }}</span>
        </div>

        <div
          v-for="(q, index) in byCategory[cat]"
          :key="`${cat}-${index}`"
          class="question-card"
          :class="`cat-${cat}`"
        >
          <div class="question-header" @click="toggleExpanded(cat, index)">
            <div class="question-text">{{ q.question }}</div>
            <ion-icon
              :icon="isExpanded(cat, index) ? chevronUpOutline : chevronDownOutline"
              class="expand-icon"
            />
          </div>

          <div v-if="isExpanded(cat, index)" class="question-detail">
            <div v-if="q.expectedFollowup" class="followup-section">
              <div class="detail-label">Expected Follow-up If Evasive</div>
              <div class="followup-text">{{ q.expectedFollowup }}</div>
            </div>

            <div v-if="coaching && coaching[globalIndex(cat, index)]" class="coaching-section">
              <div class="detail-label">Answer Framework</div>
              <div class="framework-text">
                {{ coaching[globalIndex(cat, index)]?.answerFramework }}
              </div>

              <div
                v-if="coaching[globalIndex(cat, index)]?.dangerZones?.length"
                class="danger-zones"
              >
                <div class="detail-label danger">Danger Zones</div>
                <ul>
                  <li
                    v-for="(dz, di) in coaching[globalIndex(cat, index)]?.dangerZones"
                    :key="di"
                  >
                    {{ dz }}
                  </li>
                </ul>
              </div>

              <div class="recall-assessment">
                <div class="detail-label">"I Don't Recall" Assessment</div>
                <span
                  class="recall-badge"
                  :class="`recall-${coaching[globalIndex(cat, index)]?.dontRecallAssessment}`"
                >
                  {{ coaching[globalIndex(cat, index)]?.dontRecallAssessment }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="opposingPerspective" class="opposing-perspective-section">
        <h3>Opposing Counsel Strategy</h3>

        <div v-if="opposingPerspective.depositionGoals?.length" class="perspective-block">
          <div class="detail-label">Deposition Goals</div>
          <ul>
            <li v-for="(goal, i) in opposingPerspective.depositionGoals" :key="i">{{ goal }}</li>
          </ul>
        </div>

        <div v-if="opposingPerspective.witnessVulnerabilities?.length" class="perspective-block">
          <div class="detail-label">Witness Vulnerabilities (Priority Order)</div>
          <ol>
            <li
              v-for="(vuln, i) in opposingPerspective.witnessVulnerabilities"
              :key="i"
              class="vulnerability"
            >
              {{ vuln }}
            </li>
          </ol>
        </div>

        <div v-if="opposingPerspective.availableDocuments?.length" class="perspective-block">
          <div class="detail-label">Documents Opposing Counsel Has</div>
          <ul>
            <li v-for="(doc, i) in opposingPerspective.availableDocuments" :key="i">{{ doc }}</li>
          </ul>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { IonIcon } from '@ionic/vue';
import { chevronDownOutline, chevronUpOutline } from 'ionicons/icons';

interface PredictedQuestion {
  category: 'opening' | 'core-substance' | 'confrontation' | 'trap';
  question: string;
  expectedFollowup?: string;
}

interface AnswerCoachingEntry {
  answerFramework: string;
  dangerZones: string[];
  followupHandling: string;
  dontRecallAssessment: 'safe' | 'dangerous' | 'context-dependent';
}

interface OpposingPerspective {
  depositionGoals: string[];
  availableDocuments: string[];
  witnessVulnerabilities: string[];
}

const props = defineProps<{
  questions: PredictedQuestion[];
  coaching?: Record<number, AnswerCoachingEntry>;
  opposingPerspective?: OpposingPerspective;
}>();

const categoryOrder: PredictedQuestion['category'][] = [
  'opening',
  'core-substance',
  'confrontation',
  'trap',
];

const byCategory = computed(() => {
  const map: Record<string, PredictedQuestion[]> = {};
  for (const cat of categoryOrder) {
    map[cat] = props.questions.filter((q) => q.category === cat);
  }
  return map;
});

const categoryCounts = computed(() => {
  const counts: Record<string, number> = {};
  for (const cat of categoryOrder) {
    counts[cat] = byCategory.value[cat]?.length ?? 0;
  }
  return counts;
});

// Maps (category, localIndex) → global index in props.questions
function globalIndex(cat: string, localIdx: number): number {
  let offset = 0;
  for (const c of categoryOrder) {
    if (c === cat) return offset + localIdx;
    offset += byCategory.value[c]?.length ?? 0;
  }
  return localIdx;
}

function categoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    opening: 'Opening',
    'core-substance': 'Core Substance',
    confrontation: 'Confrontation',
    trap: 'Trap',
  };
  return labels[cat] ?? cat;
}

function categoryIcon(cat: string): string {
  const icons: Record<string, string> = {
    opening: '🤝',
    'core-substance': '⚖️',
    confrontation: '📄',
    trap: '🪤',
  };
  return icons[cat] ?? '❓';
}

const expanded = ref<Set<string>>(new Set());

function expandKey(cat: string, idx: number): string {
  return `${cat}:${idx}`;
}

function isExpanded(cat: string, idx: number): boolean {
  return expanded.value.has(expandKey(cat, idx));
}

function toggleExpanded(cat: string, idx: number): void {
  const key = expandKey(cat, idx);
  if (expanded.value.has(key)) {
    expanded.value.delete(key);
  } else {
    expanded.value.add(key);
  }
  expanded.value = new Set(expanded.value);
}
</script>

<style scoped>
.predicted-cross-exam-view {
  padding: 16px;
}

.empty-state {
  color: var(--ion-color-medium);
  text-align: center;
  padding: 40px;
}

.cx-header {
  margin-bottom: 20px;
}

.cx-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.question-count {
  font-weight: 600;
  color: var(--ion-color-light);
  margin-right: 8px;
}

.category-count {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.1);
}

.category-section {
  margin-bottom: 24px;
}

.category-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 8px 12px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
}

.category-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  flex: 1;
}

.category-badge {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  padding: 1px 8px;
  font-size: 12px;
}

.cat-opening .category-header { border-left: 3px solid var(--ion-color-tertiary); }
.cat-core-substance .category-header { border-left: 3px solid var(--ion-color-primary); }
.cat-confrontation .category-header { border-left: 3px solid var(--ion-color-warning); }
.cat-trap .category-header { border-left: 3px solid var(--ion-color-danger); }

.question-card {
  margin-bottom: 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.question-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  user-select: none;
}

.question-header:hover {
  background: rgba(255, 255, 255, 0.04);
}

.question-text {
  flex: 1;
  font-size: 14px;
  line-height: 1.5;
  color: var(--ion-color-light);
}

.expand-icon {
  color: var(--ion-color-medium);
  flex-shrink: 0;
  margin-top: 2px;
}

.question-detail {
  padding: 0 16px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.followup-section,
.coaching-section,
.danger-zones,
.recall-assessment {
  margin-top: 12px;
}

.detail-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--ion-color-medium);
  margin-bottom: 4px;
}

.detail-label.danger {
  color: var(--ion-color-danger);
}

.followup-text,
.framework-text {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.75);
  line-height: 1.5;
}

.danger-zones ul,
.perspective-block ul,
.perspective-block ol {
  margin: 4px 0;
  padding-left: 20px;
}

.danger-zones li {
  font-size: 13px;
  color: var(--ion-color-danger-shade);
  margin-bottom: 4px;
}

.recall-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
}

.recall-safe { background: rgba(45, 211, 111, 0.2); color: var(--ion-color-success); }
.recall-dangerous { background: rgba(235, 68, 90, 0.2); color: var(--ion-color-danger); }
.recall-context-dependent { background: rgba(255, 196, 9, 0.2); color: var(--ion-color-warning); }

.opposing-perspective-section {
  margin-top: 32px;
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
}

.opposing-perspective-section h3 {
  margin: 0 0 16px;
  font-size: 14px;
  font-weight: 600;
  color: var(--ion-color-warning);
}

.perspective-block {
  margin-bottom: 16px;
}

.perspective-block li {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.75);
  margin-bottom: 4px;
}

.vulnerability {
  color: rgba(235, 68, 90, 0.85) !important;
}
</style>
