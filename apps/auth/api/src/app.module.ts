import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from '@orchestratorai/planes/database';
import { ConfigProviderModule } from '@orchestratorai/planes/config';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { RbacModule } from './rbac/rbac.module';
import { OrganizationsModule } from './admin/organizations/organizations.module';
import { AuthOrganizationsModule } from './auth/organizations/auth-organizations.module';
import { TeamsModule } from './teams/teams.module';
import { SuperAdminModule } from './super-admin/super-admin.module';
import { SystemModule } from './system/system.module';
import { SystemConfigModule } from './admin/system-config/system-config.module';
import { EntitlementsModule } from './entitlements/entitlements.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        // Use ENV_FILE if explicitly set, otherwise try standard locations
        process.env.ENV_FILE || '',
        // Profile overlay (ENV_PROFILE=azure loads .env.azure before .env)
        ...(process.env.ENV_PROFILE
          ? [
              join(__dirname, `../../../.env.${process.env.ENV_PROFILE}`),
              join(__dirname, `../../../../.env.${process.env.ENV_PROFILE}`),
              join(process.cwd(), `.env.${process.env.ENV_PROFILE}`),
            ]
          : []),
        // Base .env (local-first baseline)
        join(__dirname, '../../../.env'),
        join(__dirname, '../../../../.env'),
        join(process.cwd(), '.env'),
      ].filter(Boolean),
      expandVariables: true,
    }),
    // Core Infrastructure
    HttpModule,
    DatabaseModule,
    ConfigProviderModule,

    // Auth — login, logout, JWT issuance/validation
    AuthModule,

    // Health check
    HealthModule,

    // RBAC — roles, permissions
    RbacModule,

    // Org management (Admin Web calls these)
    OrganizationsModule,

    // Org management mirrored at /auth/organizations (for other products calling Auth API)
    AuthOrganizationsModule,

    // Team management (users within orgs)
    TeamsModule,

    // System health and config endpoints (dev/ops)
    SystemModule,

    // Super-admin panel (Claude Code integration, dev-only)
    SuperAdminModule,

    // System config CRUD — Admin Web calls GET/PUT /admin/system/config
    SystemConfigModule,

    // Entitlements — product access per org
    EntitlementsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
