import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  NotFoundException,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { ScenariosService, ScenarioOutcome } from './scenarios.service';

@Controller('ambient/scenarios')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
export class ScenariosController {
  constructor(private readonly scenariosService: ScenariosService) {}

  @Get()
  list(@Query('category') category?: string) {
    if (category) {
      return this.scenariosService.getByCategory(
        category as Parameters<ScenariosService['getByCategory']>[0],
      );
    }
    return this.scenariosService.list();
  }

  @Get('outcomes')
  getOutcomes(
    @Req() request: Request,
    @Query('scenarioId') scenarioId?: string,
  ) {
    return this.scenariosService.getOutcomes(
      this.requireOrganizationSlug(request),
      scenarioId,
    );
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    const scenario = this.scenariosService.getById(id);
    if (!scenario) {
      throw new NotFoundException(`Scenario ${id} not found`);
    }
    return scenario;
  }

  @Post('outcomes')
  recordOutcome(
    @Body() outcome: ScenarioOutcome,
    @Req() request: Request,
    @CurrentUser() user: { id: string },
  ) {
    if (
      !outcome ||
      typeof outcome.scenarioId !== 'string' ||
      !this.scenariosService.getById(outcome.scenarioId) ||
      typeof outcome.runId !== 'string' ||
      !outcome.runId.trim() ||
      !['passed', 'failed', 'partial'].includes(outcome.status) ||
      typeof outcome.stepResults !== 'object' ||
      outcome.stepResults === null ||
      Array.isArray(outcome.stepResults) ||
      Number.isNaN(Date.parse(outcome.completedAt))
    ) {
      throw new BadRequestException('Invalid scenario outcome');
    }
    this.scenariosService.recordOutcome(
      outcome,
      this.requireOrganizationSlug(request),
      user.id,
    );
    return { recorded: true, scenarioId: outcome.scenarioId };
  }

  private requireOrganizationSlug(request: Request): string {
    const orgSlug = (request as Request & { organizationSlug?: string })
      .organizationSlug;
    if (!orgSlug || orgSlug === '*') {
      throw new BadRequestException(
        'An explicit organizationSlug is required',
      );
    }
    return orgSlug;
  }
}
