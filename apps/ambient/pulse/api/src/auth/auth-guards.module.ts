import { Global, Module } from '@nestjs/common';
import { InProcessJwtAuthGuard, InProcessRbacGuard } from '@orchestratorai/auth-client';

@Global()
@Module({
  providers: [InProcessJwtAuthGuard, InProcessRbacGuard],
  exports: [InProcessJwtAuthGuard, InProcessRbacGuard],
})
export class AuthGuardsModule {}
