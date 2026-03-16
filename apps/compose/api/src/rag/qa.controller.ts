import {
  Controller,
  Post,
  Param,
  Body,
  Headers,
  UseGuards,
  Request,
  BadRequestException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { QueryService, SearchResult } from './query.service';
import { CollectionsService } from './collections.service';
import { LLM_SERVICE, LLMServiceProvider } from '@orchestratorai/planes/llm';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { NIL as NIL_UUID } from 'uuid';

export class QARequestDto {
  @IsString()
  question!: string;

  @IsInt()
  @Min(1)
  @Max(20)
  @IsOptional()
  topK?: number = 5;

  @IsString()
  @IsOptional()
  model?: string;
}

export interface Citation {
  documentId: string;
  documentFilename: string;
  content: string;
  score: number;
  pageNumber: number | null;
  chunkIndex: number;
}

export interface QAResponse {
  answer: string;
  citations: Citation[];
  query: string;
  model: string;
  searchDurationMs: number;
  totalDurationMs: number;
}

interface AuthenticatedRequest {
  user: {
    id: string;
    email?: string;
  };
}

function getOrgSlug(orgHeader?: string): string {
  if (!orgHeader) {
    throw new BadRequestException(
      'x-organization-slug header is required for RAG operations',
    );
  }
  return orgHeader;
}

/**
 * QA Controller — NotebookLM-style Q&A
 *
 * POST /api/rag/collections/:collectionId/qa
 *
 * Flow:
 *   1. Vector search to find relevant chunks
 *   2. Build context from top chunks
 *   3. Send question + context to LLM
 *   4. Return answer with source citations
 */
@Controller('api/rag/collections/:collectionId/qa')
@UseGuards(JwtAuthGuard)
export class QAController {
  constructor(
    private readonly queryService: QueryService,
    private readonly collectionsService: CollectionsService,
    @Inject(LLM_SERVICE)
    private readonly llmService: LLMServiceProvider,
  ) {}

  @Post()
  async ask(
    @Param('collectionId') collectionId: string,
    @Body() dto: QARequestDto,
    @Request() req: AuthenticatedRequest,
    @Headers('x-organization-slug') orgSlug?: string,
  ): Promise<QAResponse> {
    const totalStart = Date.now();
    const organizationSlug = getOrgSlug(orgSlug);
    const userId = req.user.id;

    // Access control: check collection access
    const collection = await this.collectionsService.getCollection(
      collectionId,
      organizationSlug,
    );

    if (
      collection.allowedUsers != null &&
      Array.isArray(collection.allowedUsers)
    ) {
      const hasAccess =
        collection.createdBy === userId ||
        collection.allowedUsers.includes(userId);
      if (!hasAccess) {
        throw new ForbiddenException(
          'You do not have access to this collection',
        );
      }
    }

    // Step 1: Vector search
    const queryResponse = await this.queryService.queryCollection(
      collectionId,
      organizationSlug,
      {
        query: dto.question,
        topK: dto.topK || 5,
        similarityThreshold: 0.3,
        includeMetadata: true,
      },
      collection.embeddingModel,
    );

    const searchDurationMs = queryResponse.searchDurationMs;

    if (queryResponse.results.length === 0) {
      return {
        answer:
          'I could not find any relevant information in this collection to answer your question.',
        citations: [],
        query: dto.question,
        model: dto.model || 'gpt-4o',
        searchDurationMs,
        totalDurationMs: Date.now() - totalStart,
      };
    }

    // Step 2: Build context from chunks
    const contextChunks = queryResponse.results.map(
      (r: SearchResult, idx: number) =>
        `[Source ${idx + 1}: ${r.documentFilename}${r.pageNumber ? `, page ${r.pageNumber}` : ''}]\n${r.content}`,
    );
    const context = contextChunks.join('\n\n---\n\n');

    // Step 3: Send to LLM
    const model = dto.model || 'gpt-4o';
    const executionContext: ExecutionContext = {
      orgSlug: organizationSlug,
      userId,
      conversationId: NIL_UUID,
      taskId: NIL_UUID,
      planId: NIL_UUID,
      deliverableId: NIL_UUID,
      agentSlug: 'notebooklm-qa',
      agentType: 'context',
      provider: 'openai',
      model,
    };

    const systemPrompt = `You are a helpful research assistant answering questions based on a document collection called "${collection.name}".

INSTRUCTIONS:
- Answer the question using ONLY the provided source documents
- Cite your sources by referencing [Source N] when using information from that source
- If the sources don't contain enough information to answer the question, say so clearly
- Be concise but thorough
- Do not make up information not present in the sources

SOURCES:
${context}`;

    const answer = await this.llmService.generateResponse(
      systemPrompt,
      dto.question,
      {
        executionContext,
        temperature: 0.3,
        maxTokens: 2000,
      },
    );

    const answerText = typeof answer === 'string' ? answer : answer.content;

    // Step 4: Build citations
    const citations: Citation[] = queryResponse.results.map(
      (r: SearchResult) => ({
        documentId: r.documentId,
        documentFilename: r.documentFilename,
        content: r.content,
        score: r.score,
        pageNumber: r.pageNumber,
        chunkIndex: r.chunkIndex,
      }),
    );

    return {
      answer: answerText,
      citations,
      query: dto.question,
      model,
      searchDurationMs,
      totalDurationMs: Date.now() - totalStart,
    };
  }
}
