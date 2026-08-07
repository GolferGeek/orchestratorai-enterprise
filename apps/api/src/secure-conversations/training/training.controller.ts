import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { TrainingService } from './training.service';

@Controller('secure-conversations/training')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
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
