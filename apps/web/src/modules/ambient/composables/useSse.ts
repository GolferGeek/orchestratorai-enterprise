import { ref, onUnmounted } from 'vue';

/**
 * SSE composable consuming the platform-standard Ambient SSE endpoint.
 *
 * Platform-standard format:
 *   Content-Type: text/event-stream
 *   data: <JSON>\n\n
 *
 * Uses EventSource (browser native SSE API) — no WebSocket.
 */
export function useSse() {
  const connected = ref(false);
  const events = ref<Array<{ type: string; timestamp: string; data: Record<string, unknown> }>>([]);
  const lastEvent = ref<{ type: string; timestamp: string; data: Record<string, unknown> } | null>(null);
  let eventSource: EventSource | null = null;

  function connect() {
    if (eventSource) {
      return;
    }

    eventSource = new EventSource('/api/ambient/streaming/events');

    eventSource.onopen = () => {
      connected.value = true;
    };

    eventSource.onmessage = (event: MessageEvent) => {
      const ambientEvent = JSON.parse(event.data as string) as {
        type: string;
        timestamp: string;
        data: Record<string, unknown>;
      };
      lastEvent.value = ambientEvent;

      events.value.unshift(ambientEvent);
      if (events.value.length > 100) {
        events.value.pop();
      }
    };

    eventSource.onerror = () => {
      connected.value = false;
    };
  }

  function disconnect() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
      connected.value = false;
    }
  }

  onUnmounted(() => {
    disconnect();
  });

  return { connected, events, lastEvent, connect, disconnect };
}
