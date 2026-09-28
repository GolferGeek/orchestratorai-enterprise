import { Inject, Module, OnModuleInit } from '@nestjs/common';
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import { CHECKPOINT_SAVER } from '@orchestratorai/planes/checkpointer';
import { WorkflowRegistry } from '../catalog/workflow.registry';
import { WorkflowAdminRegistry } from '../shared/admin';
import { WorkflowExporterRegistry } from '../shared/export';
import { WorkflowRestartService } from '../shared/restarts';
import { WorkflowHandlerRegistry, createGraphHandler } from '../shared/runs';
import { WorkUnitService } from '../shared/work-units';
import { swarmAdminSections } from './swarm.admin';
import { swarmExporter } from './swarm.exporter';
import { createSwarmGraph } from './swarm.graph';
import { SWARM_SLUG, parseSwarmInput, swarmRunTitle } from './swarm.input';
import { swarmResult } from './swarm.result';
import type { SwarmState } from './swarm.state';
import { SwarmStoreService } from './swarm-store.service';
import { SwarmOptionsController } from './swarm-options.controller';

/**
 * The marketing swarm on the workflow runtime: writers draft in their own
 * personas and models, Jev scores every facet, editors' gates and the
 * evaluators' standings are code, a coach explains what to fix, and a
 * person picks the winner. Configured in the workflow's admin.
 */
@Module({ controllers: [SwarmOptionsController], providers: [SwarmStoreService] })
export class MarketingSwarmModule implements OnModuleInit {
  constructor(
    private readonly registry: WorkflowRegistry,
    private readonly handlers: WorkflowHandlerRegistry,
    private readonly exporters: WorkflowExporterRegistry,
    private readonly admin: WorkflowAdminRegistry,
    private readonly units: WorkUnitService,
    private readonly restarts: WorkflowRestartService,
    private readonly store: SwarmStoreService,
    @Inject(CHECKPOINT_SAVER) private readonly checkpointer: BaseCheckpointSaver,
  ) {}

  onModuleInit(): void {
    const graph = createSwarmGraph({ units: this.units, store: this.store, checkpointer: this.checkpointer });
    this.handlers.register(
      createGraphHandler<SwarmState>({
        slug: SWARM_SLUG,
        graph,
        restarts: this.restarts,
        start: (run) => ({ input: parseSwarmInput(run.input) }),
        result: swarmResult,
      }),
    );
    this.exporters.register(swarmExporter);
    this.admin.register(SWARM_SLUG, swarmAdminSections(this.store));
    this.registry.register({
      slug: SWARM_SLUG,
      name: 'Marketing Swarm',
      description:
        'Several writers draft the same brief in their own voices and models. Every draft is scored on the same facets, editors send drafts back with coaching until they pass, evaluators rank the finalists, and you pick the winner.',
      organizationSlugs: ['marketing'],
      icon: 'megaphone',
      defaultGroup: 'Content',
      defaultLifecycle: 'dev',
      hitl: true,
      dataClassification: 'internal',
      entryPoint: {
        kind: 'runtime',
        maxAttempts: 1,
        modelRoles: ['coach'],
        accessControl: { mode: 'org' },
        parseStartInput: (input) => {
          const parsed = parseSwarmInput(input);
          return { ...parsed, brief: { ...parsed.brief } };
        },
        runTitle: swarmRunTitle,
        restartPoints: { write: { resumeAt: 'check' } },
      },
    });
  }
}
