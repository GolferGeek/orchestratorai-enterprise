<script setup lang="ts">
import { useMiniMeStore } from '../../stores/mini-me.store';
import EmptyState from '../../components/shared/EmptyState.vue';
import JsonPayloadViewer from '../../components/shared/JsonPayloadViewer.vue';

const store = useMiniMeStore();
</script>

<template>
  <div class="space-y-6">
    <EmptyState
      v-if="!store.agentCard"
      title="Agent Card Unavailable"
      message="Could not fetch Mini-Me's agent card. Is Mini-Me running?"
      icon="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0"
    />

    <template v-else>
      <!-- Agent identity -->
      <div class="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <div class="flex items-center gap-4 mb-4">
          <div class="w-14 h-14 rounded-xl bg-purple-900/50 flex items-center justify-center">
            <svg class="w-7 h-7 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h2 class="text-xl font-bold text-white">{{ store.agentCard.name }}</h2>
            <p class="text-sm text-gray-400">v{{ store.agentCard.version }}</p>
          </div>
        </div>
        <p class="text-gray-300">{{ store.agentCard.description }}</p>
        <div v-if="store.agentCard.url" class="mt-2">
          <span class="text-xs text-gray-500">Endpoint: </span>
          <span class="text-xs text-protocol-primary font-mono">{{ store.agentCard.url }}</span>
        </div>
      </div>

      <!-- Skills -->
      <div>
        <h3 class="text-lg font-semibold text-gray-200 mb-3">Skills ({{ store.skills.length }})</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div
            v-for="skill in store.skills"
            :key="skill.id"
            class="bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-gray-600 transition-colors"
          >
            <div class="flex items-center gap-2 mb-2">
              <span class="px-2 py-0.5 bg-purple-900/50 text-purple-300 rounded text-xs font-mono">
                {{ skill.id }}
              </span>
              <span class="text-sm font-medium text-gray-200">{{ skill.name }}</span>
            </div>
            <p class="text-xs text-gray-400">{{ skill.description }}</p>
            <div v-if="skill.examples?.length" class="mt-2">
              <p class="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Example messages</p>
              <ul class="space-y-1">
                <li
                  v-for="(example, idx) in skill.examples"
                  :key="idx"
                  class="text-xs text-gray-400 italic"
                >
                  "{{ example }}"
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <!-- Raw agent card -->
      <JsonPayloadViewer :data="store.agentCard" label="Raw Agent Card JSON" />
    </template>
  </div>
</template>
