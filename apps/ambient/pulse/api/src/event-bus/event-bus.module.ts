import { Global, Module } from '@nestjs/common';
import { AmbientEventBusService } from './ambient-event-bus.service';

/**
 * Global event bus module — all adapter modules can inject AmbientEventBusService
 * without needing to import EventBusModule individually.
 */
@Global()
@Module({
  providers: [AmbientEventBusService],
  exports: [AmbientEventBusService],
})
export class EventBusModule {}
