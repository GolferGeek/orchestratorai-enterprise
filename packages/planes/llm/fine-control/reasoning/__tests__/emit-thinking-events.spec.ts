/**
 * Unit tests for emit-thinking-events helpers.
 *
 * Verifies:
 * 1. emitThinkingStarted emits event with event type 'thinking_started' and correct payload.
 * 2. emitThinkingCompleted emits event with event type 'thinking_completed' and correct payload.
 * 3. ExecutionContext is passed through whole (not mutated, not cherry-picked).
 * 4. Optional token/char counts appear in payload only when provided.
 * 5. Errors from observabilityService.push() propagate — not swallowed.
 */

import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { ObservabilityEventsService } from '@orchestratorai/planes/observability';
import {
  emitThinkingStarted,
  emitThinkingCompleted,
} from '../emit-thinking-events';

// ── mock factory ──────────────────────────────────────────────────────────────

function makeObservabilityService(): jest.Mocked<Pick<ObservabilityEventsService, 'push'>> {
  return {
    push: jest.fn().mockResolvedValue(undefined),
  };
}

// ── shared fixtures ───────────────────────────────────────────────────────────

const mockContext = createMockExecutionContext({
  userId: 'user-1',
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  orgSlug: 'test-org',
  conversationId: '00000000-0000-0000-0000-000000000001',
  agentSlug: 'test-agent',
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('emitThinkingStarted', () => {
  it('calls observabilityService.push with hook_event_type "thinking_started"', async () => {
    const svc = makeObservabilityService();
    const startTime = Date.now();

    await emitThinkingStarted({
      observabilityService: svc as unknown as ObservabilityEventsService,
      context: mockContext,
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      startTime,
    });

    expect(svc.push).toHaveBeenCalledTimes(1);
    const [event] = svc.push.mock.calls[0];
    expect(event.hook_event_type).toBe('thinking_started');
    expect(event.status).toBe('thinking_started');
    expect(event.step).toBe('reasoning');
  });

  it('passes the ExecutionContext whole — the context field is the same object reference', async () => {
    const svc = makeObservabilityService();

    await emitThinkingStarted({
      observabilityService: svc as unknown as ObservabilityEventsService,
      context: mockContext,
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      startTime: Date.now(),
    });

    const [event] = svc.push.mock.calls[0];
    expect(event.context).toBe(mockContext);
  });

  it('includes provider and model in payload', async () => {
    const svc = makeObservabilityService();
    const startTime = 1_700_000_000_000;

    await emitThinkingStarted({
      observabilityService: svc as unknown as ObservabilityEventsService,
      context: mockContext,
      provider: 'openai',
      model: 'o3-mini',
      startTime,
    });

    const [event] = svc.push.mock.calls[0];
    expect(event.payload.provider).toBe('openai');
    expect(event.payload.model).toBe('o3-mini');
    expect(event.payload.startTime).toBe(startTime);
    expect(event.timestamp).toBe(startTime);
  });
});

describe('emitThinkingCompleted', () => {
  it('calls observabilityService.push with hook_event_type "thinking_completed"', async () => {
    const svc = makeObservabilityService();
    const startTime = Date.now();
    const endTime = startTime + 2000;

    await emitThinkingCompleted({
      observabilityService: svc as unknown as ObservabilityEventsService,
      context: mockContext,
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      startTime,
      endTime,
    });

    expect(svc.push).toHaveBeenCalledTimes(1);
    const [event] = svc.push.mock.calls[0];
    expect(event.hook_event_type).toBe('thinking_completed');
    expect(event.status).toBe('thinking_completed');
    expect(event.step).toBe('reasoning');
  });

  it('passes the ExecutionContext whole — the context field is the same object reference', async () => {
    const svc = makeObservabilityService();
    const now = Date.now();

    await emitThinkingCompleted({
      observabilityService: svc as unknown as ObservabilityEventsService,
      context: mockContext,
      provider: 'google',
      model: 'gemini-2.5-pro',
      startTime: now,
      endTime: now + 1500,
    });

    const [event] = svc.push.mock.calls[0];
    expect(event.context).toBe(mockContext);
  });

  it('includes durationMs, provider, and model in payload', async () => {
    const svc = makeObservabilityService();
    const startTime = 1_700_000_000_000;
    const endTime = startTime + 3000;

    await emitThinkingCompleted({
      observabilityService: svc as unknown as ObservabilityEventsService,
      context: mockContext,
      provider: 'openai',
      model: 'o3-mini',
      startTime,
      endTime,
    });

    const [event] = svc.push.mock.calls[0];
    expect(event.payload.durationMs).toBe(3000);
    expect(event.payload.provider).toBe('openai');
    expect(event.payload.model).toBe('o3-mini');
    expect(event.timestamp).toBe(endTime);
  });

  it('includes thinkingTokenCount in payload when provided', async () => {
    const svc = makeObservabilityService();
    const now = Date.now();

    await emitThinkingCompleted({
      observabilityService: svc as unknown as ObservabilityEventsService,
      context: mockContext,
      provider: 'google',
      model: 'gemini-2.5-pro',
      startTime: now,
      endTime: now + 500,
      thinkingTokenCount: 512,
    });

    const [event] = svc.push.mock.calls[0];
    expect(event.payload.thinkingTokenCount).toBe(512);
  });

  it('does NOT include thinkingTokenCount in payload when not provided', async () => {
    const svc = makeObservabilityService();
    const now = Date.now();

    await emitThinkingCompleted({
      observabilityService: svc as unknown as ObservabilityEventsService,
      context: mockContext,
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      startTime: now,
      endTime: now + 500,
    });

    const [event] = svc.push.mock.calls[0];
    expect('thinkingTokenCount' in event.payload).toBe(false);
  });

  it('includes thinkingCharCount in payload when provided', async () => {
    const svc = makeObservabilityService();
    const now = Date.now();

    await emitThinkingCompleted({
      observabilityService: svc as unknown as ObservabilityEventsService,
      context: mockContext,
      provider: 'ollama',
      model: 'gemma3:4b',
      startTime: now,
      endTime: now + 200,
      thinkingCharCount: 1024,
    });

    const [event] = svc.push.mock.calls[0];
    expect(event.payload.thinkingCharCount).toBe(1024);
  });
});

describe('error propagation', () => {
  it('emitThinkingStarted propagates errors from push — does not swallow them', async () => {
    const svc = makeObservabilityService();
    svc.push.mockRejectedValueOnce(new Error('DB write failed'));

    await expect(
      emitThinkingStarted({
        observabilityService: svc as unknown as ObservabilityEventsService,
        context: mockContext,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        startTime: Date.now(),
      }),
    ).rejects.toThrow('DB write failed');
  });

  it('emitThinkingCompleted propagates errors from push — does not swallow them', async () => {
    const svc = makeObservabilityService();
    svc.push.mockRejectedValueOnce(new Error('network timeout'));
    const now = Date.now();

    await expect(
      emitThinkingCompleted({
        observabilityService: svc as unknown as ObservabilityEventsService,
        context: mockContext,
        provider: 'openai',
        model: 'o3-mini',
        startTime: now,
        endTime: now + 1000,
      }),
    ).rejects.toThrow('network timeout');
  });
});
