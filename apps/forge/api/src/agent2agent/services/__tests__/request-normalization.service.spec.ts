import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import {
  RequestNormalizationService,
  FrontendTaskRequest,
} from '../request-normalization.service';
import { AgentTaskMode } from '../../dto/task-request.dto';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

describe('RequestNormalizationService', () => {
  let service: RequestNormalizationService;

  const mockContext = createMockExecutionContext({
    orgSlug: 'test-org',
    userId: 'user-123',
    conversationId: 'conv-123',
    taskId: 'task-123',
    agentSlug: 'test-agent',
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RequestNormalizationService],
    }).compile();

    service = module.get<RequestNormalizationService>(
      RequestNormalizationService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('adaptFrontendRequest', () => {
    it('should pass through JSON-RPC 2.0 format unchanged', () => {
      const body: FrontendTaskRequest = {
        jsonrpc: '2.0',
        method: 'tasks.build',
        id: 'req-1',
        params: { context: mockContext, userMessage: 'Hello' },
      };

      const result = service.adaptFrontendRequest(body);

      expect(result).toBe(body); // same reference
    });

    it('should pass through request that already has mode field', () => {
      const body: FrontendTaskRequest = {
        mode: 'build',
        context: mockContext,
        userMessage: 'Hello',
      };

      const result = service.adaptFrontendRequest(body);

      expect(result).toBe(body); // same reference
    });

    it('should map method to mode when method is set', () => {
      const body: FrontendTaskRequest = {
        method: 'build',
        prompt: 'Build something',
        context: mockContext,
      };

      const result = service.adaptFrontendRequest(body);

      expect(result.mode).toBe('build');
    });

    it('should map prompt to userMessage', () => {
      const body: FrontendTaskRequest = {
        method: 'converse',
        prompt: 'My question',
        context: mockContext,
      };

      const result = service.adaptFrontendRequest(body);

      expect(result.userMessage).toBe('My question');
    });

    it('should map conversationHistory to messages', () => {
      const body: FrontendTaskRequest = {
        method: 'converse',
        conversationHistory: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi' },
        ],
        context: mockContext,
      };

      const result = service.adaptFrontendRequest(body);

      const messages = result.messages as
        | Array<{ role: string; content: string }>
        | undefined;
      expect(messages).toBeDefined();
      expect(messages!.length).toBe(2);
      expect(messages!.at(0)!.role).toBe('user');
      expect(messages!.at(0)!.content).toBe('Hello');
    });

    it('should preserve ExecutionContext in adaptation', () => {
      const body: FrontendTaskRequest = {
        method: 'converse',
        context: mockContext,
      };

      const result = service.adaptFrontendRequest(body);

      expect(result.context).toBe(mockContext);
    });

    it('should preserve payload.documents for JSON-based upload', () => {
      const docs = [
        {
          filename: 'test.pdf',
          mimeType: 'application/pdf',
          base64Data: 'abc',
        },
      ];
      const body: FrontendTaskRequest = {
        method: 'build',
        context: mockContext,
        payload: { documents: docs },
      };

      const result = service.adaptFrontendRequest(body);

      expect((result.payload as Record<string, unknown>).documents).toEqual(
        docs,
      );
    });

    it('should default mode to "converse" when method is absent', () => {
      const body: FrontendTaskRequest = {
        context: mockContext,
      };

      const result = service.adaptFrontendRequest(body);

      expect(result.mode).toBe('converse');
    });

    it('should merge params and payload into payload field', () => {
      const body: FrontendTaskRequest = {
        method: 'build',
        context: mockContext,
        params: { extraParam: 'value' },
        payload: { doc: 'thing' },
      };

      const result = service.adaptFrontendRequest(body);

      const payload = result.payload as Record<string, unknown>;
      expect(payload.extraParam).toBe('value');
      expect(payload.doc).toBe('thing');
    });
  });

  describe('mapMethodToMode', () => {
    const cases: Array<[string, AgentTaskMode]> = [
      ['converse', AgentTaskMode.CONVERSE],
      ['agent.converse', AgentTaskMode.CONVERSE],
      ['tasks.converse', AgentTaskMode.CONVERSE],
      ['plan', AgentTaskMode.PLAN],
      ['agent.plan', AgentTaskMode.PLAN],
      ['tasks.plan', AgentTaskMode.PLAN],
      ['build', AgentTaskMode.BUILD],
      ['agent.build', AgentTaskMode.BUILD],
      ['tasks.build', AgentTaskMode.BUILD],
      ['hitl', AgentTaskMode.HITL],
      ['hitl.resume', AgentTaskMode.HITL],
      ['hitl.status', AgentTaskMode.HITL],
      ['hitl.history', AgentTaskMode.HITL],
      ['agent.hitl', AgentTaskMode.HITL],
      ['tasks.hitl', AgentTaskMode.HITL],
    ];

    it.each(cases)('should map "%s" to %s', (method, expectedMode) => {
      const result = service.mapMethodToMode(method);
      expect(result).toBe(expectedMode);
    });

    it('should return undefined for unknown method', () => {
      expect(service.mapMethodToMode('unknown.method')).toBeUndefined();
    });

    it('should handle uppercase method strings', () => {
      const result = service.mapMethodToMode('CONVERSE');
      expect(result).toBe(AgentTaskMode.CONVERSE);
    });

    it('should handle method with surrounding whitespace', () => {
      const result = service.mapMethodToMode('  build  ');
      expect(result).toBe(AgentTaskMode.BUILD);
    });
  });

  describe('normalizeTaskRequest', () => {
    it('should throw BadRequestException for non-object payload', async () => {
      await expect(
        service.normalizeTaskRequest('not-an-object'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for null payload', async () => {
      await expect(service.normalizeTaskRequest(null)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should normalize a valid non-JSON-RPC request', async () => {
      const payload = {
        mode: 'converse',
        userMessage: 'Hello',
        context: mockContext,
      };

      const result = await service.normalizeTaskRequest(payload);

      expect(result.dto.mode).toBe(AgentTaskMode.CONVERSE);
      expect(result.dto.userMessage).toBe('Hello');
      expect(result.jsonrpc).toBeUndefined();
    });

    it('should default mode to CONVERSE when not specified', async () => {
      const payload = {
        userMessage: 'Hello',
        context: mockContext,
      };

      const result = await service.normalizeTaskRequest(payload);

      expect(result.dto.mode).toBe(AgentTaskMode.CONVERSE);
    });

    it('should normalize JSON-RPC 2.0 request', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 'req-1',
        method: 'tasks.build',
        params: {
          context: mockContext,
          userMessage: 'Build it',
          mode: 'build',
        },
      };

      const result = await service.normalizeTaskRequest(payload);

      expect(result.dto.mode).toBe(AgentTaskMode.BUILD);
      expect(result.dto.userMessage).toBe('Build it');
      expect(result.jsonrpc).toBeDefined();
      expect(result.jsonrpc!.id).toBe('req-1');
      expect(result.jsonrpc!.method).toBe('tasks.build');
    });

    it('should map JSON-RPC method to mode when mode not in params', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 'req-2',
        method: 'tasks.plan',
        params: {
          context: mockContext,
          userMessage: 'Plan something',
        },
      };

      const result = await service.normalizeTaskRequest(payload);

      expect(result.dto.mode).toBe(AgentTaskMode.PLAN);
    });

    it('should preserve all JSON-RPC params in payload', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 'req-3',
        method: 'hitl.resume',
        params: {
          context: mockContext,
          taskId: 'some-task-id',
          decision: 'approved',
          action: 'resume', // HITL mode requires action field
        },
      };

      const result = await service.normalizeTaskRequest(payload);

      const dtoPayload = result.dto.payload as Record<string, unknown>;
      expect(dtoPayload.taskId).toBe('some-task-id');
      expect(dtoPayload.decision).toBe('approved');
    });

    it('should attach jsonrpc metadata to dto.metadata', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 42,
        method: 'tasks.converse',
        params: {
          context: mockContext,
        },
      };

      const result = await service.normalizeTaskRequest(payload);

      const metadata = result.dto.metadata as Record<string, unknown>;
      expect(metadata.jsonrpc).toBeDefined();
      const jsonrpcMeta = metadata.jsonrpc as Record<string, unknown>;
      expect(jsonrpcMeta.id).toBe(42);
    });
  });
});
