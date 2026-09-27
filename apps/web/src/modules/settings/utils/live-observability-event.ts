import type { ObservabilityEvent } from '../services/settings-api.service';

/** An event as the observability plane streams it. */
interface StreamedEvent {
  context?: {
    orgSlug?: string;
    userId?: string;
    agentSlug?: string;
    conversationId?: string;
  };
  source_app?: string;
  hook_event_type?: string;
  status?: string;
  message?: string | null;
  payload?: Record<string, unknown>;
  timestamp?: number;
}

/**
 * The same severity rule the event log's query applies
 * (apps/api/src/admin/observability/observability.service.ts).
 */
function severityOf(status: string, eventType: string, message: string): ObservabilityEvent['severity'] {
  const s = status.toLowerCase();
  const t = eventType.toLowerCase();
  if (['error', 'failed', 'failure'].includes(s) || t.includes('failed') || t.includes('error') || message.toLowerCase().startsWith('error:')) {
    return 'error';
  }
  if (['warn', 'warning'].includes(s) || t.includes('warn')) return 'warn';
  return 'info';
}

/**
 * Turn one streamed message into an event-log row, or null for a message
 * that is not an event (the `connected` greeting).
 */
export function toLiveEvent(raw: unknown, sequence: number): ObservabilityEvent | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const event = raw as StreamedEvent;
  if (!event.hook_event_type || !event.context) return null;
  const message = event.message ?? '';
  const occurred = typeof event.timestamp === 'number' ? event.timestamp : Date.now();
  return {
    id: `live-${occurred}-${sequence}`,
    eventType: event.hook_event_type,
    product: event.source_app ?? 'unknown',
    orgSlug: event.context.orgSlug ?? 'unknown',
    userId: event.context.userId ?? null,
    agentSlug: event.context.agentSlug ?? null,
    conversationId: event.context.conversationId ?? null,
    severity: severityOf(event.status ?? '', event.hook_event_type, message),
    message,
    metadata: event.payload ?? {},
    occurredAt: new Date(occurred).toISOString(),
  };
}
