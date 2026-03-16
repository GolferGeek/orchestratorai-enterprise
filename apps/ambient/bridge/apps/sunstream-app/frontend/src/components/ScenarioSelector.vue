<script setup lang="ts">
import { onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useScenarioStore } from '@/stores/scenario.store';
import { useHelpStore } from '@/stores/help.store';
import ScenarioInfoIcon from '@/components/help/ScenarioInfoIcon.vue';
import HelpToggle from '@/components/help/HelpToggle.vue';

const scenarioStore = useScenarioStore();
const helpStore = useHelpStore();
const { scenarios, running, completed, loading, error } = storeToRefs(scenarioStore);

onMounted(async () => {
  if (scenarios.value.length === 0) {
    await scenarioStore.loadScenarios();
  }
});

async function handleRunScenario(id: number) {
  await scenarioStore.executeScenario(id);
}

const scenarioColors = [
  'border-blue-500/40 hover:border-blue-400/70 bg-blue-950/20',
  'border-purple-500/40 hover:border-purple-400/70 bg-purple-950/20',
  'border-amber-500/40 hover:border-amber-400/70 bg-amber-950/20',
  'border-red-500/40 hover:border-red-400/70 bg-red-950/20',
  'border-emerald-500/40 hover:border-emerald-400/70 bg-emerald-950/20',
];

const providerBadgeColors: Record<string, string> = {
  'well-known': 'bg-violet-900/60 text-violet-300',
  'a2a-jsonrpc': 'bg-indigo-900/60 text-indigo-300',
  'oauth-jwt': 'bg-blue-900/60 text-blue-300',
  'x509': 'bg-cyan-900/60 text-cyan-300',
  'tls-mutual': 'bg-teal-900/60 text-teal-300',
  'envelope': 'bg-green-900/60 text-green-300',
  'reputation': 'bg-yellow-900/60 text-yellow-300',
  'allowlist': 'bg-orange-900/60 text-orange-300',
  'hash-chain': 'bg-red-900/60 text-red-300',
  'circuit-breaker': 'bg-pink-900/60 text-pink-300',
  'bulkhead': 'bg-rose-900/60 text-rose-300',
  'retry': 'bg-fuchsia-900/60 text-fuchsia-300',
  'pipeline': 'bg-purple-900/60 text-purple-300',
  'acp': 'bg-amber-900/60 text-amber-300',
  'opentelemetry': 'bg-lime-900/60 text-lime-300',
  'capability-card': 'bg-sky-900/60 text-sky-300',
  'websocket': 'bg-emerald-900/60 text-emerald-300',
  'first-contact': 'bg-slate-800/60 text-slate-300',
  'local-keys': 'bg-stone-900/60 text-stone-300',
  'x402-usdc': 'bg-sky-900/60 text-sky-300',
  'coinbase-cdp': 'bg-indigo-900/60 text-indigo-300',
  'a2a-agent-card': 'bg-violet-900/60 text-violet-300',
  'a2a-skill-negotiation': 'bg-sky-900/60 text-sky-300',
  'a2a-jws-trust': 'bg-amber-900/60 text-amber-300',
  'a2a-task-lifecycle': 'bg-purple-900/60 text-purple-300',
  'commerce-cart-negotiation': 'bg-amber-900/60 text-amber-300',
  'commerce-checkout': 'bg-emerald-900/60 text-emerald-300',
  'commerce-checkout-fsm': 'bg-violet-900/60 text-violet-300',
  'agntcy-oasf': 'bg-cyan-900/60 text-cyan-300',
  'agntcy-crypto-identity': 'bg-blue-900/60 text-blue-300',
  'agntcy-slim': 'bg-teal-900/60 text-teal-300',
};

function getBadgeColor(provider: string): string {
  return providerBadgeColors[provider] ?? 'bg-slate-800/60 text-slate-400';
}
</script>

<template>
  <div class="bg-slate-900/80 border-b border-slate-700/50 px-4 py-3">
    <!-- Header row -->
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-3">
        <div class="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
        <span class="text-sm font-bold text-slate-100 tracking-wide">
          SunStream Fishbowl — Farm Credit Protocol Playground
        </span>
      </div>

      <div class="flex items-center gap-2">
        <div v-if="error" class="text-xs text-red-400 bg-red-950/30 px-2 py-1 rounded border border-red-800/50">
          {{ error }}
        </div>

        <div v-if="loading" class="text-xs text-slate-400">Loading scenarios...</div>

        <HelpToggle :active="helpStore.drawerOpen" @toggle="helpStore.toggleDrawer()" />
      </div>
    </div>

    <!-- Scenario cards -->
    <div class="flex gap-3 overflow-x-auto pb-1">
      <div
        v-for="(scenario, index) in scenarios"
        :key="scenario.id"
        :class="[
          'flex-shrink-0 border rounded-lg px-3 py-2 cursor-pointer transition-all duration-150 min-w-[220px] max-w-[260px]',
          scenarioColors[index % scenarioColors.length],
          running === scenario.id ? 'opacity-75' : '',
        ]"
        @click="handleRunScenario(scenario.id)"
      >
        <!-- Scenario header -->
        <div class="flex items-center justify-between mb-1">
          <span class="text-xxs text-slate-500 font-mono">S-{{ scenario.id }}</span>
          <div class="flex items-center gap-1.5">
            <!-- Help info icon -->
            <ScenarioInfoIcon
              :scenario-id="scenario.id"
              :active="helpStore.activeScenarioGuide === scenario.id"
              @toggle="helpStore.toggleScenarioGuide(scenario.id)"
            />
            <!-- Running spinner -->
            <div
              v-if="running === scenario.id"
              class="w-3 h-3 border border-slate-400 border-t-white rounded-full animate-spin"
            />
            <!-- Completed check -->
            <div
              v-else-if="completed.has(scenario.id)"
              class="w-3 h-3 rounded-full bg-emerald-500 flex items-center justify-center"
            >
              <svg class="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <!-- Run button -->
            <div v-else class="w-3 h-3 rounded-full border border-slate-600 flex items-center justify-center">
              <svg class="w-2 h-2 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        </div>

        <!-- Scenario name -->
        <p class="text-xs font-semibold text-slate-200 mb-1 leading-tight">{{ scenario.name }}</p>

        <!-- Description -->
        <p class="text-xxs text-slate-500 mb-2 leading-relaxed line-clamp-2">{{ scenario.description }}</p>

        <!-- Provider badges (clickable) -->
        <div class="flex flex-wrap gap-1">
          <button
            v-for="provider in scenario.providers.slice(0, 4)"
            :key="provider"
            :class="['text-xxs px-1 py-0.5 rounded font-mono hover:brightness-125 transition-all cursor-help', getBadgeColor(provider)]"
            @click.stop="helpStore.showProvider(provider, $event.clientX, $event.clientY)"
          >
            {{ provider }}
          </button>
          <span
            v-if="scenario.providers.length > 4"
            class="text-xxs px-1 py-0.5 rounded font-mono bg-slate-800/60 text-slate-500"
          >
            +{{ scenario.providers.length - 4 }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
