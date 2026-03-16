import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { ScenariosService, ScenarioOutcome } from './scenarios.service';

@Controller('scenarios')
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
  getOutcomes(@Query('scenarioId') scenarioId?: string) {
    return this.scenariosService.getOutcomes(scenarioId);
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
  recordOutcome(@Body() outcome: ScenarioOutcome) {
    this.scenariosService.recordOutcome(outcome);
    return { recorded: true, scenarioId: outcome.scenarioId };
  }
}
