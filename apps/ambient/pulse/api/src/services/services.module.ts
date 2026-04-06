import { Module } from '@nestjs/common';
import { EventBusModule } from '../event-bus/event-bus.module';
import { AmbientDatabaseModule } from '../ambient-database/database.module';
import { StreamingModule } from '../streaming/streaming.module';
import { TriggerEvaluatorService } from './trigger-evaluator.service';
import { TriggerExecutorService } from './trigger-executor.service';

/**
 * Services module — wires together the trigger evaluation and execution pipeline.
 *
 * TriggerEvaluatorService subscribes to the event bus and calls TriggerExecutorService.
 * TriggerExecutorService dispatches to remote A2A for agents in other products (Forge, Compose).
 */
@Module({
  imports: [
    EventBusModule,
    AmbientDatabaseModule,
    StreamingModule,
  ],
  providers: [TriggerEvaluatorService, TriggerExecutorService],
  exports: [TriggerEvaluatorService, TriggerExecutorService],
})
export class ServicesModule {}
