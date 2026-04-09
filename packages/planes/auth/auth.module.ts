import { Module } from '@nestjs/common';

/**
 * AuthModule — identity provider plane.
 *
 * Provides multi-cloud identity providers (Supabase, Auth0, Azure OIDC,
 * Google OIDC) and auth services. Guards and decorators live in
 * @orchestratorai/auth-client, not here.
 *
 * Products wire their own AuthModule that registers the appropriate
 * identity provider based on env vars and imports guards from
 * @orchestratorai/auth-client.
 */
@Module({})
export class AuthModule {}
