import { Inject, Module, OnModuleInit } from '@nestjs/common';
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import { CHECKPOINT_SAVER } from '@orchestratorai/planes/checkpointer';
import { WorkflowRegistry } from '../catalog/workflow.registry';
import { WorkflowDocumentsService } from '../shared/documents/workflow-documents.service';
import { WorkflowExporterRegistry } from '../shared/export';
import { IssueLedgerService } from '../shared/ledger';
import { WorkflowRestartService } from '../shared/restarts';
import { WorkflowHandlerRegistry, createGraphHandler } from '../shared/runs';
import { WorkUnitService } from '../shared/work-units';
import { SpecLibraryService } from './spec-library.service';
import { SpecSectionsController } from './spec-sections.controller';
import { SubmittalDecisionsService } from './submittal-decisions.service';
import { submittalReviewExporter } from './submittal-review.exporter';
import { createSubmittalReviewGraph } from './submittal-review.graph';
import { SUBMITTAL_REVIEW_SLUG, parseSubmittalReviewInput, submittalReviewRunTitle } from './submittal-review.input';
import { submittalReviewResult } from './submittal-review.result';
import type { SubmittalReviewState } from './submittal-review.state';

/**
 * Building's submittal review: a contractor's product data checked against
 * the project specification, requirement by requirement, with Jev verifying
 * the quoted evidence, a reviewer's confirmation, and the response letter.
 */
@Module({
  controllers: [SpecSectionsController],
  providers: [SpecLibraryService, SubmittalDecisionsService],
})
export class SubmittalReviewModule implements OnModuleInit {
  constructor(
    private readonly registry: WorkflowRegistry,
    private readonly handlers: WorkflowHandlerRegistry,
    private readonly exporters: WorkflowExporterRegistry,
    private readonly units: WorkUnitService,
    private readonly restarts: WorkflowRestartService,
    private readonly ledger: IssueLedgerService,
    private readonly documents: WorkflowDocumentsService,
    private readonly specs: SpecLibraryService,
    private readonly decisions: SubmittalDecisionsService,
    @Inject(CHECKPOINT_SAVER) private readonly checkpointer: BaseCheckpointSaver,
  ) {}

  onModuleInit(): void {
    const graph = createSubmittalReviewGraph({ units: this.units, specs: this.specs, documents: this.documents, ledger: this.ledger, decisions: this.decisions, checkpointer: this.checkpointer });
    this.handlers.register(
      createGraphHandler<SubmittalReviewState>({
        slug: SUBMITTAL_REVIEW_SLUG,
        graph,
        restarts: this.restarts,
        start: (run) => ({ ...parseSubmittalReviewInput(run.input), documents: run.documents }),
        result: submittalReviewResult,
      }),
    );
    this.exporters.register(submittalReviewExporter);
    this.registry.register({
      slug: SUBMITTAL_REVIEW_SLUG,
      name: 'Submittal Review',
      description: 'Check a contractor\'s product submittal against the project specification requirement by requirement; Jev verifies the evidence, you confirm, and the response letter is drafted.',
      organizationSlugs: ['building'],
      icon: 'clipboard',
      defaultGroup: 'Construction Administration',
      defaultLifecycle: 'dev',
      hitl: true,
      dataClassification: 'internal',
      entryPoint: {
        kind: 'runtime',
        maxAttempts: 2,
        modelRoles: ['analyst', 'writer'],
        accessControl: { mode: 'org' },
        parseStartInput: (input) => ({ ...parseSubmittalReviewInput(input) }),
        runTitle: submittalReviewRunTitle,
        restartPoints: { 'verify-evidence': { resumeAt: 'review' }, 'review-findings': { resumeAt: 'respond' } },
      },
    });
  }
}
