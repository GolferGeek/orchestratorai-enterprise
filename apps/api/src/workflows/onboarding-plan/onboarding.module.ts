import { Inject, Module, OnModuleInit } from '@nestjs/common';
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import { CHECKPOINT_SAVER } from '@orchestratorai/planes/checkpointer';
import { CONFIG_PROVIDER_SERVICE, type ConfigProvider } from '@orchestratorai/planes/config';
import { WorkflowRegistry } from '../catalog/workflow.registry';
import { WorkflowExporterRegistry } from '../shared/export';
import { WorkflowRestartService } from '../shared/restarts';
import { WorkflowHandlerRegistry, createGraphHandler } from '../shared/runs';
import { RunTasksService } from '../shared/tasks';
import { WorkUnitService } from '../shared/work-units';
import { HiresStoreService } from './hires-store.service';
import { NewHiresController } from './new-hires.controller';
import { onboardingExporter } from './onboarding.exporter';
import { createOnboardingGraph } from './onboarding.graph';
import { ONBOARDING_SLUG, onboardingRunTitle, parseOnboardingInput } from './onboarding.input';
import { onboardingResult } from './onboarding.result';
import type { OnboardingState } from './onboarding.state';
import { PolicyFactsService } from './policy-facts.service';

/**
 * HR's new-hire onboarding plan: recording a new hire starts it (an ambient
 * database trigger); the plan follows HR policy from the knowledge base; the
 * manager approves the requests, and each becomes a task for its team.
 */
@Module({
  controllers: [NewHiresController],
  providers: [HiresStoreService, PolicyFactsService],
})
export class OnboardingPlanModule implements OnModuleInit {
  constructor(
    private readonly registry: WorkflowRegistry,
    private readonly handlers: WorkflowHandlerRegistry,
    private readonly exporters: WorkflowExporterRegistry,
    private readonly units: WorkUnitService,
    private readonly restarts: WorkflowRestartService,
    private readonly runTasks: RunTasksService,
    private readonly hires: HiresStoreService,
    private readonly policy: PolicyFactsService,
    @Inject(CONFIG_PROVIDER_SERVICE) private readonly config: ConfigProvider,
    @Inject(CHECKPOINT_SAVER) private readonly checkpointer: BaseCheckpointSaver,
  ) {}

  onModuleInit(): void {
    const webUrl = this.config.getRequired('PUBLIC_WEB_URL').replace(/\/$/, '');
    const graph = createOnboardingGraph({ units: this.units, hires: this.hires, policy: this.policy, runTasks: this.runTasks, webUrl, checkpointer: this.checkpointer });
    this.handlers.register(
      createGraphHandler<OnboardingState>({
        slug: ONBOARDING_SLUG,
        graph,
        restarts: this.restarts,
        start: (run) => ({ input: parseOnboardingInput(run.input) }),
        result: onboardingResult,
      }),
    );
    this.exporters.register(onboardingExporter);
    this.registry.register({
      slug: ONBOARDING_SLUG,
      name: 'New Hire Onboarding',
      description: 'Record a new hire and their onboarding plan starts itself: first week, 30/60/90 and the accounts and equipment to request, from HR policy. The manager approves and each request becomes a task.',
      organizationSlugs: ['human-resources'],
      icon: 'person-add',
      defaultGroup: 'People Operations',
      defaultLifecycle: 'dev',
      hitl: true,
      dataClassification: 'confidential',
      entryPoint: {
        kind: 'runtime',
        maxAttempts: 2,
        modelRoles: ['writer'],
        accessControl: { mode: 'org' },
        parseStartInput: (input) => {
          const parsed = parseOnboardingInput(input);
          return 'hire' in parsed ? { hire: { ...parsed.hire } } : { ...parsed };
        },
        runTitle: onboardingRunTitle,
        restartPoints: { 'draft-plan': { resumeAt: 'approve' } },
      },
    });
  }
}
