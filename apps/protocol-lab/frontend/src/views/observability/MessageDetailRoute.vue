<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useMessagesStore } from '../../stores/messages.store';
import MessageDetail from './MessageDetail.vue';
import LoadingSpinner from '../../components/shared/LoadingSpinner.vue';

const props = defineProps<{
  id: string;
}>();

const messagesStore = useMessagesStore();

onMounted(async () => {
  if (props.id) {
    await messagesStore.selectMessage(props.id);
  }
});

onUnmounted(() => {
  messagesStore.clearSelection();
});
</script>

<template>
  <div class="h-full flex flex-col p-4 w-full">
    <div v-if="messagesStore.loading && !messagesStore.selectedMessage" class="flex justify-center py-12">
      <LoadingSpinner size="lg" label="Loading message details..." />
    </div>
    <div v-else-if="messagesStore.selectedMessage" class="card shadow-xl overflow-hidden">
      <!-- Back button -->
      <div class="mb-4">
        <router-link to="/observability" class="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1 w-max">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Observability
        </router-link>
      </div>

      <MessageDetail :message="messagesStore.selectedMessage" />
    </div>
    <div v-else class="card border border-red-500 bg-red-950/20 p-6 text-center">
      <p class="text-red-400">Message not found</p>
      <router-link to="/observability" class="text-blue-400 hover:text-blue-300 mt-4 inline-block underline">
        Return to Observability Log
      </router-link>
    </div>
  </div>
</template>
