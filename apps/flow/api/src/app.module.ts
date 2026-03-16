import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './planes/database/database.module';
import { ConfigProviderModule } from './planes/config/config-provider.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { SystemModule } from './system/system.module';
import { TeamsModule } from './teams/teams.module';
import { FlowModule } from './flow/flow.module';
import { RbacModule } from './rbac/rbac.module';

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
    DatabaseModule,
    ConfigProviderModule,
    AuthModule,
    HealthModule,
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),

    // Flow Productivity Modules
    RbacModule,
    TeamsModule,
    SystemModule,
    FlowModule, // Flow app endpoints (efforts, projects, tasks, sprints, files)
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
