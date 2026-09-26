import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  isExecutionContext,
  type ExecutionContext,
  type WorkflowDocumentRef,
} from '@orchestrator-ai/transport-types';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { ConversationOwnershipService } from '../../common/conversations/conversation-ownership.service';
import { WorkflowRegistry } from '../catalog/workflow.registry';
import { WorkflowRunsRepository } from '../shared/runs';
import {
  WORKFLOW_DOCUMENT_MAX_BYTES,
  WorkflowDocumentError,
  WorkflowDocumentsService,
} from '../shared/documents/workflow-documents.service';

interface AuthorizedRequest {
  organizationSlug?: string;
}

const CONTEXT_KEYS = new Set([
  'orgSlug',
  'userId',
  'conversationId',
  'agentSlug',
  'agentType',
  'provider',
  'model',
  'sovereignMode',
]);

/**
 * POST /workflows/uploads — a document for a runtime workflow's `start`.
 *
 * multipart/form-data: `file`, and `context` (the ExecutionContext as JSON,
 * the same capsule the start will carry). Returns the WorkflowDocumentRef the
 * start action lists in `documents`. Uploads are accepted only before the run
 * exists.
 */
@Controller('workflows')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
export class WorkflowUploadController {
  private readonly logger = new Logger(WorkflowUploadController.name);

  constructor(
    private readonly registry: WorkflowRegistry,
    private readonly conversations: ConversationOwnershipService,
    private readonly runs: WorkflowRunsRepository,
    private readonly documents: WorkflowDocumentsService,
  ) {}

  @Post('uploads')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: WORKFLOW_DOCUMENT_MAX_BYTES, files: 1 } }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('context') rawContext: unknown,
    @CurrentUser() user: { id: string },
    @Req() request: AuthorizedRequest,
  ): Promise<WorkflowDocumentRef> {
    if (!file) {
      throw new BadRequestException('A file is required');
    }
    const context = this.parseContext(rawContext, user.id, request.organizationSlug);
    const workflow = this.registry.get(context.agentSlug, context.orgSlug);
    if (!workflow || workflow.entryPoint.kind !== 'runtime') {
      throw new BadRequestException(
        `Workflow "${context.agentSlug}" does not take documents in organization "${context.orgSlug}"`,
      );
    }

    try {
      await this.conversations.ensure(context);
    } catch (error) {
      this.logger.error(
        `Conversation check failed for ${context.conversationId}: ${(error as Error).message}`,
      );
      throw new BadRequestException('The conversation cannot be used for this upload');
    }
    if (await this.runs.getForOrg(context.orgSlug, context.conversationId)) {
      throw new BadRequestException('The run has already started; documents are fixed at start');
    }

    try {
      return await this.documents.store(context, file);
    } catch (error) {
      if (error instanceof WorkflowDocumentError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private parseContext(
    raw: unknown,
    userId: string,
    organizationSlug: string | undefined,
  ): ExecutionContext {
    let context: unknown;
    try {
      context = typeof raw === 'string' ? JSON.parse(raw) : undefined;
    } catch {
      throw new BadRequestException('context must be an ExecutionContext as JSON');
    }
    if (
      !isExecutionContext(context) ||
      !Object.keys(context).every((key) => CONTEXT_KEYS.has(key)) ||
      context.userId !== userId ||
      context.agentType !== 'workflow' ||
      !organizationSlug ||
      organizationSlug === '*' ||
      context.orgSlug !== organizationSlug
    ) {
      throw new BadRequestException(
        'context must be a workflow ExecutionContext for the authenticated user and selected organization',
      );
    }
    return context;
  }
}
