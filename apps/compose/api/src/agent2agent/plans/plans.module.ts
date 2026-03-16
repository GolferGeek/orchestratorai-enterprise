import { Module, forwardRef } from '@nestjs/common';
import { LLMModule } from '@/llms/llm.module';
import { TasksModule } from '../tasks/tasks.module';
import { PlansService } from './services/plans.service';
import { PlanVersionsService } from './services/plan-versions.service';
import { PlansRepository } from './repositories/plans.repository';
import { PlanVersionsRepository } from './repositories/plan-versions.repository';
import { PlansController } from './plans.controller';

@Module({
  imports: [forwardRef(() => LLMModule), forwardRef(() => TasksModule)],
  controllers: [PlansController],
  providers: [
    PlansService,
    PlanVersionsService,
    PlansRepository,
    PlanVersionsRepository,
  ],
  exports: [PlansService, PlanVersionsService],
})
export class PlansModule {}
