import { Module } from '@nestjs/common';
import { WorkflowsController } from './workflows.controller';
import { LegalDepartmentModule } from './legal-department/legal-department.module';
import { MarketingSwarmModule } from './marketing-swarm/marketing-swarm.module';
import { PersistenceModule } from './shared/persistence/persistence.module';
import { SharedServicesModule } from './shared/services/shared-services.module';

@Module({
  imports: [
    SharedServicesModule,
    PersistenceModule,
    LegalDepartmentModule,
    MarketingSwarmModule,
  ],
  controllers: [WorkflowsController],
})
export class WorkflowsModule {}
