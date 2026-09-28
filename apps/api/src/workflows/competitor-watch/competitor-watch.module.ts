import { WorkflowAdminRegistry } from '../shared/admin';
import { competitorWatchAdminSections } from './competitor-watch.admin';
import { Inject, Module, OnModuleInit } from '@nestjs/common';
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import { CHECKPOINT_SAVER } from '@orchestratorai/planes/checkpointer';
import { SecurityModule } from '../../secure-conversations/security/security.module';
import { WorkflowRegistry } from '../catalog/workflow.registry';
import { WorkflowExporterRegistry } from '../shared/export';
import { WorkflowRestartService } from '../shared/restarts';
import { WorkflowHandlerRegistry, createGraphHandler } from '../shared/runs';
import { WorkUnitService } from '../shared/work-units';
import { CompetitorSourcesController } from './competitor-sources.controller';
import { competitorWatchExporter } from './competitor-watch.exporter';
import { createCompetitorWatchGraph } from './competitor-watch.graph';
import { COMPETITOR_WATCH_SLUG, competitorWatchRunTitle, parseCompetitorWatchInput } from './competitor-watch.input';
import { competitorWatchResult } from './competitor-watch.result';
import type { CompetitorWatchState } from './competitor-watch.state';
import { PageFetcherService } from './page-fetcher.service';
import { SourcesStoreService } from './sources-store.service';

/**
 * Marketing's competitor watch: what changed on the pages it follows, which
 * changes matter (Jev), and a write-up of those. Weekly on Monday mornings,
 * or on demand against the Internet Archive's copy from a quarter ago.
 */
@Module({
  imports: [SecurityModule],
  controllers: [CompetitorSourcesController],
  providers: [SourcesStoreService, PageFetcherService],
})
export class CompetitorWatchModule implements OnModuleInit {
  constructor(
    private readonly registry: WorkflowRegistry,
    private readonly handlers: WorkflowHandlerRegistry,
    private readonly exporters: WorkflowExporterRegistry,
    private readonly units: WorkUnitService,
    private readonly restarts: WorkflowRestartService,
    private readonly store: SourcesStoreService,
    private readonly fetcher: PageFetcherService,
    private readonly admin: WorkflowAdminRegistry,
    @Inject(CHECKPOINT_SAVER) private readonly checkpointer: BaseCheckpointSaver,
  ) {}

  onModuleInit(): void {
    const graph = createCompetitorWatchGraph({ units: this.units, store: this.store, fetcher: this.fetcher, checkpointer: this.checkpointer });
    this.handlers.register(
      createGraphHandler<CompetitorWatchState>({
        slug: COMPETITOR_WATCH_SLUG,
        graph,
        restarts: this.restarts,
        start: (run) => ({ ...parseCompetitorWatchInput(run.input) }),
        result: competitorWatchResult,
      }),
    );
    this.exporters.register(competitorWatchExporter);
    this.admin.register(COMPETITOR_WATCH_SLUG, competitorWatchAdminSections(this.store));
    this.registry.register({
      slug: COMPETITOR_WATCH_SLUG,
      name: 'Competitor Watch',
      description: 'What changed on the competitor pages you follow, which changes matter (checked by Jev), and a short write-up of those.',
      organizationSlugs: ['marketing'],
      icon: 'eye',
      defaultGroup: 'Market Intelligence',
      defaultLifecycle: 'dev',
      hitl: false,
      dataClassification: 'internal',
      entryPoint: {
        kind: 'runtime',
        maxAttempts: 2,
        modelRoles: ['writer'],
        accessControl: { mode: 'org' },
        parseStartInput: (input) => ({ ...parseCompetitorWatchInput(input) }),
        runTitle: competitorWatchRunTitle,
        restartPoints: { 'classify-changes': { resumeAt: 'summarize' } },
      },
    });
  }
}
