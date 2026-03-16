import { Module } from '@nestjs/common';
import { MarketingSwarmController } from './marketing-swarm.controller';
import { MarketingSwarmService } from './marketing-swarm.service';
import { MarketingDbService } from './marketing-db.service';
import { DualTrackProcessorService } from './dual-track-processor.service';

/**
 * MarketingSwarmModule
 *
 * Provides the Marketing Swarm agent for generating marketing content
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
  controllers: [MarketingSwarmController],
  providers: [
    MarketingSwarmService,
    MarketingDbService,
    DualTrackProcessorService,
  ],
  exports: [
    MarketingSwarmService,
    MarketingDbService,
    DualTrackProcessorService,
  ],
})
export class MarketingSwarmModule {}
