/**
 * Risk Runner Controller
 *
 * REST endpoints for the risk runner agent dashboard operations and runner triggers.
 * Provides direct HTTP access to the risk dashboard (bypasses A2A for internal use).
 */

import {
  Controller,
  Post,
  Body,
  Param,
  Logger,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { Public } from '@/auth/decorators/public.decorator';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '../shared/types/forge-types';
import { RiskRunnerService, RiskRunnerResult } from './risk-runner.service';

interface DashboardRequestBody {
  context: ExecutionContext;
  action: string;
  payload: DashboardRequestPayload;
}

interface RunnerTriggerBody {
  context: ExecutionContext;
  runner: string;
}

@Controller('agents/risk-runner')
@UseGuards(JwtAuthGuard)
export class RiskRunnerController {
  private readonly logger = new Logger(RiskRunnerController.name);

  constructor(private readonly riskRunnerService: RiskRunnerService) {}

  /**
   * Dashboard mode endpoint
   * POST /agents/risk-runner/dashboard
   */
  @Post('dashboard')
  @HttpCode(HttpStatus.OK)
  async dashboard(
    @Body() body: DashboardRequestBody,
  ): Promise<RiskRunnerResult> {
    this.logger.debug(
      `[RISK-CONTROLLER] dashboard - action: ${body.action}, org: ${body.context.orgSlug}`,
    );

    return this.riskRunnerService.process({
      context: body.context,
      mode: 'dashboard',
      action: body.action,
      payload: body.payload,
    });
  }

  /**
   * Runner trigger endpoint (authenticated)
   * POST /agents/risk-runner/trigger
   */
  @Post('trigger')
  @HttpCode(HttpStatus.OK)
  async trigger(@Body() body: RunnerTriggerBody): Promise<RiskRunnerResult> {
    this.logger.debug(`[RISK-CONTROLLER] trigger - runner: ${body.runner}`);

    return this.riskRunnerService.process({
      context: body.context,
      mode: 'runner',
      action: body.runner,
    });
  }

  /**
   * Manual runner trigger (dev/admin, no auth)
   * POST /agents/risk-runner/trigger/:runner
   *
   * Available runners: analysis, evaluation, learning, alert
   */
  @Post('trigger/:runner')
  @Public()
  @HttpCode(HttpStatus.OK)
  async triggerRunner(
    @Param('runner') runner: string,
  ): Promise<RiskRunnerResult> {
    this.logger.log(`Manual trigger for risk runner: ${runner}`);

    return this.riskRunnerService.process({
      context: {
        orgSlug: 'global',
        userId: 'system',
        conversationId: `manual-risk-${runner}-${Date.now()}`,
        agentSlug: 'risk-runner',
        agentType: 'langgraph',
        provider: 'default',
        model: 'default',
      },
      mode: 'runner',
      action: runner,
    });
  }
}
