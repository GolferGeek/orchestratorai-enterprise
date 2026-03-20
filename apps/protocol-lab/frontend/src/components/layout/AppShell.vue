<script setup lang="ts">
import { onMounted } from 'vue';
import TopNav from './TopNav.vue';
import SidebarNav from './SidebarNav.vue';
import StatusBar from './StatusBar.vue';
import ProtocolDrawer from '../../views/protocol/ProtocolDrawer.vue';
import HelpPanel from '../help/HelpPanel.vue';
import HelpModeBanner from '../help/HelpModeBanner.vue';
import { useProtocolStore } from '../../stores/protocol.store';
import { useAgentsStore } from '../../stores/agents.store';
import { useMessagesStore } from '../../stores/messages.store';
import { useWebSocket } from '../../composables/useWebSocket';

const protocolStore = useProtocolStore();
const agentsStore = useAgentsStore();
const messagesStore = useMessagesStore();
const { connect, onEvent } = useWebSocket();

onMounted(async () => {
  connect();

  // Load initial data so StatusBar shows real state
  await Promise.all([
    agentsStore.fetchAgents(),
    protocolStore.fetchConfig(),
  ]);

  onEvent('agent-status', () => {
    agentsStore.refreshStatuses();
  });

  onEvent('message', () => {
    messagesStore.fetchMessages({ limit: 50 });
  });

  onEvent('protocol-change', () => {
    protocolStore.fetchConfig();
  });
});
</script>

<template>
  <div class="min-h-screen bg-gray-900">
    <TopNav />
    <SidebarNav />
    <main class="pt-14 pb-8 pl-[220px]">
      <div class="p-6">
        <router-view />
      </div>
    </main>
    <StatusBar />
    <ProtocolDrawer />
    <HelpPanel />
    <HelpModeBanner />
  </div>
</template>
