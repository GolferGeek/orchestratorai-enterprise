import { of } from 'rxjs';
import type { HttpService } from '@nestjs/axios';
import type {
  ExecutionContext,
  InvokeData,
} from '@orchestrator-ai/transport-types';
import type { LLMServiceProvider } from '@orchestratorai/planes/llm';
import type {
  CollectionsService,
  QueryService,
} from '@orchestratorai/planes/rag';
import type { AgentDefinition } from '../agent-definition.types';
import { ApiFamilyRunner } from './api-family.runner';
import { RagFamilyRunner } from './rag-family.runner';

jest.mock('@orchestratorai/planes/llm', () => ({
  LLM_SERVICE: Symbol('LLM_SERVICE'),
}));

describe('family runner ExecutionContext model routing', () => {
  const context: ExecutionContext = Object.freeze({
    orgSlug: 'org',
    userId: 'user',
    conversationId: 'conversation',
    agentSlug: 'agent',
    agentType: 'context',
    provider: 'openrouter',
    model: 'openrouter/auto',
  });
  const data: InvokeData = { content: 'Explain this result' };

  it('uses the immutable invocation model for API response formatting', async () => {
    const httpService = {
      request: jest.fn().mockReturnValue(
        of({
          status: 200,
          data: { answer: 'raw result' },
        }),
      ),
    } as unknown as HttpService;
    const llmService = {
      generateUnifiedResponse: jest.fn().mockResolvedValue('formatted result'),
    } as unknown as LLMServiceProvider;
    const runner = new ApiFamilyRunner(httpService, llmService);
    const definition: AgentDefinition = {
      id: 'api-agent',
      slug: 'api-agent',
      name: 'API agent',
      agentType: 'api',
      status: 'active',
      outputType: 'text',
      endpoint: 'https://api.example.test/invoke',
      context: 'Format the response.',
      llmConfig: {
        provider: 'anthropic',
        model: 'legacy-model',
      },
    };

    await runner.invoke(definition, context, data);

    expect(llmService.generateUnifiedResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: context.provider,
        model: context.model,
        options: expect.objectContaining({ executionContext: context }),
      }),
    );
  });

  it('uses the immutable invocation model after RAG retrieval', async () => {
    const llmService = {
      generateUnifiedResponse: jest.fn().mockResolvedValue('rag response'),
    } as unknown as LLMServiceProvider;
    const collectionsService = {
      getCollections: jest.fn().mockResolvedValue([
        {
          id: 'collection-id',
          slug: 'knowledge',
          complexityType: 'basic',
          embeddingModel: 'text-embedding-3-small',
        },
      ]),
    } as unknown as CollectionsService;
    const queryService = {
      queryCollection: jest.fn().mockResolvedValue({
        results: [
          {
            chunkId: 'chunk-id',
            documentId: 'document-id',
            documentFilename: 'source.txt',
            content: 'retrieved context',
            score: 0.9,
            chunkIndex: 0,
            metadata: {},
          },
        ],
      }),
    } as unknown as QueryService;
    const runner = new RagFamilyRunner(
      llmService,
      collectionsService,
      queryService,
    );
    const definition: AgentDefinition = {
      id: 'rag-agent',
      slug: 'rag-agent',
      name: 'RAG agent',
      agentType: 'rag',
      status: 'active',
      outputType: 'text',
      collectionSlug: 'knowledge',
      context: 'Answer from retrieved sources.',
      llmConfig: {
        provider: 'ollama',
        model: 'legacy-model',
      },
    };

    await runner.invoke(definition, context, data);

    expect(llmService.generateUnifiedResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: context.provider,
        model: context.model,
        options: expect.objectContaining({ executionContext: context }),
      }),
    );
  });
});
