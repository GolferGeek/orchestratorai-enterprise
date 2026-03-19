<script setup lang="ts">
import { ref, computed } from 'vue';

interface TraceStep {
  id: number;
  from: string;
  to: string;
  method: string;
  protocol: string;
  protocolColor: string;
  arrowColor: string;
  durationMs: number;
  timestamp: string;
}

const steps: TraceStep[] = [
  {
    id: 1,
    from: 'ContentForge',
    to: 'ResearchHub',
    method: 'request-narrative',
    protocol: 'http-rest',
    protocolColor: 'text-green-400',
    arrowColor: 'bg-green-500',
    durationMs: 120,
    timestamp: '14:32:01.004',
  },
  {
    id: 2,
    from: 'ResearchHub',
    to: 'MarketPulse',
    method: 'get-trending',
    protocol: 'http-rest',
    protocolColor: 'text-green-400',
    arrowColor: 'bg-green-500',
    durationMs: 85,
    timestamp: '14:32:01.130',
  },
  {
    id: 3,
    from: 'MarketPulse',
    to: 'ResearchHub',
    method: 'trending-response',
    protocol: 'http-rest',
    protocolColor: 'text-green-400',
    arrowColor: 'bg-green-500',
    durationMs: 90,
    timestamp: '14:32:01.220',
  },
  {
    id: 4,
    from: 'ResearchHub',
    to: 'ContentForge',
    method: 'narrative-response',
    protocol: 'http-rest',
    protocolColor: 'text-green-400',
    arrowColor: 'bg-green-500',
    durationMs: 200,
    timestamp: '14:32:01.315',
  },
];

const lanes = ['ContentForge', 'ResearchHub', 'MarketPulse'] as const;

const laneColors: Record<string, { bg: string; border: string; text: string }> = {
  ContentForge: { bg: 'bg-blue-900/60', border: 'border-blue-700', text: 'text-blue-300' },
  ResearchHub: { bg: 'bg-emerald-900/60', border: 'border-emerald-700', text: 'text-emerald-300' },
  MarketPulse: { bg: 'bg-purple-900/60', border: 'border-purple-700', text: 'text-purple-300' },
};

function laneIndex(name: string): number {
  return lanes.indexOf(name as typeof lanes[number]);
}

const totalDuration = computed(() => {
  return steps.reduce((sum, s) => sum + s.durationMs, 0);
});

const isPlaying = ref(false);
const activeStep = ref(-1);

function playTrace() {
  isPlaying.value = true;
  activeStep.value = -1;

  let i = 0;
  function nextStep() {
    if (i >= steps.length) {
      isPlaying.value = false;
      return;
    }
    activeStep.value = i;
    i++;
    setTimeout(nextStep, 800);
  }
  setTimeout(nextStep, 300);
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-white">Workflow Trace</h1>
        <p class="text-gray-400 mt-1">Multi-hop delegation visualization for the Full Content Pipeline.</p>
      </div>
      <button class="btn-primary text-sm" :disabled="isPlaying" @click="playTrace">
        <span v-if="isPlaying" class="flex items-center gap-2">
          <span class="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
          Playing...
        </span>
        <span v-else class="flex items-center gap-2">
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
          Replay Trace
        </span>
      </button>
    </div>

    <!-- Sequence Diagram -->
    <div class="card overflow-x-auto">
      <div class="min-w-[700px]">
        <!-- Lane Headers -->
        <div class="grid grid-cols-3 gap-4 mb-2">
          <div
            v-for="lane in lanes"
            :key="lane"
            :class="[
              'text-center py-3 rounded-lg border font-semibold text-sm',
              laneColors[lane].bg,
              laneColors[lane].border,
              laneColors[lane].text,
            ]"
          >
            {{ lane }}
          </div>
        </div>

        <!-- Lane Lifelines -->
        <div class="relative">
          <!-- Vertical lifeline bars -->
          <div class="absolute inset-0 grid grid-cols-3 gap-4 pointer-events-none">
            <div v-for="lane in lanes" :key="lane" class="flex justify-center">
              <div :class="['w-0.5 h-full', laneColors[lane].border.replace('border-', 'bg-'), 'opacity-30']" />
            </div>
          </div>

          <!-- Steps -->
          <div class="relative space-y-0">
            <div
              v-for="(step, idx) in steps"
              :key="step.id"
              :class="[
                'relative py-5 transition-all duration-500',
                activeStep >= idx ? 'opacity-100' : (isPlaying && activeStep < idx ? 'opacity-20' : 'opacity-100'),
              ]"
            >
              <!-- Arrow row -->
              <div class="grid grid-cols-3 gap-4 items-center relative">
                <!-- Determine positions -->
                <div
                  v-for="(lane, li) in lanes"
                  :key="lane"
                  class="flex justify-center relative h-16"
                >
                  <!-- From dot -->
                  <div
                    v-if="lane === step.from"
                    :class="[
                      'absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full z-10',
                      step.arrowColor,
                      activeStep === idx ? 'ring-2 ring-white/50 ring-offset-1 ring-offset-gray-800' : '',
                    ]"
                  />
                  <!-- To dot -->
                  <div
                    v-if="lane === step.to"
                    :class="[
                      'absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full z-10',
                      step.arrowColor,
                    ]"
                  />
                </div>

                <!-- Arrow overlay -->
                <div class="absolute inset-x-0 top-1/2 -translate-y-1/2 grid grid-cols-3 gap-4 pointer-events-none">
                  <div
                    class="col-span-3 relative h-px mx-8"
                  >
                    <!-- Calculate the arrow line between lanes -->
                    <div
                      :class="['absolute h-0.5 top-0', step.arrowColor]"
                      :style="{
                        left: `${(Math.min(laneIndex(step.from), laneIndex(step.to)) * 33.333) + 16.667}%`,
                        width: `${Math.abs(laneIndex(step.to) - laneIndex(step.from)) * 33.333}%`,
                      }"
                    />
                    <!-- Arrowhead -->
                    <div
                      :class="['absolute top-1/2 -translate-y-1/2 w-0 h-0', laneIndex(step.to) > laneIndex(step.from) ? 'border-l-[8px] border-y-[5px] border-y-transparent' : 'border-r-[8px] border-y-[5px] border-y-transparent']"
                      :style="{
                        left: laneIndex(step.to) > laneIndex(step.from)
                          ? `${(laneIndex(step.to) * 33.333) + 16.667}%`
                          : `${(laneIndex(step.to) * 33.333) + 16.667 - 1.5}%`,
                        borderLeftColor: laneIndex(step.to) > laneIndex(step.from) ? '#22c55e' : 'transparent',
                        borderRightColor: laneIndex(step.to) < laneIndex(step.from) ? '#22c55e' : 'transparent',
                      }"
                    />

                    <!-- Label above arrow -->
                    <div
                      class="absolute -top-6 text-center"
                      :style="{
                        left: `${(Math.min(laneIndex(step.from), laneIndex(step.to)) * 33.333) + 16.667}%`,
                        width: `${Math.abs(laneIndex(step.to) - laneIndex(step.from)) * 33.333}%`,
                      }"
                    >
                      <span class="text-xs font-mono text-white bg-gray-800 px-2 py-0.5 rounded">{{ step.method }}</span>
                    </div>

                    <!-- Metadata below arrow -->
                    <div
                      class="absolute top-3 text-center"
                      :style="{
                        left: `${(Math.min(laneIndex(step.from), laneIndex(step.to)) * 33.333) + 16.667}%`,
                        width: `${Math.abs(laneIndex(step.to) - laneIndex(step.from)) * 33.333}%`,
                      }"
                    >
                      <span :class="['text-xs', step.protocolColor]">{{ step.protocol }}</span>
                      <span class="text-xs text-gray-400 ml-2">{{ step.durationMs }}ms</span>
                      <span class="text-xs text-gray-400 ml-2">{{ step.timestamp }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Total Duration -->
        <div class="mt-6 pt-4 border-t border-gray-700 flex items-center justify-between">
          <span class="text-sm text-gray-400">Total workflow duration</span>
          <div class="flex items-center gap-4">
            <span class="text-sm text-gray-400">{{ steps.length }} hops</span>
            <span class="text-lg font-bold text-white">{{ totalDuration }}ms</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Step Details Table -->
    <div class="card">
      <h2 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Step Details</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-700">
              <th class="text-left py-2 px-3 text-gray-400 font-medium">#</th>
              <th class="text-left py-2 px-3 text-gray-400 font-medium">From</th>
              <th class="text-left py-2 px-3 text-gray-400 font-medium">To</th>
              <th class="text-left py-2 px-3 text-gray-400 font-medium">Method</th>
              <th class="text-left py-2 px-3 text-gray-400 font-medium">Protocol</th>
              <th class="text-left py-2 px-3 text-gray-400 font-medium">Timestamp</th>
              <th class="text-right py-2 px-3 text-gray-400 font-medium">Duration</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(step, idx) in steps"
              :key="step.id"
              :class="[
                'border-b border-gray-800 transition-colors',
                activeStep === idx ? 'bg-gray-700/40' : 'hover:bg-gray-800/50',
              ]"
            >
              <td class="py-2 px-3 text-gray-400">{{ step.id }}</td>
              <td :class="['py-2 px-3', laneColors[step.from].text]">{{ step.from }}</td>
              <td :class="['py-2 px-3', laneColors[step.to].text]">{{ step.to }}</td>
              <td class="py-2 px-3 text-white font-mono text-xs">{{ step.method }}</td>
              <td :class="['py-2 px-3', step.protocolColor]">{{ step.protocol }}</td>
              <td class="py-2 px-3 text-gray-400 font-mono text-xs">{{ step.timestamp }}</td>
              <td class="py-2 px-3 text-right text-white">{{ step.durationMs }}ms</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
