<template>
  <div class="simulation-view">
    <!-- Setup state: no active simulation -->
    <div v-if="!activeJob && !setupModalOpen" class="setup-state">
      <div class="setup-card">
        <h3>Cross-Examination Simulator</h3>
        <p class="setup-description">
          Practice responding to tough cross-examination questions with an AI opposing counsel that
          adapts to your answers in real time.
        </p>
        <ion-button @click="setupModalOpen = true" expand="block">Start Simulation</ion-button>
      </div>
    </div>

    <!-- Setup modal (inline) -->
    <div v-if="setupModalOpen" class="setup-modal-overlay">
      <div class="setup-modal">
        <h3>Configure Simulation</h3>

        <div class="form-field">
          <label>Max Questions: {{ maxQuestions }}</label>
          <input
            type="range"
            min="5"
            max="50"
            :value="maxQuestions"
            @input="maxQuestions = Number(($event.target as HTMLInputElement).value)"
            class="range-input"
          />
          <div class="range-labels"><span>5</span><span>50</span></div>
        </div>

        <div class="form-field">
          <label>Simulation Focus (optional)</label>
          <textarea
            v-model="simulationFocus"
            placeholder="e.g., Focus on timeline inconsistencies..."
            rows="2"
            class="textarea-input"
          />
        </div>

        <div class="privilege-notice">
          These materials constitute attorney work product privileged under applicable law
          and are not subject to production in discovery.
        </div>

        <div class="modal-actions">
          <ion-button fill="outline" @click="setupModalOpen = false">Cancel</ion-button>
          <ion-button @click="beginSimulation" :disabled="starting">
            <ion-spinner v-if="starting" name="crescent" style="margin-right:6px" />
            Begin Simulation
          </ion-button>
        </div>
      </div>
    </div>

    <!-- Active simulation -->
    <div v-if="activeJob" class="active-simulation">
      <!-- Processing state -->
      <div v-if="activeJob.status === 'processing' || activeJob.status === 'queued'" class="processing-state">
        <ion-spinner />
        <p>Opposing counsel is preparing...</p>
      </div>

      <!-- Awaiting answer state -->
      <div v-else-if="activeJob.status === 'awaiting_answer'" class="question-panel">
        <div class="question-card">
          <div class="question-label">Opposing Counsel Asks:</div>
          <p class="question-text">{{ currentQuestion?.question }}</p>
          <div v-if="currentQuestion?.topic" class="topic-tag">Topic: {{ currentQuestion.topic }}</div>
        </div>

        <div class="answer-section">
          <textarea
            v-model="pendingAnswer"
            placeholder="Type the witness's response..."
            rows="4"
            class="answer-textarea"
          />
          <ion-button
            @click="submitAnswer"
            :disabled="!pendingAnswer.trim() || submitting"
            expand="block"
          >
            <ion-spinner v-if="submitting" name="crescent" style="margin-right:6px" />
            Submit Answer
          </ion-button>
        </div>
      </div>

      <!-- Failed state -->
      <div v-else-if="activeJob.status === 'failed'" class="failed-state">
        <p>Simulation failed: {{ activeJob.error ?? 'Unknown error' }}</p>
        <ion-button fill="outline" @click="resetSimulation">Try Again</ion-button>
      </div>

      <!-- Running transcript -->
      <div v-if="transcript.length > 0" class="transcript-panel">
        <h4>Transcript</h4>
        <div
          v-for="(entry, idx) in transcript"
          :key="idx"
          class="transcript-entry"
          :class="activeJob.status === 'completed' ? damageClass(entry.score?.damage ?? 0) : ''"
        >
          <div class="transcript-q"><strong>Q{{ entry.turn }}:</strong> {{ entry.question }}</div>
          <div class="transcript-a"><strong>A:</strong> {{ entry.answer }}</div>
        </div>
      </div>

      <!-- Completed: debrief -->
      <div v-if="activeJob.status === 'completed' && debrief" class="debrief-section">
        <SimulationDebriefView :debrief="debrief" />

        <div class="run-again">
          <ion-button fill="outline" @click="resetSimulation">Run Again</ion-button>
        </div>
      </div>
    </div>

    <!-- Past sessions (collapsed) -->
    <div v-if="pastSessions.length > 0" class="past-sessions">
      <h4>Past Sessions</h4>
      <div
        v-for="session in pastSessions"
        :key="session.id"
        class="past-session-row"
        @click="loadSession(session.id)"
      >
        <span>{{ formatDate(session.completed_at ?? session.queued_at) }}</span>
        <span class="session-status" :class="session.status">{{ session.status }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import { IonButton, IonSpinner } from '@ionic/vue';
import { legalJobsService, type AgentJobRow, type ExecutionContextLike } from '../legalJobsService';
import SimulationDebriefView from './SimulationDebriefView.vue';

interface SimulationQuestion {
  turn: number;
  question: string;
  topic: string;
  move: string;
}

interface SimulationDebrief {
  transcript: Array<{
    question: SimulationQuestion;
    answer: { turn: number; answer: string; submittedAt: string };
    score: { turn: number; evasion: number; consistency: number; damage: number; coachingNote: string };
  }>;
  weakestMoments: Array<{ turn: number; evasion: number; consistency: number; damage: number; coachingNote: string }>;
  patterns: string[];
  coachingRecommendations: string[];
  disclaimerText: string;
}

const props = defineProps<{
  context: ExecutionContextLike;
  caseFacts?: string;
  witnessBackground?: string;
  priorStatements?: string;
  orgSlug: string;
  callerUserId?: string;
  simulationJobId?: string | null;
}>();

const setupModalOpen = ref(false);
const maxQuestions = ref(30);
const simulationFocus = ref('');
const starting = ref(false);
const submitting = ref(false);
const pendingAnswer = ref('');

const activeJob = ref<AgentJobRow | null>(null);
const pastSessions = ref<AgentJobRow[]>([]);

let pollTimer: ReturnType<typeof setInterval> | null = null;

const currentQuestion = computed((): SimulationQuestion | null => {
  const q = (activeJob.value?.result as Record<string, unknown> | null)?.currentQuestion;
  return (q as SimulationQuestion | undefined) ?? null;
});

const debrief = computed((): SimulationDebrief | null => {
  const r = activeJob.value?.result as Record<string, unknown> | null;
  return (r?.debrief as SimulationDebrief | undefined) ?? null;
});

const transcript = computed((): Array<{ turn: number; question: string; answer: string; score?: { damage: number } }> => {
  if (debrief.value) {
    return debrief.value.transcript.map((e) => ({
      turn: e.question.turn,
      question: e.question.question,
      answer: e.answer.answer,
      score: e.score,
    }));
  }
  return [];
});

function damageClass(damage: number): string {
  if (damage >= 7) return 'damage-high';
  if (damage >= 4) return 'damage-medium';
  return 'damage-low';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

async function beginSimulation(): Promise<void> {
  starting.value = true;
  try {
    const resp = await legalJobsService.enqueueSimulation(props.context, {
      caseFacts: props.caseFacts ?? '',
      witnessBackground: props.witnessBackground ?? '',
      priorStatements: props.priorStatements,
      maxQuestions: maxQuestions.value,
      simulationFocus: simulationFocus.value || undefined,
    });

    setupModalOpen.value = false;
    simulationFocus.value = '';

    activeJob.value = { id: resp.jobId, status: resp.status } as AgentJobRow;
    startPolling();
    await refreshActiveJob();
  } finally {
    starting.value = false;
  }
}

async function submitAnswer(): Promise<void> {
  if (!activeJob.value || !pendingAnswer.value.trim()) return;

  submitting.value = true;
  try {
    await legalJobsService.submitSimulationAnswer(
      activeJob.value.id,
      pendingAnswer.value.trim(),
      props.context,
    );
    pendingAnswer.value = '';
    await refreshActiveJob();
  } finally {
    submitting.value = false;
  }
}

async function refreshActiveJob(): Promise<void> {
  if (!activeJob.value?.id) return;
  try {
    activeJob.value = await legalJobsService.getJob(
      activeJob.value.id,
      props.orgSlug,
      props.callerUserId,
    );
  } catch {
    // keep current state on fetch error
  }
}

function startPolling(): void {
  stopPolling();
  pollTimer = setInterval(async () => {
    if (
      activeJob.value?.status === 'processing' ||
      activeJob.value?.status === 'queued' ||
      activeJob.value?.status === 'awaiting_answer'
    ) {
      await refreshActiveJob();
    } else {
      stopPolling();
    }
  }, 2000);
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function resetSimulation(): void {
  if (activeJob.value?.status === 'completed' || activeJob.value?.status === 'failed') {
    pastSessions.value.unshift(activeJob.value);
  }
  activeJob.value = null;
  pendingAnswer.value = '';
  stopPolling();
}

async function loadSession(jobId: string): Promise<void> {
  const found = pastSessions.value.find((s) => s.id === jobId);
  if (found) {
    pastSessions.value = pastSessions.value.filter((s) => s.id !== jobId);
    if (activeJob.value) pastSessions.value.unshift(activeJob.value);
    activeJob.value = found;
  }
}

// Load a simulation job when provided via prop (e.g., after page refresh)
watch(
  () => props.simulationJobId,
  async (jobId) => {
    if (jobId && !activeJob.value) {
      try {
        activeJob.value = await legalJobsService.getJob(jobId, props.orgSlug, props.callerUserId);
        if (
          activeJob.value.status === 'processing' ||
          activeJob.value.status === 'queued' ||
          activeJob.value.status === 'awaiting_answer'
        ) {
          startPolling();
        }
      } catch {
        // ignore — no existing session
      }
    }
  },
  { immediate: true },
);

onUnmounted(stopPolling);
</script>

<style scoped>
.simulation-view {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  min-height: 300px;
}

.setup-state {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 3rem 1rem;
}

.setup-card {
  max-width: 480px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.setup-card h3 { font-size: 1.2rem; font-weight: 600; }
.setup-description { color: var(--ion-color-medium); font-size: 0.9rem; }

.setup-modal-overlay {
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.setup-modal {
  background: var(--ion-card-background, #1e1e2e);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 0.75rem;
  padding: 1.5rem;
  width: 100%;
  max-width: 480px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.setup-modal h3 { font-size: 1.1rem; font-weight: 600; }

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.form-field label { font-size: 0.85rem; color: var(--ion-color-medium); }

.range-input { width: 100%; accent-color: var(--ion-color-primary); }
.range-labels { display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--ion-color-medium); }
.textarea-input { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 0.375rem; padding: 0.5rem; color: var(--ion-color-light); font-size: 0.9rem; resize: vertical; }

.privilege-notice {
  font-size: 0.75rem;
  color: #f59e0b;
  background: rgba(245,158,11,0.08);
  border: 1px solid rgba(245,158,11,0.2);
  border-radius: 0.375rem;
  padding: 0.5rem 0.75rem;
  font-style: italic;
}

.modal-actions { display: flex; gap: 0.5rem; justify-content: flex-end; }

.processing-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 2rem;
  color: var(--ion-color-medium);
}

.question-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.question-card {
  background: rgba(124,58,237,0.08);
  border: 1px solid rgba(124,58,237,0.3);
  border-radius: 0.5rem;
  padding: 1rem 1.25rem;
}

.question-label { font-size: 0.75rem; text-transform: uppercase; color: #7c3aed; margin-bottom: 0.5rem; font-weight: 600; letter-spacing: 0.05em; }
.question-text { font-size: 1rem; line-height: 1.6; color: var(--ion-color-light); margin: 0 0 0.5rem; }
.topic-tag { font-size: 0.75rem; color: var(--ion-color-medium); }

.answer-textarea {
  width: 100%;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 0.375rem;
  padding: 0.75rem;
  color: var(--ion-color-light);
  font-size: 0.9rem;
  resize: vertical;
  margin-bottom: 0.5rem;
  box-sizing: border-box;
}

.failed-state { color: var(--ion-color-danger); padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; align-items: flex-start; }

.transcript-panel { border-top: 1px solid rgba(255,255,255,0.08); padding-top: 1rem; }
.transcript-panel h4 { font-size: 0.85rem; font-weight: 600; text-transform: uppercase; color: var(--ion-color-medium); margin-bottom: 0.75rem; }

.transcript-entry {
  padding: 0.6rem 0.75rem;
  border-radius: 0.375rem;
  margin-bottom: 0.5rem;
  border-left: 3px solid transparent;
  font-size: 0.875rem;
  line-height: 1.5;
}
.transcript-entry.damage-high { border-left-color: #ef4444; background: rgba(239,68,68,0.05); }
.transcript-entry.damage-medium { border-left-color: #f59e0b; background: rgba(245,158,11,0.05); }
.transcript-entry.damage-low { border-left-color: #22c55e; background: rgba(34,197,94,0.05); }

.transcript-q, .transcript-a { margin: 0.15rem 0; }

.debrief-section { border-top: 1px solid rgba(255,255,255,0.08); padding-top: 1rem; }
.run-again { margin-top: 1rem; }

.past-sessions { border-top: 1px solid rgba(255,255,255,0.08); padding-top: 1rem; }
.past-sessions h4 { font-size: 0.85rem; text-transform: uppercase; color: var(--ion-color-medium); margin-bottom: 0.5rem; }

.past-session-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0.75rem;
  border-radius: 0.375rem;
  cursor: pointer;
  font-size: 0.85rem;
}
.past-session-row:hover { background: rgba(255,255,255,0.05); }

.session-status.completed { color: #22c55e; }
.session-status.failed { color: #ef4444; }
</style>
