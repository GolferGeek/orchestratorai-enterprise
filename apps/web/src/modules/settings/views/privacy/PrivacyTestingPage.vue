<template>
  <ion-page>
    <div class="detail-view">
      <div class="detail-header">
        <h2>Sanitization Inspector</h2>
        <div class="header-actions">
          <ion-button fill="clear" size="small" :disabled="!result" @click="reset">
            <ion-icon :icon="refreshOutline" slot="start" />
            Reset
          </ion-button>
        </div>
      </div>

      <div class="detail-body">
        <div class="page-content">
          <p class="page-note">
            Runs text through the real boundary pipeline and back again. No
            provider is called and nothing is stored — this is the same code
            path a live message takes, so what you see under
            <strong>Sent to provider</strong> is literally what would leave the
            building.
          </p>

          <div class="input-card">
            <ion-textarea
              v-model="inputText"
              :rows="4"
              label="Text to inspect"
              label-placement="stacked"
              placeholder="Email Jane Roe at jane@example.com about invoice 4455"
              :disabled="running"
            />
            <div class="input-row">
              <ion-input
                v-model="orgSlug"
                label="Organization slug (optional)"
                label-placement="stacked"
                placeholder="Scope the dictionary lookup"
              />
              <ion-input
                v-model="agentSlug"
                label="Agent slug (optional)"
                label-placement="stacked"
                placeholder="Narrow it further"
              />
            </div>
            <ion-button
              expand="block"
              :disabled="!inputText.trim() || running"
              @click="run"
            >
              <ion-spinner v-if="running" name="crescent" slot="start" />
              <ion-icon v-else :icon="playOutline" slot="start" />
              {{ running ? 'Running...' : 'Run pipeline' }}
            </ion-button>
            <p v-if="error" class="field-error">{{ error }}</p>
          </div>

          <template v-if="result">
            <div v-if="result.blocked" class="blocked-banner">
              <ion-icon :icon="banOutline" />
              <div>
                <strong>This request would be blocked.</strong>
                <span>
                  Showstopper PII detected{{
                    result.blockingReason ? ` (${result.blockingReason})` : ''
                  }}. Nothing would be sent to a provider at all.
                </span>
              </div>
            </div>

            <!-- The four stages, in the order the pipeline runs them -->
            <div class="stages">
              <div class="stage">
                <div class="stage-head">
                  <span class="stage-index">1</span>
                  <div>
                    <h4>Original</h4>
                    <p>What the user typed.</p>
                  </div>
                </div>
                <pre class="stage-text">{{ result.original }}</pre>
              </div>

              <div class="stage">
                <div class="stage-head">
                  <span class="stage-index">2</span>
                  <div>
                    <h4>Pseudonymized</h4>
                    <p>
                      Dictionary values swapped out.
                      {{ result.pseudonymsApplied.length }} applied.
                    </p>
                  </div>
                </div>
                <pre class="stage-text">{{ result.pseudonymized }}</pre>
              </div>

              <div class="stage stage-outbound">
                <div class="stage-head">
                  <span class="stage-index">3</span>
                  <div>
                    <h4>Sent to provider</h4>
                    <p>
                      Patterns redacted on top of the pseudonyms.
                      {{ result.redactionsApplied.length }} applied.
                    </p>
                  </div>
                </div>
                <pre class="stage-text">{{ result.redacted }}</pre>
              </div>

              <div class="stage">
                <div class="stage-head">
                  <span class="stage-index">4</span>
                  <div>
                    <h4>Restored</h4>
                    <p>Redactions reversed, then pseudonyms.</p>
                  </div>
                </div>
                <pre class="stage-text">{{ result.restored }}</pre>
                <div
                  class="round-trip"
                  :class="result.roundTripClean ? 'clean' : 'lossy'"
                >
                  <ion-icon
                    :icon="result.roundTripClean ? checkmarkCircleOutline : alertCircleOutline"
                  />
                  {{
                    result.roundTripClean
                      ? 'Round trip is lossless — restored text matches the original exactly.'
                      : 'Round trip did not restore the original. Reversal is lossy for this input.'
                  }}
                </div>
              </div>
            </div>

            <div class="detail-grid">
              <div class="detail-card">
                <h4>Detected ({{ result.detections.length }})</h4>
                <p v-if="result.detections.length === 0" class="muted">
                  No PII matched.
                </p>
                <table v-else class="mini-table">
                  <thead>
                    <tr>
                      <th>Value</th>
                      <th>Type</th>
                      <th>Severity</th>
                      <th>Conf.</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(d, i) in result.detections" :key="i">
                      <td class="mono">{{ d.value }}</td>
                      <td class="mono">{{ d.dataType }}</td>
                      <td>
                        <ion-badge
                          :color="d.severity === 'showstopper' ? 'danger' : 'warning'"
                        >
                          {{ d.severity }}
                        </ion-badge>
                      </td>
                      <td class="mono">{{ (d.confidence * 100).toFixed(0) }}%</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="detail-card">
                <h4>Pseudonyms ({{ result.pseudonymsApplied.length }})</h4>
                <p v-if="result.pseudonymsApplied.length === 0" class="muted">
                  Nothing matched the dictionary.
                </p>
                <table v-else class="mini-table">
                  <thead>
                    <tr>
                      <th>Original</th>
                      <th>Pseudonym</th>
                      <th>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(p, i) in result.pseudonymsApplied" :key="i">
                      <td class="mono">{{ p.originalValue }}</td>
                      <td class="mono">{{ p.pseudonym }}</td>
                      <td class="mono">{{ p.dataType }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="detail-card">
                <h4>Redactions ({{ result.redactionsApplied.length }})</h4>
                <p v-if="result.redactionsApplied.length === 0" class="muted">
                  No pattern matched.
                </p>
                <table v-else class="mini-table">
                  <thead>
                    <tr>
                      <th>Original</th>
                      <th>Redacted</th>
                      <th>Pattern</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(r, i) in result.redactionsApplied" :key="i">
                      <td class="mono">{{ r.originalValue }}</td>
                      <td class="mono">{{ r.redactedValue }}</td>
                      <td>{{ r.patternName }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="detail-card">
                <h4>Timing</h4>
                <table class="mini-table">
                  <tbody>
                    <tr>
                      <td>Detection</td>
                      <td class="mono">{{ result.timings.detectionMs }} ms</td>
                    </tr>
                    <tr>
                      <td>Pseudonymization</td>
                      <td class="mono">{{ result.timings.pseudonymizationMs }} ms</td>
                    </tr>
                    <tr>
                      <td>Redaction</td>
                      <td class="mono">{{ result.timings.redactionMs }} ms</td>
                    </tr>
                    <tr class="total-row">
                      <td>Total overhead</td>
                      <td class="mono">{{ totalMs }} ms</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  IonPage,
  IonButton,
  IonIcon,
  IonSpinner,
  IonBadge,
  IonInput,
  IonTextarea,
} from '@ionic/vue';
import {
  refreshOutline,
  playOutline,
  banOutline,
  checkmarkCircleOutline,
  alertCircleOutline,
} from 'ionicons/icons';
import {
  privacyApiService,
  type SanitizationPreview,
} from '../../services/privacy-api.service';

const inputText = ref('');
const orgSlug = ref('');
const agentSlug = ref('');
const running = ref(false);
const error = ref<string | null>(null);
const result = ref<SanitizationPreview | null>(null);

const totalMs = computed(() => {
  if (!result.value) return 0;
  const t = result.value.timings;
  return t.detectionMs + t.pseudonymizationMs + t.redactionMs;
});

const run = async () => {
  running.value = true;
  error.value = null;
  try {
    result.value = await privacyApiService.preview(inputText.value, {
      organizationSlug: orgSlug.value.trim() || null,
      agentSlug: agentSlug.value.trim() || null,
    });
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Preview failed';
    result.value = null;
  } finally {
    running.value = false;
  }
};

const reset = () => {
  result.value = null;
  error.value = null;
};
</script>

<style scoped>
.detail-view {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  background: var(--ion-toolbar-background, var(--ion-color-light));
}

.detail-header h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--ion-text-color, #333);
}

.detail-body {
  flex: 1;
  overflow-y: auto;
}

.page-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  max-width: 1100px;
}

.page-note {
  margin: 0;
  font-size: 0.85rem;
  color: var(--dark-text-muted, #888);
}

.input-card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  background: var(--ion-card-background, white);
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  border-radius: 10px;
}

.input-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.blocked-banner {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  background: rgba(var(--ion-color-danger-rgb), 0.12);
  border: 1px solid rgba(var(--ion-color-danger-rgb), 0.4);
  font-size: 0.85rem;
}

.blocked-banner ion-icon {
  color: var(--ion-color-danger);
  font-size: 1.2rem;
  flex-shrink: 0;
}

.blocked-banner div {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.stages {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.stage {
  padding: 0.85rem 1rem;
  background: var(--ion-card-background, white);
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  border-radius: 10px;
}

.stage-outbound {
  border-color: rgba(var(--ion-color-warning-rgb), 0.55);
  background: rgba(var(--ion-color-warning-rgb), 0.06);
}

.stage-head {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  margin-bottom: 0.5rem;
}

.stage-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 50%;
  background: var(--ion-color-primary);
  color: white;
  font-size: 0.75rem;
  font-weight: 700;
  flex-shrink: 0;
}

.stage-head h4 {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
}

.stage-head p {
  margin: 0.1rem 0 0;
  font-size: 0.75rem;
  color: var(--dark-text-muted, #888);
}

.stage-text {
  margin: 0;
  padding: 0.6rem 0.75rem;
  background: var(--ion-color-step-50, #f6f6f6);
  border-radius: 6px;
  font-family: monospace;
  font-size: 0.8rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--ion-text-color);
}

.round-trip {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.5rem;
  font-size: 0.8rem;
}

.round-trip.clean {
  color: var(--ion-color-success);
}

.round-trip.lossy {
  color: var(--ion-color-danger);
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 0.75rem;
}

.detail-card {
  padding: 0.85rem 1rem;
  background: var(--ion-card-background, white);
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  border-radius: 10px;
  overflow-x: auto;
}

.detail-card h4 {
  margin: 0 0 0.5rem;
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--dark-text-muted, #555);
}

.mini-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}

.mini-table th {
  text-align: left;
  font-weight: 600;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--dark-text-muted, #888);
  padding: 0.3rem 0.4rem;
  border-bottom: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
}

.mini-table td {
  padding: 0.35rem 0.4rem;
  border-bottom: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  overflow-wrap: anywhere;
}

.mini-table tr:last-child td {
  border-bottom: none;
}

.total-row td {
  font-weight: 600;
  border-top: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
}

.mono {
  font-family: monospace;
  font-size: 0.78rem;
}

.muted {
  margin: 0;
  color: var(--dark-text-muted, #888);
  font-size: 0.8rem;
}

.field-error {
  margin: 0;
  font-size: 0.8rem;
  color: var(--ion-color-danger);
}

@media (max-width: 768px) {
  .input-row {
    grid-template-columns: 1fr;
  }
}
</style>
