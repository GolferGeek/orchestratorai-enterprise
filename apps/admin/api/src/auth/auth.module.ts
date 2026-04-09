import { Global, Module } from '@nestjs/common';
import { AuthClient } from './auth-client.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RbacGuard } from './rbac.guard';

@Global()
@Module({
  providers: [AuthClient, JwtAuthGuard, RbacGuard],
  exports: [AuthClient, JwtAuthGuard, RbacGuard],
})
export class AuthModule {}
