<template>
  <div class="report">
    <div v-if="loading" class="state">Loading report...</div>
    <div v-else-if="error" class="state error">{{ error }}</div>
    <template v-else-if="reportContent">
      <div class="report-actions">
        <ion-button size="small" fill="outline" @click="downloadReport">
          <ion-icon :icon="downloadOutline" slot="start" />
          Download Markdown
        </ion-button>
      </div>
      <ReportMarkdown :markdown="reportContent" />
    </template>
    <div v-else class="state">
      No report available. The report is generated after HITL review approval.
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { IonButton, IonIcon } from '@ionic/vue';
import { downloadOutline } from 'ionicons/icons';
import { legalJobsService } from '../legalJobsService';
import ReportMarkdown from './ReportMarkdown.vue';

const props = defineProps<{
  jobId: string;
  orgSlug: string;
}>();

const reportContent = ref<string | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

function downloadReport(): void {
  if (!reportContent.value) return;
  const blob = new Blob([reportContent.value], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `compliance-audit-${props.jobId}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

onMounted(async () => {
  try {
    const job = await legalJobsService.getJob(props.jobId, props.orgSlug);
    const result = job.result as Record<string, unknown> | null;
    reportContent.value =
      (result?.report as string) ??
      (result?.response as string) ??
      null;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.report {
  max-width: 900px;
}

.report-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}

.state {
  padding: 24px;
  text-align: center;
  color: var(--ion-color-medium);
}
.state.error {
  color: var(--ion-color-danger);
}
</style>
