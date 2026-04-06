/**
 * Trigger Executor Routing Tests
 *
 * Validates that the trigger executor correctly dispatches all agents
 * via remote HTTP A2A — Forge (port 6200) for langgraph agents,
 * Compose (port 6300) for all others.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TriggerExecutorService } from './trigger-executor.service';
import { AmbientDatabaseService, Trigger } from '../ambient-database/database.service';
import { StreamingService } from '../streaming/streaming.service';
import { AmbientEvent } from '../event-bus/ambient-event.types';

// Mock global fetch for remote A2A tests
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('TriggerExecutorService', () => {
  let service: TriggerExecutorService;
  let mockDatabase: jest.Mocked<Partial<AmbientDatabaseService>>;
  let mockStreaming: jest.Mocked<Partial<StreamingService>>;

  const baseTrigger: Trigger = {
    id: 'trigger-1',
    org_slug: 'test-org',
    name: 'Test Trigger',
    description: null,
    source_type: 'database',
    enabled: true,
    source_config: {},
    condition: null,
    action_config: {
      agentSlug: 'marketing-swarm',
      agentType: 'langgraph',
      mode: 'converse',
      action: 'execute',
      payload: {},
    },
    cooldown_seconds: 0,
    max_fires_per_hour: null,
    last_fired_at: null,
    created_by: 'user-1',
    product: 'pulse',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  const baseEvent: AmbientEvent = {
    sourceType: 'database',
    payload: { table: 'articles', operation: 'INSERT' },
    timestamp: new Date().toISOString(),
  };

  beforeEach(async () => {
    mockDatabase = {
      insertExecution: jest.fn().mockResolvedValue(undefined),
      updateExecution: jest.fn().mockResolvedValue(undefined),
      updateTriggerLastFired: jest.fn().mockResolvedValue(undefined),
    };

    mockStreaming = {
      emitWorkflowTriggered: jest.fn(),
      emitWorkflowCompleted: jest.fn(),
      emitWorkflowFailed: jest.fn(),
    };

    const mockConfigService = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'DEFAULT_LLM_PROVIDER') return 'openai';
        if (key === 'DEFAULT_LLM_MODEL') return 'gpt-4o';
        throw new Error(`Unknown config key: ${key}`);
      }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        TriggerExecutorService,
        { provide: AmbientDatabaseService, useValue: mockDatabase },
        { provide: StreamingService, useValue: mockStreaming },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = moduleRef.get(TriggerExecutorService);
    jest.clearAllMocks();
  });

  // ─── Remote Routing ─────────────────────────────────────────────────

  it('routes langgraph agents to Forge (port 6200)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        jsonrpc: '2.0',
        id: 'test',
        result: { success: true },
      }),
    });

    await service.execute(baseTrigger, baseEvent);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const fetchUrl = mockFetch.mock.calls[0]![0] as string;
    expect(fetchUrl).toContain('6200');
  });

  it('routes non-langgraph agents to Compose (port 6300)', async () => {
    const trigger = {
      ...baseTrigger,
      action_config: {
        ...baseTrigger.action_config,
        agentSlug: 'simple-rag-agent',
        agentType: 'context',
      },
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ jsonrpc: '2.0', id: 'test', result: {} }),
    });

    await service.execute(trigger, baseEvent);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const fetchUrl = mockFetch.mock.calls[0]![0] as string;
    expect(fetchUrl).toContain('6300');
  });

  // ─── Execution Records ──────────────────────────────────────────────

  it('creates execution record before dispatching', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ jsonrpc: '2.0', id: 'test', result: {} }),
    });

    await service.execute(baseTrigger, baseEvent);

    expect(mockDatabase.insertExecution).toHaveBeenCalledTimes(1);
    const execution = (mockDatabase.insertExecution as jest.Mock).mock.calls[0]![0];
    expect(execution.trigger_id).toBe('trigger-1');
    expect(execution.status).toBe('fired');
    expect(execution.product).toBe('pulse');
    expect(execution.condition_met).toBe(true);
    expect(execution.action_taken).toBe(true);
  });

  it('updates execution record after successful remote dispatch', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ jsonrpc: '2.0', id: 'test', result: { success: true } }),
    });

    await service.execute(baseTrigger, baseEvent);

    expect(mockDatabase.updateExecution).toHaveBeenCalledTimes(1);
    const [id, update] = (mockDatabase.updateExecution as jest.Mock).mock.calls[0]!;
    expect(id).toBeDefined();
    expect(update.status).toBe('completed');
    expect(update.duration_ms).toBeGreaterThanOrEqual(0);
    expect(update.a2a_response).toBeDefined();
  });

  it('updates last_fired_at after execution', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ jsonrpc: '2.0', id: 'test', result: {} }),
    });

    await service.execute(baseTrigger, baseEvent);
    expect(mockDatabase.updateTriggerLastFired).toHaveBeenCalledWith('trigger-1');
  });

  // ─── SSE Events ─────────────────────────────────────────────────────

  it('emits workflow.completed SSE event on success', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ jsonrpc: '2.0', id: 'test', result: {} }),
    });

    await service.execute(baseTrigger, baseEvent);

    expect(mockStreaming.emitWorkflowCompleted).toHaveBeenCalledTimes(1);
    expect(mockStreaming.emitWorkflowFailed).not.toHaveBeenCalled();
  });

  it('emits workflow.failed SSE event on remote A2A error', async () => {
    mockFetch.mockRejectedValue(new Error('Connection refused'));

    await service.execute(baseTrigger, baseEvent);

    expect(mockStreaming.emitWorkflowFailed).toHaveBeenCalledTimes(1);
    expect(mockStreaming.emitWorkflowFailed).toHaveBeenCalledWith(
      'trigger-1',
      'Connection refused',
    );
  });

  // ─── ExecutionContext Construction ──────────────────────────────────

  it('constructs ExecutionContext with all required fields', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ jsonrpc: '2.0', id: 'test', result: {} }),
    });

    await service.execute(baseTrigger, baseEvent);

    const fetchBody = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
    const ctx = fetchBody.params.context;

    expect(ctx.orgSlug).toBe('test-org');
    expect(ctx.userId).toBe('user-1');
    expect(ctx.conversationId).toBeDefined();
    expect(ctx.agentSlug).toBe('marketing-swarm');
    expect(ctx.agentType).toBe('langgraph');
    expect(ctx.provider).toBeDefined();
    expect(ctx.model).toBeDefined();
  });

  it('defaults userId to "system" when created_by is null', async () => {
    const trigger = { ...baseTrigger, created_by: null };

    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ jsonrpc: '2.0', id: 'test', result: {} }),
    });

    await service.execute(trigger, baseEvent);

    const fetchBody = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
    expect(fetchBody.params.context.userId).toBe('system');
  });

  // ─── Error Handling ─────────────────────────────────────────────────

  it('handles remote A2A failure gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Connection refused'));

    await service.execute(baseTrigger, baseEvent);

    // Should not throw — error is caught and recorded
    expect(mockDatabase.updateExecution).toHaveBeenCalledTimes(1);
    const [, update] = (mockDatabase.updateExecution as jest.Mock).mock.calls[0]!;
    expect(update.status).toBe('failed');
    expect(update.a2a_response).toEqual({ error: 'Connection refused' });
  });

  // ─── JSON-RPC Format ───────────────────────────────────────────────

  it('sends correct JSON-RPC 2.0 format for remote A2A', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ jsonrpc: '2.0', id: 'test', result: {} }),
    });

    await service.execute(baseTrigger, baseEvent);

    const fetchBody = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
    expect(fetchBody.jsonrpc).toBe('2.0');
    expect(fetchBody.method).toBe('converse.execute');
    expect(fetchBody.params.context).toBeDefined();
    expect(fetchBody.params.mode).toBe('converse');
    expect(fetchBody.params.payload).toBeDefined();
  });
});
