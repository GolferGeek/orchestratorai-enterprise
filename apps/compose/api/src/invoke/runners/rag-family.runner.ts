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
import type { AgentDefinition } from '../agent-definition.types';
import type { LLMResponse } from '@orchestratorai/planes/llm';
import { CollectionsService, QueryService } from '@orchestratorai/planes/rag';

@Injectable()
export class RagFamilyRunner implements FamilyRunner {
  private readonly logger = new Logger(RagFamilyRunner.name);

  constructor(
    @Inject(LLM_SERVICE) private readonly llmService: LLMServiceProvider,
    private readonly collectionsService: CollectionsService,
    private readonly queryService: QueryService,
  ) {}

  async invoke(
    definition: AgentDefinition,
    context: ExecutionContext,
    data: InvokeData,
    metadata?: Record<string, unknown>,
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
        content:
          "I don't have access to the information needed to answer that question.",
        outputType: 'text',
        metadata: {
          agentSlug: definition.slug,
          collectionSlug,
          accessDenied: true,
        },
      };
    }

    // Query the vector store — use complexity-aware search when the collection has a type
    const topK = 5;
    const similarityThreshold = 0.5;
    const complexityType = collection.complexityType;
    const useComplexity = complexityType && complexityType !== 'basic';

    const queryResponse = useComplexity
      ? await this.queryService.queryByComplexity(
          collection.id,
          orgSlug,
          complexityType,
          {
            query: userMessage,
            topK,
            similarityThreshold,
            includeMetadata: true,
          },
          collection.embeddingModel,
        )
      : await this.queryService.queryCollection(
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
        content:
          "I don't have enough information in my knowledge base to answer that question.",
        outputType: 'text',
        metadata: {
          agentSlug: definition.slug,
          collectionSlug,
          noResults: true,
        },
      };
    }

    // Build augmented system prompt
    const systemPrompt = this.buildAugmentedPrompt(
      definition,
      queryResponse.results,
    );

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

    let content = this.extractContent(llmResponse);
    const llmMeta = this.extractMeta(llmResponse);

    // Voice-mode condensing: if the caller is in voice mode and the response
    // exceeds 360 characters, condense it to 2-3 spoken sentences.
    if (metadata?.interactionMode === 'voice' && content.length > 360) {
      this.logger.debug(
        `Voice mode: condensing ${content.length}-char response for agent ${definition.slug}`,
      );
      const condensed = await this.llmService.generateUnifiedResponse({
        provider,
        model,
        systemPrompt:
          'Condense this response to 2-3 spoken sentences (under 360 characters). Keep the key information. Do not add any preamble.',
        userMessage: content,
        options: {
          temperature: 0.3,
          conversationId: context.conversationId,
          userId: context.userId,
          organizationSlug: orgSlug,
          agentSlug: definition.slug,
          callerType: 'agent' as const,
          callerName: `${definition.slug}-rag-voice-condense`,
          executionContext: context,
        },
      });
      content = this.extractContent(condensed);
    }

    // Normalize scores to 0-100 range relative to the top result.
    // Raw scores vary by strategy (cosine: 0-1, RRF: 0-0.03) so we
    // normalize against the max to produce meaningful percentages.
    const maxScore = Math.max(
      ...queryResponse.results.map((r) => r.score),
      0.001,
    );
    const sources = queryResponse.results.map((r) => ({
      document: r.documentFilename,
      documentId: r.documentIdRef ?? null,
      sectionPath: r.sectionPath ?? null,
      matchType: r.matchType ?? null,
      version: r.version ?? null,
      score: parseFloat(((r.score / maxScore) * 100).toFixed(1)),
      excerpt:
        r.content.length > 200
          ? r.content.substring(0, 200) + '...'
          : r.content,
      chunkMetadata: r.metadata ?? null,
    }));

    return {
      content,
      outputType: definition.outputType ?? 'text',
      metadata: {
        agentSlug: definition.slug,
        collectionSlug,
        collectionName: collection.name,
        complexityType: queryResponse.complexityType ?? 'basic',
        resultsCount: queryResponse.results.length,
        searchDurationMs: queryResponse.searchDurationMs,
        sources,
        relatedDocuments: queryResponse.relatedDocuments ?? [],
        provider,
        model,
        ...llmMeta,
      },
    };
  }

  private buildAugmentedPrompt(
    definition: AgentDefinition,
    results: Array<{
      documentFilename: string;
      documentIdRef?: string;
      sectionPath?: string;
      matchType?: string;
      version?: string;
      score: number;
      content: string;
    }>,
  ): string {
    const basePrompt =
      definition.context?.trim() ||
      `You are ${definition.name ?? definition.slug}, a knowledgeable assistant that answers questions using the provided knowledge base.`;

    const retrievedContext = results
      .map((r, i) => {
        const score = (r.score * 100).toFixed(1);
        const docLabel = r.documentIdRef
          ? `${r.documentFilename} [${r.documentIdRef}]`
          : r.documentFilename;
        const sectionLine = r.sectionPath
          ? `\n**Section:** ${r.sectionPath}`
          : '';
        const versionLine = r.version ? ` (v${r.version})` : '';
        const matchLine =
          r.matchType === 'both'
            ? ' — matched by keyword AND meaning'
            : r.matchType === 'keyword'
              ? ' — matched by keyword'
              : '';
        return `### Source ${i + 1}: ${docLabel}${versionLine} (${score}% relevant)${matchLine}${sectionLine}\n${r.content}`;
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
      '- Cite your sources using the document name and section when available',
      '- If a document ID is shown in brackets (e.g., [FP-001]), include it in your citation',
    ].join('\n\n');
  }

  private extractUserMessage(data: InvokeData): string {
    if (typeof data.content === 'string') {
      return data.content;
    }
    if (data.content && typeof data.content === 'object') {
      const obj = data.content as Record<string, unknown>;
      const msg =
        obj.message ?? obj.userMessage ?? obj.text ?? obj.query ?? obj.content;
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
      const r = response;
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
      const r = response;
      return (r.metadata as unknown as Record<string, unknown>) ?? {};
    }
    return {};
  }
}
