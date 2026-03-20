import { Controller, Post, Param, Get, Body, BadRequestException } from '@nestjs/common';
import { ProtocolConfig } from '@agent-communication/shared-types';
import { ScenarioService } from './scenario.service';

@Controller('scenarios')
export class ScenarioController {
  constructor(private readonly scenarioService: ScenarioService) {}

  @Post('run/:id')
  async runScenario(
    @Param('id') id: string,
    @Body() body?: { config?: Partial<ProtocolConfig> } | Partial<ProtocolConfig>,
  ) {
    const scenarioId = parseInt(id, 10);
    if (isNaN(scenarioId) || scenarioId < 6 || scenarioId > 15) {
      throw new BadRequestException(`Invalid scenario ID: ${id}. Must be 6-15.`);
    }
    const configOverrides: Partial<ProtocolConfig> | undefined =
      body && typeof body === 'object' && 'config' in body
        ? (body as { config?: Partial<ProtocolConfig> }).config
        : (body as Partial<ProtocolConfig> | undefined);
    return this.scenarioService.runScenario(scenarioId, configOverrides);
  }

  @Get('list')
  listScenarios() {
    return this.scenarioService.listScenarios();
  }
}
