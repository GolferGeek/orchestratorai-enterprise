<template>
  <div class="sub">
    <p :class="['action', `action--${result.action}`]">{{ ACTIONS[result.action] }} - Section {{ result.specSection }}</p>
    <div class="letter">{{ result.letter }}</div>
    <h4>Findings</h4>
    <table>
      <thead><tr><th>Ref</th><th>Requirement</th><th>Finding</th><th>Evidence</th></tr></thead>
      <tbody>
        <tr v-for="f in result.findings" :key="f.ref">
          <td>{{ f.ref }}</td>
          <td>{{ f.requirement }}<div class="note">{{ f.note }}</div></td>
          <td :class="`status--${f.status}`">{{ f.status }}</td>
          <td class="evidence">
            <template v-if="f.evidence">"{{ f.evidence }}" <span v-if="f.evidenceVerified === false" class="unverified">not in the submittal</span></template>
            <template v-else>-</template>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script lang="ts" setup>
/** A completed submittal review (submittal-review.result.ts). */
export interface SubmittalReviewRunResult {
  specSection: string;
  action: 'approved' | 'approved_as_noted' | 'revise_and_resubmit';
  letter: string;
  findings: Array<{ ref: string; requirement: string; status: string; evidence: string | null; note: string; evidenceVerified: boolean | null }>;
}

defineProps<{ result: SubmittalReviewRunResult }>();
const ACTIONS = { approved: 'Approved', approved_as_noted: 'Approved as noted', revise_and_resubmit: 'Revise and resubmit' };
</script>

<style scoped>
.sub { display: flex; flex-direction: column; gap: 10px; }
.action { margin: 0; font-size: 18px; font-weight: 600; }
.action--approved { color: var(--ion-color-success); }
.action--approved_as_noted { color: var(--ion-color-warning-shade); }
.action--revise_and_resubmit { color: var(--ion-color-danger); }
.letter { white-space: pre-wrap; line-height: 1.55; border-left: 3px solid var(--ion-color-light-shade); padding-left: 12px; }
h4 { margin: 6px 0 0; }
table { border-collapse: collapse; font-size: 13px; }
th, td { padding: 6px 10px 6px 0; text-align: left; vertical-align: top; }
th { font-size: 11px; text-transform: uppercase; color: var(--ion-color-medium); }
.note { font-size: 12px; color: var(--ion-color-medium); }
.evidence { font-style: italic; max-width: 320px; }
.status--deviation, .status--missing { color: var(--ion-color-danger); font-weight: 600; }
.status--compliant { color: var(--ion-color-success); }
.status--noted { color: var(--ion-color-warning-shade); }
.unverified { color: var(--ion-color-danger); font-style: normal; font-weight: 600; }
</style>
