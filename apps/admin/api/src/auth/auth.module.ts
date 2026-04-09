import { Global, Module } from '@nestjs/common';
import {
  AuthClient,
  RemoteJwtAuthGuard,
  RemoteRbacGuard,
} from '@orchestratorai/auth-client';

@Global()
@Module({
  providers: [AuthClient, RemoteJwtAuthGuard, RemoteRbacGuard],
  exports: [AuthClient, RemoteJwtAuthGuard, RemoteRbacGuard],
})
export class AuthModule {}
