import { describe, expect, it } from 'vitest';
import { toLiveEvent } from './live-observability-event';

describe('toLiveEvent', () => {
  it('maps a streamed plane event to an event-log row', () => {
    const row = toLiveEvent(
      {
        context: { orgSlug: 'corporate', userId: 'u1', agentSlug: 'decision-risk', conversationId: 'c1' },
        source_app: 'orchestrator-ai',
        hook_event_type: 'agent.llm.failed',
        status: 'failed',
        message: 'Model not found',
        payload: { provider: 'ollama' },
        timestamp: Date.UTC(2026, 8, 27, 12),
      },
      3,
    );
    expect(row).toEqual({
      id: `live-${Date.UTC(2026, 8, 27, 12)}-3`,
      eventType: 'agent.llm.failed',
      product: 'orchestrator-ai',
      orgSlug: 'corporate',
      userId: 'u1',
      agentSlug: 'decision-risk',
      conversationId: 'c1',
      severity: 'error',
      message: 'Model not found',
      metadata: { provider: 'ollama' },
      occurredAt: '2026-09-27T12:00:00.000Z',
    });
  });

  it('skips the connection greeting', () => {
    expect(toLiveEvent({ event_type: 'connected' }, 0)).toBeNull();
  });
});
