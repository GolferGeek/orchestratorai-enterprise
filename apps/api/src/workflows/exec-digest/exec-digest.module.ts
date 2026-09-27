import { Inject, Module, OnModuleInit } from '@nestjs/common';
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import { CHECKPOINT_SAVER } from '@orchestratorai/planes/checkpointer';
import { WorkflowRegistry } from '../catalog/workflow.registry';
import { WorkflowExporterRegistry } from '../shared/export';
import { WorkflowRestartService } from '../shared/restarts';
import { WorkflowHandlerRegistry, createGraphHandler } from '../shared/runs';
import { WorkUnitService } from '../shared/work-units';
import { ActivityStoreService } from './activity-store.service';
import { execDigestExporter } from './exec-digest.exporter';
import { createExecDigestGraph } from './exec-digest.graph';
import { EXEC_DIGEST_SLUG, execDigestRunTitle, parseExecDigestInput } from './exec-digest.input';
import { execDigestResult } from './exec-digest.result';
import type { ExecDigestState } from './exec-digest.state';

/**
 * Corporate's weekly executive digest: each department's week in numbers
 * and a paragraph, and the company view. Runs on demand or every Friday
 * (an ambient cron trigger).
 */
@Module({ providers: [ActivityStoreService] })
export class ExecDigestModule implements OnModuleInit {
  constructor(
    private readonly registry: WorkflowRegistry,
    private readonly handlers: WorkflowHandlerRegistry,
    private readonly exporters: WorkflowExporterRegistry,
    private readonly units: WorkUnitService,
    private readonly restarts: WorkflowRestartService,
    private readonly store: ActivityStoreService,
    @Inject(CHECKPOINT_SAVER) private readonly checkpointer: BaseCheckpointSaver,
  ) {}

  onModuleInit(): void {
    const graph = createExecDigestGraph({ units: this.units, store: this.store, checkpointer: this.checkpointer });
    this.handlers.register(
      createGraphHandler<ExecDigestState>({
        slug: EXEC_DIGEST_SLUG,
        graph,
        restarts: this.restarts,
        start: (run) => ({ ...parseExecDigestInput(run.input) }),
        result: execDigestResult,
      }),
    );
    this.exporters.register(execDigestExporter);
    this.registry.register({
      slug: EXEC_DIGEST_SLUG,
      name: 'Weekly Exec Digest',
      description: 'Each department\'s week in numbers - workflow runs, agent conversations, open reviews, model cost - with a paragraph per department and a company summary.',
      organizationSlugs: ['corporate'],
      icon: 'newspaper',
      defaultGroup: 'Leadership',
      defaultLifecycle: 'dev',
      hitl: false,
      dataClassification: 'internal',
      entryPoint: {
        kind: 'runtime',
        maxAttempts: 2,
        modelRoles: ['writer'],
        accessControl: { mode: 'org' },
        parseStartInput: (input) => ({ ...parseExecDigestInput(input) }),
        runTitle: execDigestRunTitle,
        restartPoints: { 'summarize-departments': { resumeAt: 'compose' } },
      },
    });
  }
}
