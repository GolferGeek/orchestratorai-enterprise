import { Module } from '@nestjs/common';
import { EventBusModule } from '../event-bus/event-bus.module';
import { AmbientDatabaseModule } from '../ambient-database/database.module';
import { StreamingModule } from '../streaming/streaming.module';
import { PredictorModule } from '../processing/predictor/predictor.module';
import { RiskRunnerModule } from '../processing/risk-runner/risk-runner.module';
import { CrawlerModule } from '../crawler/crawler.module';
import { TriggerEvaluatorService } from './trigger-evaluator.service';
import { TriggerExecutorService } from './trigger-executor.service';

/**
 * Services module — wires together the trigger evaluation and execution pipeline.
 *
 * TriggerEvaluatorService subscribes to the event bus and calls TriggerExecutorService.
 * TriggerExecutorService dispatches to local processing services (predictor, risk-runner,
 * crawler) directly, or falls back to remote A2A for agents in other products.
 */
@Module({
  imports: [
    EventBusModule,
    AmbientDatabaseModule,
    StreamingModule,
    PredictorModule,
    RiskRunnerModule,
    CrawlerModule,
  ],
  providers: [TriggerEvaluatorService, TriggerExecutorService],
  exports: [TriggerEvaluatorService, TriggerExecutorService],
})
export class ServicesModule {}
