<script setup lang="ts">
import { onMounted } from 'vue';
import { useSse } from '../composables/useSse';

const { connect } = useSse();

onMounted(() => {
  connect();
});
</script>

<template>
  <div class="min-h-screen bg-gray-900">
    <!-- Top nav -->
    <nav class="fixed top-0 left-0 right-0 z-50 h-14 bg-gray-800 border-b border-gray-700 flex items-center px-6 gap-4">
      <span class="text-purple-400 font-bold text-lg tracking-tight">Pulse</span>
      <span class="text-gray-500 text-sm">Internal Ambient Automation</span>
    </nav>

    <!-- Sidebar -->
    <aside class="fixed top-14 left-0 bottom-0 w-52 bg-gray-800 border-r border-gray-700 overflow-y-auto">
      <nav class="p-4 space-y-1">
        <router-link
          to="/"
          class="block px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
          active-class="bg-purple-900/50 text-purple-300"
        >
          Dashboard
        </router-link>
        <router-link
          to="/listeners"
          class="block px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
          active-class="bg-purple-900/50 text-purple-300"
        >
          Listeners
        </router-link>
        <router-link
          to="/workflows"
          class="block px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
          active-class="bg-purple-900/50 text-purple-300"
        >
          Workflows
        </router-link>
        <router-link
          to="/triggers"
          class="block px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
          active-class="bg-purple-900/50 text-purple-300"
        >
          Triggers
        </router-link>
        <router-link
          to="/executions"
          class="block px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
          active-class="bg-purple-900/50 text-purple-300"
        >
          Executions
        </router-link>
        <router-link
          to="/scenarios"
          class="block px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
          active-class="bg-purple-900/50 text-purple-300"
        >
          Scenarios
        </router-link>
        <router-link
          to="/stream"
          class="block px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
          active-class="bg-purple-900/50 text-purple-300"
        >
          Event Stream
        </router-link>
      </nav>
    </aside>

    <!-- Main content -->
    <main class="pt-14 pl-52 min-h-screen">
      <div class="p-6">
        <router-view />
      </div>
    </main>
  </div>
</template>
