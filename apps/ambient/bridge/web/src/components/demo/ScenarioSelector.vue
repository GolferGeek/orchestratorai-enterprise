<script setup lang="ts">
import { useDemoStore } from '../../stores/demo.store';

const demoStore = useDemoStore();

const PROTOCOL_BADGE_COLORS: Record<string, string> = {
  discovery: 'bg-blue-900 text-blue-300',
  transport: 'bg-green-900 text-green-300',
  negotiation: 'bg-purple-900 text-purple-300',
  identity: 'bg-orange-900 text-orange-300',
  payment: 'bg-yellow-900 text-yellow-300',
  trust: 'bg-teal-900 text-teal-300',
  encryption: 'bg-red-900 text-red-300',
  resilience: 'bg-cyan-900 text-cyan-300',
  observability: 'bg-pink-900 text-pink-300',
  orchestration: 'bg-indigo-900 text-indigo-300',
};

function getBadgeColor(protocol: string): string {
  return PROTOCOL_BADGE_COLORS[protocol] ?? 'bg-gray-800 text-gray-300';
}

function selectScenario(id: string) {
  demoStore.startScenario(id);
}
</script>

<template>
  <div>
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-white mb-2">Demo Mode</h1>
      <p class="text-gray-400">
        Select a scenario to walk through an interactive demonstration of the Agent Communication Protocol.
      </p>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      <button
        v-for="scenario in demoStore.scenarios"
        :key="scenario.id"
        class="bg-gray-800 border border-gray-700 rounded-xl p-5 text-left transition-all hover:border-blue-500 hover:bg-gray-750 focus:outline-none focus:ring-2 focus:ring-blue-500"
        @click="selectScenario(scenario.id)"
      >
        <h3 class="text-white font-semibold text-lg mb-2">{{ scenario.name }}</h3>
        <p class="text-gray-400 text-sm mb-4 leading-relaxed">{{ scenario.description }}</p>
        <div class="flex items-center justify-between">
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="protocol in scenario.protocolsUsed"
              :key="protocol"
              :class="['px-2 py-0.5 rounded text-xs font-medium', getBadgeColor(protocol)]"
            >
              {{ protocol }}
            </span>
          </div>
          <span class="text-gray-400 text-xs whitespace-nowrap ml-3">
            {{ scenario.steps.length }} steps
          </span>
        </div>
      </button>
    </div>
  </div>
</template>
