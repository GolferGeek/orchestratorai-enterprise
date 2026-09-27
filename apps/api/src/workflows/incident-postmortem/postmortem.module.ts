import { Inject, Module, OnModuleInit } from '@nestjs/common';
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import { CHECKPOINT_SAVER } from '@orchestratorai/planes/checkpointer';
import { CONFIG_PROVIDER_SERVICE, type ConfigProvider } from '@orchestratorai/planes/config';
import { WorkflowRegistry } from '../catalog/workflow.registry';
import { WorkflowExporterRegistry } from '../shared/export';
import { WorkflowRestartService } from '../shared/restarts';
import { WorkflowHandlerRegistry, createGraphHandler } from '../shared/runs';
import { WorkUnitService } from '../shared/work-units';
import { postmortemExporter } from './postmortem.exporter';
import { createPostmortemGraph } from './postmortem.graph';
import { POSTMORTEM_SLUG, parsePostmortemInput, postmortemRunTitle } from './postmortem.input';
import { postmortemResult } from './postmortem.result';
import type { PostmortemState } from './postmortem.state';
import { PostmortemTasksService } from './postmortem-tasks.service';

/**
 * Engineering's incident postmortem: Jev rates the severity, a writer drafts
 * the blameless postmortem, the incident lead approves the action items, and
 * each becomes a task in the team's tracker.
 */
@Module({ providers: [PostmortemTasksService] })
export class IncidentPostmortemModule implements OnModuleInit {
  constructor(
    private readonly registry: WorkflowRegistry,
    private readonly handlers: WorkflowHandlerRegistry,
    private readonly exporters: WorkflowExporterRegistry,
    private readonly units: WorkUnitService,
    private readonly restarts: WorkflowRestartService,
    private readonly tasks: PostmortemTasksService,
    @Inject(CONFIG_PROVIDER_SERVICE) private readonly config: ConfigProvider,
    @Inject(CHECKPOINT_SAVER) private readonly checkpointer: BaseCheckpointSaver,
  ) {}

  onModuleInit(): void {
    const webUrl = this.config.getRequired('PUBLIC_WEB_URL').replace(/\/$/, '');
    const graph = createPostmortemGraph({ units: this.units, tasks: this.tasks, webUrl, checkpointer: this.checkpointer });
    this.handlers.register(
      createGraphHandler<PostmortemState>({
        slug: POSTMORTEM_SLUG,
        graph,
        restarts: this.restarts,
        start: (run) => ({ ...parsePostmortemInput(run.input) }),
        result: postmortemResult,
      }),
    );
    this.exporters.register(postmortemExporter);
    this.registry.register({
      slug: POSTMORTEM_SLUG,
      name: 'Incident Postmortem',
      description: 'Paste the incident timeline and notes: Jev rates the severity, a blameless postmortem is drafted, you approve the action items, and each becomes a task in your tracker.',
      organizationSlugs: ['engineering'],
      icon: 'flame',
      defaultGroup: 'Reliability',
      defaultLifecycle: 'dev',
      hitl: true,
      dataClassification: 'internal',
      entryPoint: {
        kind: 'runtime',
        maxAttempts: 2,
        modelRoles: ['writer', 'analyst'],
        accessControl: { mode: 'org' },
        parseStartInput: (input) => ({ ...parsePostmortemInput(input) }),
        runTitle: postmortemRunTitle,
        restartPoints: { 'rate-severity': { resumeAt: 'draft' }, 'propose-action-items': { resumeAt: 'review' } },
      },
    });
  }
}
