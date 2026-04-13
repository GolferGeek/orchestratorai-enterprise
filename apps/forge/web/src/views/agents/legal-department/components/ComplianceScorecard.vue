<template>
  <div class="scorecard">
    <div v-if="loading" class="state">Loading scorecard...</div>
    <div v-else-if="error" class="state error">{{ error }}</div>
    <template v-else-if="scorecard">
      <div class="overall">
        <h3>Overall Compliance Score</h3>
        <div class="overall-bar">
          <div
            class="bar-fill"
            :class="scoreColor(scorecard.overallScore)"
            :style="{ width: `${scorecard.overallScore}%` }"
          />
          <span class="bar-label"
            >{{ scorecard.overallScore.toFixed(1) }}%</span
          >
        </div>
      </div>

      <div
        v-for="fw in scorecard.perFramework"
        :key="fw.frameworkSlug"
        class="framework-section"
      >
        <div
          class="fw-header"
          @click="toggleExpand(fw.frameworkSlug)"
        >
          <h4>{{ fw.frameworkName }} ({{ fw.frameworkSlug.toUpperCase() }})</h4>
          <div class="fw-bar">
            <div
              class="bar-fill"
              :class="scoreColor(fw.score)"
              :style="{ width: `${fw.score}%` }"
            />
            <span class="bar-label">{{ fw.score.toFixed(1) }}%</span>
          </div>
          <ion-icon
            :icon="expanded.includes(fw.frameworkSlug) ? chevronUp : chevronDown"
            class="expand-icon"
          />
        </div>

        <div
          v-if="expanded.includes(fw.frameworkSlug) && fw.themeScores?.length"
          class="theme-breakdown"
        >
          <div
            v-for="ts in fw.themeScores"
            :key="ts.themeId"
            class="theme-row"
          >
            <span class="theme-name">{{ ts.themeName }}</span>
            <div class="theme-bar">
              <div
                class="bar-fill"
                :class="scoreColor(ts.score)"
                :style="{ width: `${ts.score}%` }"
              />
            </div>
            <span class="theme-score">{{ ts.score.toFixed(0) }}%</span>
            <span class="theme-counts">
              {{ ts.compliant }}C / {{ ts.partiallyCompliant }}P /
              {{ ts.nonCompliant }}NC / {{ ts.notAddressed }}NA
            </span>
          </div>
        </div>
      </div>

      <p v-if="isScanMode" class="scan-note">
        This was a Compliance Scan — only discovered themes are shown. Run a
        Full Audit to evaluate all themes systematically.
      </p>
    </template>
    <div v-else class="state">No scorecard data available.</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { IonIcon } from '@ionic/vue';
import { chevronDown, chevronUp } from 'ionicons/icons';
import { legalJobsService } from '../legalJobsService';

interface ThemeScore {
  themeId: string;
  themeName: string;
  score: number;
  compliant: number;
  partiallyCompliant: number;
  nonCompliant: number;
  notAddressed: number;
}

interface FrameworkScore {
  frameworkSlug: string;
  frameworkName: string;
  score: number;
  themeScores: ThemeScore[];
}

interface Scorecard {
  overallScore: number;
  perFramework: FrameworkScore[];
}

const props = defineProps<{
  jobId: string;
  orgSlug: string;
}>();

const scorecard = ref<Scorecard | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const expanded = ref<string[]>([]);
const isScanMode = ref(false);

function scoreColor(score: number): string {
  if (score >= 80) return 'green';
  if (score >= 50) return 'yellow';
  return 'red';
}

function toggleExpand(slug: string): void {
  const idx = expanded.value.indexOf(slug);
  if (idx >= 0) {
    expanded.value.splice(idx, 1);
  } else {
    expanded.value.push(slug);
  }
}

onMounted(async () => {
  try {
    const data = (await legalJobsService.fetchScorecard(
      props.jobId,
      props.orgSlug,
    )) as unknown as Scorecard;
    scorecard.value = data;
    // Auto-expand all frameworks
    expanded.value = data.perFramework.map((fw) => fw.frameworkSlug);

    // Check if scan mode by looking at the job
    const job = await legalJobsService.getJob(props.jobId, props.orgSlug);
    const input = job.input as Record<string, unknown>;
    const ac = (input?.data as Record<string, unknown>)?.auditContext as
      | Record<string, unknown>
      | undefined;
    isScanMode.value = ac?.mode === 'scan';
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
});

// Expose for parent to detect scan mode
const scanModeExposed = computed(() => isScanMode.value);
defineExpose({ isScanMode: scanModeExposed });
</script>

<style scoped>
.scorecard {
  max-width: 800px;
}

.overall {
  margin-bottom: 24px;
}
.overall h3 {
  margin: 0 0 8px;
  font-size: 1.1rem;
}

.overall-bar,
.fw-bar,
.theme-bar {
  height: 24px;
  background: var(--ion-color-step-100);
  border-radius: 12px;
  position: relative;
  overflow: hidden;
}
.fw-bar {
  flex: 1;
  height: 20px;
}
.theme-bar {
  width: 120px;
  height: 16px;
}

.bar-fill {
  height: 100%;
  border-radius: 12px;
  transition: width 0.5s ease;
}
.bar-fill.green {
  background: var(--ion-color-success);
}
.bar-fill.yellow {
  background: var(--ion-color-warning);
}
.bar-fill.red {
  background: var(--ion-color-danger);
}

.bar-label {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.8rem;
  font-weight: 600;
}

.framework-section {
  margin-bottom: 16px;
  border: 1px solid var(--ion-color-step-150);
  border-radius: 8px;
  overflow: hidden;
}

.fw-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  cursor: pointer;
  background: var(--ion-color-step-50);
}
.fw-header h4 {
  margin: 0;
  font-size: 0.95rem;
  white-space: nowrap;
}
.expand-icon {
  font-size: 1.2rem;
  color: var(--ion-color-medium);
}

.theme-breakdown {
  padding: 8px 12px;
}

.theme-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}
.theme-name {
  width: 200px;
  font-size: 0.85rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.theme-score {
  font-size: 0.85rem;
  font-weight: 600;
  width: 40px;
  text-align: right;
}
.theme-counts {
  font-size: 0.75rem;
  color: var(--ion-color-medium);
  white-space: nowrap;
}

.scan-note {
  font-size: 0.85rem;
  color: var(--ion-color-medium);
  font-style: italic;
  margin-top: 16px;
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
