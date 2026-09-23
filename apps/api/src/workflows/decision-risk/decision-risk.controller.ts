import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { DecisionRiskService } from './decision-risk.service';
import type { DecisionRiskResult } from './decision-risk.service';

interface AssessBody {
  context: ExecutionContext;
  proposition: string;
  background?: string;
}

/**
 * POST /workflows/decision-risk/assess
 *
 * The ExecutionContext arrives from the frontend and is passed through whole —
 * never rebuilt here.
 */
@Controller('workflows/decision-risk')
@UseGuards(JwtAuthGuard, RbacGuard)
export class DecisionRiskController {
  private readonly logger = new Logger(DecisionRiskController.name);

  constructor(private readonly service: DecisionRiskService) {}

  @Post('assess')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('agents:execute')
  async assess(@Body() body: AssessBody): Promise<DecisionRiskResult> {
    if (!body?.context) {
      throw new Error('decision-risk requires an ExecutionContext.');
    }
    if (!body.proposition?.trim()) {
      throw new Error('decision-risk requires a proposition to assess.');
    }

    return this.service.assess(
      body.context,
      body.proposition,
      body.background ?? '',
    );
  }
}
