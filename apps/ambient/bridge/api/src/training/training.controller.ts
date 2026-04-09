import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { BridgeJwtAuthGuard as JwtAuthGuard } from '@orchestratorai/auth-client';
import { TrainingService } from './training.service';

@Controller('training')
@UseGuards(JwtAuthGuard)
export class TrainingController {
  constructor(private readonly training: TrainingService) {}

  @Get('scenarios')
  listScenarios() {
    return this.training.listScenarios();
  }

  @Get('scenarios/:id')
  getScenario(@Param('id') id: string) {
    const scenario = this.training.getScenario(id);
    if (!scenario) {
      return { error: `Scenario not found: ${id}` };
    }
    return scenario;
  }

  @Get('docs')
  getDocumentation() {
    return this.training.getDocumentation();
  }
}
