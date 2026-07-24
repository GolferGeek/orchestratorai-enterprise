import { Global, Module, forwardRef } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { StreamTokenService } from './services/stream-token.service';
import {
  AuthClient,
  AuthModule as AuthProviderModule,
  IDENTITY_LINK_DATABASE_PROVIDER,
  DATABASE_PROVIDER,
  DatabaseProvider,
  RemoteJwtAuthGuard,
  RemoteRbacGuard,
} from '@orchestratorai/planes/auth';
import { RbacModule } from '../rbac/rbac.module';
import { EntitlementsModule } from './entitlements/entitlements.module';

@Global()
@Module({
  imports: [
    AuthProviderModule,
    forwardRef(() => RbacModule),
    EntitlementsModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthClient,
    RemoteJwtAuthGuard,
    RemoteRbacGuard,
    JwtAuthGuard,
    StreamTokenService,
    {
      provide: IDENTITY_LINK_DATABASE_PROVIDER,
      useFactory: (db: DatabaseProvider) => db,
      inject: [DATABASE_PROVIDER],
    },
  ],
  exports: [
    AuthProviderModule,
    AuthClient,
    RemoteJwtAuthGuard,
    RemoteRbacGuard,
    JwtAuthGuard,
    StreamTokenService,
    IDENTITY_LINK_DATABASE_PROVIDER,
  ],
})
export class AuthModule {}
