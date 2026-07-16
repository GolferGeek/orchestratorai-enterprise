<template>
  <div class="ca-view">
    <div class="ca-header">
      <div class="ca-title-row">
        <h2>Compliance Audit</h2>
        <ion-button
          v-if="openJobId"
          size="small"
          fill="clear"
          @click="$router.replace({ query: {} })"
        >
          Back to List
        </ion-button>
      </div>
      <div v-if="job" class="ca-meta">
        <span class="ca-status" :class="job.status">{{ job.status }}</span>
        <span v-if="job.progress != null" class="ca-progress">
          {{ job.progress }}%
        </span>
        <span v-if="lastMessage" class="ca-message">{{ lastMessage }}</span>
      </div>
    </div>

    <div v-if="loading" class="placeholder">Loading audit data...</div>
    <template v-else-if="job">
      <!-- Progress view for in-progress jobs -->
      <div
        v-if="job.status === 'processing' || job.status === 'queued'"
        class="progress-view"
      >
        <div class="progress-bar-container">
          <div
            class="progress-bar-fill"
            :style="{ width: `${job.progress ?? 0}%` }"
          />
        </div>
        <p class="progress-text">
          {{ lastMessage ?? 'Processing...' }}
        </p>
      </div>

      <!-- Tab view for completed jobs -->
      <template v-else>
        <ion-segment v-model="activeTab" class="ca-tabs">
          <ion-segment-button value="scorecard">
            <ion-label>Scorecard</ion-label>
          </ion-segment-button>
          <ion-segment-button value="gaps">
            <ion-label>Gap Analysis</ion-label>
          </ion-segment-button>
          <ion-segment-button value="remediation">
            <ion-label>Remediation</ion-label>
          </ion-segment-button>
          <ion-segment-button value="report">
            <ion-label>Report</ion-label>
          </ion-segment-button>
        </ion-segment>

        <div class="ca-content">
          <ComplianceScorecard
            v-if="activeTab === 'scorecard'"
            :job-id="jobId"
            :org-slug="orgSlug"
          />
          <ComplianceGapAnalysis
            v-else-if="activeTab === 'gaps'"
            :job-id="jobId"
            :org-slug="orgSlug"
          />
          <ComplianceRemediation
            v-else-if="activeTab === 'remediation'"
            :job-id="jobId"
            :org-slug="orgSlug"
          />
          <ComplianceReport
            v-else-if="activeTab === 'report'"
            :job-id="jobId"
            :org-slug="orgSlug"
          />
        </div>
      </template>
    </template>
    <div v-else class="placeholder">Audit not found.</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { IonSegment, IonSegmentButton, IonLabel, IonButton } from '@ionic/vue';
import {
  legalJobsService,
  type AgentJobRow,
} from '../legalJobsService';
import ComplianceScorecard from './ComplianceScorecard.vue';
import ComplianceGapAnalysis from './ComplianceGapAnalysis.vue';
import ComplianceRemediation from './ComplianceRemediation.vue';
import ComplianceReport from './ComplianceReport.vue';

const props = defineProps<{
  jobId: string;
  orgSlug: string;
}>();

const route = useRoute();
const openJobId = computed(() => (route.query.jobId as string) || null);

const activeTab = ref('scorecard');
const job = ref<AgentJobRow | null>(null);
const loading = ref(true);
const lastMessage = ref<string | null>(null);
let eventSource: EventSource | null = null;

async function loadJob(): Promise<void> {
  try {
    job.value = await legalJobsService.getJob(props.jobId, props.orgSlug);
    lastMessage.value = job.value.last_message;
  } catch {
    job.value = null;
  } finally {
    loading.value = false;
  }
}

function startSSE(): void {
  if (!job.value?.conversation_id) return;
  eventSource = legalJobsService.openEventStream(job.value.conversation_id);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.message) lastMessage.value = data.message;
      if (data.progress != null && job.value) {
        job.value = { ...job.value, progress: data.progress };
      }
      // Reload job when status changes
      if (data.hook_event_type === 'completed' || data.hook_event_type === 'failed') {
        void loadJob();
      }
    } catch {
      // ignore malformed
    }
  };
}

onMounted(() => {
  void loadJob().then(() => startSSE());
});

onUnmounted(() => {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
});
</script>

<style scoped>
.ca-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.ca-header {
  padding: 0 0 12px;
  border-bottom: 1px solid var(--ion-color-step-200);
}

.ca-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.ca-title-row h2 {
  margin: 0;
  font-size: 1.2rem;
}

.ca-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
}

.ca-status {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
}
.ca-status.completed {
  background: var(--ion-color-success-tint);
  color: var(--ion-color-success-shade);
}
.ca-status.processing,
.ca-status.queued {
  background: var(--ion-color-warning-tint);
  color: var(--ion-color-warning-shade);
}
.ca-status.failed {
  background: var(--ion-color-danger-tint);
  color: var(--ion-color-danger-shade);
}
.ca-status.awaiting_review {
  background: var(--ion-color-primary-tint);
  color: var(--ion-color-primary-shade);
}

.ca-progress {
  font-size: 0.85rem;
  color: var(--ion-color-medium);
}
.ca-message {
  font-size: 0.85rem;
  color: var(--ion-color-medium);
}

.ca-tabs {
  margin: 12px 0 0;
}

.ca-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 0;
}

.progress-view {
  padding: 32px 16px;
  text-align: center;
}
.progress-bar-container {
  height: 8px;
  background: var(--ion-color-step-100);
  border-radius: 4px;
  overflow: hidden;
  max-width: 400px;
  margin: 0 auto;
}
.progress-bar-fill {
  height: 100%;
  background: var(--ion-color-primary);
  border-radius: 4px;
  transition: width 0.5s ease;
}
.progress-text {
  margin-top: 12px;
  color: var(--ion-color-medium);
  font-size: 0.9rem;
}

.placeholder {
  text-align: center;
  padding: 48px 16px;
  color: var(--ion-color-medium);
}
</style>
