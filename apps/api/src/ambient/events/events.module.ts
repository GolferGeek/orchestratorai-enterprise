import { Module } from '@nestjs/common';
import { AmbientDatabaseModule } from '../ambient-database/database.module';
import { ListenersModule } from '../listeners/listeners.module';
import { StreamingModule } from '../streaming/streaming.module';
import { AmbientEventsService } from './ambient-events.service';
import { EventsController } from './events.controller';
import { StorageWatcherService } from './storage-watcher.service';
import { StorageWatchesController } from './storage-watches.controller';

/**
 * Push mode: named events handed to ambient (stored in ambient.events, then
 * emitted to the bus), and watched storage folders that push them when a file
 * lands. Export AmbientEventsService to push from other modules.
 */
@Module({
  imports: [AmbientDatabaseModule, ListenersModule, StreamingModule],
  controllers: [EventsController, StorageWatchesController],
  providers: [AmbientEventsService, StorageWatcherService],
  exports: [AmbientEventsService],
})
export class AmbientEventsModule {}
