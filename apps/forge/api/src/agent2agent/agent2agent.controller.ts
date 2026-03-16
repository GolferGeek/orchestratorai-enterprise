import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Param,
  Post,
  Query,
  UseGuards,
  Res,
  Req,
  NotFoundException,
  UnauthorizedException,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AgentCardBuilderService } from './services/agent-card-builder.service';
import { AgentExecutionGateway } from './services/agent-execution-gateway.service';
import { TaskRequestDto } from './dto/task-request.dto';
import { TaskResponseDto } from './dto/task-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SupabaseAuthUserDto } from '../auth/dto/auth.dto';
import {
  Agent2AgentTasksService,
  ConversationMessage,
} from './services/agent-tasks.service';
import { Agent2AgentTaskStatusService } from './services/agent-task-status.service';
import { Agent2AgentConversationsService } from './services/agent-conversations.service';
import { NormalizedTaskRequestDto } from './dto/task-request.dto';
import { AgentRegistryService } from '../agent-platform/services/agent-registry.service';
import { Public } from '../auth/decorators/public.decorator';
import { Agent2AgentDeliverablesService } from './services/agent2agent-deliverables.service';
import {
  A2ATaskSuccessResponse,
  A2ATaskErrorResponse,
  NIL_UUID,
} from '@orchestrator-ai/transport-types';
import { Response, Request } from 'express';
import { CreateStreamTokenDto } from './dto/create-stream-token.dto';
import {
  StreamTokenClaims,
  StreamTokenService,
} from '../auth/services/stream-token.service';
import { TaskStatusService } from './tasks/task-status.service';
import { TasksService } from './tasks/tasks.service';
import { DeliverablesService } from './deliverables/deliverables.service';
import { ObservabilityEventsService } from '../observability/observability-events.service';
import { Subscription } from 'rxjs';
import { DocumentProcessingService } from './services/document-processing.service';
import { StreamingService } from './services/streaming.service';
import { ApiKeyGuard } from './guards/api-key.guard';
import { AgentHierarchyService } from './services/agent-hierarchy.service';
import { TaskCompletionService } from './services/task-completion.service';
import {
  RequestNormalizationService,
  FrontendTaskRequest,
  NormalizedTaskRequest,
} from './services/request-normalization.service';
import { SseEventMapperService } from './services/sse-event-mapper.service';
import { JsonRpcResponseService } from './services/json-rpc-response.service';

interface TaskExecutionResult {
  taskCompletionHandled?: boolean;
  metadata?: {
    taskCompletionHandled?: boolean;
    [key: string]: unknown;
  };
  deliverableId?: string;
  [key: string]: unknown;
}

interface RequestWithStreamData extends Request {
  sanitizedUrl?: string;
  streamTokenClaims?: StreamTokenClaims;
}

// Use shared protocol types
type JsonRpcSuccessEnvelope = A2ATaskSuccessResponse;
type JsonRpcErrorEnvelope = A2ATaskErrorResponse;

type AgentTaskRecord = NonNullable<
  Awaited<ReturnType<Agent2AgentTasksService['getTaskById']>>
>;

@Controller()
export class Agent2AgentController {
  constructor(
    private readonly cardBuilder: AgentCardBuilderService,
    private readonly gateway: AgentExecutionGateway,
    private readonly tasksService: Agent2AgentTasksService,
    private readonly agentTaskStatusService: Agent2AgentTaskStatusService,
    private readonly taskStatusCache: TaskStatusService,
    private readonly agentConversationsService: Agent2AgentConversationsService,
    private readonly agentRegistry: AgentRegistryService,
    private readonly agentDeliverablesService: Agent2AgentDeliverablesService,
    private readonly streamTokenService: StreamTokenService,
    private readonly deliverablesService: DeliverablesService,
    private readonly taskUpdateService: TasksService,
    private readonly observabilityEvents: ObservabilityEventsService,
    private readonly documentProcessing: DocumentProcessingService,
    private readonly streamingService: StreamingService,
    private readonly agentHierarchyService: AgentHierarchyService,
    private readonly taskCompletionService: TaskCompletionService,
    private readonly requestNormalization: RequestNormalizationService,
    private readonly sseEventMapper: SseEventMapperService,
    private readonly jsonRpcResponse: JsonRpcResponseService,
  ) {}

  private readonly logger = new Logger(Agent2AgentController.name);

  /**
   * Create conversation for database agents
   * Route: POST /agent-to-agent/conversations
   */
  @Post('agent-to-agent/conversations')
  @UseGuards(JwtAuthGuard)
  async createConversation(
    @Body()
    body: {
      agentName: string;
      organization: string;
      conversationId?: string;
      metadata?: Record<string, unknown>;
    },
    @CurrentUser() currentUser: SupabaseAuthUserDto,
  ) {
    const conversation =
      await this.agentConversationsService.createConversation(
        {
          userId: currentUser.id,
          orgSlug: body.organization,
        },
        body.agentName,
        {
          metadata: body.metadata,
        },
      );

    return conversation;
  }

  /**
   * Get hierarchy of database agents (A2A protocol)
   * Route: GET /agent-to-agent/.well-known/hierarchy
   */
  @Get('agent-to-agent/.well-known/hierarchy')
  @Public()
  async getAgentHierarchy(
    @Headers('x-organization-slug') organizationHeader?: string,
  ) {
    const effectiveHeader = organizationHeader;
    const organizations = effectiveHeader
      ? effectiveHeader
          .split(',')
          .map((org) => org.trim())
          .filter(Boolean)
      : undefined;

    try {
      const databaseAgents =
        await this.agentHierarchyService.fetchDatabaseAgents(organizations);
      const hierarchy =
        this.agentHierarchyService.buildDatabaseHierarchy(databaseAgents);

      return {
        success: true,
        data: hierarchy,
        metadata: {
          totalAgents: databaseAgents.length,
          rootNodes: hierarchy.length,
          organizations: organizations ?? 'all',
          source: 'database',
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.logger.error('Error fetching agent hierarchy:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        data: [],
        metadata: {
          totalAgents: 0,
          rootNodes: 0,
          organizations: organizations ?? 'all',
          source: 'database',
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  @Get([
    'agent-to-agent/:orgSlug/:agentSlug/.well-known/agent.json',
    'agents/:orgSlug/:agentSlug/.well-known/agent.json',
  ])
  async getAgentCard(
    @Param('orgSlug') orgSlug: string,
    @Param('agentSlug') agentSlug: string,
    @Query('includePrivate') includePrivate?: string,
    @Query('include_private') includePrivateSnake?: string,
  ) {
    const org = orgSlug === 'global' ? null : orgSlug;
    const includePrivateFields = this.resolveBooleanQuery(
      includePrivate,
      includePrivateSnake,
    );

    const options =
      includePrivateFields === undefined ? undefined : { includePrivateFields };

    return this.cardBuilder.build(org, agentSlug, options);
  }

  @Post('agent-to-agent/:orgSlug/:agentSlug/tasks')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FilesInterceptor('files', 10)) // Support up to 10 files
  async executeTask(
    @Param('orgSlug') orgSlug: string,
    @Param('agentSlug') agentSlug: string,
    @Body() body: FrontendTaskRequest,
    @UploadedFiles() files: Array<Express.Multer.File>,
    @CurrentUser() currentUser: SupabaseAuthUserDto,
    @Req() request: RequestWithStreamData,
  ): Promise<TaskResponseDto | JsonRpcSuccessEnvelope | JsonRpcErrorEnvelope> {
    const bodyMethod = (body as Record<string, unknown>)?.method;
    this.logger.log(
      `🔍 [A2A-CTRL] Request received - org: ${orgSlug}, agent: ${agentSlug}, body.method: ${typeof bodyMethod === 'string' || typeof bodyMethod === 'number' ? bodyMethod : JSON.stringify(bodyMethod)}`,
    );

    // ADAPTER: Transform frontend CreateTaskDto format to Agent2Agent TaskRequestDto format
    this.logger.log(
      `🔍 [A2A-CTRL] DEBUG BEFORE adapt - body.mode: ${String((body as Record<string, unknown>)?.mode)}, body.method: ${String((body as Record<string, unknown>)?.method)}`,
    );
    const adaptedBody = this.requestNormalization.adaptFrontendRequest(body);
    this.logger.log(
      `🔍 [A2A-CTRL] DEBUG AFTER adapt - adaptedBody.mode: ${String((adaptedBody as Record<string, unknown>)?.mode)}`,
    );
    const { dto, jsonrpc } =
      await this.requestNormalization.normalizeTaskRequest(adaptedBody);
    this.logger.log(
      `🔍 [A2A-CTRL] DEBUG AFTER normalize - dto.mode: ${dto.mode}`,
    );

    const payloadMethod = (dto.payload as Record<string, unknown>)?.method;
    this.logger.log(
      `🔍 [A2A-CTRL] After normalization - mode: ${dto.mode}, payload.method: ${typeof payloadMethod === 'string' || typeof payloadMethod === 'number' ? payloadMethod : JSON.stringify(payloadMethod)}, taskId: ${dto.context?.taskId ?? 'none'}`,
    );

    // =========================================================================
    // EXECUTION CONTEXT HANDLING
    // The context is created by frontend and flows through unchanged.
    // Backend can ONLY mutate: taskId, deliverableId, planId (when first created)
    // Backend must VALIDATE: userId matches JWT auth
    // =========================================================================

    // 1. VALIDATE: Context must exist (created by frontend)
    if (!dto.context) {
      throw new BadRequestException(
        'ExecutionContext is required. Frontend must send context in request params.',
      );
    }

    // 2. VALIDATE: userId must match authenticated user
    if (dto.context.userId !== currentUser.id) {
      this.logger.error(
        `userId mismatch: context=${dto.context.userId} auth=${currentUser.id}`,
      );
      throw new UnauthorizedException(
        'Context userId does not match authenticated user',
      );
    }

    // 3. VALIDATE: Agent exists
    const agentRecord = await this.agentRegistry.getAgent(
      dto.context.orgSlug,
      dto.context.agentSlug,
    );
    if (!agentRecord) {
      throw new NotFoundException(
        `Agent ${dto.context.agentSlug} not found in organization ${dto.context.orgSlug || 'global'}`,
      );
    }

    // Context reference - we only mutate taskId when creating a new task
    const context = dto.context;

    try {
      // =========================================================================
      // FILE UPLOAD PROCESSING (Phase 2: Multimodal A2A Transport)
      // Process uploaded files and convert to base64 for metadata storage
      // Upload original files to legal-documents storage bucket
      // =========================================================================
      if (files && files.length > 0) {
        this.logger.log(
          `📎 [A2A-CTRL] Processing ${files.length} uploaded file(s)`,
        );

        // Initialize documents array in metadata if not present
        if (!dto.metadata) {
          dto.metadata = {};
        }
        if (!dto.metadata.documents) {
          dto.metadata.documents = [];
        }

        // Process each file
        for (const file of files) {
          try {
            // Convert file buffer to base64
            const base64Data = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;

            // Process document (extract text if applicable, upload to storage)
            const processedDoc = await this.documentProcessing.processDocument(
              {
                filename: file.originalname,
                mimeType: file.mimetype,
                size: file.size,
                base64Data,
              },
              context,
            );

            // Add processed document to metadata (including legal metadata)
            // Preserve base64Data for image types so agents can pass raw images to vision LLMs
            (dto.metadata.documents as Array<unknown>).push({
              documentId: processedDoc.documentId,
              filename: file.originalname,
              mimeType: file.mimetype,
              size: file.size,
              url: processedDoc.url,
              storagePath: processedDoc.storagePath,
              extractedText: processedDoc.extractedText,
              extractionMethod: processedDoc.extractionMethod,
              legalMetadata: processedDoc.legalMetadata,
              base64Data: file.mimetype.startsWith('image/')
                ? base64Data
                : undefined,
              uploadedAt: new Date().toISOString(),
            });

            this.logger.log(
              `📎 [A2A-CTRL] Processed file: ${file.originalname} (${processedDoc.extractionMethod || 'no extraction'})`,
            );
          } catch (error) {
            this.logger.error(
              `📎 [A2A-CTRL] Failed to process file ${file.originalname}: ${error instanceof Error ? error.message : String(error)}`,
            );
            // Continue processing other files even if one fails
          }
        }

        this.logger.log(
          `📎 [A2A-CTRL] Finished processing ${files.length} file(s)`,
        );
      }

      // =========================================================================
      // DOCUMENT PROCESSING FROM PAYLOAD (JSON-based document upload)
      // Process documents sent as base64 in payload.documents array
      // This supports both multipart file upload AND JSON-based document transfer
      // =========================================================================
      const payloadDocuments = (dto.payload as Record<string, unknown>)
        ?.documents;

      // DEBUG: Log payload structure to diagnose document processing issues
      this.logger.warn(
        `📄 [A2A-CTRL] DEBUG PAYLOAD - keys: ${Object.keys(dto.payload || {}).join(', ')}, hasDocuments: ${!!payloadDocuments}, isArray: ${Array.isArray(payloadDocuments)}, length: ${Array.isArray(payloadDocuments) ? payloadDocuments.length : 'N/A'}`,
      );

      if (Array.isArray(payloadDocuments) && payloadDocuments.length > 0) {
        this.logger.log(
          `📄 [A2A-CTRL] Processing ${payloadDocuments.length} document(s) from payload`,
        );

        // Initialize documents array in metadata if not present
        if (!dto.metadata) {
          dto.metadata = {};
        }
        if (!dto.metadata.documents) {
          dto.metadata.documents = [];
        }

        // Process each document
        for (const doc of payloadDocuments) {
          try {
            if (
              typeof doc === 'object' &&
              doc !== null &&
              'filename' in doc &&
              'mimeType' in doc &&
              'base64Data' in doc
            ) {
              const docMetadata = doc as {
                filename: string;
                mimeType: string;
                size?: number;
                base64Data: string;
              };

              // Process document (extract text if applicable, upload to storage)
              const processedDoc =
                await this.documentProcessing.processDocument(
                  {
                    filename: docMetadata.filename,
                    mimeType: docMetadata.mimeType,
                    size: docMetadata.size || 0,
                    base64Data: docMetadata.base64Data,
                  },
                  context,
                );

              // Add processed document to metadata (including legal metadata)
              // Preserve base64Data for image types so agents can pass raw images to vision LLMs
              (dto.metadata.documents as Array<unknown>).push({
                documentId: processedDoc.documentId,
                filename: docMetadata.filename,
                mimeType: docMetadata.mimeType,
                size: processedDoc.sizeBytes,
                url: processedDoc.url,
                storagePath: processedDoc.storagePath,
                extractedText: processedDoc.extractedText,
                extractionMethod: processedDoc.extractionMethod,
                legalMetadata: processedDoc.legalMetadata,
                base64Data: docMetadata.mimeType.startsWith('image/')
                  ? docMetadata.base64Data
                  : undefined,
                uploadedAt: new Date().toISOString(),
              });

              this.logger.log(
                `📄 [A2A-CTRL] Processed document: ${docMetadata.filename} (${processedDoc.extractionMethod || 'no extraction'})`,
              );
            }
          } catch (error) {
            this.logger.error(
              `📄 [A2A-CTRL] Failed to process document: ${error instanceof Error ? error.message : String(error)}`,
            );
            // Continue processing other documents even if one fails
          }
        }

        this.logger.log(
          `📄 [A2A-CTRL] Finished processing ${payloadDocuments.length} document(s) from payload`,
        );
      }

      // Build conversation history from messages
      const conversationHistoryFromMessages: ConversationMessage[] =
        dto.messages?.map((msg) => {
          const content =
            typeof msg.content === 'string'
              ? msg.content
              : msg.content && typeof msg.content === 'object'
                ? JSON.stringify(msg.content)
                : '';
          return {
            role: msg.role,
            content,
            timestamp: new Date().toISOString(),
          };
        }) || [];

      // Get or create task using the IDs from context
      // Frontend pre-generates both conversationId and taskId,
      // backend creates the records if they don't exist
      await this.tasksService.getOrCreateTask(
        {
          userId: context.userId,
          orgSlug: context.orgSlug,
          conversationId: context.conversationId,
        },
        context.agentSlug,
        {
          method: dto.mode,
          prompt: dto.userMessage || '',
          taskId: context.taskId,
          metadata: dto.metadata || {},
          llmSelection: {
            provider: context.provider,
            model: context.model,
          },
          conversationHistory: conversationHistoryFromMessages,
        },
      );

      // Mark task as running before execution starts
      await this.agentTaskStatusService.updateTaskStatus(context, {
        status: 'running',
      });

      // =========================================================================
      // ASYNC EXECUTION MODE
      // For long-running agents (marketing swarm, legal department, etc.),
      // the client sets executionMode: 'async'. We return immediately with
      // the taskId and streamEndpoint, then run execution in the background.
      // The client connects to the SSE stream to get progress + completion.
      // This prevents Cloudflare 524 timeouts on long-running agents.
      // =========================================================================
      if (body.executionMode === 'async') {
        // Register SSE stream so client can connect
        const streamId = this.streamingService.registerStream(
          context,
          dto.mode,
          dto.userMessage || '',
        );

        // Fire execution in background (no await — response returns immediately)
        this.runTaskInBackground(context, dto, request).catch((err) => {
          this.logger.error(
            `❌ [A2A-CTRL] Background task ${context.taskId} failed:`,
            err,
          );
        });

        const asyncResponse = {
          taskId: context.taskId,
          streamId,
          streamEndpoint: `/agent-to-agent/${context.orgSlug}/${context.agentSlug}/tasks/${context.taskId}/stream`,
          status: 'accepted',
          context,
        };

        this.logRequest({
          org: context.orgSlug,
          agentSlug: context.agentSlug,
          dto,
          jsonrpc,
          status: 'success',
          error: null,
        });

        if (jsonrpc) {
          return {
            jsonrpc: '2.0',
            id: jsonrpc.id ?? null,
            result: asyncResponse,
          } as unknown as A2ATaskSuccessResponse;
        }
        return asyncResponse as unknown as TaskResponseDto;
      }

      // =========================================================================
      // SYNCHRONOUS EXECUTION (default)
      // For regular deliverable-based agents, execute and return result.
      // =========================================================================

      // Execute the agent - context flows through unchanged
      const result = await this.gateway.execute(context, dto);
      this.attachStreamMetadata(result, {
        request,
        organizationSlug: context.orgSlug,
        agentSlug: context.agentSlug,
        taskId: context.taskId,
        conversationId: context.conversationId || null,
      });

      // Check if task completion was already handled by the agent
      const typedResult = result as unknown as TaskExecutionResult;
      const taskAlreadyHandled =
        result &&
        (typedResult.taskCompletionHandled === true ||
          (typedResult.metadata &&
            typedResult.metadata.taskCompletionHandled === true));

      if (!taskAlreadyHandled) {
        // Create deliverable - this is where deliverableId can be set
        const deliverableId =
          await this.agentDeliverablesService.createFromTaskResult(
            result,
            context.userId,
            context.taskId,
            context.agentSlug,
            context.conversationId,
            dto.mode,
          );

        // MUTATION: Set deliverableId when first created (from NIL_UUID)
        // The context (capsule) is the source of truth - frontend gets deliverableId from there
        if (deliverableId) {
          if (context.deliverableId === NIL_UUID) {
            context.deliverableId = deliverableId;
          }
          if (typeof result === 'object' && result !== null) {
            typedResult.deliverableId = deliverableId;
          }
        }
      } else if (typedResult.deliverableId) {
        // Handler already created deliverable - update context with the deliverableId
        if (context.deliverableId === NIL_UUID) {
          context.deliverableId = typedResult.deliverableId;
        }
      }

      // Always complete the task (even if deliverable was already created by handler)
      await this.agentTaskStatusService.completeTask(context, result);

      // Attach processed documents to result payload for client visibility
      if (
        dto.metadata?.documents &&
        Array.isArray(dto.metadata.documents) &&
        dto.metadata.documents.length > 0
      ) {
        const typedResult2 = result as unknown as TaskExecutionResult;
        if (!typedResult2.payload) {
          typedResult2.payload = {};
        }
        if (
          typeof typedResult2.payload === 'object' &&
          typedResult2.payload !== null
        ) {
          const payload = typedResult2.payload as Record<string, unknown>;
          if (!payload.content) {
            payload.content = {};
          }
          if (typeof payload.content === 'object' && payload.content !== null) {
            (payload.content as Record<string, unknown>).documents =
              dto.metadata.documents;
          }
        }
        this.logger.log(
          `📄 [A2A-CTRL] Attached ${dto.metadata.documents.length} processed document(s) to response`,
        );
      }

      this.logRequest({
        org: context.orgSlug,
        agentSlug: context.agentSlug,
        dto,
        jsonrpc,
        status: 'success',
        error: null,
      });

      // Attach the ExecutionContext capsule to the response
      // This allows the frontend to update its store with the latest context
      // (especially taskId, planId, deliverableId which may have been set)
      let resultWithContext: TaskResponseDto | Record<string, unknown>;
      if (result && typeof result === 'object' && 'withContext' in result) {
        resultWithContext = result.withContext(context);
      } else if (result && typeof result === 'object') {
        resultWithContext = { ...(result as Record<string, unknown>), context };
      } else {
        resultWithContext = { result, context };
      }

      if (jsonrpc) {
        return {
          jsonrpc: '2.0',
          id: jsonrpc.id ?? null,
          result: resultWithContext,
        } as A2ATaskSuccessResponse;
      }

      return resultWithContext as TaskResponseDto;
    } catch (error) {
      this.logger.error(
        `❌ [Agent2AgentController] Error executing task:`,
        error,
      );

      if (!jsonrpc) {
        this.logRequest({
          org: context.orgSlug,
          agentSlug: context.agentSlug,
          dto,
          jsonrpc: null,
          status: 'error',
          error,
        });
        throw error;
      }

      this.logRequest({
        org: context.orgSlug,
        agentSlug: context.agentSlug,
        dto,
        jsonrpc,
        status: 'error',
        error,
      });

      return this.jsonRpcResponse.buildJsonRpcError(jsonrpc.id ?? null, error);
    }
  }

  /**
   * Async task execution endpoint for long-running agents.
   * Returns immediately with taskId + streamEndpoint.
   * Client connects to SSE stream for progress and completion events.
   *
   * Use this for agents that take >100s (marketing swarm, legal department, etc.)
   * to avoid Cloudflare 524 timeouts.
   *
   * Route: POST /agent-to-agent/:orgSlug/:agentSlug/tasks/async
   */
  @Post('agent-to-agent/:orgSlug/:agentSlug/tasks/async')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FilesInterceptor('files', 10))
  @HttpCode(202)
  async executeTaskAsync(
    @Param('orgSlug') orgSlug: string,
    @Param('agentSlug') agentSlug: string,
    @Body() body: FrontendTaskRequest,
    @UploadedFiles() files: Array<Express.Multer.File>,
    @CurrentUser() currentUser: SupabaseAuthUserDto,
    @Req() request: RequestWithStreamData,
  ): Promise<TaskResponseDto | JsonRpcSuccessEnvelope | JsonRpcErrorEnvelope> {
    // Delegate to the shared handler with async mode enabled
    body.executionMode = 'async';
    return this.executeTask(
      orgSlug,
      agentSlug,
      body,
      files,
      currentUser,
      request,
    );
  }

  /**
   * Run agent execution in the background.
   * Called by executeTask when executionMode is 'async'.
   * Handles deliverable creation, task completion, and SSE emission.
   */
  private async runTaskInBackground(
    context: import('@orchestrator-ai/transport-types').ExecutionContext,
    dto: NormalizedTaskRequestDto,
    request: RequestWithStreamData,
  ): Promise<void> {
    try {
      this.logger.log(
        `🚀 [A2A-CTRL] Background execution started for task ${context.taskId}`,
      );

      // Execute the agent
      const result = await this.gateway.execute(context, dto);
      this.attachStreamMetadata(result, {
        request,
        organizationSlug: context.orgSlug,
        agentSlug: context.agentSlug,
        taskId: context.taskId,
        conversationId: context.conversationId || null,
      });

      // Handle deliverable creation (same as synchronous path)
      const typedResult = result as unknown as TaskExecutionResult;
      const taskAlreadyHandled =
        result &&
        (typedResult.taskCompletionHandled === true ||
          (typedResult.metadata &&
            typedResult.metadata.taskCompletionHandled === true));

      if (!taskAlreadyHandled) {
        const deliverableId =
          await this.agentDeliverablesService.createFromTaskResult(
            result,
            context.userId,
            context.taskId,
            context.agentSlug,
            context.conversationId,
            dto.mode,
          );

        if (deliverableId) {
          if (context.deliverableId === NIL_UUID) {
            context.deliverableId = deliverableId;
          }
          if (typeof result === 'object' && result !== null) {
            typedResult.deliverableId = deliverableId;
          }
        }
      } else if (typedResult.deliverableId) {
        if (context.deliverableId === NIL_UUID) {
          context.deliverableId = typedResult.deliverableId;
        }
      }

      // Complete the task
      await this.agentTaskStatusService.completeTask(context, result);

      // Emit SSE completion event so connected clients know it's done
      // emitComplete → agent stream endpoint
      this.streamingService.emitComplete(
        context,
        dto.userMessage || '',
        dto.mode,
      );
      // emitObservabilityOnly → observability stream (for clients that connect there)
      this.streamingService.emitObservabilityOnly(
        context,
        'agent.completed',
        'Task completed',
        { status: 'completed', deliverableId: context.deliverableId },
      );

      this.logger.log(
        `✅ [A2A-CTRL] Background execution completed for task ${context.taskId}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ [A2A-CTRL] Background execution failed for task ${context.taskId}:`,
        error,
      );

      // Mark task as failed
      await this.agentTaskStatusService
        .failTask(
          context,
          error instanceof Error ? error.message : String(error),
          error,
        )
        .catch((failErr) => {
          this.logger.error(
            `Failed to mark task ${context.taskId} as failed:`,
            failErr,
          );
        });

      // Emit SSE error event so connected clients get the failure
      this.streamingService.emitError(
        context,
        dto.userMessage || '',
        dto.mode,
        error instanceof Error ? error.message : String(error),
      );
      this.streamingService.emitObservabilityOnly(
        context,
        'agent.failed',
        error instanceof Error ? error.message : String(error),
        { status: 'failed' },
      );
    }
  }

  /**
   * Completion callback endpoint for async agents (e.g., n8n workflows)
   * Authenticated via API key (x-agent-api-key header) — n8n must include
   * the organization's registered API key when posting results.
   * Route: POST /agent-to-agent/:orgSlug/:agentSlug/tasks/:taskId/complete
   */
  @Post('agent-to-agent/:orgSlug/:agentSlug/tasks/:taskId/complete')
  @UseGuards(ApiKeyGuard)
  @HttpCode(200)
  async handleTaskCompletion(
    @Param('orgSlug') orgSlug: string,
    @Param('agentSlug') agentSlug: string,
    @Param('taskId') taskId: string,
    @Body()
    body: {
      userId: string;
      conversationId: string;
      status: 'success' | 'failed';
      results?: unknown;
      error?: string;
    },
  ): Promise<{ success: boolean; message: string }> {
    try {
      const org = this.normalizeOrgSlug(orgSlug);

      return await this.taskCompletionService.handleCompletion({
        orgSlug: org,
        agentSlug,
        taskId,
        userId: body.userId,
        conversationId: body.conversationId,
        status: body.status,
        results: body.results,
        error: body.error,
      });
    } catch (error) {
      this.logger.error(
        `Failed to handle completion callback for task ${taskId}:`,
        error,
      );
      throw error;
    }
  }

  @Post('agent-to-agent/:orgSlug/:agentSlug/tasks/:taskId/stream-token')
  @UseGuards(JwtAuthGuard)
  async createStreamToken(
    @Param('orgSlug') orgSlug: string,
    @Param('agentSlug') agentSlug: string,
    @Param('taskId') taskId: string,
    @Body() body: CreateStreamTokenDto,
    @CurrentUser() currentUser: SupabaseAuthUserDto,
  ) {
    const organizationSlug = this.normalizeOrgSlug(orgSlug);

    const task = await this.ensureTaskOwnership(taskId, currentUser.id);
    this.assertTaskContext(task, agentSlug, organizationSlug);

    const { token, expiresAt } = this.streamTokenService.issueToken({
      user: currentUser,
      taskId,
      agentSlug,
      organizationSlug,
      streamId: body.streamId,
      conversationId: task.agentConversationId ?? null,
    });

    return {
      success: true,
      token,
      expiresAt: expiresAt.toISOString(),
    };
  }

  @Get('agent-to-agent/:orgSlug/:agentSlug/tasks/:taskId/stream')
  @UseGuards(JwtAuthGuard)
  async streamAgentTask(
    @Param('orgSlug') orgSlug: string,
    @Param('agentSlug') agentSlug: string,
    @Param('taskId') taskId: string,
    @Query('streamId') streamIdParam: string | undefined,
    @CurrentUser() currentUser: SupabaseAuthUserDto,
    @Req() request: RequestWithStreamData,
    @Res() response: Response,
  ): Promise<void> {
    // LOG AT VERY START OF ENDPOINT
    this.logger.debug(
      `🔴 [STREAM-ENDPOINT] HIT! org=${orgSlug}, agent=${agentSlug}, taskId=${taskId}`,
    );

    const organizationSlug = this.normalizeOrgSlug(orgSlug);
    const claims = request.streamTokenClaims;

    if (claims) {
      if (
        claims.taskId !== taskId ||
        claims.agentSlug !== agentSlug ||
        claims.organizationSlug !== organizationSlug
      ) {
        throw new UnauthorizedException('Stream token does not match request');
      }
    }

    // Try to get existing task, but allow streaming for pre-generated taskIds
    // This enables connecting to stream BEFORE the POST creates the task
    // Security: Events are filtered by taskId, so user can only see events for tasks
    // that will be created with this ID (which they pre-generated)
    const task = await this.tasksService.getTaskById({
      taskId,
      userId: currentUser.id,
    });

    // If task exists, validate ownership and context
    if (task) {
      this.assertTaskContext(task, agentSlug, organizationSlug);
    }

    const streamId = streamIdParam || claims?.streamId;
    const expectedConversationId = task?.agentConversationId ?? null;

    let streamSessionId: string | null = null;
    let observabilitySubscription: Subscription | null = null;
    try {
      streamSessionId = this.taskStatusCache.registerStreamSession({
        taskId,
        userId: currentUser.id,
        agentSlug,
        organizationSlug,
        streamId: streamId ?? null,
        conversationId: expectedConversationId,
      });
    } catch (error) {
      this.logger.warn('Failed to register stream session', {
        taskId,
        streamId: streamId ?? null,
        error: (error as Error)?.message,
      });
    }

    this.logger.debug(
      `[STREAM] Task stream connecting - taskId: ${taskId}, agentSlug: ${agentSlug}, org: ${organizationSlug}`,
    );

    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    });

    response.flushHeaders?.();
    // Send proper connection event as JSON data (not just SSE comment)
    response.write(
      `data: ${JSON.stringify({ event_type: 'connected', taskId, message: 'Stream connected' })}\n\n`,
    );

    const keepAlive = setInterval(() => {
      response.write(': keepalive\n\n');
    }, 15000);

    let streamActive = true;
    const observabilityFilters = {
      taskId,
      agentSlug,
      organizationSlug,
      conversationId: expectedConversationId,
    };

    const cleanup = (cleanupReason?: string) => {
      if (!streamActive) {
        return;
      }
      streamActive = false;
      clearInterval(keepAlive);
      if (observabilitySubscription) {
        observabilitySubscription.unsubscribe();
        observabilitySubscription = null;
      }
      if (streamSessionId) {
        this.taskStatusCache.unregisterStreamSession(
          streamSessionId,
          cleanupReason ?? 'connection_cleanup',
        );
        streamSessionId = null;
      }
    };

    const endStream = (reason: string) => {
      cleanup(reason);
      if (!response.writableEnded) {
        response.end();
      }
    };

    // Replay recent observability events for this task
    const replayEvents = this.observabilityEvents
      .getSnapshot()
      .filter((event) =>
        this.sseEventMapper.matchesObservabilityEvent(
          event,
          observabilityFilters,
        ),
      );
    for (const eventRecord of replayEvents) {
      if (
        eventRecord.hook_event_type === 'agent.completed' ||
        eventRecord.hook_event_type === 'agent.failed'
      ) {
        continue;
      }
      const chunkEvent =
        this.sseEventMapper.toChunkSseEventFromObservability(eventRecord);
      if (chunkEvent) {
        this.sseEventMapper.writeSseEvent(response, chunkEvent);
      }
    }

    this.logger.debug(
      `[STREAM] Subscribing to observability events for taskId: ${taskId}`,
    );

    observabilitySubscription = this.observabilityEvents.events$.subscribe({
      next: (eventRecord) => {
        // Log every event that comes through
        this.logger.debug(
          `[STREAM-V3] Event: ${eventRecord.hook_event_type}, taskId: ${eventRecord.context?.taskId}, streamActive: ${streamActive}`,
        );

        // Check filters
        if (
          !this.sseEventMapper.matchesObservabilityEvent(
            eventRecord,
            observabilityFilters,
          ) ||
          !streamActive
        ) {
          this.logger.debug(
            `[STREAM-V3] Filtered out - streamActive: ${streamActive}`,
          );
          return;
        }

        this.logger.debug(
          `[STREAM-V3] ✅ Forwarding ${eventRecord.hook_event_type} for task ${taskId}`,
        );

        const hookType = eventRecord.hook_event_type;
        if (hookType === 'agent.completed' || hookType === 'task.completed') {
          const completeEvent =
            this.sseEventMapper.toCompleteSseEventFromObservability(
              eventRecord,
            );
          if (completeEvent) {
            this.sseEventMapper.writeSseEvent(response, completeEvent);
          }
          this.logger.debug(
            `[STREAM-V3] Task ${taskId} completed, ending stream`,
          );
          endStream('complete');
          return;
        }

        if (hookType === 'agent.failed' || hookType === 'task.failed') {
          const errorEvent =
            this.sseEventMapper.toErrorSseEventFromObservability(eventRecord);
          if (errorEvent) {
            this.sseEventMapper.writeSseEvent(response, errorEvent);
          }
          this.logger.debug(`[STREAM-V3] Task ${taskId} failed, ending stream`);
          endStream('error');
          return;
        }

        const chunkEvent =
          this.sseEventMapper.toChunkSseEventFromObservability(eventRecord);
        if (chunkEvent) {
          this.logger.debug(`[STREAM-V3] Writing chunk event to SSE`);
          this.sseEventMapper.writeSseEvent(response, chunkEvent);
        }
      },
      error: (error) => {
        this.logger.warn(
          `Observability stream error for task ${taskId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      },
    });

    request.on('close', () => {
      this.logger.debug(`[STREAM] Client closed connection for task ${taskId}`);
      endStream('client_closed');
    });
    request.on('error', (err) => {
      this.logger.debug(`[STREAM] Client error for task ${taskId}: ${err}`);
      endStream('client_error');
    });
    response.on('close', () => {
      this.logger.debug(`[STREAM] Response closed for task ${taskId}`);
      endStream('response_closed');
    });
    response.on('error', (err) => {
      this.logger.debug(`[STREAM] Response error for task ${taskId}: ${err}`);
      endStream('response_error');
    });
  }

  @Get('agent-to-agent/:orgSlug/:agentSlug/health')
  getHealth(
    @Param('orgSlug') orgSlug: string,
    @Param('agentSlug') agentSlug: string,
  ) {
    const org = orgSlug === 'global' ? null : orgSlug;
    // We do not fetch agent details here to avoid side effects; this is a simple liveness check
    return {
      ok: true,
      service: 'agent-to-agent',
      organization: org ?? 'global',
      agent: agentSlug,
      timestamp: new Date().toISOString(),
    };
  }

  private normalizeOrgSlug(orgSlug: string): string {
    // 'global' is now an explicit organization slug for shared agents
    // '*' wildcard means "any organization" - treat as null to match global agents
    if (orgSlug === '*' || !orgSlug) {
      return 'global';
    }
    return orgSlug;
  }

  private attachStreamMetadata(
    result: TaskResponseDto,
    params: {
      request: Request;
      organizationSlug: string;
      agentSlug: string;
      taskId: string;
      conversationId: string | null;
    },
  ): void {
    if (!result || typeof result !== 'object' || !result.payload) {
      return;
    }

    const payload = result.payload;
    const metadata =
      (payload.metadata as Record<string, unknown> | undefined) ?? {};

    payload.metadata = metadata;

    const streamId = this.extractStreamId(result);
    const basePath = `/agent-to-agent/${params.organizationSlug}/${params.agentSlug}/tasks/${params.taskId}`;
    const streamPath = `${basePath}/stream`;
    const tokenPath = `${basePath}/stream-token`;
    const baseUrl = this.buildBaseUrl(params.request);
    const streamUrl = baseUrl ? `${baseUrl}${streamPath}` : streamPath;
    const tokenUrl = baseUrl ? `${baseUrl}${tokenPath}` : tokenPath;

    metadata.streamEndpoint = streamPath;
    metadata.streamTokenEndpoint = tokenPath;

    const existingStreaming =
      (metadata.streaming as Record<string, unknown> | undefined) ?? {};

    const streamingMetadata: Record<string, unknown> = {
      ...existingStreaming,
      streamEndpoint: streamPath,
      streamTokenEndpoint: tokenPath,
      streamUrl,
      streamTokenUrl: tokenUrl,
    };

    if (streamId) {
      streamingMetadata.streamId = streamId;
    }
    if (params.conversationId) {
      streamingMetadata.conversationId = params.conversationId;
    }

    metadata.streaming = streamingMetadata;
  }

  private extractStreamId(result: TaskResponseDto): string | undefined {
    const metadata = result.payload?.metadata as
      | Record<string, unknown>
      | undefined;
    if (!metadata) {
      return undefined;
    }

    const streaming = metadata.streaming as { streamId?: unknown } | undefined;
    const candidates: Array<unknown> = [metadata.streamId, streaming?.streamId];

    for (const candidate of candidates) {
      const value = this.asString(candidate);
      if (value) {
        return value;
      }
    }

    return undefined;
  }

  private asString(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
    return undefined;
  }

  private buildBaseUrl(request: Request): string | null {
    const host =
      request.get('x-forwarded-host') ??
      request.get('host') ??
      request.headers['host'];

    if (!host || typeof host !== 'string') {
      return null;
    }

    const proto =
      request.get('x-forwarded-proto') ??
      request.protocol ??
      (request.secure ? 'https' : 'http');

    return `${proto}://${host}`;
  }

  private async ensureTaskOwnership(
    taskId: string,
    userId: string,
  ): Promise<AgentTaskRecord> {
    const task = await this.tasksService.getTaskById({ taskId, userId });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }

  private assertTaskContext(
    task: AgentTaskRecord,
    agentSlug: string,
    organizationSlug: string,
  ): void {
    if (task.agentName !== agentSlug) {
      throw new UnauthorizedException(
        'Task does not belong to the requested agent',
      );
    }

    // Normalize task organization: null → 'global', empty → 'global'
    const taskOrg =
      !task.organization || task.organization === ''
        ? 'global'
        : task.organization;

    if (taskOrg !== organizationSlug) {
      throw new UnauthorizedException(
        `Task does not belong to the requested organization (task: ${taskOrg}, requested: ${organizationSlug})`,
      );
    }
  }

  private logRequest(params: {
    org: string | null;
    agentSlug: string;
    dto: TaskRequestDto;
    jsonrpc: NormalizedTaskRequest['jsonrpc'] | null | undefined;
    status: 'success' | 'error';
    error: unknown;
  }) {
    const { org, agentSlug, dto, jsonrpc, status, error } = params;
    const base = {
      organization: org ?? 'global',
      agent: agentSlug,
      mode: dto.mode,
      conversationId: dto.context?.conversationId ?? null,
      planId: dto.context?.planId ?? null,
      jsonrpc: jsonrpc
        ? {
            id: jsonrpc.id ?? null,
            method: jsonrpc.method ?? null,
          }
        : null,
    };

    if (status === 'success') {
      this.logger.log({
        ...base,
        status,
      });
      return;
    }

    const mapped = this.jsonRpcResponse.mapExceptionToError(error);

    this.logger.warn({
      ...base,
      status,
      error: {
        code: mapped.code,
        message: mapped.message,
      },
    });
  }

  private resolveBooleanQuery(
    ...candidates: Array<string | undefined>
  ): boolean | undefined {
    for (const value of candidates) {
      if (value === undefined) {
        continue;
      }
      const normalized = value.trim().toLowerCase();
      if (!normalized) {
        continue;
      }
      if (['true', '1', 'yes', 'y'].includes(normalized)) {
        return true;
      }
      if (['false', '0', 'no', 'n'].includes(normalized)) {
        return false;
      }
    }
    return undefined;
  }
}
