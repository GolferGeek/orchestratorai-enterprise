import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseProviderModule } from './client/data-pilot/database-provider.module';
import { InternalIdentityLinkService } from './client/services/internal-identity-link.service';
import {
  AUTH_SERVICE,
  AuthServiceProvider,
} from './interfaces/auth-service.interface';
import {
  IDENTITY_PROVIDER,
  IdentityProvider,
} from './interfaces/identity-provider.interface';
import { Auth0IdentityProvider } from './providers/auth0-identity.provider';
import { AzureOidcIdentityProvider } from './providers/azure-oidc-identity.provider';
import { GoogleOidcIdentityProvider } from './providers/google-oidc-identity.provider';
import { SupabaseIdentityProvider } from './providers/supabase-identity.provider';
import { ExternalOidcAuthService } from './services/external-oidc-auth.service';
import { SupabaseAuthService } from './services/supabase-auth.service';

/**
 * Auth provider plane. Product auth modules own controllers, guards, and
 * entitlements; provider selection remains entirely inside this module.
 */
const authProvider = process.env.AUTH_PROVIDER ?? 'supabase';
const needsSupabase = authProvider === 'supabase';

@Global()
@Module({
  imports: [DatabaseProviderModule],
  providers: [
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
        auth0Provider: Auth0IdentityProvider,
        azureProvider: AzureOidcIdentityProvider,
        googleProvider: GoogleOidcIdentityProvider,
        supabaseProvider?: SupabaseIdentityProvider,
      ): IdentityProvider => {
        const provider = configService.getOrThrow<string>('AUTH_PROVIDER');
        switch (provider) {
          case 'supabase':
            if (!supabaseProvider) {
              throw new Error(
                'SupabaseIdentityProvider is unavailable when AUTH_PROVIDER is not supabase',
              );
            }
            return supabaseProvider;
          case 'auth0':
            return auth0Provider;
          case 'azure_oidc':
            return azureProvider;
          case 'google_oidc':
            return googleProvider;
          default:
            throw new Error(
              `Unsupported AUTH_PROVIDER '${provider}'. Expected: supabase, auth0, azure_oidc, google_oidc`,
            );
        }
      },
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
        externalOidcService: ExternalOidcAuthService,
        supabaseService?: SupabaseAuthService,
      ): AuthServiceProvider => {
        const provider = configService.getOrThrow<string>('AUTH_PROVIDER');
        switch (provider) {
          case 'supabase':
            if (!supabaseService) {
              throw new Error(
                'SupabaseAuthService is unavailable when AUTH_PROVIDER is not supabase',
              );
            }
            return supabaseService;
          case 'auth0':
          case 'azure_oidc':
          case 'google_oidc':
            return externalOidcService;
          default:
            throw new Error(
              `Unsupported AUTH_PROVIDER '${provider}'. Expected: supabase, auth0, azure_oidc, google_oidc`,
            );
        }
      },
      inject: [
        ConfigService,
        ExternalOidcAuthService,
        ...(needsSupabase ? [SupabaseAuthService] : []),
      ],
    },
  ],
  exports: [AUTH_SERVICE, IDENTITY_PROVIDER],
})
export class AuthModule {}
