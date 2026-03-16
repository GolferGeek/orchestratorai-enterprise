/**
 * RAG Family Runner
 *
 * Handles agents of family type 'rag':
 * - Queries the vector collection specified in definition.collectionSlug
 * - Augments the LLM system prompt with retrieved document chunks
 * - Returns text/markdown InvokeOutput with source citations in metadata
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import type {
  ExecutionContext,
  InvokeData,
  InvokeOutput,
} from '@orchestrator-ai/transport-types';
import { LLM_SERVICE, LLMServiceProvider } from '@orchestratorai/planes/llm';
import type { FamilyRunner } from '../invoke-dispatch.service';
import type { AgentDefinitionV2 } from '../agent-definition.types';
import type { LLMResponse } from '@orchestratorai/planes/llm';
import { CollectionsService } from '@/rag/collections.service';
import { QueryService } from '@/rag/query.service';

@Injectable()
export class RagFamilyRunner implements FamilyRunner {
  private readonly logger = new Logger(RagFamilyRunner.name);

  constructor(
    @Inject(LLM_SERVICE) private readonly llmService: LLMServiceProvider,
    private readonly collectionsService: CollectionsService,
    private readonly queryService: QueryService,
  ) {}

  async invoke(
    definition: AgentDefinitionV2,
    context: ExecutionContext,
    data: InvokeData,
  ): Promise<InvokeOutput> {
    this.logger.debug(
      `RagFamilyRunner.invoke — agent: ${definition.slug}, collection: ${definition.collectionSlug}`,
    );

    const collectionSlug = definition.collectionSlug;
    if (!collectionSlug) {
      throw new Error(
        `RAG agent ${definition.slug} missing collectionSlug in definition`,
      );
    }

    const userMessage = this.extractUserMessage(data);
    if (!userMessage.trim()) {
      throw new Error('User message is required for RAG agent invocation');
    }

    // Resolve collection — uses agent's org (not necessarily user's org)
    const orgSlug = definition.orgSlug ?? context.orgSlug;
    const collections = await this.collectionsService.getCollections(
      orgSlug,
      context.userId,
    );
    const collection = collections.find((c) => c.slug === collectionSlug);

    if (!collection) {
      this.logger.warn(
        `Collection '${collectionSlug}' not found or not accessible for user ${context.userId}`,
      );
      return {
        content: "I don't have access to the information needed to answer that question.",
        outputType: 'text',
        metadata: {
          agentSlug: definition.slug,
          collectionSlug,
          accessDenied: true,
        },
      };
    }

    // Query the vector store
    const topK = 5;
    const similarityThreshold = 0.5;
    const queryResponse = await this.queryService.queryCollection(
      collection.id,
      orgSlug,
      {
        query: userMessage,
        topK,
        similarityThreshold,
        strategy: 'basic',
        includeMetadata: true,
      },
      collection.embeddingModel,
    );

    if (queryResponse.results.length === 0) {
      return {
        content: "I don't have enough information in my knowledge base to answer that question.",
        outputType: 'text',
        metadata: {
          agentSlug: definition.slug,
          collectionSlug,
          noResults: true,
        },
      };
    }

    // Build augmented system prompt
    const systemPrompt = this.buildAugmentedPrompt(definition, queryResponse.results);

    const provider = definition.llmConfig?.provider ?? context.provider;
    const model = definition.llmConfig?.model ?? context.model;

    const llmResponse = await this.llmService.generateUnifiedResponse({
      provider,
      model,
      systemPrompt,
      userMessage,
      options: {
        temperature: definition.llmConfig?.temperature,
        maxTokens: definition.llmConfig?.maxTokens,
        conversationId: context.conversationId,
        userId: context.userId,
        organizationSlug: orgSlug,
        agentSlug: definition.slug,
        callerType: 'agent' as const,
        callerName: `${definition.slug}-rag`,
        executionContext: context,
      },
    });

    const content = this.extractContent(llmResponse);
    const llmMeta = this.extractMeta(llmResponse);
    const sources = queryResponse.results.map((r) => ({
      document: r.documentFilename,
      score: parseFloat((r.score * 100).toFixed(1)),
      excerpt: r.content.length > 200 ? r.content.substring(0, 200) + '...' : r.content,
    }));

    return {
      content,
      outputType: definition.outputType ?? 'text',
      metadata: {
        agentSlug: definition.slug,
        collectionSlug,
        collectionName: collection.name,
        resultsCount: queryResponse.results.length,
        searchDurationMs: queryResponse.searchDurationMs,
        sources,
        provider,
        model,
        ...llmMeta,
      },
    };
  }

  private buildAugmentedPrompt(
    definition: AgentDefinitionV2,
    results: Array<{ documentFilename: string; score: number; content: string }>,
  ): string {
    const basePrompt =
      definition.context?.trim() ||
      `You are ${definition.name ?? definition.slug}, a knowledgeable assistant that answers questions using the provided knowledge base.`;

    const retrievedContext = results
      .map((r, i) => {
        const score = (r.score * 100).toFixed(1);
        return `### Source ${i + 1}: ${r.documentFilename} (${score}% relevant)\n${r.content}`;
      })
      .join('\n\n');

    return [
      basePrompt,
      '## Retrieved Context',
      "The following excerpts are relevant to the user's question:",
      retrievedContext,
      '## Instructions',
      '- Answer using ONLY the information from the Retrieved Context above',
      '- If the context lacks sufficient information, say so clearly',
      '- Be concise and cite your sources',
    ].join('\n\n');
  }

  private extractUserMessage(data: InvokeData): string {
    if (typeof data.content === 'string') {
      return data.content;
    }
    if (data.content && typeof data.content === 'object') {
      const obj = data.content as Record<string, unknown>;
      const msg = obj.message ?? obj.userMessage ?? obj.text ?? obj.query ?? obj.content;
      if (typeof msg === 'string') {
        return msg;
      }
    }
    return '';
  }

  private extractContent(response: string | LLMResponse): string {
    if (typeof response === 'string') {
      return response;
    }
    if (response && typeof response === 'object') {
      const r = response as LLMResponse;
      if (typeof r.content === 'string') {
        return r.content;
      }
    }
    return '';
  }

  private extractMeta(response: string | LLMResponse): Record<string, unknown> {
    if (typeof response === 'string') {
      return {};
    }
    if (response && typeof response === 'object') {
      const r = response as LLMResponse;
      return (r.metadata as unknown as Record<string, unknown>) ?? {};
    }
    return {};
  }
}
