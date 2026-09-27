<template>
  <div class="export-menu">
    <span class="label">Download</span>
    <ion-button
      v-for="option in OPTIONS"
      :key="option.format"
      fill="clear"
      size="small"
      :disabled="pending !== null"
      @click="download(option.format)"
    >
      {{ pending === option.format ? 'Preparing…' : option.label }}
    </ion-button>
    <span v-if="error" class="problem">{{ error }}</span>
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { IonButton } from '@ionic/vue';
import { workflowRunsClient, type ExportFormat } from './workflowRunsClient';

const props = defineProps<{ slug: string; runId: string; orgSlug: string }>();

const OPTIONS: Array<{ format: ExportFormat; label: string }> = [
  { format: 'pdf', label: 'PDF' },
  { format: 'docx', label: 'Word' },
  { format: 'md', label: 'Markdown' },
];

const pending = ref<ExportFormat | null>(null);
const error = ref<string | null>(null);

async function download(format: ExportFormat): Promise<void> {
  pending.value = format;
  error.value = null;
  try {
    const { blob, fileName } = await workflowRunsClient.downloadExport(props.slug, props.runId, props.orgSlug, format);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    pending.value = null;
  }
}
</script>

<style scoped>
.export-menu { display: flex; align-items: center; gap: 2px; flex-wrap: wrap; }
.label { font-size: 12px; color: var(--ion-color-medium); margin-right: 4px; }
.problem { color: var(--ion-color-danger); font-size: 12px; }
</style>
