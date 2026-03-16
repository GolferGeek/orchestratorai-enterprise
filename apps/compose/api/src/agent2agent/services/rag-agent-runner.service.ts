import { Injectable, Logger, Inject } from '@nestjs/common';
import { AgentRuntimeDefinition } from '@agent-platform/interfaces/agent.interface';
import { LLM_SERVICE, LLMServiceProvider } from '@/planes/llm/llm.interface';
import { BaseAgentRunner } from './base-agent-runner.service';
import {
  buildResponseMetadata,
  callLLM,
  fetchConversationHistory,
  optimizeContext,
  shouldStreamResponse,
  buildDocumentContext,
  extractImages,
} from './base-agent-runner/shared.helpers';
import { Agent2AgentConversationsService } from './agent-conversations.service';
import { TaskRequestDto, AgentTaskMode } from '../dto/task-request.dto';
import { TaskResponseDto } from '../dto/task-response.dto';
import {
  ContextOptimizationService,
  ConversationMessage,
} from '../context-optimization/context-optimization.service';
import { DeliverablesService } from '../deliverables/deliverables.service';
import { PlansService } from '../plans/services/plans.service';
import { StreamingService } from './streaming.service';
import { CollectionsService, RagCollection } from '@/rag/collections.service';
import {
  QueryService,
  SearchResult,
  RelatedDocument,
  QueryResponse,
} from '@/rag/query.service';
import { RagComplexityType } from '@/rag/dto/create-collection.dto';

/**
 * RAG Agent Configuration stored in agent metadata
 */
interface RagConfig {
  collection_slug: string;
  top_k?: number;
  similarity_threshold?: number;
  no_results_message?: string;
  no_access_message?: string;
}

/**
 * RAG Agent Runner
 *
 * Handles execution of RAG agents - agents that query a dedicated RAG collection
 * and use retrieved documents to augment LLM responses.
 *
 * Use cases:
 * - HR Agent → queries hr-policy collection
 * - Legal Agent → queries legal-docs collection
 * - Engineering Docs Agent → queries eng-wiki collection
 *
 * Configuration (in agent metadata.rag_config):
 * - collection_slug: The collection to query (required)
 * - top_k: Number of results to retrieve (default: 5)
 * - similarity_threshold: Minimum similarity score (default: 0.5)
 * - no_results_message: Custom message when no results found
 * - no_access_message: Custom message when user lacks collection access
 *
 * Access Control:
 * - Agent visibility: Standard org-based visibility
 * - Collection access: Handled by existing RAG access control
 *   (required_role, allowed_users, created_by)
 *
 * @example
 * ```typescript
 * // Agent definition in database
 * {
 *   slug: 'hr-agent',
 *   name: 'HR Policy Assistant',
 *   agent_type: 'rag-runner',
 *   metadata: {
 *     rag_config: {
 *       collection_slug: 'hr-policy',
 *       top_k: 5,
 *       similarity_threshold: 0.6
 *     }
 *   }
 * }
 * ```
 */
@Injectable()
export class RagAgentRunnerService extends BaseAgentRunner {
  protected readonly logger = new Logger(RagAgentRunnerService.name);

  constructor(
    contextOptimization: ContextOptimizationService,
    @Inject(LLM_SERVICE) llmService: LLMServiceProvider,
    plansService: PlansService,
    conversationsService: Agent2AgentConversationsService,
    deliverablesService: DeliverablesService,
    streamingService: StreamingService,
    @Inject(CollectionsService)
    private readonly collectionsService: CollectionsService,
    @Inject(QueryService)
    private readonly queryService: QueryService,
  ) {
    super(
      llmService,
      contextOptimization,
      plansService,
      conversationsService,
      deliverablesService,
      streamingService,
    );
  }

  /**
   * CONVERSE mode - Query RAG collection and generate conversational response
   */
  protected async handleConverse(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    this.logger.debug(
      `🔍 [RAG-RUNNER] handleConverse() ENTRY - agent: ${definition.slug}, org: ${organizationSlug}`,
    );
    try {
      const userId = this.resolveUserId(request);
      this.logger.debug(`🔍 [RAG-RUNNER] userId: ${userId}`);
      if (!userId) {
        return TaskResponseDto.failure(
          AgentTaskMode.CONVERSE,
          'User identity is required for RAG agent execution',
        );
      }

      const context = request.context;
      this.logger.debug(
        `🔍 [RAG-RUNNER] conversationId: ${context?.conversationId}`,
      );
      if (!context?.conversationId) {
        return TaskResponseDto.failure(
          AgentTaskMode.CONVERSE,
          'Conversation context is required for RAG agent execution',
        );
      }

      // Get RAG configuration from agent metadata
      const ragConfig = this.extractRagConfig(definition);
      this.logger.debug(
        `🔍 [RAG-RUNNER] ragConfig: ${ragConfig ? JSON.stringify(ragConfig) : 'null'}`,
      );
      if (!ragConfig) {
        // Fallback to base handler if no RAG config
        this.logger.warn(
          `🔍 [RAG-RUNNER] No ragConfig found - falling back to base handler`,
        );
        return await super.handleConverse(
          definition,
          request,
          organizationSlug,
        );
      }

      // Resolve organization slug
      const resolvedOrgSlug = this.resolveOrganizationSlug(
        definition,
        organizationSlug,
      );
      this.logger.debug(`🔍 [RAG-RUNNER] resolvedOrgSlug: ${resolvedOrgSlug}`);

      // Get collection by slug
      this.logger.debug(
        `🔍 [RAG-RUNNER] Looking for collection: ${ragConfig.collection_slug} in org: ${resolvedOrgSlug}`,
      );
      const collection = await this.getCollectionBySlug(
        ragConfig.collection_slug,
        resolvedOrgSlug,
        userId,
      );
      this.logger.debug(
        `🔍 [RAG-RUNNER] collection found: ${collection ? collection.slug : 'null'}`,
      );

      if (!collection) {
        this.logger.warn(
          `🔍 [RAG-RUNNER] Collection not found or no access - returning no_access_message`,
        );
        const noAccessMessage =
          ragConfig.no_access_message ||
          "I don't have access to the information needed to answer that question.";
        return TaskResponseDto.success(AgentTaskMode.CONVERSE, {
          content: {
            message: noAccessMessage,
            hasAccess: false,
            isConversational: true,
          },
          metadata: {
            agentSlug: definition.slug,
            collectionSlug: ragConfig.collection_slug,
            accessDenied: true,
          },
        });
      }

      // Get user message for query
      const userMessage = this.resolveUserMessage(request);
      if (!userMessage || userMessage.trim().length === 0) {
        return TaskResponseDto.failure(
          AgentTaskMode.CONVERSE,
          'User message is required for RAG query',
        );
      }

      // Query the collection using complexity-based strategy
      const queryResponse = await this.executeComplexityQuery(
        collection,
        resolvedOrgSlug,
        userMessage,
        ragConfig,
      );

      // Build augmented prompt with RAG results
      const conversationHistory = await fetchConversationHistory(
        this.conversationsService,
        request,
      );
      const optimizedHistory = await optimizeContext(
        this.contextOptimization,
        conversationHistory,
        definition,
      );

      // Build system prompt with RAG context
      const docContext = buildDocumentContext(request);
      const images = extractImages(request);
      const systemPrompt = this.buildRagPrompt(
        definition,
        collection,
        queryResponse.results.length > 0 ? queryResponse.results : [],
        optimizedHistory,
        undefined,
        docContext,
      );

      // Handle no results
      if (queryResponse.results.length === 0) {
        const noResultsMessage =
          ragConfig.no_results_message ||
          "I don't have enough information in my knowledge base to answer that question.";
        return TaskResponseDto.success(AgentTaskMode.CONVERSE, {
          content: {
            message: noResultsMessage,
            hasResults: false,
            searchDurationMs: queryResponse.searchDurationMs,
            isConversational: true,
          },
          metadata: {
            agentSlug: definition.slug,
            collectionSlug: ragConfig.collection_slug,
            collectionName: collection.name,
            noResults: true,
          },
        });
      }

      // Build LLM config
      const llmConfig = this.buildLlmConfig(
        definition,
        context.conversationId,
        userId,
        resolvedOrgSlug,
        request,
      );

      // Update caller name for converse mode
      llmConfig.callerName = `${definition.slug}-rag-converse`;
      llmConfig.stream = shouldStreamResponse(request);

      // Call LLM with augmented context
      const llmResponse = await callLLM(
        this.llmService,
        llmConfig,
        systemPrompt,
        userMessage,
        context,
        optimizedHistory,
        images,
      );

      const content = this.normalizeContent(llmResponse.content);
      const llmMetadata =
        (llmResponse.metadata as unknown as Record<string, unknown>) ?? null;

      // Build response metadata
      const usage = this.normalizeUsage(llmMetadata?.usage);
      const provider = this.resolveProvider(llmMetadata, definition);
      const model = this.resolveModel(llmMetadata, definition);

      const metadata = buildResponseMetadata(
        {
          provider,
          model,
          usage,
          thinking: llmMetadata?.thinking,
        },
        {
          agentSlug: definition.slug,
          collectionSlug: ragConfig.collection_slug,
          collectionName: collection.name,
          resultsCount: queryResponse.results.length,
          searchDurationMs: queryResponse.searchDurationMs,
          topK: ragConfig.top_k ?? 5,
          similarityThreshold: ragConfig.similarity_threshold ?? 0.5,
          sources: this.formatSources(queryResponse.results),
        },
      );

      // Save conversation history (same as base handler)
      const timestamp = new Date().toISOString();
      const updatedHistory: ConversationMessage[] = [...optimizedHistory];

      if (userMessage.length > 0) {
        updatedHistory.push({
          role: 'user',
          content: userMessage,
          timestamp,
        });
      }

      updatedHistory.push({
        role: 'assistant',
        content: content,
        timestamp,
        metadata: {
          provider,
          model,
        },
      });

      const maxHistoryEntries = 50;
      const trimmedHistory =
        updatedHistory.length > maxHistoryEntries
          ? updatedHistory.slice(updatedHistory.length - maxHistoryEntries)
          : updatedHistory;

      await this.conversationsService.updateConversation(
        {
          conversationId: context.conversationId,
          userId,
        },
        {
          metadata: {
            history: trimmedHistory,
            lastAssistantMessageAt: timestamp,
          },
        },
      );

      return TaskResponseDto.success(AgentTaskMode.CONVERSE, {
        content: {
          message: content,
          sources: this.formatSources(queryResponse.results),
          isConversational: true,
        },
        metadata,
      });
    } catch (error) {
      this.logger.error(
        `RAG agent ${definition.slug} CONVERSE failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      return TaskResponseDto.failure(
        AgentTaskMode.CONVERSE,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  /**
   * BUILD mode - Query RAG collection and generate response with LLM
   */
  protected async executeBuild(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    try {
      const userId = this.resolveUserId(request);
      if (!userId) {
        return TaskResponseDto.failure(
          AgentTaskMode.BUILD,
          'User identity is required for RAG agent execution',
        );
      }

      // Use ExecutionContext from request - it flows through unchanged
      const context = request.context;
      if (!context.conversationId) {
        return TaskResponseDto.failure(
          AgentTaskMode.BUILD,
          'Conversation context is required for RAG agent execution',
        );
      }

      // Get RAG configuration from agent metadata
      const ragConfig = this.extractRagConfig(definition);
      if (!ragConfig) {
        return TaskResponseDto.failure(
          AgentTaskMode.BUILD,
          'RAG agent missing rag_config in metadata',
        );
      }

      // Emit progress: Starting using ExecutionContext
      this.streamingService.emitProgress(
        context,
        'Starting RAG query...',
        request.userMessage || '',
        {
          step: 'Initializing',
          progress: 5,
          status: 'running',
          sequence: 1,
          totalSteps: 5,
        },
      );

      // Resolve organization slug
      const resolvedOrgSlug = this.resolveOrganizationSlug(
        definition,
        organizationSlug,
      );

      // Get collection by slug
      const collection = await this.getCollectionBySlug(
        ragConfig.collection_slug,
        resolvedOrgSlug,
        userId,
      );

      if (!collection) {
        const noAccessMessage =
          ragConfig.no_access_message ||
          "I don't have access to the information needed to answer that question.";
        // Return conversational response - base runner will add humanResponse
        return TaskResponseDto.success(AgentTaskMode.BUILD, {
          content: {
            message: noAccessMessage,
            hasAccess: false,
            isConversational: true,
          },
          metadata: {
            agentSlug: definition.slug,
            collectionSlug: ragConfig.collection_slug,
            accessDenied: true,
          },
        });
      }

      // Emit progress: Querying collection
      this.streamingService.emitProgress(
        context,
        `Searching ${collection.name}...`,
        request.userMessage || '',
        {
          step: 'Querying RAG collection',
          progress: 20,
          status: 'running',
          sequence: 2,
          totalSteps: 5,
        },
      );

      // Get user message for query
      const userMessage = this.resolveUserMessage(request);
      if (!userMessage || userMessage.trim().length === 0) {
        return TaskResponseDto.failure(
          AgentTaskMode.BUILD,
          'User message is required for RAG query',
        );
      }

      // Query the collection using complexity-based strategy
      const queryResponse = await this.executeComplexityQuery(
        collection,
        resolvedOrgSlug,
        userMessage,
        ragConfig,
      );

      // Handle no results
      if (queryResponse.results.length === 0) {
        const noResultsMessage =
          ragConfig.no_results_message ||
          "I don't have enough information in my knowledge base to answer that question.";
        // Return conversational response - base runner will add humanResponse
        return TaskResponseDto.success(AgentTaskMode.BUILD, {
          content: {
            message: noResultsMessage,
            hasResults: false,
            searchDurationMs: queryResponse.searchDurationMs,
            isConversational: true,
          },
          metadata: {
            agentSlug: definition.slug,
            collectionSlug: ragConfig.collection_slug,
            collectionName: collection.name,
            noResults: true,
          },
        });
      }

      // Emit progress: Building context
      this.streamingService.emitProgress(
        context,
        `Found ${queryResponse.results.length} relevant documents...`,
        request.userMessage || '',
        {
          step: 'Building context',
          progress: 40,
          status: 'running',
          sequence: 3,
          totalSteps: 5,
        },
      );

      // Build augmented prompt with RAG results
      const conversationHistory = await fetchConversationHistory(
        this.conversationsService,
        request,
      );
      const optimizedHistory = await optimizeContext(
        this.contextOptimization,
        conversationHistory,
        definition,
      );

      const buildDocCtx = buildDocumentContext(request);
      const buildImages = extractImages(request);
      const systemPrompt = this.buildRagPrompt(
        definition,
        collection,
        queryResponse.results,
        optimizedHistory,
        undefined,
        buildDocCtx,
      );

      // Emit progress: Calling LLM
      this.streamingService.emitProgress(
        context,
        'Generating response...',
        request.userMessage || '',
        {
          step: 'Calling LLM',
          progress: 60,
          status: 'running',
          sequence: 4,
          totalSteps: 5,
        },
      );

      // Call LLM with augmented context
      const llmConfig = this.buildLlmConfig(
        definition,
        context.conversationId,
        userId,
        resolvedOrgSlug,
        request,
      );

      const llmResponse = await callLLM(
        this.llmService,
        llmConfig,
        systemPrompt,
        userMessage,
        context,
        optimizedHistory,
        buildImages,
      );

      const content = this.normalizeContent(llmResponse.content);
      const llmMetadata =
        (llmResponse.metadata as unknown as Record<string, unknown>) ?? null;

      // Emit progress: Complete
      this.streamingService.emitProgress(
        context,
        'Response generated',
        request.userMessage || '',
        {
          step: 'Complete',
          progress: 100,
          status: 'completed',
          sequence: 5,
          totalSteps: 5,
        },
      );

      // Build response metadata
      const usage = this.normalizeUsage(llmMetadata?.usage);
      const provider = this.resolveProvider(llmMetadata, definition);
      const model = this.resolveModel(llmMetadata, definition);

      const metadata = buildResponseMetadata(
        {
          provider,
          model,
          usage,
          thinking: llmMetadata?.thinking,
        },
        {
          agentSlug: definition.slug,
          collectionSlug: ragConfig.collection_slug,
          collectionName: collection.name,
          resultsCount: queryResponse.results.length,
          searchDurationMs: queryResponse.searchDurationMs,
          topK: ragConfig.top_k ?? 5,
          similarityThreshold: ragConfig.similarity_threshold ?? 0.5,
        },
      );

      // Use request.context directly - full ExecutionContext from transport-types
      const executionContext = request.context;

      const deliverableResult = await this.deliverablesService.executeAction(
        'create',
        {
          title: this.resolveDeliverableTitle(userMessage, definition),
          content: content,
          format: 'markdown',
          type: 'rag-response',
          agentName: definition.name ?? definition.slug,
          taskId: context.taskId,
          metadata: {
            sources: this.formatSources(queryResponse.results),
            collectionSlug: ragConfig.collection_slug,
            collectionName: collection.name,
            resultsCount: queryResponse.results.length,
            searchDurationMs: queryResponse.searchDurationMs,
            topK: ragConfig.top_k ?? 5,
            similarityThreshold: ragConfig.similarity_threshold ?? 0.5,
            llm: {
              provider,
              model,
              usage,
            },
          },
        },
        executionContext,
      );

      if (!deliverableResult.success || !deliverableResult.data) {
        return TaskResponseDto.failure(
          AgentTaskMode.BUILD,
          deliverableResult.error?.message ?? 'Failed to create deliverable',
        );
      }

      const resultData = deliverableResult.data as {
        deliverable: unknown;
        version: unknown;
        isNew: boolean;
      };

      return TaskResponseDto.success(AgentTaskMode.BUILD, {
        content: {
          deliverable: resultData.deliverable,
          version: resultData.version,
          isNew: resultData.isNew,
          sources: this.formatSources(queryResponse.results),
        },
        metadata,
      });
    } catch (error) {
      this.logger.error(
        `RAG agent ${definition.slug} BUILD failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      return TaskResponseDto.failure(
        AgentTaskMode.BUILD,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  /**
   * Extract RAG configuration from agent metadata
   * RAG config is stored in metadata.raw.rag_config (raw is the original JSONB)
   */
  private extractRagConfig(
    definition: AgentRuntimeDefinition,
  ): RagConfig | null {
    // The raw metadata JSONB is in definition.metadata.raw
    const rawMetadata = definition.metadata?.raw as
      | Record<string, unknown>
      | undefined;
    const ragConfig = rawMetadata?.rag_config as RagConfig | undefined;

    if (!ragConfig?.collection_slug) {
      this.logger.error(
        `RAG agent ${definition.slug} missing rag_config.collection_slug in metadata.raw`,
      );
      return null;
    }

    return ragConfig;
  }

  /**
   * Get collection by slug, checking user access
   */
  private async getCollectionBySlug(
    collectionSlug: string,
    organizationSlug: string,
    userId: string,
  ): Promise<RagCollection | null> {
    try {
      // Get all collections user can access
      const collections = await this.collectionsService.getCollections(
        organizationSlug,
        userId,
      );

      // Find the one matching our slug
      const collection = collections.find((c) => c.slug === collectionSlug);

      if (!collection) {
        this.logger.warn(
          `Collection ${collectionSlug} not found or user ${userId} lacks access`,
        );
        return null;
      }

      return collection;
    } catch (error) {
      this.logger.error(
        `Failed to get collection ${collectionSlug}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Execute complexity-based query
   * Routes to appropriate search strategy based on collection's complexity type
   */
  private async executeComplexityQuery(
    collection: RagCollection,
    organizationSlug: string,
    userMessage: string,
    ragConfig: RagConfig,
  ): Promise<QueryResponse> {
    const complexityType = collection.complexityType || 'basic';

    // Use complexity-based query for non-basic types
    if (complexityType !== 'basic') {
      return await this.queryService.queryByComplexity(
        collection.id,
        organizationSlug,
        complexityType,
        {
          query: userMessage,
          topK: ragConfig.top_k ?? 5,
          similarityThreshold: ragConfig.similarity_threshold ?? 0.5,
          includeMetadata: true,
        },
        collection.embeddingModel,
      );
    }

    // Basic search for default type
    return await this.queryService.queryCollection(
      collection.id,
      organizationSlug,
      {
        query: userMessage,
        topK: ragConfig.top_k ?? 5,
        similarityThreshold: ragConfig.similarity_threshold ?? 0.5,
        strategy: 'basic',
        includeMetadata: true,
      },
      collection.embeddingModel,
    );
  }

  /**
   * Build RAG-augmented system prompt with complexity-specific instructions
   */
  private buildRagPrompt(
    definition: AgentRuntimeDefinition,
    collection: RagCollection,
    results: SearchResult[],
    conversationHistory: ConversationMessage[],
    relatedDocuments?: RelatedDocument[],
    documentContext?: string,
  ): string {
    const sections: string[] = [];
    const complexityType = collection.complexityType || 'basic';

    // Base system prompt from agent definition
    // Check multiple sources: prompts.build, prompts.system, llm.systemPrompt, context (markdown/raw), or fallback
    let basePrompt: string | undefined;

    // Try prompts.build first (for build mode)
    basePrompt = definition.prompts?.build;

    // Then prompts.system
    if (!basePrompt) {
      basePrompt = definition.prompts?.system;
    }

    // Then llm.systemPrompt
    if (!basePrompt) {
      basePrompt = definition.llm?.systemPrompt;
    }

    // Then check context for system_prompt field (if context is a structured object)
    if (
      !basePrompt &&
      definition.context &&
      typeof definition.context === 'object'
    ) {
      const contextObj = definition.context as Record<string, unknown>;
      basePrompt =
        (typeof contextObj.system_prompt === 'string'
          ? contextObj.system_prompt
          : undefined) ||
        (typeof contextObj.systemPrompt === 'string'
          ? contextObj.systemPrompt
          : undefined);
    }

    // If still no prompt, try using the raw context string as the system prompt
    // This handles agents with plain text context (like legal-policies-agent)
    if (
      !basePrompt &&
      definition.context &&
      typeof definition.context === 'object'
    ) {
      const contextObj = definition.context as Record<string, unknown>;
      const rawContext = contextObj.raw || contextObj.markdown;
      if (typeof rawContext === 'string' && rawContext.trim().length > 0) {
        // Use the raw context as the system prompt if it looks like a prompt (not YAML frontmatter)
        if (!rawContext.trim().startsWith('---')) {
          basePrompt = rawContext.trim();
        }
      }
    }

    // Fallback to generic prompt
    if (!basePrompt) {
      basePrompt = `You are ${definition.name ?? definition.slug}, a knowledgeable assistant that answers questions using the provided knowledge base.`;
    }

    sections.push(basePrompt.trim());

    // Knowledge base context
    sections.push(`## Knowledge Base: ${collection.name}`);
    if (collection.description) {
      sections.push(collection.description);
    }

    // Retrieved documents with complexity-specific formatting
    sections.push('## Retrieved Context');
    sections.push(
      "The following excerpts from the knowledge base are relevant to the user's question:",
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (!result) continue;

      const source = result.documentFilename || 'Unknown source';
      const score = (result.score * 100).toFixed(1);

      // Build source header with complexity-specific info
      let sourceHeader = `### Source ${i + 1}: ${source} (${score}% relevant)`;

      // Add document ID for attributed search
      if (result.documentIdRef) {
        sourceHeader = `### Source ${i + 1}: [${result.documentIdRef}] ${source} (${score}% relevant)`;
      }

      // Add section path for attributed search
      if (result.sectionPath) {
        sourceHeader += `\n**Section:** ${result.sectionPath}`;
      }

      // Add match type for hybrid search
      if (result.matchType) {
        const matchLabel =
          result.matchType === 'both' ? 'keyword + semantic' : result.matchType;
        sourceHeader += `\n**Match Type:** ${matchLabel}`;
      }

      // Add version for temporal search
      if (result.version) {
        sourceHeader += `\n**Version:** ${result.version}`;
      }

      sections.push(sourceHeader);
      sections.push(result.content);
    }

    // Add related documents for cross-reference search
    if (relatedDocuments && relatedDocuments.length > 0) {
      sections.push('## Related Documents');
      sections.push(
        'The following documents are related to the retrieved context:',
      );
      for (const doc of relatedDocuments) {
        const docRef = doc.documentIdRef || doc.documentId;
        sections.push(`- **[${docRef}]** ${doc.title} (${doc.relationship})`);
      }
    }

    // Recent conversation context
    if (conversationHistory.length > 0) {
      const recentMessages = conversationHistory
        .slice(-5)
        .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
        .join('\n');
      sections.push(`## Recent Conversation\n${recentMessages}`);
    }

    // Uploaded document text (extracted from user uploads)
    if (documentContext && documentContext.length > 0) {
      sections.push(documentContext);
    }

    // Complexity-specific instructions
    const instructions = this.getComplexityInstructions(complexityType);
    sections.push(`## Instructions\n${instructions}`);

    return sections.join('\n\n');
  }

  /**
   * Get complexity-specific instructions for the LLM
   */
  private getComplexityInstructions(complexityType: RagComplexityType): string {
    const baseInstructions = `- Answer the user's question using ONLY the information from the Retrieved Context above
- If the context doesn't contain enough information, say so clearly
- Be concise and direct
- Do not make up information not found in the context`;

    switch (complexityType) {
      case 'attributed':
        return `${baseInstructions}
- ALWAYS cite your sources using document ID and section (e.g., "[FP-001, Article II]")
- Include specific citations for each fact or claim`;

      case 'hybrid':
        return `${baseInstructions}
- Note that matches may be keyword-based (exact terms) or semantic (meaning-based)
- Prioritize results that match both keyword and semantic criteria
- Cite sources with their match type when relevant`;

      case 'cross-reference':
        return `${baseInstructions}
- Reference related documents when they provide additional context
- Use "See also:" to point to related materials
- Connect information across documents when answering complex questions`;

      case 'temporal':
        return `${baseInstructions}
- Note the version of documents when citing
- If comparing versions, clearly indicate what changed
- Prefer the latest version unless specifically asked about older versions`;

      case 'basic':
      default:
        return `${baseInstructions}
- Cite your sources when possible (e.g., "According to [document name]...")`;
    }
  }

  /**
   * Format search results as sources for response
   * Includes extended fields for advanced RAG types
   */
  private formatSources(results: SearchResult[]): Array<{
    document: string;
    documentId: string;
    score: number;
    excerpt: string;
    charOffset?: number;
    documentIdRef?: string;
    sectionPath?: string;
    matchType?: string;
    version?: string;
  }> {
    return results.map((result) => ({
      document: result.documentFilename,
      documentId: result.documentId, // UUID for document content retrieval
      score: parseFloat((result.score * 100).toFixed(1)),
      excerpt:
        result.content.length > 200
          ? result.content.substring(0, 200) + '...'
          : result.content,
      // Char offset for highlighting in document viewer
      ...(result.charOffset !== undefined && { charOffset: result.charOffset }),
      // Extended fields for advanced RAG types
      ...(result.documentIdRef && { documentIdRef: result.documentIdRef }),
      ...(result.sectionPath && { sectionPath: result.sectionPath }),
      ...(result.matchType && { matchType: result.matchType }),
      ...(result.version && { version: result.version }),
    }));
  }

  /**
   * Resolve organization slug from the agent definition.
   * RAG collections belong to the agent's organization, so the org
   * must come from the agent itself — not from the calling user's context.
   */
  private resolveOrganizationSlug(
    definition: AgentRuntimeDefinition,
    _organizationSlug: string | null,
  ): string {
    const orgSlugs = definition.organizationSlug;
    if (Array.isArray(orgSlugs) && orgSlugs.length > 0) {
      return orgSlugs[0] as string;
    }
    if (typeof orgSlugs === 'string') {
      return orgSlugs;
    }
    return 'global';
  }

  /**
   * Resolve user message from request
   */
  private resolveUserMessage(request: TaskRequestDto): string {
    if (
      typeof request.userMessage === 'string' &&
      request.userMessage.trim().length > 0
    ) {
      return request.userMessage.trim();
    }

    const payload = request.payload;
    const payloadMessage =
      payload?.userMessage ?? payload?.message ?? payload?.query;
    if (
      typeof payloadMessage === 'string' &&
      payloadMessage.trim().length > 0
    ) {
      return payloadMessage.trim();
    }

    return '';
  }

  /**
   * Build LLM configuration
   * Priority: llmOverride (rerun) > payload.config > ExecutionContext > definition.llm
   */
  private buildLlmConfig(
    definition: AgentRuntimeDefinition,
    conversationId: string,
    userId: string,
    orgSlug: string,
    request: TaskRequestDto,
  ): Record<string, unknown> {
    const payload = request.payload;
    const llmOverride = payload?.llmOverride as
      | {
          provider?: string;
          model?: string;
          temperature?: number;
          maxTokens?: number;
        }
      | undefined;
    const payloadConfig = payload?.config as
      | {
          provider?: string;
          model?: string;
          temperature?: number;
          maxTokens?: number;
        }
      | undefined;

    // Get provider/model with priority: llmOverride > payload.config > definition.llm > context
    // Agent's own llm_config takes precedence over the UI-selected context model
    // because agents are tuned for specific models (e.g., RAG agents need specific models)
    const llmDef = definition.llm;
    const provider =
      llmOverride?.provider ||
      payloadConfig?.provider ||
      llmDef?.provider ||
      request.context?.provider ||
      'ollama';
    const model =
      llmOverride?.model ||
      payloadConfig?.model ||
      llmDef?.model ||
      request.context?.model ||
      'gpt-oss:20b';

    // Temperature and maxTokens from override or defaults
    const temperature =
      llmOverride?.temperature ??
      payloadConfig?.temperature ??
      llmDef?.temperature ??
      0.3;
    const maxTokens =
      llmOverride?.maxTokens ??
      payloadConfig?.maxTokens ??
      llmDef?.maxTokens ??
      2000;

    return {
      provider,
      model,
      temperature,
      maxTokens,
      conversationId,
      sessionId: request.context.taskId, // Use taskId for session correlation
      userId,
      organizationSlug: orgSlug,
      agentSlug: definition.slug,
      callerType: 'agent',
      callerName: `${definition.slug}-rag-build`,
      stream: false,
    };
  }

  /**
   * Normalize LLM response content
   */
  private normalizeContent(content: unknown): string {
    if (typeof content === 'string') {
      return content;
    }
    if (content === null || content === undefined) {
      return '';
    }
    try {
      return JSON.stringify(content, null, 2);
    } catch {
      return '[unserializable content]';
    }
  }

  /**
   * Normalize usage metadata
   */
  private normalizeUsage(raw: unknown): {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost: number;
  } {
    if (!raw || typeof raw !== 'object') {
      return { inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 };
    }

    const value = raw as Record<string, unknown>;
    const inputTokens = this.numberOrZero(
      value.inputTokens ?? value.promptTokens ?? value.total_input_tokens,
    );
    const outputTokens = this.numberOrZero(
      value.outputTokens ?? value.completionTokens ?? value.total_output_tokens,
    );
    const totalTokens = this.numberOrZero(
      value.totalTokens ?? value.total_tokens,
      inputTokens + outputTokens,
    );
    const cost = this.numberOrZero(value.cost ?? value.price);

    return { inputTokens, outputTokens, totalTokens, cost };
  }

  /**
   * Resolve provider from metadata or definition
   */
  private resolveProvider(
    metadata: Record<string, unknown> | null,
    definition: AgentRuntimeDefinition,
  ): string {
    const fromMetadata = metadata?.provider;
    if (typeof fromMetadata === 'string' && fromMetadata.trim().length > 0) {
      return fromMetadata;
    }
    const fromDefinition = definition.llm?.provider;
    if (
      typeof fromDefinition === 'string' &&
      fromDefinition.trim().length > 0
    ) {
      return fromDefinition;
    }
    return '';
  }

  /**
   * Resolve model from metadata or definition
   */
  private resolveModel(
    metadata: Record<string, unknown> | null,
    definition: AgentRuntimeDefinition,
  ): string {
    const fromMetadata = metadata?.model;
    if (typeof fromMetadata === 'string' && fromMetadata.trim().length > 0) {
      return fromMetadata;
    }
    const fromDefinition = definition.llm?.model;
    if (
      typeof fromDefinition === 'string' &&
      fromDefinition.trim().length > 0
    ) {
      return fromDefinition;
    }
    return '';
  }

  /**
   * Convert value to number or return fallback
   */
  private numberOrZero(value: unknown, fallback = 0): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return fallback;
  }

  /**
   * Generate a title for the deliverable based on the user's query
   */
  private resolveDeliverableTitle(
    userMessage: string,
    definition: AgentRuntimeDefinition,
  ): string {
    // Truncate long queries and create a reasonable title
    const maxLength = 60;
    const truncated =
      userMessage.length > maxLength
        ? userMessage.substring(0, maxLength) + '...'
        : userMessage;

    const agentName = definition.name ?? definition.slug;
    return `${agentName}: ${truncated}`;
  }
}
