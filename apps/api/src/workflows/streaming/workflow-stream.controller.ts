import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  isExecutionContext,
  type ExecutionContext,
} from '@orchestrator-ai/transport-types';
import {
  ObservabilityEventsService,
  type ObservabilityEventRecord,
} from '@orchestratorai/planes/observability';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { SupabaseAuthUserDto } from '../../auth/dto/auth.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  StreamTokenService,
  type StreamTokenClaims,
} from '../../auth/services/stream-token.service';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { WorkflowRegistry } from '../catalog/workflow.registry';
import {
  WorkflowRunsRepository,
  type WorkflowRunReader,
} from '../shared/runs';

/** A run's full history is bounded; a run emitting more is a bug to see. */
const RUN_EVENT_HISTORY_LIMIT = 5000;

interface AuthorizedRequest {
  organizationSlug?: string;
  streamTokenClaims?: StreamTokenClaims;
}

/**
 * Live and persisted events of a workflow conversation, for any registered
 * workflow.
 *
 * The caller streams their own conversation (the frontend opens the stream
 * before it invokes, so the run may not exist yet), or a runtime run someone
 * else started that its access rule lets them read. Either way only events
 * of that conversation's owner are sent.
 */
@Controller('workflows')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
export class WorkflowStreamController {
  constructor(
    private readonly events: ObservabilityEventsService,
    private readonly streamTokens: StreamTokenService,
    private readonly registry: WorkflowRegistry,
    private readonly runs: WorkflowRunsRepository,
  ) {}

  @Post('stream-token')
  async issueStreamToken(
    @Body() body: unknown,
    @CurrentUser() user: SupabaseAuthUserDto,
    @Req() request: AuthorizedRequest,
  ): Promise<{ token: string; expiresAt: string }> {
    const context = this.validateContextBody(body, request);
    if (context.userId !== user.id) {
      const run = await this.readableRuntimeRun(context.agentSlug, context.conversationId, {
        userId: user.id,
        organizationSlug: request.organizationSlug!,
      });
      if (!run || run.userId !== context.userId) {
        throw new BadRequestException('Workflow ExecutionContext is invalid');
      }
    }
    const issued = this.streamTokens.issueToken({
      user,
      taskId: context.conversationId,
      agentSlug: context.agentSlug,
      organizationSlug: context.orgSlug,
      conversationId: context.conversationId,
    });
    return { token: issued.token, expiresAt: issued.expiresAt.toISOString() };
  }

  @Get('stream')
  async stream(
    @Query('conversationId') conversationId: string,
    @CurrentUser() user: SupabaseAuthUserDto,
    @Req() request: AuthorizedRequest,
    @Res() response: Response,
  ): Promise<void> {
    const claims = request.streamTokenClaims;
    if (
      !claims ||
      claims.sub !== user.id ||
      !claims.agentSlug ||
      claims.taskId !== conversationId ||
      claims.conversationId !== conversationId ||
      claims.organizationSlug !== request.organizationSlug
    ) {
      throw new UnauthorizedException('Workflow stream token is not valid');
    }
    const agentSlug = claims.agentSlug;
    const organizationSlug = request.organizationSlug!;
    const shared = await this.readableRuntimeRun(agentSlug, conversationId, {
      userId: user.id,
      organizationSlug,
    });
    const scope: EventScope = {
      ownerId: shared ? shared.userId : user.id,
      organizationSlug,
      conversationId,
      agentSlug,
    };

    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-store');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();
    response.write(
      `data: ${JSON.stringify({ event_type: 'connected', conversationId })}\n\n`,
    );

    for (const event of this.events.getSnapshot()) {
      if (inScope(event, scope)) this.writeEvent(response, event);
    }

    const subscription = this.events.events$.subscribe((event) => {
      if (inScope(event, scope)) this.writeEvent(response, event);
    });
    const heartbeat = setInterval(() => {
      if (!response.writableEnded) response.write(': heartbeat\n\n');
    }, 30_000);
    response.on('close', () => {
      clearInterval(heartbeat);
      subscription.unsubscribe();
    });
  }

  /**
   * Every persisted event of a runtime run the caller may read, oldest first:
   * what a page reopening a finished or long-running run replays.
   */
  @Get(':slug/runs/:runId/events')
  async runEvents(
    @Param('slug') slug: string,
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @CurrentUser() user: SupabaseAuthUserDto,
    @Req() request: AuthorizedRequest,
  ): Promise<{ events: ObservabilityEventRecord[] }> {
    const organizationSlug = request.organizationSlug;
    if (!organizationSlug) {
      throw new BadRequestException('No organization on the request');
    }
    const run = await this.readableRuntimeRun(slug, runId, {
      userId: user.id,
      organizationSlug,
    });
    if (!run) {
      throw new NotFoundException(`No run ${runId} for workflow ${slug}`);
    }
    const scope: EventScope = {
      ownerId: run.userId,
      organizationSlug: run.organizationSlug,
      conversationId: run.id,
      agentSlug: run.workflowSlug,
    };
    const events = await this.events.getConversationEvents(run.id, RUN_EVENT_HISTORY_LIMIT);
    return { events: events.filter((event) => inScope(event, scope)) };
  }

  /** A runtime run of this workflow the reader may see, or null. */
  private async readableRuntimeRun(
    workflowSlug: string,
    runId: string,
    reader: WorkflowRunReader,
  ) {
    const workflow = this.registry.get(workflowSlug, reader.organizationSlug);
    if (!workflow || workflow.entryPoint.kind !== 'runtime') return null;
    const run = await this.runs.getReadable(runId, reader);
    return run && run.workflowSlug === workflowSlug ? run : null;
  }

  private validateContextBody(
    body: unknown,
    request: AuthorizedRequest,
  ): ExecutionContext {
    if (
      typeof body !== 'object' ||
      body === null ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      !('context' in body)
    ) {
      throw new BadRequestException('A complete ExecutionContext is required');
    }
    const context = (body as { context: unknown }).context;
    if (
      !isExecutionContext(context) ||
      !this.hasOnlyContextKeys(context) ||
      context.agentType !== 'workflow' ||
      !request.organizationSlug ||
      (request.organizationSlug !== '*' &&
        context.orgSlug !== request.organizationSlug) ||
      !this.registry.has(context.agentSlug, context.orgSlug)
    ) {
      throw new BadRequestException('Workflow ExecutionContext is invalid');
    }
    return context;
  }

  private hasOnlyContextKeys(context: ExecutionContext): boolean {
    const allowed = new Set([
      'orgSlug',
      'userId',
      'conversationId',
      'agentSlug',
      'agentType',
      'provider',
      'model',
      'sovereignMode',
    ]);
    return Object.keys(context).every((key) => allowed.has(key));
  }

  private writeEvent(
    response: Response,
    event: ObservabilityEventRecord,
  ): void {
    if (!response.writableEnded) {
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  }
}

interface EventScope {
  ownerId: string;
  organizationSlug: string;
  conversationId: string;
  agentSlug: string;
}

function inScope(event: ObservabilityEventRecord, scope: EventScope): boolean {
  return (
    event.context.userId === scope.ownerId &&
    event.context.conversationId === scope.conversationId &&
    event.context.agentSlug === scope.agentSlug &&
    (scope.organizationSlug === '*' || event.context.orgSlug === scope.organizationSlug)
  );
}
