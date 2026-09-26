import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ConversationOwnershipService } from '../../common/conversations/conversation-ownership.service';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { DecisionRiskService } from './decision-risk.service';
import type { DecisionRiskRunHandle } from './decision-risk.service';
import {
  DecisionRiskAssessDto,
  DECISION_RISK_AGENT_SLUG,
  DECISION_RISK_AGENT_TYPE,
} from './dto/decision-risk-assess.dto';

/**
 * POST /workflows/decision-risk/assess
 *
 * The ExecutionContext originates in the frontend's executionContextStore and
 * flows through whole: validated here, handed to the service as one object,
 * placed on graph state as `executionContext`, and read by every node from
 * there. It is never reconstructed and never mutated.
 */
@Controller('workflows/decision-risk')
@UseGuards(JwtAuthGuard, RbacGuard)
export class DecisionRiskController {
  private readonly logger = new Logger(DecisionRiskController.name);

  constructor(
    private readonly service: DecisionRiskService,
    private readonly conversations: ConversationOwnershipService,
  ) {}

  /**
   * Start an assessment. Returns as soon as the run is opened.
   *
   * 202, not 200: the work has been accepted, not completed. A run takes two to
   * five minutes and this API sits behind a sixty-second proxy timeout, so
   * holding the connection produced a 504 while the workflow finished unseen.
   */
  @Post('assess')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermission('agents:execute')
  async assess(
    @Body() dto: DecisionRiskAssessDto,
    @CurrentUser() user: { id: string },
    @Req() request: { organizationSlug?: string },
  ): Promise<DecisionRiskRunHandle> {
    // The capsule must belong to the caller: the token's user, and the org
    // RBAC authorized (a super-admin with no org selected is bound to "*").
    if (
      dto.context.userId !== user.id ||
      !request.organizationSlug ||
      (request.organizationSlug !== '*' &&
        dto.context.orgSlug !== request.organizationSlug)
    ) {
      throw new ForbiddenException(
        'ExecutionContext must name the authenticated user and authorized organization.',
      );
    }

    // Shape is guaranteed by the pipe. What it cannot check is that the capsule
    // describes THIS workflow — a context addressed elsewhere would otherwise
    // be accepted and then attributed to decision-risk in usage and traces.
    if (
      dto.context.agentSlug !== DECISION_RISK_AGENT_SLUG ||
      dto.context.agentType !== DECISION_RISK_AGENT_TYPE
    ) {
      throw new BadRequestException(
        `ExecutionContext must address this workflow: expected agentSlug ` +
          `'${DECISION_RISK_AGENT_SLUG}' and agentType '${DECISION_RISK_AGENT_TYPE}', ` +
          `received '${dto.context.agentSlug}' / '${dto.context.agentType}'.`,
      );
    }

    // llm_usage and the run are keyed by conversationId; the row must exist
    // and belong to this caller before any LLM call is made under it.
    try {
      await this.conversations.ensure(dto.context);
    } catch (error) {
      this.logger.error(
        `Conversation check failed for ${dto.context.conversationId}: ${(error as Error).message}`,
      );
      throw new BadRequestException(
        'ExecutionContext.conversationId cannot be used for this run.',
      );
    }

    this.logger.log(
      `Starting decision-risk run ${dto.context.conversationId} for ${dto.context.orgSlug}`,
    );

    return this.service.startAssessment(
      dto.context,
      dto.proposition,
      dto.background ?? '',
    );
  }

  /**
   * Poll a run.
   *
   * Scoped to the caller's organization rather than trusting the id: a UUID is
   * hard to guess, which is not the same as being an authorisation check.
   */
  @Get('runs/:runId')
  @RequirePermission('agents:execute')
  async getRun(
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @Req() request: { organizationSlug?: string },
  ): Promise<Record<string, unknown>> {
    const organizationSlug = request.organizationSlug;
    if (!organizationSlug) {
      throw new BadRequestException(
        'No organization on the request; cannot scope a run lookup.',
      );
    }

    const run = await this.service.getRun(runId, organizationSlug);
    if (!run) {
      throw new NotFoundException(
        `No decision-risk run '${runId}' in organization '${organizationSlug}'.`,
      );
    }
    return run;
  }
}
