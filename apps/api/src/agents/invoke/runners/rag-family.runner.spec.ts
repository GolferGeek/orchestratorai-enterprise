import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { CollectionsService, QueryService } from '@orchestratorai/planes/rag';
import type { LLMServiceProvider } from '@orchestratorai/planes/llm';
import type { AgentDefinition } from '../agent-definition.types';
import { RagFamilyRunner } from './rag-family.runner';

/**
 * Whose collection a RAG agent searches: always the caller's organization
 * (plus global collections, which the database adds), never the agent's home
 * organization. A {legal,global} assistant invoked from another organization
 * used to search legal's collections (security review of fix/picker-reland).
 */
describe('RagFamilyRunner collection organization', () => {
  const context: ExecutionContext = {
    orgSlug: 'acme',
    userId: '00000000-0000-4000-a000-000000000001',
    conversationId: '00000000-0000-4000-a000-000000000002',
    agentSlug: 'legal-contracts-agent',
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
    return { slug: 'legal-contracts-agent', orgSlug, collectionSlug: 'law-contracts-hybrid' } as AgentDefinition;
  }

  it("searches the caller's organization for a global agent", async () => {
    const { runner, getCollections } = setup();
    await expect(runner.invoke(definition('global'), context, { content: 'Hours?' })).rejects.toThrow('not accessible');
    expect(getCollections).toHaveBeenCalledWith('acme', context.userId);
  });

  it("searches the caller's organization, not the agent's home organization", async () => {
    const { runner, getCollections } = setup();
    await expect(runner.invoke(definition('legal'), context, { content: 'Hours?' })).rejects.toThrow('not accessible');
    expect(getCollections).toHaveBeenCalledWith('acme', context.userId);
    expect(getCollections).not.toHaveBeenCalledWith('legal', expect.anything());
  });

  it("refuses a collection the caller's organization cannot see", async () => {
    const getCollections = jest.fn().mockResolvedValue([{ id: 'c1', slug: 'other-collection' }]);
    const queryCollection = jest.fn();
    const runner = new RagFamilyRunner(
      {} as LLMServiceProvider,
      { getCollections } as unknown as CollectionsService,
      { queryCollection, queryByComplexity: queryCollection } as unknown as QueryService,
    );
    await expect(runner.invoke(definition('legal'), context, { content: 'Hours?' })).rejects.toThrow('not accessible');
    expect(queryCollection).not.toHaveBeenCalled();
  });
});
