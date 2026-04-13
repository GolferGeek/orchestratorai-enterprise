<template>
  <div class="remediation">
    <div v-if="loading" class="state">Loading remediation plan...</div>
    <div v-else-if="error" class="state error">{{ error }}</div>
    <div v-else-if="items.length === 0" class="state">
      No remediation items identified — all findings are compliant.
    </div>
    <div v-else class="remediation-list">
      <div
        v-for="item in items"
        :key="item.findingId as string"
        class="remediation-card"
      >
        <div class="card-header">
          <span class="priority">#{{ item.priority }}</span>
          <span
            class="severity-badge"
            :class="item.severity as string"
          >
            {{ item.severity }}
          </span>
          <span
            class="effort-chip"
            :class="item.effort as string"
          >
            {{ (item.effort as string).toUpperCase() }}
          </span>
        </div>
        <div class="card-body">
          <div class="requirement">{{ item.requirement }}</div>
          <div class="current-state">
            <strong>Current State:</strong> {{ item.currentState }}
          </div>
          <div class="recommended-action">
            <strong>Recommended Action:</strong> {{ item.recommendedAction }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { legalJobsService } from '../legalJobsService';

const props = defineProps<{
  jobId: string;
  orgSlug: string;
}>();

const items = ref<Array<Record<string, unknown>>>([]);
const loading = ref(true);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    items.value = await legalJobsService.fetchRemediation(
      props.jobId,
      props.orgSlug,
    );
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.remediation {
  max-width: 800px;
}

.remediation-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.remediation-card {
  border: 1px solid var(--ion-color-step-150);
  border-radius: 8px;
  overflow: hidden;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--ion-color-step-50);
  border-bottom: 1px solid var(--ion-color-step-150);
}

.priority {
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--ion-color-medium);
}

.severity-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}
.severity-badge.critical {
  background: var(--ion-color-danger);
  color: #fff;
}
.severity-badge.high {
  background: var(--ion-color-danger-tint);
  color: var(--ion-color-danger-shade);
}
.severity-badge.medium {
  background: var(--ion-color-warning-tint);
  color: var(--ion-color-warning-shade);
}
.severity-badge.low {
  background: var(--ion-color-step-100);
  color: var(--ion-color-medium);
}

.effort-chip {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  border: 1px solid var(--ion-color-step-200);
}
.effort-chip.small {
  color: var(--ion-color-success-shade);
}
.effort-chip.medium {
  color: var(--ion-color-warning-shade);
}
.effort-chip.large {
  color: var(--ion-color-danger-shade);
}

.card-body {
  padding: 12px;
}

.requirement {
  font-weight: 600;
  margin-bottom: 8px;
}

.current-state,
.recommended-action {
  font-size: 0.9rem;
  margin-bottom: 6px;
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
