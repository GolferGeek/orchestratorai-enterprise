import { Global, Module } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { RbacController } from './rbac.controller';
import { RbacGuard } from './guards/rbac.guard';
import { WorkflowRegistryModule } from '../workflows/catalog/workflow-registry.module';

@Global()
@Module({
  // WorkflowRegistryModule is @Global, but RbacService depends on the registry
  // to decide org visibility — an explicit import keeps that from depending on
  // module initialisation order.
  imports: [WorkflowRegistryModule],
  controllers: [RbacController],
  providers: [RbacService, RbacGuard],
  exports: [RbacService, RbacGuard],
})
export class RbacModule {}
