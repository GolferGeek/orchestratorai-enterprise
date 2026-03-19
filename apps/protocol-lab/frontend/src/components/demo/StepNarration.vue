<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import type { DemoStep } from '../../stores/demo.store';

const props = defineProps<{
  step: DemoStep;
}>();

const displayedText = ref('');
let typingTimer: ReturnType<typeof setInterval> | null = null;

const AGENT_COLORS: Record<string, string> = {
  'Protocol API': 'bg-blue-600',
  'ResearchHub': 'bg-emerald-600',
  'MarketPulse': 'bg-amber-600',
  'ContentForge': 'bg-purple-600',
  'DataMiner-7': 'bg-rose-600',
};

function getAgentColor(agent: string): string {
  return AGENT_COLORS[agent] ?? 'bg-gray-600';
}

const PROTOCOL_COLORS: Record<string, string> = {
  discovery: 'text-blue-400 border-blue-400',
  transport: 'text-green-400 border-green-400',
  negotiation: 'text-purple-400 border-purple-400',
  identity: 'text-orange-400 border-orange-400',
  payment: 'text-yellow-400 border-yellow-400',
  trust: 'text-teal-400 border-teal-400',
  encryption: 'text-red-400 border-red-400',
  resilience: 'text-cyan-400 border-cyan-400',
  observability: 'text-pink-400 border-pink-400',
  orchestration: 'text-indigo-400 border-indigo-400',
};

function getProtocolColor(protocol: string): string {
  return PROTOCOL_COLORS[protocol] ?? 'text-gray-400 border-gray-400';
}

function startTyping() {
  stopTyping();
  displayedText.value = '';
  let index = 0;
  const text = props.step.narration;

  typingTimer = setInterval(() => {
    if (index < text.length) {
      displayedText.value = text.slice(0, index + 1);
      index++;
    } else {
      stopTyping();
    }
  }, 18);
}

function stopTyping() {
  if (typingTimer !== null) {
    clearInterval(typingTimer);
    typingTimer = null;
  }
}

watch(
  () => props.step.id,
  () => {
    startTyping();
  },
  { immediate: true },
);

onUnmounted(() => {
  stopTyping();
});
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center gap-3 flex-wrap">
      <span
        v-if="step.fromAgent"
        :class="['px-2.5 py-1 rounded-full text-xs font-medium text-white', getAgentColor(step.fromAgent)]"
      >
        {{ step.fromAgent }}
      </span>
      <svg
        v-if="step.fromAgent && step.toAgent"
        class="w-4 h-4 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
      </svg>
      <span
        v-if="step.toAgent"
        :class="['px-2.5 py-1 rounded-full text-xs font-medium text-white', getAgentColor(step.toAgent)]"
      >
        {{ step.toAgent }}
      </span>
      <span
        v-if="step.protocol"
        :class="['px-2.5 py-1 rounded text-xs font-medium border', getProtocolColor(step.protocol)]"
      >
        {{ step.protocol }}
      </span>
    </div>
    <p class="text-gray-300 text-sm leading-relaxed min-h-[3rem]">
      {{ displayedText }}<span class="animate-pulse text-gray-400">|</span>
    </p>
  </div>
</template>
