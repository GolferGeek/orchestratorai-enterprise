<template>
  <div class="agent-card" role="button" tabindex="0" @click="emit('select', agent)" @keypress.enter="emit('select', agent)">
    <h3 class="agent-name">{{ agent.displayName ?? agent.name }}</h3>
    <p v-if="agent.description" class="agent-description">{{ agent.description }}</p>
    <div class="agent-footer">
      <span class="chat-hint">Start Conversation &rarr;</span>
    </div>
  </div>
</template>

<script lang="ts" setup>
import type { ComposeAgent } from '@/services/compose-api.service';

defineProps<{
  agent: ComposeAgent;
}>();

const emit = defineEmits<{
  select: [agent: ComposeAgent];
}>();
</script>

<style scoped>
.agent-card {
  border: 1px solid var(--ion-color-step-200);
  border-radius: 10px;
  padding: 16px;
  background: var(--ion-background-color);
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.agent-card:hover {
  border-color: var(--ion-color-primary);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-1px);
}

.agent-card:focus {
  outline: 2px solid var(--ion-color-primary);
  outline-offset: 2px;
}

.agent-name {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--ion-text-color);
  line-height: 1.3;
}

.agent-description {
  margin: 0;
  font-size: 0.85rem;
  color: var(--ion-color-medium);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.agent-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
}

.chat-hint {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--ion-color-primary);
}
</style>
