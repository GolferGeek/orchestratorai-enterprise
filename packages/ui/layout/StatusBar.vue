<script setup lang="ts">
import { computed } from 'vue';
import { useAgentsStore } from '../../stores/agents.store';
import { useMessagesStore } from '../../stores/messages.store';
import { useProtocolStore } from '../../stores/protocol.store';
import { useWalletStore } from '../../stores/wallet.store';
import ConnectionStatusDot from '../shared/ConnectionStatusDot.vue';
import { PROTOCOL_LAYERS, LAYER_COLORS } from '../../types';

const agentsStore = useAgentsStore();
const messagesStore = useMessagesStore();
const protocolStore = useProtocolStore();
const walletStore = useWalletStore();

const totalSent = computed(() =>
  agentsStore.agents.reduce((sum, a) => sum + a.messagesSent, 0)
);

const totalReceived = computed(() =>
  agentsStore.agents.reduce((sum, a) => sum + a.messagesReceived, 0)
);

const activeLayerCount = computed(() => PROTOCOL_LAYERS.length);

function layerColor(layer: string): string {
  return LAYER_COLORS[layer];
}

function layerConfigValue(layer: string): string {
  const config = protocolStore.currentConfig as Record<string, string>;
  return config[layer];
}
</script>

<template>
  <footer class="fixed bottom-0 left-0 right-0 h-8 bg-gray-800 border-t border-gray-700 flex items-center justify-between px-4 text-xs text-gray-400 z-50">
    <!-- Left: Agents + Wallet + Network -->
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-2">
        <span class="text-gray-500">Agents:</span>
        <div v-for="agent in agentsStore.agents" :key="agent.card.id" class="flex items-center gap-1">
          <ConnectionStatusDot :status="agent.status" size="sm" />
          <span class="text-gray-300">{{ agent.card.name }}</span>
        </div>
        <span v-if="agentsStore.agents.length === 0" class="text-gray-500">None connected</span>
      </div>

      <div v-if="walletStore.wallet" class="flex items-center gap-1.5 border-l border-gray-700 pl-3">
        <span class="text-gray-500">Wallet:</span>
        <span class="text-white font-medium">{{ walletStore.wallet.balance }} {{ walletStore.wallet.currency }}</span>
      </div>

      <div class="flex items-center gap-1.5 border-l border-gray-700 pl-3">
        <span class="inline-block w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
        <span class="text-gray-400">Base Sepolia Testnet</span>
      </div>
    </div>

    <!-- Right: Protocol layers pill + message counts -->
    <div class="flex items-center gap-4">
      <!-- Protocol stack summary: compact pill row, click opens drawer -->
      <button
        type="button"
        class="flex items-center gap-1 hover:bg-gray-700 rounded px-1.5 py-0.5 transition-colors cursor-pointer"
        title="Protocol stack — click to configure"
        @click="protocolStore.toggleDrawer()"
      >
        <span
          v-for="layer in PROTOCOL_LAYERS"
          :key="layer"
          class="inline-block w-2 h-2 rounded-sm flex-shrink-0"
          :class="layerColor(layer)"
          :title="`${layer}: ${layerConfigValue(layer)}`"
        />
        <span class="ml-1 text-gray-400">{{ activeLayerCount }} layers</span>
      </button>

      <!-- Message counts: ↑ sent ↓ received -->
      <div class="flex items-center gap-1.5 border-l border-gray-700 pl-3">
        <span class="text-green-400">↑</span>
        <span class="text-gray-300">{{ totalSent }}</span>
        <span class="text-blue-400 ml-1">↓</span>
        <span class="text-gray-300">{{ totalReceived }}</span>
      </div>
    </div>
  </footer>
</template>
