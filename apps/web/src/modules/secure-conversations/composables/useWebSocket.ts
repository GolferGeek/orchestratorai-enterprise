import { ref, onUnmounted } from 'vue';
import type { WebSocketEvent } from '../types';

type EventCallback = (data: Record<string, unknown>) => void;

export function useWebSocket() {
  const connected = ref(false);
  const lastEvent = ref<WebSocketEvent | null>(null);
  const listeners = new Map<string, Set<EventCallback>>();
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let intentionalClose = false;

  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/protocol-api/ws/events`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      connected.value = true;
    };

    ws.onmessage = (event) => {
      const wsEvent: WebSocketEvent = JSON.parse(event.data);
      lastEvent.value = wsEvent;

      const callbacks = listeners.get(wsEvent.type);
      if (callbacks) {
        callbacks.forEach((cb) => cb(wsEvent.data));
      }
    };

    ws.onclose = () => {
      connected.value = false;
      if (!intentionalClose) {
        reconnectTimer = setTimeout(connect, 3000);
      }
    };

    ws.onerror = () => {
      connected.value = false;
    };
  }

  function disconnect() {
    intentionalClose = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      ws.close();
      ws = null;
    }
  }

  function onEvent(type: WebSocketEvent['type'], callback: EventCallback) {
    if (!listeners.has(type)) {
      listeners.set(type, new Set());
    }
    listeners.get(type)!.add(callback);

    return () => {
      listeners.get(type)?.delete(callback);
    };
  }

  onUnmounted(() => {
    disconnect();
  });

  return { connected, lastEvent, connect, disconnect, onEvent };
}
