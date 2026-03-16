import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { TimelineMessage, ScenarioResult } from '@/types';

export const useTimelineStore = defineStore('timeline', () => {
  const messages = ref<TimelineMessage[]>([]);
  const selectedMessageId = ref<string | null>(null);

  const selectedMessage = ref<TimelineMessage | null>(null);

  function addFromScenarioResult(result: ScenarioResult) {
    const trace = result.pipelineTrace;
    if (!trace) return;

    const msg: TimelineMessage = {
      id: trace.id ?? `msg-${Date.now()}`,
      timestamp: trace.completedAt ?? new Date().toISOString(),
      source: trace.source,
      target: trace.target,
      method: trace.method,
      duration: trace.totalDuration,
      providers: result.scenario.providers,
      scenarioId: result.scenario.id,
      scenarioName: result.scenario.name,
      pipelineTrace: trace,
      result: result.result,
    };

    messages.value = [msg, ...messages.value];

    // Auto-select the latest message
    selectMessage(msg.id);
  }

  function selectMessage(id: string) {
    selectedMessageId.value = id;
    selectedMessage.value = messages.value.find((m) => m.id === id) ?? null;
  }

  function clearSelection() {
    selectedMessageId.value = null;
    selectedMessage.value = null;
  }

  function clearAll() {
    messages.value = [];
    selectedMessageId.value = null;
    selectedMessage.value = null;
  }

  return {
    messages,
    selectedMessageId,
    selectedMessage,
    addFromScenarioResult,
    selectMessage,
    clearSelection,
    clearAll,
  };
});
