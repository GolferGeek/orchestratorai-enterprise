<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useProtocolStore } from '../../stores/protocol.store';
import { useAuthStore } from '../../stores/auth.store';

const router = useRouter();
const protocolStore = useProtocolStore();
const authStore = useAuthStore();
const appsDropdownOpen = ref(false);
const loginEmail = ref('');
const loginPassword = ref('');
const loginError = ref('');
const loggingIn = ref(false);

function toggleAppsDropdown() {
  appsDropdownOpen.value = !appsDropdownOpen.value;
}

function navigateTo(path: string) {
  appsDropdownOpen.value = false;
  router.push(path);
}

async function handleLogin() {
  if (!loginEmail.value || !loginPassword.value) return;
  loggingIn.value = true;
  loginError.value = '';
  try {
    await authStore.login(loginEmail.value, loginPassword.value);
    loginEmail.value = '';
    loginPassword.value = '';
  } catch (e) {
    loginError.value = e instanceof Error ? e.message : 'Login failed';
  } finally {
    loggingIn.value = false;
  }
}
</script>

<template>
  <nav class="fixed top-0 left-0 right-0 h-14 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-4 z-50">
    <div class="flex items-center gap-6">
      <router-link to="/" class="flex items-center gap-2 text-white font-semibold hover:text-protocol-primary transition-colors">
        <svg class="w-6 h-6 text-protocol-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <span class="text-sm">Agent Communication Playground</span>
      </router-link>

      <div class="relative">
        <button
          class="flex items-center gap-1 text-sm text-gray-300 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-700"
          @click="toggleAppsDropdown"
        >
          <span>Apps</span>
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <div
          v-if="appsDropdownOpen"
          class="absolute top-full left-0 mt-1 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 z-50"
        >
          <button
            class="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
            @click="navigateTo('/apps/research-hub')"
          >
            Research Hub
          </button>
          <button
            class="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
            @click="navigateTo('/apps/market-pulse')"
          >
            MarketPulse
          </button>
        </div>
      </div>
    </div>

    <div class="flex items-center gap-3">
      <button
        class="flex items-center gap-1.5 text-sm text-gray-300 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-700"
        @click="protocolStore.toggleDrawer()"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
        <span>Protocol Stack</span>
      </button>

      <router-link
        to="/matrix"
        class="flex items-center gap-1.5 text-sm text-gray-300 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-700"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16M9 4v16M15 4v16" />
        </svg>
        <span>Matrix</span>
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

      <!-- Auth: login form or user display -->
      <div class="flex items-center gap-2 ml-4 pl-4 border-l border-gray-700">
        <template v-if="authStore.isAuthenticated">
          <svg class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span class="text-sm text-gray-300">{{ authStore.user.name }}</span>
          <button
            class="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            @click="authStore.logout()"
          >
            Logout
          </button>
        </template>
        <template v-else>
          <form class="flex items-center gap-2" @submit.prevent="handleLogin">
            <input
              v-model="loginEmail"
              type="email"
              placeholder="Email"
              class="w-36 px-2 py-1 text-xs bg-gray-900 border border-gray-600 rounded text-gray-200 placeholder-gray-500 focus:border-protocol-primary focus:outline-none"
            />
            <input
              v-model="loginPassword"
              type="password"
              placeholder="Password"
              class="w-24 px-2 py-1 text-xs bg-gray-900 border border-gray-600 rounded text-gray-200 placeholder-gray-500 focus:border-protocol-primary focus:outline-none"
            />
            <button
              type="submit"
              :disabled="loggingIn"
              class="px-3 py-1 text-xs font-medium text-white bg-protocol-primary hover:bg-protocol-primary/80 rounded transition-colors disabled:opacity-50"
            >
              {{ loggingIn ? '...' : 'Login' }}
            </button>
          </form>
          <span v-if="loginError" class="text-xs text-red-400">{{ loginError }}</span>
        </template>
      </div>
    </div>
  </nav>
</template>
