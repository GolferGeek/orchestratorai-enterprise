import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FlowController, FlowGlobalController } from './flow.controller';
import { FlowTaskEventsController } from './flow-task-events.controller';
import { FlowService } from './flow.service';
import { FlowTaskEventsService } from './flow-task-events.service';
import { FlowSupabaseTaskSinkService } from '@orchestratorai/planes/work-routing/flow-supabase-task-sink.service';
import { AdoWorkItemTaskSinkService } from '@orchestratorai/planes/work-routing/ado-work-item-task-sink.service';
import { SlackWorkTaskSinkService } from '@orchestratorai/planes/work-routing/slack-work-task-sink.service';
import {
  WORK_TASK_SINK,
  WorkTaskSink,
} from '@orchestratorai/planes/work-routing/work-task-sink.interface';
import { DATABASE_SERVICE, DatabaseService } from '../database';
// DATABASE_SERVICE provided by @Global DatabaseModule plane
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [FlowController, FlowGlobalController, FlowTaskEventsController],
  providers: [
    FlowService,
    FlowTaskEventsService,
    {
      provide: WORK_TASK_SINK,
      useFactory: (
        configService: ConfigService,
        db: DatabaseService,
      ): WorkTaskSink => {
        const provider = configService.get<string>('WORK_PROVIDER') || 'flow';
        switch (provider) {
          case 'flow':
            return new FlowSupabaseTaskSinkService(db, configService);
          case 'slack':
            return new SlackWorkTaskSinkService(db, configService);
          case 'ado':
            return new AdoWorkItemTaskSinkService(configService, db);
          default:
            throw new Error(
              `Unsupported WORK_PROVIDER '${provider}'. Allowed values: flow, slack, ado`,
            );
        }
      },
      inject: [ConfigService, DATABASE_SERVICE],
    },
  ],
  exports: [FlowService, FlowTaskEventsService],
})
export class FlowModule {}
