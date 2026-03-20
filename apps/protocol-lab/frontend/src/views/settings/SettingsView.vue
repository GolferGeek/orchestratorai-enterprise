<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.store';
import { useWalletStore } from '../../stores/wallet.store';
import { useProtocolStore } from '../../stores/protocol.store';
import { PROTOCOL_LAYERS } from '../../types';

const router = useRouter();
const authStore = useAuthStore();
const walletStore = useWalletStore();
const protocolStore = useProtocolStore();

onMounted(async () => {
  try {
    await walletStore.fetchWallet();
  } catch {
    // Error captured in store
  }
});

// --- Auth section ---
const userEmail = computed(() => authStore.user?.email ?? 'Not authenticated');
const userName = computed(() => authStore.user?.name ?? '—');

async function handleLogout() {
  // Navigate to login; auth state reset happens at login view
  await router.push('/login');
}

// --- Wallet section ---
const walletProvider = computed(() => walletStore.wallet?.provider ?? '—');
const walletAddress = computed(() => {
  const addr = walletStore.wallet?.address;
  if (!addr) return '—';
  if (addr.length <= 20) return addr;
  return `${addr.slice(0, 10)}…${addr.slice(-8)}`;
});
const walletBalance = computed(() => {
  const w = walletStore.wallet;
  if (!w) return '—';
  return `${w.balance} ${w.currency}`;
});
const walletNetwork = computed(() => walletStore.wallet?.network ?? '—');

// --- Environment section ---
const appPorts = [
  { label: 'Protocol API', port: 6402 },
  { label: 'ResearchHub', port: 6403 },
  { label: 'MarketPulse', port: 6404 },
  { label: 'ContentForge', port: 6405 },
  { label: 'Frontend SPA', port: 6400 },
] as const;

const apiEndpoints = [
  { label: 'Protocol API', url: 'http://localhost:6402/api' },
  { label: 'ResearchHub', url: 'http://localhost:6403/api' },
  { label: 'MarketPulse', url: 'http://localhost:6404/api' },
  { label: 'ContentForge', url: 'http://localhost:6405/api' },
] as const;

const connectedServices = computed(() => [
  {
    label: 'Protocol API',
    connected: true,
  },
  {
    label: 'ResearchHub',
    connected: walletStore.error === null,
  },
  {
    label: 'MarketPulse',
    connected: walletStore.error === null,
  },
  {
    label: 'ContentForge',
    connected: walletStore.error === null,
  },
]);

// --- Protocol section ---
const currentPreset = computed(() => {
  const cfg = protocolStore.currentConfig;
  const match = protocolStore.presets.find((p) => {
    return PROTOCOL_LAYERS.every((layer) => p.config[layer] === cfg[layer]);
  });
  return match?.name ?? 'Custom';
});

const layerPairs = computed(() => {
  const cfg = protocolStore.currentConfig;
  return PROTOCOL_LAYERS.map((layer) => ({
    layer,
    provider: cfg[layer] ?? '—',
  }));
});

function openProtocolDrawer() {
  protocolStore.toggleDrawer();
}
</script>

<template>
  <div class="space-y-6">
    <!-- Page header -->
    <div>
      <h1 class="text-2xl font-bold text-white">Settings</h1>
      <p class="text-gray-400 text-sm mt-1">Current environment, authentication, and protocol configuration</p>
    </div>

    <!-- 1. Auth Status -->
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

        <div>
          <p class="text-xs text-gray-400 uppercase tracking-wide mb-1">Role</p>
          <p class="text-sm text-gray-400 italic">Not set</p>
        </div>

        <div>
          <p class="text-xs text-gray-400 uppercase tracking-wide mb-1">Token Expiry</p>
          <p class="text-sm text-gray-400 italic">Not set</p>
        </div>
      </div>

      <button
        class="px-4 py-2 rounded text-sm font-medium bg-red-600 hover:bg-red-700 text-white transition-colors"
        @click="handleLogout"
      >
        Logout
      </button>
    </div>

    <!-- 2. Wallet Configuration -->
    <div class="bg-gray-800 rounded-lg p-6">
      <h2 class="text-lg font-semibold text-white mb-4">Wallet Configuration</h2>

      <div v-if="walletStore.loading" class="text-sm text-gray-400">Loading wallet...</div>

      <div v-else-if="walletStore.error" class="flex items-center justify-between rounded-lg border border-red-500 bg-red-950/20 px-4 py-3">
        <p class="text-sm text-red-400">{{ walletStore.error }}</p>
        <button
          class="ml-4 px-3 py-1 text-xs rounded bg-red-600 hover:bg-red-700 text-white transition-colors"
          @click="walletStore.fetchWallet()"
        >
          Retry
        </button>
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p class="text-xs text-gray-400 uppercase tracking-wide mb-1">Provider</p>
          <p class="text-sm text-gray-200">{{ walletProvider }}</p>
        </div>

        <div>
          <p class="text-xs text-gray-400 uppercase tracking-wide mb-1">Network</p>
          <p class="text-sm text-gray-200">{{ walletNetwork }}</p>
        </div>

        <div class="sm:col-span-2">
          <p class="text-xs text-gray-400 uppercase tracking-wide mb-1">Address</p>
          <p class="text-sm text-gray-200 font-mono break-all">{{ walletAddress }}</p>
        </div>

        <div>
          <p class="text-xs text-gray-400 uppercase tracking-wide mb-1">Balance</p>
          <p class="text-sm text-gray-200 font-semibold">{{ walletBalance }}</p>
        </div>
      </div>
    </div>

    <!-- 3. Environment -->
    <div class="bg-gray-800 rounded-lg p-6">
      <h2 class="text-lg font-semibold text-white mb-4">Environment</h2>

      <div class="space-y-6">
        <!-- App Ports -->
        <div>
          <h3 class="text-sm font-medium text-gray-300 mb-3">App Ports</h3>
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

        <!-- API Endpoints -->
        <div>
          <h3 class="text-sm font-medium text-gray-300 mb-3">API Endpoints</h3>
          <div class="space-y-2">
            <div
              v-for="ep in apiEndpoints"
              :key="ep.label"
              class="flex items-center justify-between bg-gray-700/50 rounded px-3 py-2"
            >
              <span class="text-xs text-gray-400 w-28 shrink-0">{{ ep.label }}</span>
              <span class="text-xs font-mono text-blue-300 break-all text-right">{{ ep.url }}</span>
            </div>
          </div>
        </div>

        <!-- Connected Services -->
        <div>
          <h3 class="text-sm font-medium text-gray-300 mb-3">Connected Services</h3>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div
              v-for="svc in connectedServices"
              :key="svc.label"
              class="flex items-center gap-2 bg-gray-700/50 rounded px-3 py-2"
            >
              <span
                class="w-2.5 h-2.5 rounded-full shrink-0"
                :class="svc.connected ? 'bg-green-400' : 'bg-red-500'"
              />
              <span class="text-xs text-gray-300">{{ svc.label }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 4. Protocol Defaults -->
    <div class="bg-gray-800 rounded-lg p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-white">Protocol Defaults</h2>
        <button
          class="px-3 py-1.5 rounded text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          @click="openProtocolDrawer"
        >
          Open Protocol Drawer
        </button>
      </div>

      <div class="mb-4">
        <p class="text-xs text-gray-400 uppercase tracking-wide mb-1">Active Preset</p>
        <p class="text-sm font-semibold text-blue-300">{{ currentPreset }}</p>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        <div
          v-for="pair in layerPairs"
          :key="pair.layer"
          class="bg-gray-700/50 rounded px-3 py-2"
        >
          <p class="text-xs text-gray-400 capitalize mb-0.5">{{ pair.layer }}</p>
          <p class="text-xs font-mono text-gray-200 truncate">{{ pair.provider }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
