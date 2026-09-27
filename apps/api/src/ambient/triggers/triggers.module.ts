import { Module } from '@nestjs/common';
import { TriggersController } from './triggers.controller';
import { ListenersModule } from '../listeners/listeners.module';

/**
 * TriggersModule exposes CRUD endpoints for Ambient triggers.
 * DatabaseModule and EventBusModule are both global — their services
 * are available to all modules without explicit imports.
 */
@Module({
  imports: [ListenersModule],
  controllers: [TriggersController],
})
export class TriggersModule {}
