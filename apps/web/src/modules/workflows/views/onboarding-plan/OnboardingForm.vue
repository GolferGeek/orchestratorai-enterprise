<template>
  <div class="onboarding">
    <form class="form" @submit.prevent="record">
      <h3>Record a new hire</h3>
      <div class="row">
        <label class="field"><span>Full name</span><input v-model="hire.fullName" maxlength="200" :disabled="disabled" /></label>
        <label class="field"><span>Role</span><input v-model="hire.roleTitle" maxlength="200" placeholder="e.g. Customer Support Specialist" :disabled="disabled" /></label>
      </div>
      <div class="row">
        <label class="field"><span>Team</span><input v-model="hire.team" maxlength="200" :disabled="disabled" /></label>
        <label class="field"><span>Manager</span><input v-model="hire.managerName" maxlength="200" :disabled="disabled" /></label>
      </div>
      <div class="row">
        <label class="field"><span>Location</span><input v-model="hire.location" maxlength="200" placeholder="e.g. Remote (Denver, CO)" :disabled="disabled" /></label>
        <label class="field">
          <span>Employment type</span>
          <select v-model="hire.employmentType" :disabled="disabled">
            <option value="full-time">Full-time</option>
            <option value="part-time">Part-time</option>
            <option value="contractor">Contractor</option>
          </select>
        </label>
        <label class="field"><span>Start date</span><input v-model="hire.startDate" type="date" :disabled="disabled" /></label>
      </div>
      <label class="field">
        <span>Notes <span class="note">(optional: relocation, accommodations, access needs)</span></span>
        <textarea v-model="notes" rows="3" maxlength="2000" :disabled="disabled" />
      </label>
      <div class="actions">
        <ion-button type="submit" :disabled="disabled || !complete">{{ saving ? 'Recording...' : 'Record hire' }}</ion-button>
        <ion-button fill="outline" :disabled="disabled || !complete" @click="emit('start', { hire: fields() })">Plan now</ion-button>
      </div>
      <p class="note">Recording the hire starts their plan on its own. Plan now starts it here and records the hire with it.</p>
      <p v-if="problem" class="problem">{{ problem }}</p>
    </form>

    <section class="hires">
      <h3>Recent hires</h3>
      <p v-if="!hires.length" class="note">No new hires recorded yet.</p>
      <table v-else>
        <tr v-for="h in hires" :key="h.id">
          <td><strong>{{ h.fullName }}</strong><div class="note">{{ h.roleTitle }}, {{ h.team }}</div></td>
          <td class="note">starts {{ h.startDate }}</td>
          <td>
            <router-link v-if="h.onboardingRunId" :to="{ name: 'OnboardingPlan', query: { conversationId: h.onboardingRunId } }">Open plan</router-link>
            <span v-else-if="justRecorded(h)" class="note">Starting...</span>
            <ion-button v-else size="small" fill="outline" :disabled="disabled" @click="emit('start', { hireId: h.id })">Start plan</ion-button>
          </td>
        </tr>
      </table>
    </section>
  </div>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { IonButton } from '@ionic/vue';
import type { JsonValue } from '@orchestrator-ai/transport-types';
import { newHiresApi, type NewHire, type NewHireFields } from './newHiresApi';

const props = defineProps<{ busy: boolean; blocked: boolean; example: JsonValue | null }>();
const emit = defineEmits<{ start: [input: JsonValue] }>();

const blank = (): Omit<NewHireFields, 'notes'> => ({ fullName: '', roleTitle: '', team: '', managerName: '', location: '', employmentType: 'full-time', startDate: '' });
const hire = reactive(blank());
const notes = ref('');
const hires = ref<NewHire[]>([]);
const saving = ref(false);
const problem = ref<string | null>(null);
let poll: ReturnType<typeof setInterval> | null = null;

const disabled = computed(() => props.blocked || props.busy || saving.value);
const complete = computed(() => Object.values(hire).every((v) => v.trim() !== ''));

function fields(): NewHireFields {
  return {
    fullName: hire.fullName.trim(),
    roleTitle: hire.roleTitle.trim(),
    team: hire.team.trim(),
    managerName: hire.managerName.trim(),
    location: hire.location.trim(),
    employmentType: hire.employmentType,
    startDate: hire.startDate,
    notes: notes.value.trim() || null,
  };
}

async function load(): Promise<void> {
  if (props.blocked) return;
  try {
    hires.value = await newHiresApi.list();
    problem.value = null;
  } catch (error) {
    problem.value = error instanceof Error ? error.message : String(error);
  }
  // A just-recorded hire gets its run from the trigger within seconds; one
  // without a run after that is offered "Start plan" instead.
  const waiting = hires.value.some(justRecorded);
  if (waiting && !poll) poll = setInterval(() => void load(), 3000);
  if (!waiting && poll) {
    clearInterval(poll);
    poll = null;
  }
}

/** A hire recorded under a minute ago whose trigger-started run has not appeared yet. */
function justRecorded(h: NewHire): boolean {
  return !h.onboardingRunId && Date.now() - Date.parse(h.createdAt) < 60_000;
}

async function record(): Promise<void> {
  saving.value = true;
  problem.value = null;
  try {
    await newHiresApi.add(fields());
    Object.assign(hire, blank());
    notes.value = '';
    await load();
  } catch (error) {
    problem.value = error instanceof Error ? error.message : String(error);
  } finally {
    saving.value = false;
  }
}

watch(() => props.example, (e) => {
  const x = (e as { hire?: NewHireFields } | null)?.hire;
  if (!x) return;
  Object.assign(hire, { fullName: x.fullName, roleTitle: x.roleTitle, team: x.team, managerName: x.managerName, location: x.location, employmentType: x.employmentType, startDate: x.startDate });
  notes.value = x.notes ?? '';
});
watch(() => props.blocked, () => void load());
onMounted(load);
onBeforeUnmount(() => {
  if (poll) clearInterval(poll);
});
</script>

<style src="../../kit/workflow-form.css" scoped></style>
<style scoped>
.onboarding { display: flex; flex-direction: column; gap: 24px; }
h3 { margin: 0; font-size: 15px; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.note { font-weight: 400; color: var(--ion-color-medium); font-size: 12px; margin: 0; }
.problem { color: var(--ion-color-danger); margin: 0; }
.hires table { border-collapse: collapse; font-size: 13px; width: 100%; }
.hires td { padding: 6px 12px 6px 0; vertical-align: top; border-top: 1px solid var(--ion-color-light-shade); }
</style>
