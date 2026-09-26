import { Module, OnModuleInit } from '@nestjs/common';
import { MarketingSwarmController } from './marketing-swarm.controller';
import { MarketingSwarmService } from './marketing-swarm.service';
import { MarketingSwarmInvokeService } from './marketing-swarm-invoke.service';
import { MarketingDbService } from './marketing-db.service';
import { DualTrackProcessorService } from './dual-track-processor.service';
import { SharedServicesModule } from '../shared/services/shared-services.module';
import { WorkflowRegistry } from '../catalog/workflow.registry';

/**
 * MarketingSwarmModule
 *
 * Provides the Marketing Swarm workflow for generating marketing content
 * through multiple writer/editor/evaluator agents.
 *
 * Phase 2 Architecture:
 * - Database-driven state machine (no in-memory state)
 * - Dual-track execution (local sequential, cloud parallel)
 * - Fat SSE messages with full row data
 * - Two-stage evaluation (initial 1-10 scoring, final weighted ranking)
 *
 * The workflow:
 * 1. Build output matrix (writers × editors)
 * 2. Process writing with dual-track execution
 * 3. Process editing with edit cycles (up to maxEditCycles)
 * 4. Initial evaluation (all evaluators × all outputs, 1-10 scores)
 * 5. Select top N finalists
 * 6. Final ranking (forced 1-5 ranking with weighted points)
 */
@Module({
  imports: [SharedServicesModule],
  controllers: [MarketingSwarmController],
  providers: [
    MarketingSwarmService,
    MarketingSwarmInvokeService,
    MarketingDbService,
    DualTrackProcessorService,
  ],
  exports: [
    MarketingSwarmService,
    MarketingDbService,
    DualTrackProcessorService,
  ],
})
export class MarketingSwarmModule implements OnModuleInit {
  constructor(
    private readonly registry: WorkflowRegistry,
    private readonly invoker: MarketingSwarmInvokeService,
  ) {}

  /**
   * The workflow announces itself to the catalog. It used to be listed via a
   * row in the `agents` table plus a hardcoded slug constant; it needs neither.
   */
  onModuleInit(): void {
    this.registry.register({
      slug: 'marketing-swarm',
      name: 'Marketing Swarm',
      description:
        'Multiple writer, editor and evaluator agents draft, refine and rank marketing content.',
      organizationSlugs: ['marketing'],
      entryPoint: {
        kind: 'custom',
        invoke: (body, userId, organizationSlug) =>
          this.invoker.invoke(body, userId, organizationSlug),
      },
    });
  }
}
