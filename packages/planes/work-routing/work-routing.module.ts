import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DATABASE_SERVICE, DatabaseService } from '../database/database.interface';
import { AdoWorkItemTaskSinkService } from './ado-work-item-task-sink.service';
import { FlowSupabaseTaskSinkService } from './flow-supabase-task-sink.service';
import { SlackWorkTaskSinkService } from './slack-work-task-sink.service';
import { WORK_TASK_SINK, WorkTaskSink } from './work-task-sink.interface';

/**
 * Registers {@link WORK_TASK_SINK} for products that need work-item routing (Compose, Forge, Auth smoke scripts).
 * `WORK_PROVIDER` selects the implementation; default is `slack`.
 */
@Module({
  providers: [
    {
      provide: WORK_TASK_SINK,
      useFactory: (
        configService: ConfigService,
        db: DatabaseService,
      ): WorkTaskSink => {
        const provider = configService.get<string>('WORK_PROVIDER') || 'slack';
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
  exports: [WORK_TASK_SINK],
})
export class WorkRoutingModule {}
