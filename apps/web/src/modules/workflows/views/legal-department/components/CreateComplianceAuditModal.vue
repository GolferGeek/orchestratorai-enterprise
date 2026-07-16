<template>
  <ion-modal
    :is-open="open"
    @did-dismiss="onDismissed"
    @will-dismiss="$emit('close')"
    @keydown.esc="$emit('close')"
    class="ca-modal"
  >
    <div class="ion-page">
      <ion-header>
        <ion-toolbar>
          <ion-title>Create Compliance Audit</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="$emit('close')">Cancel</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <!-- File Upload -->
        <div
          class="dropzone"
          :class="{ active: dragActive }"
          @dragover.prevent="dragActive = true"
          @dragleave.prevent="dragActive = false"
          @drop.prevent="onDrop"
        >
          <ion-icon :icon="cloudUploadOutline" size="large" />
          <p v-if="files.length === 0">
            Drop policy documents here or click below. Supports PDF, DOCX, TXT.
          </p>
          <div v-else class="file-summary">
            <strong
              >{{ files.length }} file{{
                files.length !== 1 ? 's' : ''
              }}</strong
            >
            <span class="file-size">({{ formatBytes(totalSize) }} total)</span>
          </div>
          <input
            type="file"
            ref="fileInput"
            @change="onPick"
            accept=".txt,.md,.pdf,.docx"
            multiple
            hidden
          />
          <ion-button size="small" fill="outline" @click="fileInput?.click()">
            Choose files
          </ion-button>
          <p class="hint">Up to 500 files. 50MB per file, 1GB total.</p>
        </div>

        <div class="error" v-if="sizeError">{{ sizeError }}</div>

        <!-- Framework Selection -->
        <div class="section">
          <h3>Regulatory Frameworks</h3>
          <div v-if="loadingFrameworks" class="loading">
            Loading frameworks...
          </div>
          <div v-else-if="frameworks.length === 0" class="empty-hint">
            No frameworks available. Run the seed migration first.
          </div>
          <div v-else class="framework-chips">
            <ion-chip
              v-for="fw in frameworks"
              :key="fw.slug"
              :color="selectedFrameworks.includes(fw.slug) ? 'primary' : ''"
              :outline="!selectedFrameworks.includes(fw.slug)"
              @click="toggleFramework(fw.slug)"
            >
              {{ fw.name }}
            </ion-chip>
          </div>
        </div>

        <!-- Mode Toggle -->
        <div class="section">
          <h3>Audit Mode</h3>
          <ion-segment v-model="auditMode">
            <ion-segment-button value="scan">
              <ion-label>Compliance Scan</ion-label>
            </ion-segment-button>
            <ion-segment-button value="full-audit">
              <ion-label>Full Audit</ion-label>
            </ion-segment-button>
          </ion-segment>
          <p class="mode-hint" v-if="auditMode === 'scan'">
            AI-driven discovery: scans your policies against selected frameworks
            to find gaps.
          </p>
          <p class="mode-hint" v-else>
            Systematic evaluation: works through all compliance themes for
            selected frameworks with per-theme scoring.
          </p>
        </div>

        <!-- Theme Selection (Full Audit only) -->
        <div
          class="section"
          v-if="auditMode === 'full-audit' && availableThemes.length > 0"
        >
          <h3>
            Themes
            <ion-button
              size="small"
              fill="clear"
              @click="toggleAllThemes"
              class="toggle-all"
            >
              {{ allThemesSelected ? 'Deselect All' : 'Select All' }}
            </ion-button>
          </h3>
          <div
            v-for="fw in selectedFrameworkObjects"
            :key="fw.slug"
            class="theme-group"
          >
            <h4>{{ fw.name }}</h4>
            <ion-item
              v-for="theme in fw.themes"
              :key="theme.themeId"
              lines="none"
              class="theme-item"
            >
              <ion-checkbox
                slot="start"
                :checked="selectedThemes.includes(theme.themeId)"
                @ion-change="toggleTheme(theme.themeId)"
              />
              <ion-label>
                {{ theme.themeName }}
                <span class="question-count"
                  >({{ theme.questionCount }} questions)</span
                >
              </ion-label>
            </ion-item>
          </div>
        </div>

        <!-- Organization Context (optional) -->
        <div class="section">
          <h3>Organization Context (optional)</h3>
          <ion-item>
            <ion-select
              v-model="orgContext.industry"
              label="Industry"
              label-placement="stacked"
              interface="popover"
              placeholder="Select industry"
            >
              <ion-select-option value="healthcare">Healthcare</ion-select-option>
              <ion-select-option value="financial-services"
                >Financial Services</ion-select-option
              >
              <ion-select-option value="technology">Technology</ion-select-option>
              <ion-select-option value="retail">Retail</ion-select-option>
              <ion-select-option value="manufacturing"
                >Manufacturing</ion-select-option
              >
              <ion-select-option value="education">Education</ion-select-option>
              <ion-select-option value="government">Government</ion-select-option>
              <ion-select-option value="other">Other</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-input
              v-model="orgContext.jurisdiction"
              label="Jurisdiction"
              label-placement="stacked"
              placeholder="e.g. EU, US, UK"
            />
          </ion-item>
          <ion-item>
            <ion-select
              v-model="orgContext.employeeCount"
              label="Employee Count"
              label-placement="stacked"
              interface="popover"
              placeholder="Select range"
            >
              <ion-select-option value="1-49">1-49</ion-select-option>
              <ion-select-option value="50-249">50-249</ion-select-option>
              <ion-select-option value="250-999">250-999</ion-select-option>
              <ion-select-option value="1000-4999"
                >1,000-4,999</ion-select-option
              >
              <ion-select-option value="5000+">5,000+</ion-select-option>
            </ion-select>
          </ion-item>
        </div>

        <div class="error" v-if="error">{{ error }}</div>

        <ion-button
          expand="block"
          :disabled="!canSubmit || submitting"
          @click="submit"
          class="submit"
        >
          <ion-spinner v-if="submitting" name="dots" />
          <span v-else>{{
            auditMode === 'scan' ? 'Run Compliance Scan' : 'Run Full Audit'
          }}</span>
        </ion-button>
      </ion-content>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonIcon,
  IonSpinner,
  IonItem,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonChip,
  IonCheckbox,
} from '@ionic/vue';
import { cloudUploadOutline } from 'ionicons/icons';
import {
  legalJobsService,
  type ExecutionContextLike,
} from '../legalJobsService';

interface FrameworkInfo {
  slug: string;
  name: string;
  description: string;
  hasThemeConfig: boolean;
  themes?: Array<{
    themeId: string;
    themeName: string;
    questionCount: number;
  }>;
}

const props = defineProps<{
  open: boolean;
  context: ExecutionContextLike;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'queued', payload: { jobId: string; conversationId: string }): void;
}>();

const files = ref<File[]>([]);
const submitting = ref(false);
const error = ref<string | null>(null);
const dragActive = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

const auditMode = ref<'scan' | 'full-audit'>('scan');
const selectedFrameworks = ref<string[]>([]);
const selectedThemes = ref<string[]>([]);
const frameworks = ref<FrameworkInfo[]>([]);
const loadingFrameworks = ref(false);

const orgContext = ref({
  industry: '',
  jurisdiction: '',
  employeeCount: '',
});

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_TOTAL_SIZE = 1024 * 1024 * 1024;
const MAX_FILES = 500;

const totalSize = computed(() =>
  files.value.reduce((sum, f) => sum + f.size, 0),
);

const sizeError = computed(() => {
  if (files.value.length > MAX_FILES)
    return `Too many files: ${files.value.length} exceeds ${MAX_FILES}.`;
  const oversized = files.value.find((f) => f.size > MAX_FILE_SIZE);
  if (oversized)
    return `"${oversized.name}" is ${formatBytes(oversized.size)} — exceeds 50MB.`;
  if (totalSize.value > MAX_TOTAL_SIZE)
    return `Total ${formatBytes(totalSize.value)} exceeds 1GB.`;
  return null;
});

const selectedFrameworkObjects = computed(() =>
  frameworks.value.filter(
    (fw) =>
      selectedFrameworks.value.includes(fw.slug) &&
      fw.themes &&
      fw.themes.length > 0,
  ),
);

const availableThemes = computed(() =>
  selectedFrameworkObjects.value.flatMap((fw) => fw.themes ?? []),
);

const allThemesSelected = computed(
  () =>
    availableThemes.value.length > 0 &&
    availableThemes.value.every((t) =>
      selectedThemes.value.includes(t.themeId),
    ),
);

const canSubmit = computed(
  () =>
    files.value.length > 0 &&
    !sizeError.value &&
    selectedFrameworks.value.length > 0,
);

function toggleFramework(slug: string): void {
  const idx = selectedFrameworks.value.indexOf(slug);
  if (idx >= 0) {
    selectedFrameworks.value.splice(idx, 1);
  } else {
    selectedFrameworks.value.push(slug);
  }
}

function toggleTheme(themeId: string): void {
  const idx = selectedThemes.value.indexOf(themeId);
  if (idx >= 0) {
    selectedThemes.value.splice(idx, 1);
  } else {
    selectedThemes.value.push(themeId);
  }
}

function toggleAllThemes(): void {
  if (allThemesSelected.value) {
    selectedThemes.value = [];
  } else {
    selectedThemes.value = availableThemes.value.map((t) => t.themeId);
  }
}

// When frameworks are selected, auto-select all themes
watch(selectedFrameworks, () => {
  selectedThemes.value = availableThemes.value.map((t) => t.themeId);
});

function onPick(e: Event): void {
  const input = e.target as HTMLInputElement;
  files.value = Array.from(input.files ?? []);
  error.value = null;
}

function onDrop(e: DragEvent): void {
  dragActive.value = false;
  const dropped = Array.from(e.dataTransfer?.files ?? []);
  if (dropped.length > 0) {
    files.value = dropped;
    error.value = null;
  }
}

function resetForm(): void {
  files.value = [];
  error.value = null;
  auditMode.value = 'scan';
  selectedFrameworks.value = [];
  selectedThemes.value = [];
  orgContext.value = { industry: '', jurisdiction: '', employeeCount: '' };
  if (fileInput.value) fileInput.value.value = '';
}

function onDismissed(): void {
  resetForm();
}

async function loadFrameworks(): Promise<void> {
  loadingFrameworks.value = true;
  try {
    frameworks.value = await legalJobsService.fetchFrameworks(
      props.context.orgSlug,
    );
  } catch {
    frameworks.value = [];
  } finally {
    loadingFrameworks.value = false;
  }
}

async function submit(): Promise<void> {
  if (!canSubmit.value) return;
  submitting.value = true;
  error.value = null;
  try {
    const oc = orgContext.value;
    const organizationContext =
      oc.industry || oc.jurisdiction || oc.employeeCount
        ? {
            industry: oc.industry || undefined,
            jurisdiction: oc.jurisdiction || undefined,
            employeeCount: oc.employeeCount || undefined,
          }
        : undefined;

    const result = await legalJobsService.createComplianceAudit(
      props.context,
      files.value,
      {
        mode: auditMode.value,
        frameworkSlugs: selectedFrameworks.value,
        selectedThemes:
          auditMode.value === 'full-audit' &&
          selectedThemes.value.length < availableThemes.value.length
            ? selectedThemes.value
            : undefined,
        organizationContext,
      },
    );

    emit('queued', {
      jobId: result.jobId,
      conversationId: result.conversationId,
    });
    submitting.value = false;
    resetForm();
    emit('close');
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
    submitting.value = false;
  }
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

onMounted(() => {
  void loadFrameworks();
});
</script>

<style scoped>
.ca-modal {
  --backdrop-opacity: 0.6;
  --background: var(--ion-background-color, #fff);
  --width: 600px;
  --max-width: 95vw;
  --height: 85vh;
  --max-height: 95vh;
  --border-radius: 12px;
}

.dropzone {
  border: 2px dashed var(--ion-color-step-200);
  border-radius: 12px;
  padding: 24px 16px;
  text-align: center;
  cursor: pointer;
  transition:
    border-color 0.2s,
    background 0.2s;
  margin-bottom: 16px;
}
.dropzone.active {
  border-color: var(--ion-color-primary);
  background: var(--ion-color-primary-tint);
}

.file-summary {
  margin: 8px 0;
}
.file-size {
  color: var(--ion-color-medium);
  margin-left: 4px;
}

.hint {
  font-size: 0.8rem;
  color: var(--ion-color-medium);
  margin-top: 8px;
}

.section {
  margin-top: 16px;
}
.section h3 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.toggle-all {
  font-size: 0.8rem;
}

.framework-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.mode-hint {
  font-size: 0.85rem;
  color: var(--ion-color-medium);
  margin-top: 4px;
}

.theme-group {
  margin-top: 8px;
}
.theme-group h4 {
  font-size: 0.9rem;
  font-weight: 600;
  margin: 0 0 4px;
}
.theme-item {
  --min-height: 32px;
}

.question-count {
  font-size: 0.8rem;
  color: var(--ion-color-medium);
}

.loading,
.empty-hint {
  color: var(--ion-color-medium);
  font-size: 0.9rem;
  padding: 8px 0;
}

.error {
  color: var(--ion-color-danger);
  font-size: 0.9rem;
  padding: 8px 0;
}

.submit {
  margin-top: 16px;
}
</style>
