import { Module } from '@nestjs/common';
import { TriggersController } from './triggers.controller';

/**
 * TriggersModule exposes CRUD endpoints for Pulse triggers.
 * DatabaseModule and EventBusModule are both global — their services
 * are available to all modules without explicit imports.
 */
@Module({
  controllers: [TriggersController],
})
export class TriggersModule {}
