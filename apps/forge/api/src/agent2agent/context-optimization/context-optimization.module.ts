/**
 * Context Optimization Module
 *
 * NestJS module that bundles all context optimization components:
 *
 * - **ContextOptimizationService** - Core service that trims conversation
 *   history to fit within token budgets using a layered scoring algorithm.
 *   Exported for use by agent runners and other A2A services.
 *
 * - **ContextMetricsListener** - In-memory rolling-buffer listener that
 *   captures 'context_optimization.metrics' events and computes aggregated
 *   statistics (optimization rate, compression ratio, processing percentiles).
 *
 * - **ContextMetricsController** - HTTP controller that exposes the aggregated
 *   metrics at GET /metrics/context/rollup for monitoring dashboards.
 *
 * Dependencies:
 * - AgentConversationsModule - Provides AgentConversationsService for history lookup
 * - DeliverablesModule - Provides DeliverablesService for work-product context extraction
 * - DATABASE_SERVICE provided by @Global DatabaseModule plane
 *
 * @module ContextOptimizationModule
 *
 * @example
 * ```typescript
 * // In your feature module:
 * imports: [ContextOptimizationModule]
 * // Then inject:
 * constructor(private readonly contextOptimization: ContextOptimizationService) {}
 * ```
 */
import { Module } from '@nestjs/common';
import { ContextOptimizationService } from './context-optimization.service';
import { ContextMetricsController } from './context-metrics.controller';
import { ContextMetricsListener } from './context-metrics.listener';
import { AgentConversationsModule } from '../conversations/agent-conversations.module';
import { DeliverablesModule } from '../deliverables/deliverables.module';

@Module({
  imports: [AgentConversationsModule, DeliverablesModule],
  controllers: [ContextMetricsController],
  providers: [ContextOptimizationService, ContextMetricsListener],
  exports: [ContextOptimizationService],
})
export class ContextOptimizationModule {}
