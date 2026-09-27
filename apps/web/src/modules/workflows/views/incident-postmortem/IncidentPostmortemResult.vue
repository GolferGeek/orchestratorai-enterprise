<template>
  <article class="pm">
    <p :class="['sev', `sev--${result.severity}`]">{{ result.severity }}</p>
    <h3>Summary</h3>
    <p>{{ result.postmortem.summary }}</p>
    <h3>Impact</h3>
    <p>{{ result.postmortem.impact }}</p>
    <h3>Timeline</h3>
    <table>
      <tr v-for="(e, i) in result.postmortem.timeline" :key="i"><td class="time">{{ e.time }}</td><td>{{ e.event }}</td></tr>
    </table>
    <h3>Root cause</h3>
    <p>{{ result.postmortem.rootCause }}</p>
    <template v-for="section in LISTS" :key="section.key">
      <h3>{{ section.label }}</h3>
      <ul v-if="result.postmortem[section.key].length"><li v-for="(x, i) in result.postmortem[section.key]" :key="i">{{ x }}</li></ul>
      <p v-else class="muted">None noted.</p>
    </template>
    <h3>Action items</h3>
    <table class="actions">
      <tr v-for="a in result.actionItems" :key="a.key">
        <td><span :class="['prio', `prio--${a.priority}`]">{{ a.priority }}</span></td>
        <td>{{ a.title }}<div class="muted">{{ a.owner }} · {{ a.due }}</div></td>
        <td class="muted">{{ a.task ? `${a.task.provider} task ${a.task.id.slice(0, 8)}` : '' }}</td>
      </tr>
    </table>
  </article>
</template>

<script lang="ts" setup>
/** A completed postmortem (postmortem.result.ts). */
export interface PostmortemRunResult {
  title: string;
  severity: 'SEV1' | 'SEV2' | 'SEV3';
  postmortem: {
    summary: string;
    impact: string;
    timeline: Array<{ time: string; event: string }>;
    rootCause: string;
    contributingFactors: string[];
    whatWentWell: string[];
    lessons: string[];
  };
  actionItems: Array<{ key: string; title: string; owner: string; priority: string; due: string; task: { provider: string; id: string } | null }>;
}

defineProps<{ result: PostmortemRunResult }>();
const LISTS = [
  { key: 'contributingFactors', label: 'Contributing factors' },
  { key: 'whatWentWell', label: 'What went well' },
  { key: 'lessons', label: 'Lessons' },
] as const;
</script>

<style scoped>
.pm { display: flex; flex-direction: column; gap: 4px; max-width: 820px; }
.pm h3 { margin: 12px 0 2px; font-size: 15px; }
.pm p { margin: 0; line-height: 1.55; }
.sev { font-weight: 700; font-size: 16px; margin: 0; }
.sev--SEV1 { color: var(--ion-color-danger); }
.sev--SEV2 { color: var(--ion-color-warning-shade); }
table { border-collapse: collapse; font-size: 13px; }
td { padding: 4px 12px 4px 0; vertical-align: top; }
.time { white-space: nowrap; color: var(--ion-color-medium); }
ul { margin: 0; padding-left: 18px; }
.muted { color: var(--ion-color-medium); font-size: 12px; }
.prio { font-size: 11px; font-weight: 600; text-transform: uppercase; }
.prio--high { color: var(--ion-color-danger); }
.prio--medium { color: var(--ion-color-warning-shade); }
</style>
