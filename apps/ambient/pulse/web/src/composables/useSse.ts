import { ref, onUnmounted } from 'vue';

/**
 * SSE composable consuming the platform-standard SSE endpoint at /api/streaming/events.
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

    eventSource = new EventSource('/api/streaming/events');

    eventSource.onopen = () => {
      connected.value = true;
    };

    eventSource.onmessage = (event: MessageEvent) => {
      const pulseEvent = JSON.parse(event.data as string) as {
        type: string;
        timestamp: string;
        data: Record<string, unknown>;
      };
      lastEvent.value = pulseEvent;

      events.value.unshift(pulseEvent);
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
