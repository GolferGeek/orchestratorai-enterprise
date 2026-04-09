import { Global, Module } from '@nestjs/common';
import {
  InProcessJwtAuthGuard,
  InProcessRbacGuard,
  IDENTITY_PROVIDER as AUTH_CLIENT_IDENTITY_PROVIDER,
  AUTH_SERVICE as AUTH_CLIENT_AUTH_SERVICE,
  STREAM_TOKEN_SERVICE as AUTH_CLIENT_STREAM_TOKEN_SERVICE,
  RBAC_SERVICE as AUTH_CLIENT_RBAC_SERVICE,
} from '@orchestratorai/auth-client';
import { IDENTITY_PROVIDER } from '@orchestratorai/planes/auth/interfaces/identity-provider.interface';
import type { IdentityProvider } from '@orchestratorai/planes/auth/interfaces/identity-provider.interface';
import { AUTH_SERVICE } from '@orchestratorai/planes/auth/interfaces/auth-service.interface';
import type { AuthServiceProvider } from '@orchestratorai/planes/auth/interfaces/auth-service.interface';
import { StreamTokenService } from './services/stream-token.service';
import { RbacService } from '../rbac/rbac.service';

/**
 * Bridges the shared @orchestratorai/auth-client guards into Forge's DI graph.
 *
 * The auth-client package defines its own injection tokens (Symbols) for
 * IDENTITY_PROVIDER, AUTH_SERVICE, STREAM_TOKEN_SERVICE, and RBAC_SERVICE.
 * Forge already provides the concrete implementations via AuthModule (planes
 * symbols) and RbacModule (RbacService class).  This module maps them so the
 * shared guards can resolve their dependencies.
 */
@Global()
@Module({
  providers: [
    // Bridge planes tokens → auth-client tokens
    {
      provide: AUTH_CLIENT_IDENTITY_PROVIDER,
      useFactory: (impl: IdentityProvider) => impl,
      inject: [IDENTITY_PROVIDER],
    },
    {
      provide: AUTH_CLIENT_AUTH_SERVICE,
      useFactory: (impl: AuthServiceProvider) => impl,
      inject: [AUTH_SERVICE],
    },
    {
      provide: AUTH_CLIENT_STREAM_TOKEN_SERVICE,
      useExisting: StreamTokenService,
    },
    {
      provide: AUTH_CLIENT_RBAC_SERVICE,
      useExisting: RbacService,
    },
    // The guards themselves
    InProcessJwtAuthGuard,
    InProcessRbacGuard,
  ],
  exports: [InProcessJwtAuthGuard, InProcessRbacGuard],
})
export class AuthGuardsModule {}
