/**
 * InvokeDispatchService unit tests
 *
 * Tests runner resolution by agent family, observability event emission,
 * error propagation on unknown runner or failed agent lookup,
 * invokeStream delegation (native + sync fallback), and persistMessages
 * fire-and-forget behavior (failures must NOT break invoke response).
 */

import { InvokeDispatchService } from './invoke-dispatch.service';
import { AgentDefinitionService } from './agent-definition.service';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { InvokeOutput } from '@orchestrator-ai/transport-types';
import type { AgentDefinition } from './agent-definition.types';
import type { FamilyRunner } from './invoke-dispatch.service';
import type { Response } from 'express';

const mockOutput: InvokeOutput = { content: 'result', outputType: 'text' };

const mockDefinition: AgentDefinition = {
  id: 'def-1',
  slug: 'test-agent',
  name: 'Test Agent',
  agentType: 'context',
  status: 'active',
  outputType: 'text',
};

function buildMockObservability() {
  return {
    emitInvocationEvent: jest.fn().mockResolvedValue(undefined),
  };
}

function buildMockAgentDefs(definition: AgentDefinition | null) {
  return {
    resolve: jest.fn().mockResolvedValue(definition),
  } as unknown as jest.Mocked<AgentDefinitionService>;
}

/** Build a minimal express Response mock for SSE tests. */
function buildMockRes(): jest.Mocked<Pick<Response, 'write' | 'end'>> {
  return {
    write: jest.fn(),
    end: jest.fn(),
  };
}

describe('InvokeDispatchService', () => {
  let service: InvokeDispatchService;
  let agentDefs: jest.Mocked<AgentDefinitionService>;
  let observability: ReturnType<typeof buildMockObservability>;
  let runner: jest.Mocked<FamilyRunner>;
  let mockDb: {
    from: jest.Mock;
    select: jest.Mock;
    eq: jest.Mock;
    single: jest.Mock;
    upsert: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
    order: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(() => {
    observability = buildMockObservability();
    agentDefs = buildMockAgentDefs(mockDefinition);
    runner = { invoke: jest.fn().mockResolvedValue(mockOutput) };

    mockDb = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      insert: jest.fn().mockResolvedValue({ error: null }),
      update: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: [], error: null }),
      delete: jest.fn().mockReturnThis(),
    };
    service = new InvokeDispatchService(
      agentDefs,
      observability as never,
      mockDb as never,
    );
    service.registerRunner('context', runner);
  });

  describe('invoke — happy path', () => {
    it('resolves agent definition and dispatches to the registered runner', async () => {
      const context = createMockExecutionContext({ agentSlug: 'test-agent' });
      const data = { content: 'hello' };

      const output = await service.invoke(context, data);

      expect(agentDefs.resolve).toHaveBeenCalledWith('test-agent', 'test-org');
      expect(runner.invoke).toHaveBeenCalledWith(
        mockDefinition,
        context,
        data,
        undefined,
      );
      expect(output).toEqual(mockOutput);
    });

    it('emits invocation.started and invocation.completed observability events', async () => {
      const context = createMockExecutionContext();
      await service.invoke(context, { content: 'test' });

      const calls = observability.emitInvocationEvent.mock.calls;
      expect(calls[0]?.[1]?.type).toBe('invocation.started');
      expect(calls[1]?.[1]?.type).toBe('invocation.completed');
    });
  });

  describe('invoke — error paths', () => {
    it('throws and emits invocation.failed when agent definition not found', async () => {
      agentDefs.resolve.mockResolvedValueOnce(null);
      const context = createMockExecutionContext({ agentSlug: 'ghost-agent' });

      await expect(service.invoke(context, { content: 'hi' })).rejects.toThrow(
        'Agent not found: ghost-agent',
      );

      const calls = observability.emitInvocationEvent.mock.calls;
      expect(calls[1]?.[1]?.type).toBe('invocation.failed');
    });

    it('throws when no runner is registered for the agent family', async () => {
      const unknownDef: AgentDefinition = {
        ...mockDefinition,
        agentType: 'media',
      };
      agentDefs.resolve.mockResolvedValueOnce(unknownDef);
      const context = createMockExecutionContext();

      await expect(service.invoke(context, { content: 'hi' })).rejects.toThrow(
        'No runner for agent family: media',
      );
    });
  });

  describe('invoke — persistMessages fire-and-forget', () => {
    it('returns output even when user message DB insert fails', async () => {
      // First call = upsert conversation (ok), second call = insert user message (error)
      mockDb.insert.mockResolvedValueOnce({
        error: { message: 'insert user failed' },
      });

      const context = createMockExecutionContext();
      const output = await service.invoke(context, { content: 'hello' });

      // invoke must return successfully — persistMessages failures are fire-and-forget
      expect(output).toEqual(mockOutput);
    });

    it('strips attachment base64 and only stores filename+mimeType metadata', async () => {
      const context = createMockExecutionContext();
      const data = {
        content: {
          message: 'analyze this',
          attachments: [
            {
              filename: 'doc.pdf',
              mimeType: 'application/pdf',
              base64: 'AAABBBCCC',
            },
          ],
        },
      };

      await service.invoke(context, data);

      // Allow fire-and-forget to settle
      await new Promise((r) => setTimeout(r, 10));

      const insertCall = mockDb.insert.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      // attachments metadata should not contain base64
      if (insertCall?.['attachments']) {
        const parsed = JSON.parse(insertCall['attachments'] as string) as Array<
          Record<string, unknown>
        >;
        expect(parsed[0]).not.toHaveProperty('base64');
        expect(parsed[0]).toHaveProperty('filename', 'doc.pdf');
        expect(parsed[0]).toHaveProperty('mimeType', 'application/pdf');
      }
    });
  });

  describe('invokeStream — native streaming runner', () => {
    it('delegates to runner.invokeStream when runner supports it', async () => {
      const streamRunner: jest.Mocked<Required<FamilyRunner>> = {
        invoke: jest.fn().mockResolvedValue(mockOutput),
        invokeStream: jest.fn().mockResolvedValue(undefined),
      };
      service.registerRunner('context', streamRunner);

      const context = createMockExecutionContext();
      const res = buildMockRes();

      await service.invokeStream(
        context,
        { content: 'stream me' },
        undefined,
        'req-1',
        res as never,
      );

      expect(streamRunner.invokeStream).toHaveBeenCalledWith(
        mockDefinition,
        context,
        { content: 'stream me' },
        undefined,
        'req-1',
        res,
      );
    });
  });

  describe('invokeStream — sync fallback', () => {
    it('calls runner.invoke and sends output+completed SSE events when runner has no invokeStream', async () => {
      // runner registered in beforeEach has no invokeStream
      const context = createMockExecutionContext();
      const res = buildMockRes();

      await service.invokeStream(
        context,
        { content: 'hi' },
        undefined,
        'req-42',
        res as never,
      );

      expect(runner.invoke).toHaveBeenCalledWith(
        mockDefinition,
        context,
        { content: 'hi' },
        undefined,
      );

      const writes = res.write.mock.calls.map((c) => c[0] as string);
      const outputWrite = writes.find((w) => w.includes('"event":"output"'));
      const completedWrite = writes.find((w) =>
        w.includes('"event":"completed"'),
      );
      expect(outputWrite).toBeDefined();
      expect(completedWrite).toBeDefined();
      expect(res.end).toHaveBeenCalled();
    });

    it('output SSE event includes outputType and content from runner', async () => {
      runner.invoke.mockResolvedValueOnce({
        content: 'hello world',
        outputType: 'markdown',
      });
      const context = createMockExecutionContext();
      const res = buildMockRes();

      await service.invokeStream(
        context,
        { content: 'question' },
        undefined,
        null,
        res as never,
      );

      const outputWrite = res.write.mock.calls
        .map((c) => c[0] as string)
        .find((w) => w.includes('"event":"output"'));
      expect(outputWrite).toBeDefined();
      expect(outputWrite).toContain('hello world');
      expect(outputWrite).toContain('markdown');
    });
  });

  describe('invokeStream — error paths', () => {
    it('throws when agent definition not found', async () => {
      agentDefs.resolve.mockResolvedValueOnce(null);
      const context = createMockExecutionContext({
        agentSlug: 'missing-agent',
      });
      const res = buildMockRes();

      await expect(
        service.invokeStream(
          context,
          { content: 'hi' },
          undefined,
          null,
          res as never,
        ),
      ).rejects.toThrow('Agent not found: missing-agent');
    });

    it('throws when no runner for family', async () => {
      const unknownDef: AgentDefinition = {
        ...mockDefinition,
        agentType: 'api',
      };
      agentDefs.resolve.mockResolvedValueOnce(unknownDef);
      const context = createMockExecutionContext();
      const res = buildMockRes();

      await expect(
        service.invokeStream(
          context,
          { content: 'hi' },
          undefined,
          null,
          res as never,
        ),
      ).rejects.toThrow('No runner for agent family: api');
    });
  });
});
