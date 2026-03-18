/**
 * RagFamilyRunner unit tests
 *
 * Tests vector query + LLM path, missing collectionSlug error,
 * collection access denial, and empty query results path.
 */

import { RagFamilyRunner } from './rag-family.runner';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { AgentDefinition } from '../agent-definition.types';

const mockDefinition: AgentDefinition = {
  id: 'def-2',
  slug: 'kb-agent',
  name: 'Knowledge Base Agent',
  agentType: 'rag',
  status: 'active',
  outputType: 'text',
  collectionSlug: 'product-docs',
  llmConfig: { provider: 'openai', model: 'gpt-4o' },
};

const mockCollection = { id: 'col-1', slug: 'product-docs', name: 'Product Docs', embeddingModel: 'text-embedding-3-small' };

const mockQueryResponse = {
  results: [
    { documentFilename: 'guide.pdf', score: 0.92, content: 'Relevant content here.' },
  ],
  searchDurationMs: 45,
};

describe('RagFamilyRunner', () => {
  let runner: RagFamilyRunner;
  let mockLlmService: { generateUnifiedResponse: jest.Mock };
  let mockCollectionsService: { getCollections: jest.Mock };
  let mockQueryService: { queryCollection: jest.Mock };

  beforeEach(() => {
    mockLlmService = {
      generateUnifiedResponse: jest.fn().mockResolvedValue({
        content: 'Answer from knowledge base.',
        metadata: { tokensUsed: 80 },
      }),
    };
    mockCollectionsService = {
      getCollections: jest.fn().mockResolvedValue([mockCollection]),
    };
    mockQueryService = {
      queryCollection: jest.fn().mockResolvedValue(mockQueryResponse),
    };

    runner = new RagFamilyRunner(
      mockLlmService as never,
      mockCollectionsService as never,
      mockQueryService as never,
    );
  });

  describe('invoke — happy path', () => {
    it('queries vector store then calls LLM and returns InvokeOutput with sources', async () => {
      const context = createMockExecutionContext({ agentSlug: 'kb-agent' });
      const data = { content: 'How do I reset my password?' };

      const output = await runner.invoke(mockDefinition, context, data);

      expect(mockQueryService.queryCollection).toHaveBeenCalledWith(
        'col-1',
        'test-org',
        expect.objectContaining({ query: 'How do I reset my password?' }),
        'text-embedding-3-small',
      );
      expect(mockLlmService.generateUnifiedResponse).toHaveBeenCalled();
      expect(output.content).toBe('Answer from knowledge base.');
      expect(output.metadata?.sources).toHaveLength(1);
      expect(output.metadata?.collectionSlug).toBe('product-docs');
    });
  });

  describe('invoke — error paths', () => {
    it('throws when collectionSlug is missing from definition', async () => {
      const defNoCollection: AgentDefinition = { ...mockDefinition, collectionSlug: undefined };
      const context = createMockExecutionContext();

      await expect(runner.invoke(defNoCollection, context, { content: 'test' })).rejects.toThrow(
        'missing collectionSlug',
      );
    });

    it('returns access-denied output when collection not found for user', async () => {
      mockCollectionsService.getCollections.mockResolvedValueOnce([]); // no collections
      const context = createMockExecutionContext();

      const output = await runner.invoke(mockDefinition, context, { content: 'test' });

      expect(output.metadata?.accessDenied).toBe(true);
      expect(mockQueryService.queryCollection).not.toHaveBeenCalled();
    });

    it('returns no-results output when vector search returns empty', async () => {
      mockQueryService.queryCollection.mockResolvedValueOnce({ results: [], searchDurationMs: 10 });
      const context = createMockExecutionContext();

      const output = await runner.invoke(mockDefinition, context, { content: 'obscure question' });

      expect(output.metadata?.noResults).toBe(true);
      expect(mockLlmService.generateUnifiedResponse).not.toHaveBeenCalled();
    });
  });
});
