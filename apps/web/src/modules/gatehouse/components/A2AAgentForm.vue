<script setup lang="ts">
import { computed, ref } from 'vue';
import type { A2AAgentDraft, A2AConfig, A2ATarget, A2ATargetKind } from '../types';

/**
 * An A2A agent's name, description, target and caller policy. The API checks
 * all of it with the loader's own parser; this form only shapes it.
 */
const props = defineProps<{
  initial?: A2AAgentDraft;
  /** Creating: ask for the slug (and the org, for an admin of every org). */
  creating?: boolean;
  askOrg?: boolean;
  saving?: boolean;
}>();
const emit = defineEmits<{ submit: [draft: A2AAgentDraft & { slug?: string; orgSlug?: string }]; cancel: [] }>();

const target = props.initial?.a2a.target;
const slug = ref('');
const orgSlug = ref('');
const name = ref(props.initial?.name ?? '');
const description = ref(props.initial?.description ?? '');
const kind = ref<A2ATargetKind>(target?.kind ?? 'ambient');
const event = ref(target?.kind === 'ambient' ? target.event : '');
const agentSlug = ref(target?.kind === 'agent' ? target.agentSlug : '');
const workflowSlug = ref(target?.kind === 'workflow' ? target.workflowSlug : '');
const textField = ref(target?.kind === 'workflow' ? (target.textField ?? '') : '');
const workflowInput = ref(target?.kind === 'workflow' && target.input ? JSON.stringify(target.input, null, 2) : '');
const cardUrl = ref(target?.kind === 'a2a' ? target.cardUrl : '');
const send = ref<'all' | 'text'>(target?.kind === 'a2a' ? target.send : 'all');
const callers = props.initial?.a2a.callers;
const callerMode = ref<'any' | 'allow'>(callers === undefined || callers === 'any' ? 'any' : 'allow');
const allowList = ref(callers && callers !== 'any' ? callers.allow.join('\n') : '');
const problem = ref<string | null>(null);

const kinds: Array<{ value: A2ATargetKind; label: string }> = [
  { value: 'ambient', label: 'Raise an ambient event (the caller gets "received")' },
  { value: 'agent', label: 'Call one of our agents (the caller gets its answer)' },
  { value: 'workflow', label: 'Start a workflow run (the caller can follow it)' },
  { value: 'a2a', label: 'Forward to a partner A2A agent' },
];

const inputClass =
  'w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500';

const keptAuth = computed(() => (target?.kind === 'a2a' && kind.value === 'a2a' ? target.auth : undefined));

function buildTarget(): A2ATarget {
  switch (kind.value) {
    case 'ambient':
      return { kind: 'ambient', event: event.value.trim() };
    case 'agent':
      return { kind: 'agent', agentSlug: agentSlug.value.trim() };
    case 'workflow': {
      const input = workflowInput.value.trim() ? (JSON.parse(workflowInput.value) as Record<string, unknown>) : undefined;
      return {
        kind: 'workflow',
        workflowSlug: workflowSlug.value.trim(),
        ...(textField.value.trim() ? { textField: textField.value.trim() } : {}),
        ...(input ? { input } : {}),
      };
    }
    case 'a2a':
      return { kind: 'a2a', cardUrl: cardUrl.value.trim(), send: send.value, ...(keptAuth.value ? { auth: keptAuth.value } : {}) };
  }
}

function submit() {
  problem.value = null;
  let a2aTarget: A2ATarget;
  try {
    a2aTarget = buildTarget();
  } catch {
    problem.value = 'The fixed workflow input must be a JSON object';
    return;
  }
  const allow = allowList.value.split('\n').map((line) => line.trim()).filter(Boolean);
  if (callerMode.value === 'allow' && allow.length === 0) {
    problem.value = 'List at least one caller card URL, or let any registered caller in';
    return;
  }
  const a2a: A2AConfig = { target: a2aTarget, callers: callerMode.value === 'any' ? 'any' : { allow } };
  emit('submit', {
    name: name.value,
    description: description.value,
    a2a,
    ...(props.creating ? { slug: slug.value.trim() } : {}),
    ...(props.askOrg ? { orgSlug: orgSlug.value.trim() } : {}),
  });
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="submit">
    <div v-if="creating" class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-xs text-gray-400 mb-1">Slug (its URL: /api/a2a/&lt;slug&gt;)</label>
        <input v-model="slug" :class="inputClass" placeholder="send-invoice" required />
      </div>
      <div v-if="askOrg">
        <label class="block text-xs text-gray-400 mb-1">Organization</label>
        <input v-model="orgSlug" :class="inputClass" placeholder="finance" required />
      </div>
    </div>
    <div>
      <label class="block text-xs text-gray-400 mb-1">Name (shown on its card)</label>
      <input v-model="name" :class="inputClass" required />
    </div>
    <div>
      <label class="block text-xs text-gray-400 mb-1">Description (tells partners what to send)</label>
      <textarea v-model="description" :class="inputClass" rows="3" required />
    </div>

    <div>
      <label class="block text-xs text-gray-400 mb-1">A call to it</label>
      <select v-model="kind" :class="inputClass">
        <option v-for="k in kinds" :key="k.value" :value="k.value">{{ k.label }}</option>
      </select>
    </div>
    <div v-if="kind === 'ambient'">
      <label class="block text-xs text-gray-400 mb-1">Event</label>
      <input v-model="event" :class="inputClass" placeholder="invoice.received" required />
    </div>
    <div v-else-if="kind === 'agent'">
      <label class="block text-xs text-gray-400 mb-1">Agent slug</label>
      <input v-model="agentSlug" :class="inputClass" required />
    </div>
    <div v-else-if="kind === 'workflow'" class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs text-gray-400 mb-1">Workflow slug</label>
          <input v-model="workflowSlug" :class="inputClass" placeholder="submittal-review" required />
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Input field for the message text (optional)</label>
          <input v-model="textField" :class="inputClass" placeholder="submittalText" />
        </div>
      </div>
      <div>
        <label class="block text-xs text-gray-400 mb-1">Fixed input, as JSON (optional; merged with the message's data)</label>
        <textarea v-model="workflowInput" :class="[inputClass, 'font-mono']" rows="3" />
      </div>
    </div>
    <div v-else class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-xs text-gray-400 mb-1">Partner card URL (https, A2A v1.0)</label>
        <input v-model="cardUrl" :class="inputClass" required />
      </div>
      <div>
        <label class="block text-xs text-gray-400 mb-1">Send</label>
        <select v-model="send" :class="inputClass">
          <option value="all">Text and data</option>
          <option value="text">Text only</option>
        </select>
      </div>
      <p v-if="keptAuth" class="text-xs text-gray-500">This agent's configured credential is kept.</p>
    </div>

    <div>
      <label class="block text-xs text-gray-400 mb-1">Who may call it</label>
      <select v-model="callerMode" :class="inputClass">
        <option value="any">Any registered caller</option>
        <option value="allow">Only these callers</option>
      </select>
      <textarea
        v-if="callerMode === 'allow'"
        v-model="allowList"
        :class="[inputClass, 'font-mono mt-2']"
        rows="3"
        placeholder="One caller agent card URL per line"
      />
    </div>

    <p v-if="problem" class="text-red-400 text-sm">{{ problem }}</p>
    <div class="flex gap-3">
      <button type="submit" class="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded font-medium" :disabled="saving">
        {{ creating ? 'Create (disabled until published)' : 'Save' }}
      </button>
      <button type="button" class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded font-medium" @click="emit('cancel')">Cancel</button>
    </div>
  </form>
</template>
