<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.store';

const router = useRouter();
const authStore = useAuthStore();

const userEmail = computed(() => authStore.user?.email ?? 'Not authenticated');
const userName = computed(() => authStore.user?.name ?? '—');

async function handleLogout() {
  authStore.logout();
  await router.push('/login');
}

const appPorts = [
  { label: 'Bridge API', port: 6600 },
  { label: 'Bridge Web', port: 6601 },
  { label: 'Forge API', port: 6200 },
  { label: 'Compose API', port: 6300 },
  { label: 'Auth API', port: 6100 },
] as const;
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">Settings</h1>
      <p class="text-gray-400 text-sm mt-1">Bridge configuration and authentication</p>
    </div>

    <!-- Auth Status -->
    <div class="bg-gray-800 rounded-lg p-6">
      <h2 class="text-lg font-semibold text-white mb-4">Auth Status</h2>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div>
          <p class="text-xs text-gray-400 uppercase tracking-wide mb-1">Status</p>
          <span
            class="inline-flex items-center gap-1.5 text-sm font-medium"
            :class="authStore.isAuthenticated ? 'text-green-400' : 'text-red-400'"
          >
            <span
              class="w-2 h-2 rounded-full"
              :class="authStore.isAuthenticated ? 'bg-green-400' : 'bg-red-400'"
            />
            {{ authStore.isAuthenticated ? 'Authenticated' : 'Not authenticated' }}
          </span>
        </div>

        <div>
          <p class="text-xs text-gray-400 uppercase tracking-wide mb-1">Email</p>
          <p class="text-sm text-gray-200 font-mono">{{ userEmail }}</p>
        </div>

        <div>
          <p class="text-xs text-gray-400 uppercase tracking-wide mb-1">Name</p>
          <p class="text-sm text-gray-200">{{ userName }}</p>
        </div>
      </div>

      <button
        class="px-4 py-2 rounded text-sm font-medium bg-red-600 hover:bg-red-700 text-white transition-colors"
        @click="handleLogout"
      >
        Logout
      </button>
    </div>

    <!-- Environment -->
    <div class="bg-gray-800 rounded-lg p-6">
      <h2 class="text-lg font-semibold text-white mb-4">Environment</h2>

      <div>
        <h3 class="text-sm font-medium text-gray-300 mb-3">Service Ports</h3>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div
            v-for="svc in appPorts"
            :key="svc.label"
            class="flex items-center justify-between bg-gray-700/50 rounded px-3 py-2"
          >
            <span class="text-xs text-gray-400">{{ svc.label }}</span>
            <span class="text-xs font-mono text-gray-200">:{{ svc.port }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Bridge Info -->
    <div class="bg-gray-800 rounded-lg p-6">
      <h2 class="text-lg font-semibold text-white mb-4">Bridge</h2>
      <div class="space-y-3 text-sm text-gray-300">
        <p>Bridge is the External A2A Gateway for OrchestratorAI Enterprise.</p>
        <p>It handles:</p>
        <ul class="list-disc list-inside space-y-1 text-gray-400">
          <li>Inbound A2A requests from external agents</li>
          <li>Outbound A2A requests to external agents</li>
          <li>Security hardening (origin validation, rate limiting, request signing)</li>
          <li>External agent registry and trust scoring</li>
          <li>A2A routing to Forge (port 6200) and Compose (port 6300)</li>
        </ul>
      </div>
    </div>
  </div>
</template>
