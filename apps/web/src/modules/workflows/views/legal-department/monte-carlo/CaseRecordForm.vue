<template>
  <ion-modal :is-open="open" @did-dismiss="$emit('close')">
    <ion-header>
      <ion-toolbar>
        <ion-title>New Trial Simulation</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="$emit('close')">Cancel</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="form-content">
      <div class="form-body">

        <!-- Case Identity -->
        <section class="form-section">
          <h3 class="section-title">Case Identity</h3>
          <ion-item>
            <ion-label position="stacked">Matter ID *</ion-label>
            <ion-input v-model="form.matterId" placeholder="e.g. matter-breach-2024-001" />
          </ion-item>
          <p v-if="errors.matterId" class="field-error">{{ errors.matterId }}</p>

          <ion-item>
            <ion-label position="stacked">Jurisdiction *</ion-label>
            <ion-input v-model="form.jurisdiction" placeholder="e.g. S.D.N.Y." />
          </ion-item>
          <p v-if="errors.jurisdiction" class="field-error">{{ errors.jurisdiction }}</p>

          <ion-item>
            <ion-label position="stacked">Court Level</ion-label>
            <ion-select v-model="form.courtLevel" placeholder="Select…">
              <ion-select-option value="federal-district">Federal District</ion-select-option>
              <ion-select-option value="federal-appellate">Federal Appellate</ion-select-option>
              <ion-select-option value="state-trial">State Trial</ion-select-option>
              <ion-select-option value="state-appellate">State Appellate</ion-select-option>
            </ion-select>
          </ion-item>

          <ion-item>
            <ion-label position="stacked">Case Type *</ion-label>
            <ion-select v-model="form.caseType" placeholder="Select…">
              <ion-select-option value="breach-of-contract">Breach of Contract</ion-select-option>
              <ion-select-option value="tort">Tort</ion-select-option>
              <ion-select-option value="employment">Employment</ion-select-option>
              <ion-select-option value="ip">Intellectual Property</ion-select-option>
              <ion-select-option value="securities">Securities</ion-select-option>
              <ion-select-option value="antitrust">Antitrust</ion-select-option>
              <ion-select-option value="other">Other</ion-select-option>
            </ion-select>
          </ion-item>
          <p v-if="errors.caseType" class="field-error">{{ errors.caseType }}</p>
        </section>

        <!-- Claims -->
        <section class="form-section">
          <div class="section-header">
            <h3 class="section-title">Claims *</h3>
            <ion-button size="small" fill="outline" @click="addClaim">+ Add Claim</ion-button>
          </div>
          <p v-if="errors.claims" class="field-error">{{ errors.claims }}</p>
          <div v-for="(claim, i) in form.claims" :key="i" class="list-item-card">
            <div class="card-header">
              <span class="card-label">Claim {{ i + 1 }}</span>
              <ion-button fill="clear" color="danger" size="small" @click="removeClaim(i)">Remove</ion-button>
            </div>
            <ion-item>
              <ion-label position="stacked">Description</ion-label>
              <ion-input v-model="claim.description" placeholder="e.g. Breach of payment obligation" />
            </ion-item>
            <ion-item>
              <ion-label position="stacked">Elements (comma-separated)</ion-label>
              <ion-textarea v-model="claim.elementsText" placeholder="Element 1, Element 2, Element 3" :rows="2" />
            </ion-item>
            <ion-item>
              <ion-label position="stacked">Standard of Proof</ion-label>
              <ion-select v-model="claim.standardOfProof" placeholder="Select…">
                <ion-select-option value="preponderance">Preponderance of Evidence</ion-select-option>
                <ion-select-option value="clear-and-convincing">Clear and Convincing</ion-select-option>
                <ion-select-option value="beyond-reasonable-doubt">Beyond Reasonable Doubt</ion-select-option>
              </ion-select>
            </ion-item>
          </div>
        </section>

        <!-- Defenses -->
        <section class="form-section">
          <div class="section-header">
            <h3 class="section-title">Defenses</h3>
            <ion-button size="small" fill="outline" @click="addDefense">+ Add Defense</ion-button>
          </div>
          <div v-for="(defense, i) in form.defenses" :key="i" class="list-item-card">
            <div class="card-header">
              <span class="card-label">Defense {{ i + 1 }}</span>
              <ion-button fill="clear" color="danger" size="small" @click="removeDefense(i)">Remove</ion-button>
            </div>
            <ion-item>
              <ion-label position="stacked">Description</ion-label>
              <ion-input v-model="defense.description" placeholder="e.g. Force majeure" />
            </ion-item>
            <ion-item>
              <ion-label position="stacked">Type</ion-label>
              <ion-select v-model="defense.type" placeholder="Select…">
                <ion-select-option value="affirmative">Affirmative</ion-select-option>
                <ion-select-option value="negating">Negating</ion-select-option>
              </ion-select>
            </ion-item>
          </div>
        </section>

        <!-- Evidence -->
        <section class="form-section">
          <div class="section-header">
            <h3 class="section-title">Evidence *</h3>
            <ion-button size="small" fill="outline" @click="addEvidence">+ Add Evidence</ion-button>
          </div>
          <p v-if="errors.evidence" class="field-error">{{ errors.evidence }}</p>
          <div v-for="(ev, i) in form.evidence" :key="i" class="list-item-card">
            <div class="card-header">
              <span class="card-label">Evidence {{ i + 1 }}</span>
              <ion-button fill="clear" color="danger" size="small" @click="removeEvidence(i)">Remove</ion-button>
            </div>
            <ion-item>
              <ion-label position="stacked">Type</ion-label>
              <ion-select v-model="ev.type" placeholder="Select…">
                <ion-select-option value="document">Document</ion-select-option>
                <ion-select-option value="testimony">Testimony</ion-select-option>
                <ion-select-option value="physical">Physical</ion-select-option>
                <ion-select-option value="expert-report">Expert Report</ion-select-option>
                <ion-select-option value="digital">Digital</ion-select-option>
              </ion-select>
            </ion-item>
            <ion-item>
              <ion-label position="stacked">Description</ion-label>
              <ion-input v-model="ev.description" placeholder="e.g. Signed contract" />
            </ion-item>
            <ion-item>
              <ion-label position="stacked">Strength</ion-label>
              <ion-select v-model="ev.strength" placeholder="Select…">
                <ion-select-option value="strong">Strong</ion-select-option>
                <ion-select-option value="moderate">Moderate</ion-select-option>
                <ion-select-option value="weak">Weak</ion-select-option>
              </ion-select>
            </ion-item>
            <ion-item>
              <ion-label position="stacked">Admissibility Risk</ion-label>
              <ion-select v-model="ev.admissibilityRisk" placeholder="Select…">
                <ion-select-option value="low">Low</ion-select-option>
                <ion-select-option value="medium">Medium</ion-select-option>
                <ion-select-option value="high">High</ion-select-option>
              </ion-select>
            </ion-item>
          </div>
        </section>

        <!-- Witnesses -->
        <section class="form-section">
          <div class="section-header">
            <h3 class="section-title">Witnesses</h3>
            <ion-button size="small" fill="outline" @click="addWitness">+ Add Witness</ion-button>
          </div>
          <div v-for="(wit, i) in form.witnesses" :key="i" class="list-item-card">
            <div class="card-header">
              <span class="card-label">Witness {{ i + 1 }}</span>
              <ion-button fill="clear" color="danger" size="small" @click="removeWitness(i)">Remove</ion-button>
            </div>
            <ion-item>
              <ion-label position="stacked">Name</ion-label>
              <ion-input v-model="wit.name" placeholder="e.g. Jane Smith" />
            </ion-item>
            <ion-item>
              <ion-label position="stacked">Type</ion-label>
              <ion-select v-model="wit.type" placeholder="Select…">
                <ion-select-option value="fact">Fact</ion-select-option>
                <ion-select-option value="expert">Expert</ion-select-option>
                <ion-select-option value="party">Party</ion-select-option>
                <ion-select-option value="character">Character</ion-select-option>
              </ion-select>
            </ion-item>
            <ion-item>
              <ion-label position="stacked">Side</ion-label>
              <ion-select v-model="wit.side" placeholder="Select…">
                <ion-select-option value="plaintiff">Plaintiff</ion-select-option>
                <ion-select-option value="defense">Defense</ion-select-option>
                <ion-select-option value="neutral">Neutral</ion-select-option>
              </ion-select>
            </ion-item>
            <ion-item>
              <ion-label position="stacked">Key Testimony</ion-label>
              <ion-textarea v-model="wit.keyTestimony" placeholder="Summary of key testimony…" :rows="2" />
            </ion-item>
            <ion-item>
              <ion-label position="stacked">Credibility Factors (comma-separated)</ion-label>
              <ion-textarea v-model="wit.credibilityFactorsText" placeholder="Prior consistent statements, Expert credentials…" :rows="2" />
            </ion-item>
          </div>
        </section>

        <!-- Damages -->
        <section class="form-section">
          <div class="section-header">
            <h3 class="section-title">Damages Model *</h3>
            <ion-button size="small" fill="outline" @click="addDamage">+ Add Entry</ion-button>
          </div>
          <p v-if="errors.damages" class="field-error">{{ errors.damages }}</p>
          <div v-for="(dmg, i) in form.damages" :key="i" class="list-item-card">
            <div class="card-header">
              <span class="card-label">Damages {{ i + 1 }}</span>
              <ion-button fill="clear" color="danger" size="small" @click="removeDamage(i)">Remove</ion-button>
            </div>
            <ion-item>
              <ion-label position="stacked">Type</ion-label>
              <ion-select v-model="dmg.type" placeholder="Select…">
                <ion-select-option value="compensatory">Compensatory</ion-select-option>
                <ion-select-option value="punitive">Punitive</ion-select-option>
                <ion-select-option value="statutory">Statutory</ion-select-option>
                <ion-select-option value="restitutionary">Restitutionary</ion-select-option>
              </ion-select>
            </ion-item>
            <ion-item>
              <ion-label position="stacked">Range Min ($)</ion-label>
              <ion-input v-model.number="dmg.rangeMin" type="number" placeholder="0" />
            </ion-item>
            <ion-item>
              <ion-label position="stacked">Range Max ($)</ion-label>
              <ion-input v-model.number="dmg.rangeMax" type="number" placeholder="0" />
            </ion-item>
            <ion-item>
              <ion-label position="stacked">Calculation Method</ion-label>
              <ion-textarea v-model="dmg.calculation" placeholder="e.g. Unpaid invoices plus lost profits" :rows="2" />
            </ion-item>
          </div>
        </section>

        <!-- Simulation Settings -->
        <section class="form-section">
          <h3 class="section-title">Simulation Settings</h3>
          <ion-item>
            <ion-label position="stacked">Simulation Count (1–200)</ion-label>
            <ion-input
              v-model.number="form.simulationCount"
              type="number"
              :min="1"
              :max="200"
              placeholder="50"
            />
          </ion-item>
          <div v-if="form.simulationCount > 100" class="warning-banner">
            Running more than 100 simulations on a local model can take 1–3+ hours.
          </div>

          <div class="checkbox-group">
            <p class="checkbox-group-label">Variation Parameters:</p>
            <ion-item lines="none">
              <ion-checkbox v-model="variationParams.jury" slot="start" />
              <ion-label>Jury Composition</ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-checkbox v-model="variationParams.judge" slot="start" />
              <ion-label>Judge Profile</ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-checkbox v-model="variationParams['evidence-admissibility']" slot="start" />
              <ion-label>Evidence Admissibility</ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-checkbox v-model="variationParams['witness-credibility']" slot="start" />
              <ion-label>Witness Credibility</ion-label>
            </ion-item>
          </div>
        </section>

        <div class="form-actions">
          <ion-button expand="block" :disabled="estimating" @click="handleEstimate">
            <ion-spinner v-if="estimating" name="crescent" slot="start" />
            {{ estimating ? 'Estimating…' : 'Estimate Cost' }}
          </ion-button>
          <p v-if="estimateError" class="field-error">{{ estimateError }}</p>
        </div>
      </div>
    </ion-content>

    <CostEstimateDialog
      v-if="estimate"
      :open="estimateDialogOpen"
      :estimate="estimate"
      :context="context"
      :case-record="buildCaseRecord()"
      @close="estimateDialogOpen = false"
      @queued="onQueued"
    />
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonItem,
  IonLabel,
  IonInput,
  IonTextarea,
  IonSelect,
  IonSelectOption,
  IonCheckbox,
  IonSpinner,
} from '@ionic/vue';
import { legalJobsService } from '../legalJobsService';
import type { ExecutionContextLike } from '../legalJobsService';
import type { CostEstimateOutput } from './types';
import CostEstimateDialog from './CostEstimateDialog.vue';

interface ClaimForm {
  description: string;
  elementsText: string;
  standardOfProof: string;
}
interface DefenseForm {
  description: string;
  type: string;
}
interface EvidenceForm {
  type: string;
  description: string;
  strength: string;
  admissibilityRisk: string;
}
interface WitnessForm {
  name: string;
  type: string;
  side: string;
  keyTestimony: string;
  credibilityFactorsText: string;
}
interface DamageForm {
  type: string;
  rangeMin: number;
  rangeMax: number;
  calculation: string;
}

const props = defineProps<{
  open: boolean;
  context: ExecutionContextLike;
}>();

const emit = defineEmits<{
  close: [];
  queued: [jobId: string];
}>();

const form = reactive({
  matterId: '',
  jurisdiction: '',
  courtLevel: 'federal-district',
  caseType: '',
  simulationCount: 50,
  claims: [] as ClaimForm[],
  defenses: [] as DefenseForm[],
  evidence: [] as EvidenceForm[],
  witnesses: [] as WitnessForm[],
  damages: [] as DamageForm[],
});

const variationParams = reactive({
  jury: true,
  judge: true,
  'evidence-admissibility': true,
  'witness-credibility': true,
});

const errors = reactive<Record<string, string>>({});
const estimating = ref(false);
const estimateError = ref('');
const estimate = ref<CostEstimateOutput | null>(null);
const estimateDialogOpen = ref(false);

function addClaim() {
  form.claims.push({ description: '', elementsText: '', standardOfProof: 'preponderance' });
}
function removeClaim(i: number) {
  form.claims.splice(i, 1);
}
function addDefense() {
  form.defenses.push({ description: '', type: 'affirmative' });
}
function removeDefense(i: number) {
  form.defenses.splice(i, 1);
}
function addEvidence() {
  form.evidence.push({ type: 'document', description: '', strength: 'moderate', admissibilityRisk: 'low' });
}
function removeEvidence(i: number) {
  form.evidence.splice(i, 1);
}
function addWitness() {
  form.witnesses.push({ name: '', type: 'fact', side: 'plaintiff', keyTestimony: '', credibilityFactorsText: '' });
}
function removeWitness(i: number) {
  form.witnesses.splice(i, 1);
}
function addDamage() {
  form.damages.push({ type: 'compensatory', rangeMin: 0, rangeMax: 0, calculation: '' });
}
function removeDamage(i: number) {
  form.damages.splice(i, 1);
}

function validate(): boolean {
  Object.keys(errors).forEach((k) => delete errors[k]);
  let valid = true;
  if (!form.matterId.trim()) { errors.matterId = 'Matter ID is required'; valid = false; }
  if (!form.jurisdiction.trim()) { errors.jurisdiction = 'Jurisdiction is required'; valid = false; }
  if (!form.caseType) { errors.caseType = 'Case type is required'; valid = false; }
  if (form.claims.length === 0) { errors.claims = 'At least one claim is required'; valid = false; }
  if (form.evidence.length === 0) { errors.evidence = 'At least one evidence item is required'; valid = false; }
  if (form.damages.length === 0) { errors.damages = 'At least one damages entry is required'; valid = false; }
  return valid;
}

function buildCaseRecord() {
  const variationParamList = (Object.keys(variationParams) as Array<keyof typeof variationParams>)
    .filter((k) => variationParams[k]);

  return {
    matterId: form.matterId.trim(),
    jurisdiction: form.jurisdiction.trim(),
    courtLevel: form.courtLevel,
    caseType: form.caseType,
    simulationCount: Math.min(200, Math.max(1, form.simulationCount || 50)),
    variationParameters: variationParamList,
    claims: form.claims.map((c, i) => ({
      claimId: `c${i + 1}`,
      description: c.description,
      elements: c.elementsText.split(',').map((s) => s.trim()).filter(Boolean),
      standardOfProof: c.standardOfProof || 'preponderance',
    })),
    defenses: form.defenses.map((d, i) => ({
      defenseId: `d${i + 1}`,
      description: d.description,
      type: d.type || 'affirmative',
    })),
    evidence: form.evidence.map((e, i) => ({
      evidenceId: `ev-${i + 1}`,
      type: e.type || 'document',
      description: e.description,
      supportsClaims: [],
      supportsDefenses: [],
      strength: e.strength || 'moderate',
      admissibilityRisk: e.admissibilityRisk || 'low',
    })),
    witnesses: form.witnesses.map((w, i) => ({
      witnessId: `wit-${i + 1}`,
      name: w.name,
      type: w.type || 'fact',
      side: w.side || 'plaintiff',
      keyTestimony: w.keyTestimony,
      credibilityFactors: w.credibilityFactorsText.split(',').map((s) => s.trim()).filter(Boolean),
    })),
    damagesModel: form.damages.map((d) => ({
      type: d.type || 'compensatory',
      rangeMin: d.rangeMin || 0,
      rangeMax: d.rangeMax || 0,
      calculation: d.calculation,
    })),
  };
}

async function handleEstimate() {
  if (!validate()) return;
  estimating.value = true;
  estimateError.value = '';
  try {
    const result = await legalJobsService.estimateMonteCarloCost({
      simulationCount: form.simulationCount,
      evidenceCount: form.evidence.length,
      witnessCount: form.witnesses.length,
      provider: props.context.provider,
    });
    estimate.value = result;
    estimateDialogOpen.value = true;
  } catch (err) {
    estimateError.value = err instanceof Error ? err.message : 'Failed to get estimate';
  } finally {
    estimating.value = false;
  }
}

function onQueued(jobId: string) {
  estimateDialogOpen.value = false;
  emit('queued', jobId);
}
</script>

<style scoped>
.form-content {
  --padding-bottom: 32px;
}
.form-body {
  max-width: 700px;
  margin: 0 auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.form-section {
  border: 1px solid var(--ion-color-light-shade);
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.section-title {
  margin: 0 0 8px;
  font-size: 1rem;
  font-weight: 600;
}
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.section-header .section-title {
  margin: 0;
}
.list-item-card {
  border: 1px solid var(--ion-color-light-shade);
  border-radius: 6px;
  padding: 8px;
  margin-top: 8px;
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}
.card-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--ion-color-medium);
}
.field-error {
  color: var(--ion-color-danger);
  font-size: 0.8rem;
  margin: 4px 0 0 4px;
}
.warning-banner {
  background: var(--ion-color-warning-tint);
  color: var(--ion-color-warning-shade);
  border-radius: 6px;
  padding: 10px 14px;
  font-size: 0.875rem;
  margin-top: 8px;
}
.checkbox-group {
  margin-top: 12px;
}
.checkbox-group-label {
  font-size: 0.875rem;
  color: var(--ion-color-medium);
  margin: 0 0 4px 16px;
}
.form-actions {
  margin-top: 16px;
}
</style>
