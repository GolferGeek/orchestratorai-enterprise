import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AgentRuntimeLifecycleService,
  LifecycleContext,
} from './agent-runtime-lifecycle.service';
import { AgentTaskMode } from '@agent2agent/dto/task-request.dto';

describe('AgentRuntimeLifecycleService', () => {
  let service: AgentRuntimeLifecycleService;
  let mockEmitter: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    mockEmitter = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentRuntimeLifecycleService,
        { provide: EventEmitter2, useValue: mockEmitter },
      ],
    }).compile();

    service = module.get<AgentRuntimeLifecycleService>(
      AgentRuntimeLifecycleService,
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('start', () => {
    it('should emit lifecycle start event', () => {
      const ctx: LifecycleContext = {
        conversationId: 'conv-1',
        sessionId: 'session-1',
        organizationSlug: 'test-org',
        agentSlug: 'test-agent',
        mode: AgentTaskMode.CONVERSE,
      };
      const metadata = { key: 'value' };

      service.start(ctx, metadata);

      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'agent.lifecycle.start',
        expect.objectContaining({
          conversationId: ctx.conversationId,
          sessionId: ctx.sessionId,
          organizationSlug: ctx.organizationSlug,
          agentSlug: ctx.agentSlug,
          mode: ctx.mode,
          metadata,
          timestamp: expect.any(String) as string,
        }),
      );
    });

    it('should emit start event without metadata', () => {
      const ctx: LifecycleContext = {
        organizationSlug: 'test-org',
        agentSlug: 'test-agent',
        mode: AgentTaskMode.PLAN,
      };

      service.start(ctx);

      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'agent.lifecycle.start',
        expect.objectContaining({
          organizationSlug: ctx.organizationSlug,
          agentSlug: ctx.agentSlug,
          mode: ctx.mode,
          timestamp: expect.any(String) as string,
        }),
      );
    });
  });

  describe('progress', () => {
    it('should emit lifecycle progress event', () => {
      const ctx: LifecycleContext = {
        conversationId: 'conv-1',
        organizationSlug: 'test-org',
        agentSlug: 'test-agent',
        mode: AgentTaskMode.BUILD,
      };
      const progress = {
        step: 'processing',
        message: 'Processing request',
        percent: 50,
        metadata: { processingTime: 1000 },
      };

      service.progress(ctx, progress);

      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'agent.lifecycle.progress',
        expect.objectContaining({
          conversationId: ctx.conversationId,
          organizationSlug: ctx.organizationSlug,
          agentSlug: ctx.agentSlug,
          mode: ctx.mode,
          progress,
          timestamp: expect.any(String) as string,
        }),
      );
    });

    it('should handle progress with minimal data', () => {
      const ctx: LifecycleContext = {
        organizationSlug: null,
        agentSlug: 'test-agent',
        mode: AgentTaskMode.CONVERSE,
      };
      const progress = {
        step: 'init',
      };

      service.progress(ctx, progress);

      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'agent.lifecycle.progress',
        expect.objectContaining({
          organizationSlug: ctx.organizationSlug,
          agentSlug: ctx.agentSlug,
          mode: ctx.mode,
          progress,
          timestamp: expect.any(String) as string,
        }),
      );
    });
  });

  describe('complete', () => {
    it('should emit lifecycle complete event', () => {
      const ctx: LifecycleContext = {
        conversationId: 'conv-1',
        sessionId: 'session-1',
        organizationSlug: 'test-org',
        agentSlug: 'test-agent',
        mode: AgentTaskMode.CONVERSE,
      };
      const result = { output: 'success' };

      service.complete(ctx, result);

      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'agent.lifecycle.complete',
        expect.objectContaining({
          conversationId: ctx.conversationId,
          sessionId: ctx.sessionId,
          organizationSlug: ctx.organizationSlug,
          agentSlug: ctx.agentSlug,
          mode: ctx.mode,
          result,
          timestamp: expect.any(String) as string,
        }),
      );
    });

    it('should emit complete event without result', () => {
      const ctx: LifecycleContext = {
        organizationSlug: 'test-org',
        agentSlug: 'test-agent',
        mode: AgentTaskMode.PLAN,
      };

      service.complete(ctx);

      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'agent.lifecycle.complete',
        expect.objectContaining({
          organizationSlug: ctx.organizationSlug,
          agentSlug: ctx.agentSlug,
          mode: ctx.mode,
          timestamp: expect.any(String) as string,
        }),
      );
    });
  });

  describe('fail', () => {
    it('should emit lifecycle fail event', () => {
      const ctx: LifecycleContext = {
        conversationId: 'conv-1',
        organizationSlug: 'test-org',
        agentSlug: 'test-agent',
        mode: AgentTaskMode.CONVERSE,
      };
      const reason = 'Request timeout';
      const metadata = { errorCode: 'TIMEOUT' };

      service.fail(ctx, reason, metadata);

      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'agent.lifecycle.fail',
        expect.objectContaining({
          conversationId: ctx.conversationId,
          organizationSlug: ctx.organizationSlug,
          agentSlug: ctx.agentSlug,
          mode: ctx.mode,
          error: { reason },
          metadata,
          timestamp: expect.any(String) as string,
        }),
      );
    });

    it('should emit fail event without metadata', () => {
      const ctx: LifecycleContext = {
        organizationSlug: null,
        agentSlug: 'test-agent',
        mode: AgentTaskMode.BUILD,
      };
      const reason = 'Invalid configuration';

      service.fail(ctx, reason);

      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'agent.lifecycle.fail',
        expect.objectContaining({
          organizationSlug: ctx.organizationSlug,
          agentSlug: ctx.agentSlug,
          mode: ctx.mode,
          error: { reason },
          timestamp: expect.any(String) as string,
        }),
      );
    });
  });
});
