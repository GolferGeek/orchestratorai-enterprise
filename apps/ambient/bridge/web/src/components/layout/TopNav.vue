<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

function logout() {
  localStorage.removeItem('bridge-jwt');
  localStorage.removeItem('agent-comm-jwt');
  router.push('/login');
}
</script>

<template>
  <nav class="fixed top-0 left-0 right-0 h-14 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-4 z-50">
    <div class="flex items-center gap-6">
      <router-link to="/" class="flex items-center gap-2 text-white font-semibold hover:text-blue-400 transition-colors">
        <svg class="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <span class="text-sm">Bridge</span>
        <span class="text-xs text-gray-500">External A2A Gateway</span>
      </router-link>
    </div>

    <div class="flex items-center gap-3">
      <router-link
        to="/registry"
        class="flex items-center gap-1.5 text-sm text-gray-300 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-700"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <span>Registry</span>
      </router-link>

      <router-link
        to="/security"
        class="flex items-center gap-1.5 text-sm text-gray-300 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-700"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <span>Security</span>
      </router-link>

      <router-link
        to="/observability"
        class="flex items-center gap-1.5 text-sm text-gray-300 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-700"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <span>Observability</span>
      </router-link>

      <div class="flex items-center gap-2 ml-4 pl-4 border-l border-gray-700">
        <span class="text-xs text-gray-400">Port 6601</span>
        <button
          class="text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded hover:bg-gray-700"
          @click="logout"
        >
          Logout
        </button>
      </div>
    </div>
  </nav>
</template>
