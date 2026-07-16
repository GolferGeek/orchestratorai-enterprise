import { Module } from '@nestjs/common';

/**
 * AuthModule — identity provider plane.
 *
 * Provides multi-cloud identity providers (Supabase, Auth0, Azure OIDC,
 * Google OIDC), auth services, guards, and decorators.
 *
 * Products wire their own AuthModule that registers the appropriate
 * identity provider based on env vars.
 */
@Module({})
export class AuthModule {}
