import {
  Body,
  Controller,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { AgentExecutionGateway } from '../services/agent-execution-gateway.service';
import { HumanApprovalsRepository } from '@/agent-platform/repositories/human-approvals.repository';
import { TaskRequestDto } from '../dto/task-request.dto';
import { ExecutionContext, NIL_UUID } from '@orchestrator-ai/transport-types';

interface StoredRequest {
  conversationId?: string;
  userMessage?: string;
  payload?: Record<string, unknown>;
  taskId?: string;
  deliverableId?: string;
  agentType?: string;
  provider?: string;
  model?: string;
  [key: string]: unknown;
}

@Controller('agent-to-agent')
export class AgentApprovalsActionsController {
  constructor(
    private readonly gateway: AgentExecutionGateway,
    private readonly approvals: HumanApprovalsRepository,
  ) {}

  /**
   * Approve a pending human gate and continue the stored Build request.
   * Optional body may provide overrides merged into the stored request payload (e.g., stream option).
   */
  @Post(':orgSlug/:agentSlug/approvals/:id/continue')
  async approveAndContinue(
    @Param('orgSlug') orgSlug: string,
    @Param('agentSlug') agentSlug: string,
    @Param('id') id: string,
    @Req() req: Request,
    @Body()
    body?: {
      options?: Record<string, unknown>;
      payload?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    },
  ) {
    const record = await this.approvals.get(id);
    if (!record) {
      throw new NotFoundException('Approval not found');
    }
    if (record.agent_slug !== agentSlug) {
      throw new NotFoundException('Approval does not belong to this agent');
    }
    if (record.organization_slug && record.organization_slug !== orgSlug) {
      throw new NotFoundException(
        'Approval does not belong to this organization',
      );
    }

    const reqUser = (
      req as unknown as {
        user?: { sub?: string; id?: string; userId?: string };
      }
    ).user;
    const userId = reqUser?.sub ?? reqUser?.id ?? reqUser?.userId ?? null;
    await this.approvals.setStatus(id, 'approved', userId);

    // Rehydrate the stored request and allow minimal overrides
    const metadata = record.metadata as
      | Record<string, unknown>
      | null
      | undefined;
    const stored: StoredRequest = (metadata?.request as StoredRequest) || {};
    const request = {
      mode: 'build' as const,
      conversationId:
        record.conversation_id ?? stored.conversationId ?? undefined,
      userMessage: stored.userMessage ?? undefined,
      payload: {
        ...(stored.payload || {}),
      },
      metadata: {
        ...(body?.metadata || {}),
      },
    };

    if (body?.payload) {
      request.payload = { ...(request.payload || {}), ...body.payload };
    }
    if (body?.options) {
      request.payload = request.payload || {};
      request.payload.options = {
        ...(request.payload.options || {}),
        ...body.options,
      } as Record<string, unknown>;
    }
    // If caller provided a pre-supplied streamId in metadata, mirror it into payload.metadata for downstream consumers
    if (request.metadata?.streamId) {
      request.metadata.stream = Boolean(
        request.metadata.stream || body?.options?.stream,
      );
      request.payload = request.payload || {};
      request.payload.metadata = {
        ...(request.payload.metadata || {}),
        streamId: request.metadata.streamId,
      } as Record<string, unknown>;
    }

    // Build ExecutionContext for approval continuation
    // Note: Some fields may not be stored in older approvals, use NIL_UUID as default
    const context: ExecutionContext = {
      orgSlug: record.organization_slug ?? orgSlug ?? 'global',
      userId: userId ?? 'unknown',
      conversationId:
        record.conversation_id ?? stored.conversationId ?? NIL_UUID,
      taskId: stored.taskId ?? NIL_UUID,
      planId: NIL_UUID, // Approvals don't store planId yet
      deliverableId: stored.deliverableId ?? NIL_UUID,
      agentSlug,
      agentType: stored.agentType ?? 'context',
      provider: stored.provider ?? 'anthropic',
      model: stored.model ?? 'claude-sonnet-4-20250514',
    };

    const response = await this.gateway.execute(
      context,
      request as unknown as TaskRequestDto,
    );

    // Attach approval context to response metadata (avoid mutating readonly types)
    const responseAny = response as unknown as Record<string, unknown>;
    const resp = {
      ...response,
      payload: {
        ...(responseAny.payload as Record<string, unknown>),
        metadata: {
          ...(((responseAny.payload as Record<string, unknown>)
            ?.metadata as Record<string, unknown>) || {}),
          approvalId: id,
          approvalStatus: 'approved',
        } as Record<string, unknown>,
      },
    };

    return resp as typeof response;
  }
}
