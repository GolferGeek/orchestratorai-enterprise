import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';

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
  events: TaskProgressEvent[];
  isConnected: boolean;
  latestStatus: string | null;
  latestMessage: string | null;
}

/**
 * Hook to subscribe to real-time task progress via the dedicated
 * Flow task events SSE stream (GET /flow/task-events/stream).
 * Receives granular events from Claude Code hooks in real time.
 */
export function useTaskProgress(taskId: string | null): UseTaskProgressReturn {
  const [events, setEvents] = useState<TaskProgressEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const token = useAuthStore((s) => s.token);

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  }, []);

  useEffect(() => {
    if (!taskId || !token) {
      cleanup();
      return;
    }

    const apiBaseUrl =
      import.meta.env.VITE_MAIN_API_URL ||
      import.meta.env.MAIN_API_URL ||
      import.meta.env.VITE_API_URL;

    if (!apiBaseUrl) {
      console.error('[useTaskProgress] No API URL configured');
      return;
    }

    const params = new URLSearchParams({ taskId, token });
    const url = `${apiBaseUrl}/flow/task-events/stream?${params.toString()}`;

    // Clear previous events when task changes
    setEvents([]);

    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      setIsConnected(true);
    };

    es.addEventListener('task-event', (e: MessageEvent) => {
      const data = JSON.parse(e.data) as TaskProgressEvent;
      setEvents((prev) => [...prev, data]);
    });

    es.addEventListener('heartbeat', () => {
      // Keep-alive, no action needed
    });

    es.onerror = () => {
      setIsConnected(false);
      // EventSource will auto-reconnect
    };

    return cleanup;
  }, [taskId, token, cleanup]);

  const latestEvent = events.length > 0 ? events[events.length - 1] : null;

  return {
    events,
    isConnected,
    latestStatus: latestEvent?.status ?? null,
    latestMessage: latestEvent?.message ?? null,
  };
}
