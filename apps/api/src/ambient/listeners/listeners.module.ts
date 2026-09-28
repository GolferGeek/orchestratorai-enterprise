import { Module } from '@nestjs/common';
import { ListenersController } from './listeners.controller';
import { ListenerRegistryService } from './listener-registry.service';
import { DbWatcherService } from './db-watcher.service';
import { FileWatcherService } from './file-watcher.service';
import { CronAdapterService } from './cron-adapter.service';
import { StreamingModule } from '../streaming/streaming.module';
import { EventBusModule } from '../event-bus/event-bus.module';
import { AmbientDatabaseModule } from '../ambient-database/database.module';

@Module({
  imports: [StreamingModule, EventBusModule, AmbientDatabaseModule],
  controllers: [ListenersController],
  providers: [
    ListenerRegistryService,
    DbWatcherService,
    FileWatcherService,
    CronAdapterService,
  ],
  exports: [
    ListenerRegistryService,
    DbWatcherService,
    FileWatcherService,
    CronAdapterService,
  ],
})
export class ListenersModule {}
