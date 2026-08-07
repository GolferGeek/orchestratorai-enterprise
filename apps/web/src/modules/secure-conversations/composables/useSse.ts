import { onUnmounted, ref } from 'vue';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import { tokenStorage } from '@/services/tokenStorageService';
import { useRbacStore } from '@/stores/rbacStore';
import { resolveConcreteOrganization } from '@/shared/services/organization-context';

const SECURE_EVENT_TYPES = new Set([
  'inbound.received',
  'inbound.validated',
  'inbound.rejected',
  'inbound.forwarded',
  'outbound.sent',
  'outbound.responded',
  'agent.registered',
  'agent.deregistered',
  'agent.heartbeat',
  'security.violation',
  'heartbeat',
]);

export interface SecureConversationsStreamEvent {
  organizationSlug: string;
  type: string;
  timestamp: string;
  agentId?: string;
  method?: string;
  requestId?: string;
  success?: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

type EventHandler = (
  event: SecureConversationsStreamEvent,
) => void | Promise<void>;

export function useSecureConversationsSse(onEvent?: EventHandler) {
  const connected = ref(false);
  const error = ref<string | null>(null);
  const events = ref<SecureConversationsStreamEvent[]>([]);
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
      if (!user || !token) {
        throw new Error(
          'Authenticated organization is required for Secure Conversations streaming',
        );
      }
      if (typeof crypto.randomUUID !== 'function') {
        throw new Error('Secure UUID generation is unavailable');
      }
      const context: ExecutionContext = Object.freeze({
        orgSlug,
        userId: user.id,
        conversationId: crypto.randomUUID(),
        agentSlug: 'secure-conversations',
        agentType: 'secure-conversations',
        provider: 'platform',
        model: 'event-stream',
      });
      const response = await fetch('/api/secure-conversations/stream/token', {
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
          `Secure Conversations stream token request failed with status ${response.status}`,
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
        throw new Error(
          'Secure Conversations stream token response was malformed',
        );
      }

      eventSource = new EventSource(
        `/api/secure-conversations/stream/events?token=${encodeURIComponent(issued.token)}`,
      );
      eventSource.onopen = () => {
        connected.value = true;
      };
      eventSource.onmessage = (event: MessageEvent) => {
        try {
          const secureEvent = parseSecureConversationsEvent(
            event.data,
            orgSlug,
          );
          events.value.unshift(secureEvent);
          if (events.value.length > 100) {
            events.value.pop();
          }
          if (onEvent) {
            void Promise.resolve(onEvent(secureEvent)).catch((failure) => {
              error.value =
                failure instanceof Error
                  ? failure.message
                  : 'Secure Conversations event handling failed';
            });
          }
        } catch (failure) {
          error.value =
            failure instanceof Error
              ? failure.message
              : 'Secure Conversations stream event was malformed';
          disconnect();
        }
      };
      eventSource.onerror = () => {
        connected.value = false;
        error.value = 'Secure Conversations event stream disconnected';
      };
    } catch (failure) {
      error.value =
        failure instanceof Error
          ? failure.message
          : 'Secure Conversations streaming failed';
    } finally {
      connecting = false;
    }
  }

  function disconnect(): void {
    eventSource?.close();
    eventSource = null;
    connected.value = false;
  }

  onUnmounted(disconnect);

  return { connected, error, events, connect, disconnect };
}

export function parseSecureConversationsEvent(
  value: unknown,
  expectedOrganization: string,
): SecureConversationsStreamEvent {
  if (typeof value !== 'string') {
    throw new Error('Secure Conversations stream event was malformed');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error('Secure Conversations stream event was malformed');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Secure Conversations stream event was malformed');
  }
  const record = parsed as Record<string, unknown>;
  const optionalStrings = ['agentId', 'method', 'requestId', 'message'];
  if (
    record.organizationSlug !== expectedOrganization ||
    typeof record.type !== 'string' ||
    !SECURE_EVENT_TYPES.has(record.type) ||
    typeof record.timestamp !== 'string' ||
    !Number.isFinite(Date.parse(record.timestamp)) ||
    optionalStrings.some(
      (key) => record[key] !== undefined && typeof record[key] !== 'string',
    ) ||
    (record.success !== undefined && typeof record.success !== 'boolean') ||
    (record.data !== undefined &&
      (typeof record.data !== 'object' ||
        record.data === null ||
        Array.isArray(record.data)))
  ) {
    throw new Error('Secure Conversations stream event was malformed');
  }
  const result: SecureConversationsStreamEvent = {
    organizationSlug: record.organizationSlug as string,
    type: record.type as string,
    timestamp: record.timestamp as string,
  };
  if (typeof record.agentId === 'string') result.agentId = record.agentId;
  if (typeof record.method === 'string') result.method = record.method;
  if (typeof record.requestId === 'string') result.requestId = record.requestId;
  if (typeof record.success === 'boolean') result.success = record.success;
  if (typeof record.message === 'string') result.message = record.message;
  if (record.data !== undefined) {
    result.data = record.data as Record<string, unknown>;
  }
  return result;
}
