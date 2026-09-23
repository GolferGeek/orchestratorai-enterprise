import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { DecisionRiskService } from './decision-risk.service';
import type { DecisionRiskResult } from './decision-risk.service';
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

  constructor(private readonly service: DecisionRiskService) {}

  @Post('assess')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('agents:execute')
  async assess(@Body() dto: DecisionRiskAssessDto): Promise<DecisionRiskResult> {
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

    return this.service.assess(dto.context, dto.proposition, dto.background ?? '');
  }
}
