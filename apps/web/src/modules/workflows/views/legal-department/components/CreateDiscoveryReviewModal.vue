<template>
  <ion-modal
    :is-open="open"
    @will-dismiss="$emit('close')"
    @keydown.esc="$emit('close')"
    class="discovery-review-modal"
  >
    <div class="ion-page">
      <ion-header>
        <ion-toolbar>
          <ion-title>Start a Document Review</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="$emit('close')">Cancel</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>

      <ion-content class="ion-padding">
        <!-- ── Matter Identification ─────────────────────────────────── -->
        <div class="form-section">
          <h3>Matter</h3>
          <ion-item>
            <ion-input
              v-model="protocol.matterId"
              label="Matter ID"
              label-placement="stacked"
              placeholder="e.g. ACME-2024-001"
            />
          </ion-item>
          <ion-item>
            <ion-input
              v-model="protocol.matterName"
              label="Matter Name"
              label-placement="stacked"
              placeholder="e.g. Acme Corp v. Globex Inc."
            />
          </ion-item>
        </div>

        <!-- ── Relevance Criteria ────────────────────────────────────── -->
        <div class="form-section">
          <h3>Relevance Criteria</h3>

          <ion-item>
            <ion-textarea
              v-model="claimsInput"
              label="Claims (one per line)"
              label-placement="stacked"
              placeholder="breach of contract&#10;trade secret misappropriation"
              :rows="3"
              auto-grow
            />
          </ion-item>

          <ion-item>
            <ion-input
              v-model="dateRangeStart"
              label="Date Range Start (YYYY-MM-DD)"
              label-placement="stacked"
              placeholder="e.g. 2022-01-01"
            />
          </ion-item>

          <ion-item>
            <ion-input
              v-model="dateRangeEnd"
              label="Date Range End (YYYY-MM-DD)"
              label-placement="stacked"
              placeholder="e.g. 2024-12-31"
            />
          </ion-item>

          <ion-item>
            <ion-textarea
              v-model="keyPartiesInput"
              label="Key Parties (one per line)"
              label-placement="stacked"
              placeholder="Acme Corp&#10;John Smith"
              :rows="3"
              auto-grow
            />
          </ion-item>

          <ion-item>
            <ion-textarea
              v-model="keyTopicsInput"
              label="Key Topics (one per line)"
              label-placement="stacked"
              placeholder="product roadmap&#10;pricing"
              :rows="3"
              auto-grow
            />
          </ion-item>

          <ion-item>
            <ion-textarea
              v-model="exclusionsInput"
              label="Exclusions (one per line, optional)"
              label-placement="stacked"
              placeholder="marketing newsletters"
              :rows="2"
              auto-grow
            />
          </ion-item>
        </div>

        <!-- ── Privilege Holders ─────────────────────────────────────── -->
        <div class="form-section">
          <h3>Privilege Holders</h3>

          <ion-item>
            <ion-textarea
              v-model="attorneysInput"
              label="Attorneys (one per line)"
              label-placement="stacked"
              placeholder="Jane Doe&#10;Robert Brown"
              :rows="3"
              auto-grow
            />
          </ion-item>

          <ion-item>
            <ion-textarea
              v-model="firmsInput"
              label="Law Firms (one per line)"
              label-placement="stacked"
              placeholder="Doe & Associates LLP"
              :rows="2"
              auto-grow
            />
          </ion-item>

          <ion-item>
            <ion-textarea
              v-model="inHouseCounselInput"
              label="In-House Counsel (one per line)"
              label-placement="stacked"
              placeholder="Alice Chen, General Counsel"
              :rows="2"
              auto-grow
            />
          </ion-item>
        </div>

        <!-- ── Issue Tags ─────────────────────────────────────────────── -->
        <div class="form-section">
          <h3>Issue Tags</h3>
          <div
            v-for="(tag, index) in protocol.issueTags"
            :key="index"
            class="issue-tag-row"
          >
            <ion-item>
              <ion-input
                v-model="protocol.issueTags[index].tagId"
                label="Tag ID"
                label-placement="stacked"
                :placeholder="`tag-${index + 1}`"
              />
            </ion-item>
            <ion-item>
              <ion-input
                v-model="protocol.issueTags[index].tagName"
                label="Tag Name"
                label-placement="stacked"
                placeholder="Trade Secret"
              />
            </ion-item>
            <ion-item>
              <ion-input
                v-model="protocol.issueTags[index].description"
                label="Description"
                label-placement="stacked"
                placeholder="What this tag means"
              />
            </ion-item>
            <ion-button
              size="small"
              fill="clear"
              color="danger"
              @click="removeIssueTag(index)"
            >
              Remove
            </ion-button>
          </div>
          <ion-button size="small" fill="outline" @click="addIssueTag">
            + Add Issue Tag
          </ion-button>
        </div>

        <!-- ── Review Settings ───────────────────────────────────────── -->
        <div class="form-section">
          <h3>Review Settings</h3>

          <ion-item>
            <ion-label>
              <p>Batch Size: {{ protocol.batchSize }}</p>
              <p class="hint">Documents per HITL review batch (10–100)</p>
            </ion-label>
            <input
              type="range"
              min="10"
              max="100"
              step="10"
              v-model.number="protocol.batchSize"
              class="range-input"
            />
          </ion-item>

          <ion-item>
            <ion-label>
              <p>Confidence Threshold: {{ protocol.confidenceThreshold.toFixed(1) }}</p>
              <p class="hint">Below this, route to low-confidence review batch</p>
            </ion-label>
            <input
              type="range"
              min="0.5"
              max="0.9"
              step="0.1"
              v-model.number="protocol.confidenceThreshold"
              class="range-input"
            />
          </ion-item>

          <ion-item>
            <ion-toggle v-model="protocol.privilegeReviewRequired">
              Require human review for all privilege-flagged documents
            </ion-toggle>
          </ion-item>
        </div>

        <!-- ── Document Upload ───────────────────────────────────────── -->
        <div class="form-section">
          <h3>Documents</h3>
          <div
            class="dropzone"
            :class="{ active: dragActive }"
            @dragover.prevent="dragActive = true"
            @dragleave.prevent="dragActive = false"
            @drop.prevent="onDrop"
          >
            <p v-if="files.length === 0">
              Drop files here or click below.
            </p>
            <div v-else class="file-summary">
              <strong>{{ files.length }} file{{ files.length !== 1 ? 's' : '' }}</strong>
              <span class="file-size">({{ formatBytes(totalSize) }} total)</span>
              <ul class="file-list">
                <li v-for="f in files" :key="f.name">{{ f.name }}</li>
              </ul>
            </div>
            <input
              type="file"
              ref="fileInput"
              @change="onPick"
              accept=".txt,.md,.json,.csv,.pdf,.docx,.pptx,.png,.jpg,.jpeg,.webp,.gif"
              multiple
              hidden
            />
            <ion-button size="small" fill="outline" @click="fileInput?.click()">
              Choose files
            </ion-button>
          </div>

          <div class="error" v-if="sizeError">{{ sizeError }}</div>
        </div>

        <!-- ── Validation error ──────────────────────────────────────── -->
        <div class="error" v-if="submitError">{{ submitError }}</div>
      </ion-content>

      <div class="modal-footer">
        <ion-button expand="block" :disabled="!canSubmit || submitting" @click="submit">
          <ion-spinner v-if="submitting" name="crescent" />
          <span v-else>Launch Review</span>
        </ion-button>
      </div>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonItem,
  IonInput,
  IonTextarea,
  IonLabel,
  IonToggle,
  IonSpinner,
} from '@ionic/vue';
import { legalJobsService, type ExecutionContextLike } from '../legalJobsService';

const props = defineProps<{
  open: boolean;
  context: ExecutionContextLike;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'queued', payload: { jobId: string; conversationId: string }): void;
}>();

// ── Form State ──────────────────────────────────────────────────────────────

const protocol = ref({
  matterId: '',
  matterName: '',
  issueTags: [] as Array<{ tagId: string; tagName: string; description: string }>,
  batchSize: 50,
  confidenceThreshold: 0.7,
  privilegeReviewRequired: true,
});

// Multi-line tag inputs (split on newlines on submit)
const claimsInput = ref('');
const keyPartiesInput = ref('');
const keyTopicsInput = ref('');
const exclusionsInput = ref('');
const dateRangeStart = ref('');
const dateRangeEnd = ref('');
const attorneysInput = ref('');
const firmsInput = ref('');
const inHouseCounselInput = ref('');

const files = ref<File[]>([]);
const dragActive = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const submitting = ref(false);
const submitError = ref<string | null>(null);

// ── Computed ────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_FILES = 100;

const totalSize = computed(() => files.value.reduce((s, f) => s + f.size, 0));

const sizeError = computed(() => {
  if (files.value.length > MAX_FILES) {
    return `Too many files: ${files.value.length} exceeds the maximum of ${MAX_FILES}.`;
  }
  const oversized = files.value.find((f) => f.size > MAX_FILE_SIZE);
  if (oversized) {
    return `File "${oversized.name}" is ${formatBytes(oversized.size)} — exceeds the 50MB per-file limit.`;
  }
  return null;
});

const canSubmit = computed(() => {
  const p = protocol.value;
  const hasClaims = claimsInput.value.trim().length > 0;
  const hasAttorneys =
    !p.privilegeReviewRequired || attorneysInput.value.trim().length > 0;
  return (
    p.matterId.trim() !== '' &&
    p.matterName.trim() !== '' &&
    hasClaims &&
    hasAttorneys &&
    files.value.length > 0 &&
    !sizeError.value &&
    !submitting.value
  );
});

// ── File handlers ────────────────────────────────────────────────────────────

function onPick(e: Event): void {
  const input = e.target as HTMLInputElement;
  files.value = Array.from(input.files ?? []);
  submitError.value = null;
}

function onDrop(e: DragEvent): void {
  dragActive.value = false;
  const dropped = Array.from(e.dataTransfer?.files ?? []);
  if (dropped.length > 0) {
    files.value = dropped;
    submitError.value = null;
  }
}

// ── Issue tag helpers ────────────────────────────────────────────────────────

function addIssueTag(): void {
  protocol.value.issueTags.push({ tagId: '', tagName: '', description: '' });
}

function removeIssueTag(index: number): void {
  protocol.value.issueTags.splice(index, 1);
}

// ── Submit ───────────────────────────────────────────────────────────────────

async function submit(): Promise<void> {
  submitting.value = true;
  submitError.value = null;

  try {
    const splitLines = (s: string) =>
      s
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

    const reviewProtocol = {
      matterId: protocol.value.matterId.trim(),
      matterName: protocol.value.matterName.trim(),
      relevanceCriteria: {
        claims: splitLines(claimsInput.value),
        dateRange:
          dateRangeStart.value && dateRangeEnd.value
            ? { start: dateRangeStart.value, end: dateRangeEnd.value }
            : undefined,
        keyParties: splitLines(keyPartiesInput.value),
        keyTopics: splitLines(keyTopicsInput.value),
        exclusions:
          exclusionsInput.value.trim()
            ? splitLines(exclusionsInput.value)
            : undefined,
      },
      privilegeHolders: {
        attorneys: splitLines(attorneysInput.value),
        firms: splitLines(firmsInput.value),
        inHouseCounsel: splitLines(inHouseCounselInput.value),
      },
      issueTags: protocol.value.issueTags.filter(
        (t) => t.tagId.trim() && t.tagName.trim(),
      ),
      batchSize: protocol.value.batchSize,
      confidenceThreshold: protocol.value.confidenceThreshold,
      privilegeReviewRequired: protocol.value.privilegeReviewRequired,
    };

    const ctx: ExecutionContextLike = {
      ...props.context,
      agentSlug: 'legal-department',
      agentType: 'langgraph',
    };

    const result = await legalJobsService.createDiscoveryReview(
      ctx,
      files.value,
      reviewProtocol,
    );

    emit('queued', { jobId: result.jobId, conversationId: result.conversationId });
  } catch (err) {
    submitError.value =
      err instanceof Error ? err.message : 'Failed to start review. Please try again.';
  } finally {
    submitting.value = false;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
</script>

<style scoped>
.discovery-review-modal {
  --width: min(700px, 95vw);
  --height: min(90vh, 900px);
}

.form-section {
  margin-bottom: 24px;
}

.form-section h3 {
  font-size: 1rem;
  font-weight: 600;
  margin: 16px 0 8px;
  color: var(--ion-color-primary);
  border-bottom: 1px solid var(--ion-color-light);
  padding-bottom: 4px;
}

.issue-tag-row {
  border: 1px solid var(--ion-color-light);
  border-radius: 8px;
  margin-bottom: 12px;
  padding: 8px;
}

.dropzone {
  border: 2px dashed var(--ion-color-medium);
  border-radius: 8px;
  padding: 24px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s;
}

.dropzone.active {
  border-color: var(--ion-color-primary);
  background: var(--ion-color-primary-tint);
}

.file-list {
  text-align: left;
  max-height: 120px;
  overflow-y: auto;
  margin: 8px 0 0;
  padding-left: 20px;
  font-size: 0.85rem;
}

.file-size {
  margin-left: 8px;
  color: var(--ion-color-medium);
  font-size: 0.9rem;
}

.hint {
  font-size: 0.8rem;
  color: var(--ion-color-medium);
  margin: 2px 0 0;
}

.error {
  color: var(--ion-color-danger);
  font-size: 0.9rem;
  margin: 8px 16px;
}

.range-input {
  width: 100%;
  margin-top: 8px;
}

.modal-footer {
  padding: 16px;
  border-top: 1px solid var(--ion-color-light);
}
</style>
