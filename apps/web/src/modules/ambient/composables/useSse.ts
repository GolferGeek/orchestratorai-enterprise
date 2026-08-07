import { ref, onUnmounted } from 'vue';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import { tokenStorage } from '@/services/tokenStorageService';
import { useRbacStore } from '@/stores/rbacStore';
import { resolveConcreteOrganization } from '@/shared/services/organization-context';

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
  const error = ref<string | null>(null);
  const events = ref<
    Array<{ type: string; timestamp: string; data: Record<string, unknown> }>
  >([]);
  const lastEvent = ref<{
    type: string;
    timestamp: string;
    data: Record<string, unknown>;
  } | null>(null);
  let eventSource: EventSource | null = null;
  let connecting = false;

  async function connect(): Promise<void> {
    if (eventSource || connecting) {
      return;
    }
    connecting = true;
    error.value = null;

    try {
      const rbac = useRbacStore();
      await rbac.initialize();
      const user = rbac.user;
      const orgSlug = await resolveConcreteOrganization(rbac);
      const token = await tokenStorage.getAccessToken();
      if (!user || !orgSlug || !token) {
        throw new Error(
          'Authenticated organization is required for Ambient streaming',
        );
      }
      if (typeof crypto.randomUUID !== 'function') {
        throw new Error('Secure UUID generation is unavailable');
      }
      const context: ExecutionContext = Object.freeze({
        orgSlug,
        userId: user.id,
        conversationId: crypto.randomUUID(),
        agentSlug: 'ambient',
        agentType: 'ambient',
        provider: 'platform',
        model: 'event-stream',
      });
      const response = await fetch('/api/ambient/streaming/token', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'x-organization-slug': orgSlug,
        },
        body: JSON.stringify({ context }),
      });
      if (!response.ok) {
        throw new Error(
          `Ambient stream token request failed with status ${response.status}`,
        );
      }
      const issued = (await response.json()) as {
        token?: unknown;
        expiresAt?: unknown;
      };
      if (
        typeof issued.token !== 'string' ||
        typeof issued.expiresAt !== 'string' ||
        !Number.isFinite(Date.parse(issued.expiresAt))
      ) {
        throw new Error('Ambient stream token response was malformed');
      }

      eventSource = new EventSource(
        `/api/ambient/streaming/events?token=${encodeURIComponent(issued.token)}`,
      );

      eventSource.onopen = () => {
        connected.value = true;
      };

      eventSource.onmessage = (event: MessageEvent) => {
        try {
          const ambientEvent = parseAmbientEvent(event.data);
          lastEvent.value = ambientEvent;

          events.value.unshift(ambientEvent);
          if (events.value.length > 100) {
            events.value.pop();
          }
        } catch (failure) {
          error.value =
            failure instanceof Error
              ? failure.message
              : 'Ambient stream event was malformed';
          disconnect();
        }
      };

      eventSource.onerror = () => {
        connected.value = false;
        error.value = 'Ambient event stream disconnected';
      };
    } catch (failure) {
      error.value =
        failure instanceof Error ? failure.message : 'Ambient streaming failed';
    } finally {
      connecting = false;
    }
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

  return { connected, events, lastEvent, error, connect, disconnect };
}

function parseAmbientEvent(value: unknown): {
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
} {
  if (typeof value !== 'string') {
    throw new Error('Ambient stream event was malformed');
  }
  const parsed = JSON.parse(value) as unknown;
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    typeof (parsed as Record<string, unknown>).type !== 'string' ||
    typeof (parsed as Record<string, unknown>).timestamp !== 'string' ||
    !Number.isFinite(
      Date.parse((parsed as Record<string, unknown>).timestamp as string),
    )
  ) {
    throw new Error('Ambient stream event was malformed');
  }
  const record = parsed as Record<string, unknown>;
  const data = record.data;
  if (
    data !== undefined &&
    (typeof data !== 'object' || data === null || Array.isArray(data))
  ) {
    throw new Error('Ambient stream event was malformed');
  }
  return {
    type: record.type as string,
    timestamp: record.timestamp as string,
    data: (data ?? {}) as Record<string, unknown>,
  };
}
