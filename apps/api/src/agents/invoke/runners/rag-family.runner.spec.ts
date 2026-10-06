import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { CollectionsService, QueryService } from '@orchestratorai/planes/rag';
import type { LLMServiceProvider } from '@orchestratorai/planes/llm';
import type { AgentDefinition } from '../agent-definition.types';
import { RagFamilyRunner } from './rag-family.runner';

/** Whose collection a RAG agent searches: its own organization's, or the caller's for a global agent. */
describe('RagFamilyRunner collection organization', () => {
  const context: ExecutionContext = {
    orgSlug: 'acme',
    userId: '00000000-0000-4000-a000-000000000001',
    conversationId: '00000000-0000-4000-a000-000000000002',
    agentSlug: 'company-knowledge',
    agentType: 'rag',
    provider: 'openrouter',
    model: 'some/model',
  };

  function setup() {
    const getCollections = jest.fn().mockResolvedValue([]);
    const runner = new RagFamilyRunner(
      {} as LLMServiceProvider,
      { getCollections } as unknown as CollectionsService,
      {} as QueryService,
    );
    return { runner, getCollections };
  }

  function definition(orgSlug: string | undefined): AgentDefinition {
    return { slug: 'company-knowledge', orgSlug, collectionSlug: 'company-knowledge' } as AgentDefinition;
  }

  it("searches the caller's organization for a global agent", async () => {
    const { runner, getCollections } = setup();
    await expect(runner.invoke(definition('global'), context, { content: 'Hours?' })).rejects.toThrow('not accessible');
    expect(getCollections).toHaveBeenCalledWith('acme', context.userId);
  });

  it("searches the agent's own organization for an organization's agent", async () => {
    const { runner, getCollections } = setup();
    await expect(runner.invoke(definition('marketing'), context, { content: 'Hours?' })).rejects.toThrow('not accessible');
    expect(getCollections).toHaveBeenCalledWith('marketing', context.userId);
  });

  it('refuses an agent with no organization', async () => {
    const { runner, getCollections } = setup();
    await expect(runner.invoke(definition(undefined), context, { content: 'Hours?' })).rejects.toThrow('has no organization');
    expect(getCollections).not.toHaveBeenCalled();
  });
});
