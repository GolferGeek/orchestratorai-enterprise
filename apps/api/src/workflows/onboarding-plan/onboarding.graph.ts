import { END, StateGraph } from '@langchain/langgraph';
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import type { RunTasksService } from '../shared/tasks';
import type { WorkUnitService } from '../shared/work-units';
import type { HiresStoreService } from './hires-store.service';
import { createLoadNode } from './nodes/load.node';
import { createPlanNode } from './nodes/plan.node';
import { createReviewNode } from './nodes/review.node';
import { createTasksNode } from './nodes/tasks.node';
import { OnboardingStateAnnotation } from './onboarding.state';
import type { PolicyFactsService } from './policy-facts.service';

/** Onboarding plan:  load (hire + policy) → draft (planner) → approve (manager) → create_tasks → END. */
export function createOnboardingGraph(deps: {
  units: WorkUnitService;
  hires: HiresStoreService;
  policy: PolicyFactsService;
  runTasks: RunTasksService;
  webUrl: string;
  checkpointer: BaseCheckpointSaver;
}) {
  return new StateGraph(OnboardingStateAnnotation)
    .addNode('load', createLoadNode({ hires: deps.hires, policy: deps.policy }))
    .addNode('draft', createPlanNode({ units: deps.units }))
    .addNode('approve', createReviewNode({ units: deps.units }))
    .addNode('create_tasks', createTasksNode({ runTasks: deps.runTasks, webUrl: deps.webUrl }))
    .addEdge('__start__', 'load')
    .addEdge('load', 'draft')
    .addEdge('draft', 'approve')
    .addEdge('approve', 'create_tasks')
    .addEdge('create_tasks', END)
    .compile({ checkpointer: deps.checkpointer });
}
