import { Module } from '@nestjs/common';
import { AmbientDatabaseModule } from '../ambient-database/database.module';
import { ListenersModule } from '../listeners/listeners.module';
import { StreamingModule } from '../streaming/streaming.module';
import { AmbientEventsService } from './ambient-events.service';
import { EventsController } from './events.controller';

/**
 * Push mode: named events handed to ambient (stored in ambient.events, then
 * emitted to the bus). Export AmbientEventsService to push from other modules.
 */
@Module({
  imports: [AmbientDatabaseModule, ListenersModule, StreamingModule],
  controllers: [EventsController],
  providers: [AmbientEventsService],
  exports: [AmbientEventsService],
})
export class AmbientEventsModule {}
