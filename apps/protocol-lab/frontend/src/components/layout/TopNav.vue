<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useProtocolStore } from '../../stores/protocol.store';
import { useAuthStore } from '../../stores/auth.store';

const router = useRouter();
const protocolStore = useProtocolStore();
const authStore = useAuthStore();
const appsDropdownOpen = ref(false);
const productsDropdownOpen = ref(false);
const loginEmail = ref('');
const loginPassword = ref('');
const loginError = ref('');
const loggingIn = ref(false);

interface PlatformProduct {
  slug: string;
  label: string;
  port: number;
  emoji: string;
  category: 'agents' | 'ambient' | 'admin';
}

// Platform-wide products. Ports come from PRODUCT_REGISTRY (5xxx in dev, 7xxx in prod).
const platformProducts: PlatformProduct[] = [
  { slug: 'forge',   label: 'Forge',   port: 5201, emoji: '⚡',  category: 'agents' },
  { slug: 'compose', label: 'Compose', port: 5301, emoji: '🧩', category: 'agents' },
  { slug: 'pulse',   label: 'Pulse',   port: 5501, emoji: '💓', category: 'ambient' },
  { slug: 'bridge',  label: 'Bridge',  port: 5601, emoji: '🌉', category: 'ambient' },
  { slug: 'admin',   label: 'Admin',   port: 5101, emoji: '🛡️', category: 'admin' },
];

const productGroups = [
  { key: 'agents',  label: 'Agents',  items: platformProducts.filter(p => p.category === 'agents') },
  { key: 'ambient', label: 'Ambient', items: platformProducts.filter(p => p.category === 'ambient') },
  { key: 'admin',   label: 'Admin',   items: platformProducts.filter(p => p.category === 'admin') },
];

function toggleAppsDropdown() {
  appsDropdownOpen.value = !appsDropdownOpen.value;
  if (appsDropdownOpen.value) productsDropdownOpen.value = false;
}

function toggleProductsDropdown() {
  productsDropdownOpen.value = !productsDropdownOpen.value;
  if (productsDropdownOpen.value) appsDropdownOpen.value = false;
}

function navigateTo(path: string) {
  appsDropdownOpen.value = false;
  router.push(path);
}

function switchToProduct(product: PlatformProduct) {
  productsDropdownOpen.value = false;
  // Pass SSO token via URL hash fragment for cross-product auth
  const token = localStorage.getItem('authToken');
  const base = `http://localhost:${product.port}`;
  const url = token ? `${base}#sso_token=${token}` : base;
  window.location.href = url;
}

function commandUrl(): string {
  const token = localStorage.getItem('authToken');
  const base = 'http://localhost:5102';
  return token ? `${base}#sso_token=${token}` : base;
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
      <!-- OrchestratorAI brand → Command -->
      <a
        :href="commandUrl()"
        class="flex items-center gap-2 text-white font-semibold hover:text-protocol-primary transition-colors"
      >
        <svg class="w-5 h-5 text-protocol-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
        <span class="text-sm">OrchestratorAI</span>
      </a>

      <!-- Cross-product switcher -->
      <div class="relative">
        <button
          class="flex items-center gap-1.5 text-sm text-gray-300 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-700"
          @click="toggleProductsDropdown"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
          <span>Switch Product</span>
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <div
          v-if="productsDropdownOpen"
          class="absolute top-full left-0 mt-1 w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-2 z-50"
        >
          <div v-for="group in productGroups" :key="group.key" class="mb-1 last:mb-0">
            <div class="px-4 py-1 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
              {{ group.label }}
            </div>
            <button
              v-for="product in group.items"
              :key="product.slug"
              class="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-3"
              @click="switchToProduct(product)"
            >
              <span class="text-base">{{ product.emoji }}</span>
              <span class="flex-1">{{ product.label }}</span>
              <span class="text-[10px] text-gray-500 font-mono">:{{ product.port }}</span>
            </button>
          </div>
          <div class="border-t border-gray-700 mt-2 pt-1">
            <div class="px-4 py-1 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
              Current
            </div>
            <div class="px-4 py-2 text-sm text-protocol-primary flex items-center gap-3">
              <span class="text-base">🔬</span>
              <span class="flex-1">Protocol Lab</span>
              <span class="text-[10px] text-gray-500 font-mono">:5400</span>
            </div>
          </div>
        </div>
      </div>

      <router-link to="/" class="flex items-center gap-2 text-gray-300 hover:text-white transition-colors text-sm border-l border-gray-700 pl-6">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <span>Agent Communication Playground</span>
      </router-link>

      <div class="relative">
        <button
          class="flex items-center gap-1 text-sm text-gray-300 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-700"
          @click="toggleAppsDropdown"
        >
          <span>Lab Apps</span>
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
