/**
 * InvokeDispatchService unit tests
 *
 * Tests runner resolution by agent family, observability event emission,
 * and error propagation on unknown runner or failed agent lookup.
 */

import { InvokeDispatchService } from './invoke-dispatch.service';
import { AgentDefinitionService } from './agent-definition.service';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { InvokeOutput } from '@orchestrator-ai/transport-types';
import type { AgentDefinition } from './agent-definition.types';
import type { FamilyRunner } from './invoke-dispatch.service';

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

describe('InvokeDispatchService', () => {
  let service: InvokeDispatchService;
  let agentDefs: jest.Mocked<AgentDefinitionService>;
  let observability: ReturnType<typeof buildMockObservability>;
  let runner: jest.Mocked<FamilyRunner>;

  beforeEach(() => {
    observability = buildMockObservability();
    agentDefs = buildMockAgentDefs(mockDefinition);
    runner = { invoke: jest.fn().mockResolvedValue(mockOutput) };

    const mockDb = { from: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: null, error: null }), upsert: jest.fn().mockResolvedValue({ error: null }), insert: jest.fn().mockResolvedValue({ error: null }), update: jest.fn().mockReturnThis() } as never;
    service = new InvokeDispatchService(agentDefs, observability as never, mockDb);
    service.registerRunner('context', runner);
  });

  describe('invoke — happy path', () => {
    it('resolves agent definition and dispatches to the registered runner', async () => {
      const context = createMockExecutionContext({ agentSlug: 'test-agent' });
      const data = { content: 'hello' };

      const output = await service.invoke(context, data);

      expect(agentDefs.resolve).toHaveBeenCalledWith('test-agent', 'test-org');
      expect(runner.invoke).toHaveBeenCalledWith(mockDefinition, context, data, undefined);
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
      const unknownDef: AgentDefinition = { ...mockDefinition, agentType: 'media' };
      agentDefs.resolve.mockResolvedValueOnce(unknownDef);
      const context = createMockExecutionContext();

      await expect(service.invoke(context, { content: 'hi' })).rejects.toThrow(
        'No runner for agent family: media',
      );
    });
  });
});
