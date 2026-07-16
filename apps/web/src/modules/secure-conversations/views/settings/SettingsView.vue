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

const appEndpoints = [
  { label: 'Secure Conversations API', value: '/api/secure-conversations' },
  { label: 'Secure Conversations Web', value: '/app/secure-conversations' },
  { label: 'Inbound A2A', value: '/api/secure-conversations/a2a/tasks' },
  { label: 'Registry', value: '/api/secure-conversations/registry/agents' },
] as const;
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">Settings</h1>
      <p class="text-gray-400 text-sm mt-1">Secure Conversations configuration and authentication</p>
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
        class="settings-secondary-button"
        @click="handleLogout"
      >
        Logout
      </button>
    </div>

    <!-- Environment -->
    <div class="bg-gray-800 rounded-lg p-6">
      <h2 class="text-lg font-semibold text-white mb-4">Environment</h2>

      <div>
        <h3 class="text-sm font-medium text-gray-300 mb-3">Unified Endpoints</h3>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div
            v-for="svc in appEndpoints"
            :key="svc.label"
            class="flex items-center justify-between bg-gray-700/50 rounded px-3 py-2"
          >
            <span class="text-xs text-gray-400">{{ svc.label }}</span>
            <span class="text-xs font-mono text-gray-200">{{ svc.value }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Secure Conversations Info -->
    <div class="bg-gray-800 rounded-lg p-6">
      <h2 class="text-lg font-semibold text-white mb-4">Secure Conversations</h2>
      <div class="space-y-3 text-sm text-gray-300">
        <p>Secure Conversations is the External A2A Gateway for OrchestratorAI Enterprise.</p>
        <p>It handles:</p>
        <ul class="list-disc list-inside space-y-1 text-gray-400">
          <li>Inbound A2A requests from external agents</li>
          <li>Outbound A2A requests to external agents</li>
          <li>Security hardening (origin validation, rate limiting, request signing)</li>
          <li>External agent registry and trust scoring</li>
          <li>A2A routing to unified Workflows and Agents modules</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-secondary-button {
  background: #eef2f7;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
  color: #1f2937;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 600;
  padding: 0.5rem 1rem;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.settings-secondary-button:hover {
  background: #e2e8f0;
  border-color: #94a3b8;
  box-shadow: 0 2px 4px rgba(15, 23, 42, 0.12);
}

:global(html.dark) .settings-secondary-button,
:global(html.ion-palette-dark) .settings-secondary-button {
  background: #334155;
  border-color: #475569;
  color: #e2e8f0;
}

:global(html.dark) .settings-secondary-button:hover,
:global(html.ion-palette-dark) .settings-secondary-button:hover {
  background: #475569;
}
</style>
