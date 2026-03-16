/**
 * Trigger Executor Routing Tests
 *
 * Validates that the trigger executor correctly dispatches:
 * - predictor / us-tech-stocks → local PredictorService
 * - investment-risk-agent / risk-runner → local RiskRunnerService
 * - unknown agents → remote HTTP A2A
 */

// Mock the processing services BEFORE import to prevent compiling 175+ files
jest.mock('../processing/predictor/predictor.service', () => ({
  PredictorService: jest.fn().mockImplementation(() => ({
    process: jest.fn().mockResolvedValue({
      status: 'completed',
      response: { predictions: [] },
      duration: 42,
    }),
  })),
}));

jest.mock('../processing/risk-runner/risk-runner.service', () => ({
  RiskRunnerService: jest.fn().mockImplementation(() => ({
    process: jest.fn().mockResolvedValue({
      status: 'completed',
      response: { risks: [] },
      duration: 37,
    }),
  })),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { TriggerExecutorService } from './trigger-executor.service';
import { AmbientDatabaseService, Trigger } from '../ambient-database/database.service';
import { StreamingService } from '../streaming/streaming.service';
import { PredictorService } from '../processing/predictor/predictor.service';
import { RiskRunnerService } from '../processing/risk-runner/risk-runner.service';
import { AmbientEvent } from '../event-bus/ambient-event.types';

// Mock global fetch for remote A2A tests
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('TriggerExecutorService', () => {
  let service: TriggerExecutorService;
  let mockDatabase: jest.Mocked<Partial<AmbientDatabaseService>>;
  let mockStreaming: jest.Mocked<Partial<StreamingService>>;
  let mockPredictorInstance: { process: jest.Mock };
  let mockRiskRunnerInstance: { process: jest.Mock };

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
      agentSlug: 'predictor',
      agentType: 'context',
      mode: 'dashboard',
      action: 'list',
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
    payload: { table: 'predictions', operation: 'INSERT' },
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

    mockPredictorInstance = {
      process: jest.fn().mockResolvedValue({
        status: 'completed',
        response: { predictions: [] },
        duration: 42,
      }),
    };

    mockRiskRunnerInstance = {
      process: jest.fn().mockResolvedValue({
        status: 'completed',
        response: { risks: [] },
        duration: 37,
      }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        TriggerExecutorService,
        { provide: AmbientDatabaseService, useValue: mockDatabase },
        { provide: StreamingService, useValue: mockStreaming },
        { provide: PredictorService, useValue: mockPredictorInstance },
        { provide: RiskRunnerService, useValue: mockRiskRunnerInstance },
      ],
    }).compile();

    service = moduleRef.get(TriggerExecutorService);
    jest.clearAllMocks();
  });

  // ─── Local Routing ──────────────────────────────────────────────────

  it('routes "predictor" agent to local PredictorService', async () => {
    const trigger = {
      ...baseTrigger,
      action_config: { ...baseTrigger.action_config, agentSlug: 'predictor' },
    };

    await service.execute(trigger, baseEvent);

    expect(mockPredictorInstance.process).toHaveBeenCalledTimes(1);
    expect(mockRiskRunnerInstance.process).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();

    // Verify ExecutionContext was constructed properly
    const call = mockPredictorInstance.process.mock.calls[0]![0];
    expect(call.context.orgSlug).toBe('test-org');
    expect(call.context.agentSlug).toBe('predictor');
    expect(call.context.userId).toBe('user-1');
  });

  it('routes "us-tech-stocks" agent to local PredictorService', async () => {
    const trigger = {
      ...baseTrigger,
      action_config: { ...baseTrigger.action_config, agentSlug: 'us-tech-stocks' },
    };

    await service.execute(trigger, baseEvent);

    expect(mockPredictorInstance.process).toHaveBeenCalledTimes(1);
    expect(mockRiskRunnerInstance.process).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('routes "risk-runner" agent to local RiskRunnerService', async () => {
    const trigger = {
      ...baseTrigger,
      action_config: { ...baseTrigger.action_config, agentSlug: 'risk-runner' },
    };

    await service.execute(trigger, baseEvent);

    expect(mockRiskRunnerInstance.process).toHaveBeenCalledTimes(1);
    expect(mockPredictorInstance.process).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('routes "investment-risk-agent" agent to local RiskRunnerService', async () => {
    const trigger = {
      ...baseTrigger,
      action_config: { ...baseTrigger.action_config, agentSlug: 'investment-risk-agent' },
    };

    await service.execute(trigger, baseEvent);

    expect(mockRiskRunnerInstance.process).toHaveBeenCalledTimes(1);
    expect(mockPredictorInstance.process).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ─── Remote Routing ─────────────────────────────────────────────────

  it('routes unknown agent to remote HTTP A2A call', async () => {
    const trigger = {
      ...baseTrigger,
      action_config: {
        ...baseTrigger.action_config,
        agentSlug: 'marketing-swarm',
        agentType: 'langgraph',
      },
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        jsonrpc: '2.0',
        id: 'test',
        result: { success: true },
      }),
    });

    await service.execute(trigger, baseEvent);

    expect(mockPredictorInstance.process).not.toHaveBeenCalled();
    expect(mockRiskRunnerInstance.process).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // langgraph agents go to Forge (port 6200)
    const fetchUrl = mockFetch.mock.calls[0]![0] as string;
    expect(fetchUrl).toContain('6200');
  });

  it('routes non-langgraph unknown agent to Compose (port 6300)', async () => {
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
    await service.execute(baseTrigger, baseEvent);

    expect(mockDatabase.insertExecution).toHaveBeenCalledTimes(1);
    const execution = (mockDatabase.insertExecution as jest.Mock).mock.calls[0]![0];
    expect(execution.trigger_id).toBe('trigger-1');
    expect(execution.status).toBe('fired');
    expect(execution.product).toBe('pulse');
    expect(execution.condition_met).toBe(true);
    expect(execution.action_taken).toBe(true);
  });

  it('updates execution record after successful local dispatch', async () => {
    await service.execute(baseTrigger, baseEvent);

    expect(mockDatabase.updateExecution).toHaveBeenCalledTimes(1);
    const [id, update] = (mockDatabase.updateExecution as jest.Mock).mock.calls[0]!;
    expect(id).toBeDefined();
    expect(update.status).toBe('completed');
    expect(update.duration_ms).toBeGreaterThanOrEqual(0);
    expect(update.a2a_response).toBeDefined();
  });

  it('updates last_fired_at after execution', async () => {
    await service.execute(baseTrigger, baseEvent);
    expect(mockDatabase.updateTriggerLastFired).toHaveBeenCalledWith('trigger-1');
  });

  // ─── SSE Events ─────────────────────────────────────────────────────

  it('emits workflow.completed SSE event on success', async () => {
    await service.execute(baseTrigger, baseEvent);

    expect(mockStreaming.emitWorkflowCompleted).toHaveBeenCalledTimes(1);
    expect(mockStreaming.emitWorkflowFailed).not.toHaveBeenCalled();
  });

  it('emits workflow.failed SSE event on error', async () => {
    mockPredictorInstance.process.mockRejectedValue(new Error('LLM timeout'));

    await service.execute(baseTrigger, baseEvent);

    expect(mockStreaming.emitWorkflowFailed).toHaveBeenCalledTimes(1);
    expect(mockStreaming.emitWorkflowFailed).toHaveBeenCalledWith(
      'trigger-1',
      'LLM timeout',
    );
  });

  // ─── ExecutionContext Construction ──────────────────────────────────

  it('constructs ExecutionContext with all required fields', async () => {
    await service.execute(baseTrigger, baseEvent);

    const call = mockPredictorInstance.process.mock.calls[0]![0];
    const ctx = call.context;

    expect(ctx.orgSlug).toBe('test-org');
    expect(ctx.userId).toBe('user-1');
    expect(ctx.conversationId).toBeDefined();
    expect(ctx.conversationId).toBeDefined();
    expect(ctx.agentSlug).toBe('predictor');
    expect(ctx.agentType).toBe('context');
    expect(ctx.provider).toBe('default');
    expect(ctx.model).toBe('default');
  });

  it('defaults userId to "system" when created_by is null', async () => {
    const trigger = { ...baseTrigger, created_by: null };

    await service.execute(trigger, baseEvent);

    const call = mockPredictorInstance.process.mock.calls[0]![0];
    expect(call.context.userId).toBe('system');
  });

  // ─── DashboardRequestPayload ────────────────────────────────────────

  it('builds DashboardRequestPayload with action field', async () => {
    const trigger = {
      ...baseTrigger,
      action_config: {
        ...baseTrigger.action_config,
        mode: 'dashboard',
        action: 'list',
      },
    };

    await service.execute(trigger, baseEvent);

    const call = mockPredictorInstance.process.mock.calls[0]![0];
    expect(call.payload).toBeDefined();
    expect(call.payload!.action).toBe('list');
    expect(call.mode).toBe('dashboard');
    expect(call.action).toBe('list');
  });

  // ─── Error Handling ─────────────────────────────────────────────────

  it('handles local service failure gracefully', async () => {
    mockPredictorInstance.process.mockRejectedValue(new Error('Service crashed'));

    await service.execute(baseTrigger, baseEvent);

    // Should not throw — error is caught and recorded
    expect(mockDatabase.updateExecution).toHaveBeenCalledTimes(1);
    const [, update] = (mockDatabase.updateExecution as jest.Mock).mock.calls[0]!;
    expect(update.status).toBe('failed');
    expect(update.a2a_response).toEqual({ error: 'Service crashed' });
  });

  it('handles remote A2A failure gracefully', async () => {
    const trigger = {
      ...baseTrigger,
      action_config: {
        ...baseTrigger.action_config,
        agentSlug: 'marketing-swarm',
        agentType: 'langgraph',
      },
    };

    mockFetch.mockRejectedValue(new Error('Connection refused'));

    await service.execute(trigger, baseEvent);

    expect(mockDatabase.updateExecution).toHaveBeenCalledTimes(1);
    const [, update] = (mockDatabase.updateExecution as jest.Mock).mock.calls[0]!;
    expect(update.status).toBe('failed');
    expect(update.a2a_response).toEqual({ error: 'Connection refused' });
  });

  // ─── JSON-RPC Format ───────────────────────────────────────────────

  it('sends correct JSON-RPC 2.0 format for remote A2A', async () => {
    const trigger = {
      ...baseTrigger,
      action_config: {
        ...baseTrigger.action_config,
        agentSlug: 'marketing-swarm',
        agentType: 'langgraph',
        mode: 'converse',
        action: 'execute',
      },
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ jsonrpc: '2.0', id: 'test', result: {} }),
    });

    await service.execute(trigger, baseEvent);

    const fetchBody = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
    expect(fetchBody.jsonrpc).toBe('2.0');
    expect(fetchBody.method).toBe('converse.execute');
    expect(fetchBody.params.context).toBeDefined();
    expect(fetchBody.params.mode).toBe('converse');
    expect(fetchBody.params.payload).toBeDefined();
  });
});
