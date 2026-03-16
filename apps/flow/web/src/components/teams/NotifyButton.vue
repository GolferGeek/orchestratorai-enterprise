<template>
  <button
    class="notify-button"
    :class="{ sent: justSent, sending: sending }"
    :disabled="justSent || sending"
    @click="handleNotify"
  >
    <span v-if="justSent" class="btn-content">
      <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      Notification Sent!
    </span>
    <span v-else class="btn-content">
      <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {{ sending ? 'Sending...' : 'Notify Everyone' }}
    </span>
  </button>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { flowApiService } from '@/services/flow-api.service';
import { useAuthStore } from '@/stores/auth.store';

const props = defineProps<{
  teamId: string;
  taskId?: string;
  message?: string;
}>();

const authStore = useAuthStore();

const sending = ref(false);
const justSent = ref(false);

async function handleNotify() {
  if (sending.value || justSent.value) return;

  sending.value = true;
  const notifyMessage = props.message || 'Team notification from Flow';

  await flowApiService.createNotification(props.teamId, {
    userId: authStore.user?.id,
    type: 'team_notify',
    taskId: props.taskId,
    message: notifyMessage,
  });

  sending.value = false;
  justSent.value = true;

  setTimeout(() => {
    justSent.value = false;
  }, 2000);
}
</script>

<style scoped>
.notify-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  font-weight: 500;
  border-radius: 0.5rem;
  border: 2px solid var(--color-accent, #f59e0b);
  background: transparent;
  color: var(--color-accent, #f59e0b);
  cursor: pointer;
  transition: all 0.2s;
  min-height: 3.5rem;
}

.notify-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-accent, #f59e0b) 10%, transparent);
}

.notify-button:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.notify-button.sent {
  border-color: #22c55e;
  color: #22c55e;
  background: color-mix(in srgb, #22c55e 10%, transparent);
}

.btn-content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-icon {
  width: 1.25rem;
  height: 1.25rem;
  flex-shrink: 0;
}
</style>
