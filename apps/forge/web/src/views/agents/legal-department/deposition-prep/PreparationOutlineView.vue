<template>
  <div class="preparation-outline">
    <!-- Topics -->
    <section class="outline-section">
      <h3>Deposition Topics ({{ outline.topics.length }})</h3>
      <div v-for="(topic, tIdx) in outline.topics" :key="tIdx" class="topic-block">
        <div class="topic-header" @click="toggleTopic(tIdx)">
          <span class="topic-title">{{ topic.title }}</span>
          <span class="toggle-icon">{{ expandedTopics.has(tIdx) ? '▾' : '▸' }}</span>
        </div>

        <div v-if="expandedTopics.has(tIdx)" class="topic-body">
          <!-- Open-Ended Questions -->
          <div v-if="topic.questions.openEnded?.length" class="question-group">
            <h5 class="group-label open-ended">Open-Ended</h5>
            <div
              v-for="(q, qIdx) in topic.questions.openEnded"
              :key="`oe-${qIdx}`"
              class="question-card"
            >
              <p class="question-text">{{ q.question }}</p>
              <span class="purpose-tag">{{ q.strategicPurpose }}</span>
              <div class="expected-response-toggle" @click="toggleExpected(`oe-${tIdx}-${qIdx}`)">
                Expected response {{ expandedExpected.has(`oe-${tIdx}-${qIdx}`) ? '▾' : '▸' }}
              </div>
              <p v-if="expandedExpected.has(`oe-${tIdx}-${qIdx}`)" class="expected-text">
                {{ q.expectedWitnessResponse }}
              </p>
            </div>
          </div>

          <!-- Follow-Up Questions -->
          <div v-if="topic.questions.followUp?.length" class="question-group">
            <h5 class="group-label follow-up">Follow-Up</h5>
            <div
              v-for="(q, qIdx) in topic.questions.followUp"
              :key="`fu-${qIdx}`"
              class="question-card"
            >
              <p class="question-text">{{ q.question }}</p>
              <span class="purpose-tag">{{ q.strategicPurpose }}</span>
              <div class="expected-response-toggle" @click="toggleExpected(`fu-${tIdx}-${qIdx}`)">
                Expected response {{ expandedExpected.has(`fu-${tIdx}-${qIdx}`) ? '▾' : '▸' }}
              </div>
              <p v-if="expandedExpected.has(`fu-${tIdx}-${qIdx}`)" class="expected-text">
                {{ q.expectedWitnessResponse }}
              </p>
            </div>
          </div>

          <!-- Confrontation Questions -->
          <div v-if="topic.questions.confrontation?.length" class="question-group">
            <h5 class="group-label confrontation">Confrontation Sequences</h5>
            <div
              v-for="(q, qIdx) in topic.questions.confrontation"
              :key="`cf-${qIdx}`"
              class="question-card confrontation-card"
            >
              <p class="question-text">{{ q.question }}</p>
              <span class="purpose-tag">{{ q.strategicPurpose }}</span>
              <div class="expected-response-toggle" @click="toggleExpected(`cf-${tIdx}-${qIdx}`)">
                Expected response {{ expandedExpected.has(`cf-${tIdx}-${qIdx}`) ? '▾' : '▸' }}
              </div>
              <p v-if="expandedExpected.has(`cf-${tIdx}-${qIdx}`)" class="expected-text">
                {{ q.expectedWitnessResponse }}
              </p>
            </div>
          </div>

          <!-- Trap Questions -->
          <div v-if="topic.questions.trap?.length" class="question-group">
            <h5 class="group-label trap">Trap Sequences</h5>
            <div
              v-for="(q, qIdx) in topic.questions.trap"
              :key="`tr-${qIdx}`"
              class="question-card trap-card"
            >
              <p class="question-text">{{ q.question }}</p>
              <span class="purpose-tag">{{ q.strategicPurpose }}</span>
              <div class="expected-response-toggle" @click="toggleExpected(`tr-${tIdx}-${qIdx}`)">
                Expected response {{ expandedExpected.has(`tr-${tIdx}-${qIdx}`) ? '▾' : '▸' }}
              </div>
              <p v-if="expandedExpected.has(`tr-${tIdx}-${qIdx}`)" class="expected-text">
                {{ q.expectedWitnessResponse }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Exhibit List -->
    <section v-if="outline.exhibitList?.length" class="outline-section">
      <h3>Exhibit List ({{ outline.exhibitList.length }})</h3>
      <div v-for="(exhibit, idx) in outline.exhibitList" :key="idx" class="exhibit-card">
        <div class="exhibit-header">
          <span class="exhibit-name">{{ exhibit.name }}</span>
          <span class="exhibit-timing">Use: {{ exhibit.timing }}</span>
        </div>
        <p class="exhibit-followup">Follow-up: {{ exhibit.suggestedFollowUp }}</p>
      </div>
    </section>

    <!-- Red Flags -->
    <section v-if="outline.redFlags?.length" class="outline-section red-flags-section">
      <h3>Red Flags — Avoid These Areas</h3>
      <ul class="flags-list">
        <li v-for="(flag, idx) in outline.redFlags" :key="idx" class="flag-item">
          {{ flag }}
        </li>
      </ul>
    </section>

    <!-- Fallback Questions -->
    <section v-if="outline.fallbackQuestions?.length" class="outline-section">
      <h3>Fallback Questions</h3>
      <ol class="fallback-list">
        <li v-for="(q, idx) in outline.fallbackQuestions" :key="idx">{{ q }}</li>
      </ol>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

interface QuestionEntry {
  question: string;
  strategicPurpose: string;
  expectedWitnessResponse: string;
}

interface QuestionSet {
  themeId: string;
  openEnded: QuestionEntry[];
  followUp: QuestionEntry[];
  confrontation: QuestionEntry[];
  trap: QuestionEntry[];
}

interface PreparationOutline {
  topics: Array<{ title: string; questions: QuestionSet }>;
  exhibitList: Array<{ name: string; timing: string; suggestedFollowUp: string }>;
  redFlags: string[];
  fallbackQuestions: string[];
}

defineProps<{ outline: PreparationOutline }>();

const expandedTopics = ref(new Set<number>([0])); // first topic expanded by default
const expandedExpected = ref(new Set<string>());

function toggleTopic(idx: number): void {
  if (expandedTopics.value.has(idx)) {
    expandedTopics.value.delete(idx);
  } else {
    expandedTopics.value.add(idx);
  }
}

function toggleExpected(key: string): void {
  if (expandedExpected.value.has(key)) {
    expandedExpected.value.delete(key);
  } else {
    expandedExpected.value.add(key);
  }
}
</script>

<style scoped>
.preparation-outline {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 0.5rem;
}

.outline-section h3 {
  font-size: 0.9rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ion-color-medium);
  margin-bottom: 0.75rem;
}

.topic-block {
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 0.5rem;
  margin-bottom: 0.5rem;
  overflow: hidden;
}

.topic-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  cursor: pointer;
  background: rgba(255,255,255,0.03);
  user-select: none;
}
.topic-header:hover { background: rgba(255,255,255,0.06); }

.topic-title { font-weight: 600; font-size: 0.95rem; }
.toggle-icon { color: var(--ion-color-medium); }

.topic-body {
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.question-group h5.group-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 0.5rem;
}
.group-label.open-ended { color: #60a5fa; }
.group-label.follow-up { color: #34d399; }
.group-label.confrontation { color: #f59e0b; }
.group-label.trap { color: #f87171; }

.question-card {
  background: rgba(255,255,255,0.03);
  border-radius: 0.375rem;
  padding: 0.6rem 0.75rem;
  margin-bottom: 0.4rem;
  border-left: 3px solid rgba(255,255,255,0.1);
}
.confrontation-card { border-left-color: rgba(245,158,11,0.4); }
.trap-card { border-left-color: rgba(248,113,113,0.4); }

.question-text { margin: 0 0 0.35rem; font-size: 0.9rem; line-height: 1.5; }
.purpose-tag {
  display: inline-block;
  font-size: 0.7rem;
  background: rgba(124,58,237,0.15);
  color: #a78bfa;
  padding: 0.1rem 0.4rem;
  border-radius: 9999px;
  margin-bottom: 0.35rem;
}

.expected-response-toggle {
  font-size: 0.75rem;
  color: var(--ion-color-medium);
  cursor: pointer;
  user-select: none;
}
.expected-response-toggle:hover { color: var(--ion-color-light); }

.expected-text {
  margin: 0.35rem 0 0;
  font-size: 0.8rem;
  color: #9ca3af;
  font-style: italic;
  line-height: 1.4;
}

.exhibit-card {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 0.375rem;
  padding: 0.6rem 0.75rem;
  margin-bottom: 0.4rem;
}
.exhibit-header { display: flex; justify-content: space-between; margin-bottom: 0.25rem; }
.exhibit-name { font-weight: 600; font-size: 0.9rem; }
.exhibit-timing { font-size: 0.75rem; color: #60a5fa; }
.exhibit-followup { font-size: 0.8rem; color: #9ca3af; margin: 0; }

.red-flags-section h3 { color: #f87171; }
.flags-list { list-style: none; padding: 0; }
.flag-item {
  padding: 0.5rem 0.75rem;
  background: rgba(248,113,113,0.08);
  border-left: 3px solid rgba(248,113,113,0.4);
  border-radius: 0.25rem;
  margin-bottom: 0.35rem;
  font-size: 0.875rem;
  color: #fca5a5;
}

.fallback-list { padding-left: 1.25rem; color: #d1d5db; font-size: 0.875rem; line-height: 2; }
</style>
