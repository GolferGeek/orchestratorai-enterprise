import { ref, watch, onUnmounted } from 'vue';
import type { Ref } from 'vue';

export interface TaskProgressEvent {
  taskId: string;
  eventType: string;
  status: string;
  message: string | null;
  step: string | null;
  toolName: string | null;
  sessionId: string | null;
  sourceApp: string;
  timestamp: number;
  payload: Record<string, unknown>;
}

interface UseTaskProgressReturn {
  events: Ref<TaskProgressEvent[]>;
  isConnected: Ref<boolean>;
  isComplete: Ref<boolean>;
  latestStatus: Ref<string | null>;
  latestMessage: Ref<string | null>;
}

/**
 * Composable to subscribe to real-time task progress via the dedicated
 * Flow task events SSE stream (GET /api/flow/task-events/stream).
 * Receives granular events from Claude Code hooks in real time.
 *
 * Takes a reactive taskId ref. When taskId changes, the previous
 * EventSource is closed and a new one is opened. Auto-reconnects
 * on disconnect via native EventSource behaviour.
 */
export function useTaskProgress(taskId: Ref<string | null>): UseTaskProgressReturn {
  const events = ref<TaskProgressEvent[]>([]);
  const isConnected = ref(false);
  const isComplete = ref(false);

  let eventSource: EventSource | null = null;

  function cleanup() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    isConnected.value = false;
  }

  function connect(id: string) {
    cleanup();

    const token = localStorage.getItem('authToken');
    if (!token) {
      console.error('[useTaskProgress] No auth token in localStorage');
      return;
    }

    // Clear previous events when task changes
    events.value = [];
    isComplete.value = false;

    const params = new URLSearchParams({ taskId: id, token });
    const url = `/api/flow/task-events/stream?${params.toString()}`;

    const es = new EventSource(url);
    eventSource = es;

    es.onopen = () => {
      isConnected.value = true;
    };

    es.addEventListener('task-event', (e: MessageEvent) => {
      const data = JSON.parse(e.data) as TaskProgressEvent;
      events.value = [...events.value, data];

      if (data.status === 'completed' || data.status === 'failed') {
        isComplete.value = true;
      }
    });

    es.addEventListener('heartbeat', () => {
      // Keep-alive — no action needed
    });

    es.onerror = () => {
      isConnected.value = false;
      // Native EventSource will auto-reconnect
    };
  }

  // Watch taskId and (re)connect whenever it changes
  const stopWatch = watch(
    taskId,
    (id) => {
      if (id) {
        connect(id);
      } else {
        cleanup();
      }
    },
    { immediate: true },
  );

  onUnmounted(() => {
    stopWatch();
    cleanup();
  });

  const latestStatus = ref<string | null>(null);
  const latestMessage = ref<string | null>(null);

  // Derive latest status/message reactively
  watch(events, (evts) => {
    if (evts.length === 0) {
      latestStatus.value = null;
      latestMessage.value = null;
    } else {
      const last = evts[evts.length - 1];
      latestStatus.value = last.status ?? null;
      latestMessage.value = last.message ?? null;
    }
  });

  return { events, isConnected, isComplete, latestStatus, latestMessage };
}
