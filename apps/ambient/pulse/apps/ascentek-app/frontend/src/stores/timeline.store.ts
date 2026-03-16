import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { PipelineTrace } from '@/services/api';

export interface TimelineMessage {
  id: string;
  timestamp: string;
  source: string;
  target: string;
  method: string;
  scenarioId: number;
  scenarioName: string;
  durationMs: number;
  pipelineTrace: PipelineTrace;
}

export const useTimelineStore = defineStore('timeline', () => {
  const messages = ref<TimelineMessage[]>([]);
  const selectedMessageId = ref<string | null>(null);

  const selectedMessage = (() => {
    return messages.value.find((m) => m.id === selectedMessageId.value) ?? null;
  });

  function addMessage(msg: TimelineMessage): void {
    messages.value.unshift(msg);
    // Keep last 50 messages
    if (messages.value.length > 50) {
      messages.value = messages.value.slice(0, 50);
    }
  }

  function selectMessage(id: string): void {
    selectedMessageId.value = id;
  }

  function clearTimeline(): void {
    messages.value = [];
    selectedMessageId.value = null;
  }

  function getSelectedMessage(): TimelineMessage | null {
    if (!selectedMessageId.value) return null;
    return messages.value.find((m) => m.id === selectedMessageId.value) ?? null;
  }

  return {
    messages,
    selectedMessageId,
    selectedMessage,
    addMessage,
    selectMessage,
    clearTimeline,
    getSelectedMessage,
  };
});
