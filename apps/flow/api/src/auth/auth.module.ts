import { Global, Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { SupabaseModule } from '../planes/supabase-core/supabase.module';
import { DatabaseProviderModule } from '../data-pilot/database-provider.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { StreamTokenService } from './services/stream-token.service';
import { InternalIdentityLinkService } from './services/internal-identity-link.service';
import { SupabaseAuthService } from '../planes/auth/services/supabase-auth.service';
import { ExternalOidcAuthService } from '../planes/auth/services/external-oidc-auth.service';
import { AUTH_SERVICE } from '../planes/auth/interfaces/auth-service.interface';
import { RbacModule } from '../rbac/rbac.module';
import { IDENTITY_PROVIDER } from '../planes/auth/interfaces/identity-provider.interface';
import { SupabaseIdentityProvider } from '../planes/auth/providers/supabase-identity.provider';
import { Auth0IdentityProvider } from '../planes/auth/providers/auth0-identity.provider';
import { AzureOidcIdentityProvider } from '../planes/auth/providers/azure-oidc-identity.provider';
import { GoogleOidcIdentityProvider } from '../planes/auth/providers/google-oidc-identity.provider';

// Evaluated at module load time before NestJS DI wires anything.
// SupabaseModule, SupabaseAuthService, and SupabaseIdentityProvider are only
// registered when AUTH_PROVIDER is 'supabase'. On Azure (azure_oidc) and GCP
// (google_oidc) deployments they are excluded entirely to prevent
// SupabaseService from initialising without its required env vars.
const authProvider = process.env.AUTH_PROVIDER;
const needsSupabase = authProvider === 'supabase' || !authProvider;

@Global()
@Module({
  imports: [
    ...(needsSupabase ? [SupabaseModule] : []),
    DatabaseProviderModule,
    forwardRef(() => RbacModule),
  ],
  controllers: [AuthController],
  providers: [
    JwtAuthGuard,
    StreamTokenService,
    InternalIdentityLinkService,
    ...(needsSupabase ? [SupabaseAuthService, SupabaseIdentityProvider] : []),
    ExternalOidcAuthService,
    Auth0IdentityProvider,
    AzureOidcIdentityProvider,
    GoogleOidcIdentityProvider,
    {
      provide: IDENTITY_PROVIDER,
      useFactory: (
        configService: ConfigService,
        auth0IdentityProvider: Auth0IdentityProvider,
        azureOidcIdentityProvider: AzureOidcIdentityProvider,
        googleOidcIdentityProvider: GoogleOidcIdentityProvider,
        supabaseIdentityProvider?: SupabaseIdentityProvider,
      ) => {
        const provider = configService.get<string>('AUTH_PROVIDER');
        switch (provider) {
          case 'supabase':
            if (!supabaseIdentityProvider) {
              throw new Error(
                'SupabaseIdentityProvider not available — AUTH_PROVIDER is not supabase',
              );
            }
            return supabaseIdentityProvider;
          case 'auth0':
            return auth0IdentityProvider;
          case 'azure_oidc':
            return azureOidcIdentityProvider;
          case 'google_oidc':
            return googleOidcIdentityProvider;
          default:
            throw new Error(
              `Unsupported AUTH_PROVIDER '${provider}'. Expected one of: supabase, auth0, azure_oidc, google_oidc`,
            );
        }
      },
      // Non-supabase providers come first (always present).
      // SupabaseIdentityProvider is appended only when needsSupabase, making it
      // the last positional argument (supabaseIdentityProvider? in the factory).
      inject: [
        ConfigService,
        Auth0IdentityProvider,
        AzureOidcIdentityProvider,
        GoogleOidcIdentityProvider,
        ...(needsSupabase ? [SupabaseIdentityProvider] : []),
      ],
    },
    {
      provide: AUTH_SERVICE,
      useFactory: (
        configService: ConfigService,
        externalOidcAuthService: ExternalOidcAuthService,
        supabaseAuthService?: SupabaseAuthService,
      ) => {
        const provider = configService.get<string>('AUTH_PROVIDER');
        switch (provider) {
          case 'supabase':
            if (!supabaseAuthService) {
              throw new Error(
                'SupabaseAuthService not available — AUTH_PROVIDER is not supabase',
              );
            }
            return supabaseAuthService;
          case 'auth0':
          case 'azure_oidc':
          case 'google_oidc':
            return externalOidcAuthService;
          default:
            throw new Error(
              `Unsupported AUTH_PROVIDER '${provider}'. Expected one of: supabase, auth0, azure_oidc, google_oidc`,
            );
        }
      },
      // ExternalOidcAuthService comes first (always present).
      // SupabaseAuthService is appended only when needsSupabase, making it the
      // last positional argument (supabaseAuthService? in the factory).
      inject: [
        ConfigService,
        ExternalOidcAuthService,
        ...(needsSupabase ? [SupabaseAuthService] : []),
      ],
    },
  ],
  exports: [
    AUTH_SERVICE,
    JwtAuthGuard,
    StreamTokenService,
    InternalIdentityLinkService,
    IDENTITY_PROVIDER,
  ],
})
export class AuthModule {}
