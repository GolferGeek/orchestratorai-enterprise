import { ConflictException, NotFoundException } from '@nestjs/common';
import type { WorkflowRunSummary } from '@orchestrator-ai/transport-types';
import type { WorkflowRunsRepository } from '../shared/runs';
import type { WorkflowDocumentsService } from '../shared/documents/workflow-documents.service';
import type { HumanReviewService } from '../shared/reviews';
import { WorkflowCatalogController } from './workflow-catalog.controller';
import type { WorkflowCatalogService } from './workflow-catalog.service';
import { WorkflowRegistry, type WorkflowRunSource } from './workflow.registry';

const runId = '11111111-1111-4111-a111-111111111111';

function setup() {
  const registry = new WorkflowRegistry();
  registry.register({
    slug: 'exec-digest',
    name: 'Executive Digest',
    organizationSlugs: ['finance'],
    icon: 'flow', defaultGroup: 'General', defaultLifecycle: 'dev', hitl: false, dataClassification: 'internal',
    entryPoint: {
      kind: 'runtime',
      maxAttempts: 2,
      modelRoles: [],
      accessControl: { mode: 'org' },
      parseStartInput: (input) => input,
      runTitle: (input) => `Digest ${JSON.stringify(input)}`,
    },
  });
  const summary: WorkflowRunSummary = {
    conversationId: 'c1',
    workflowSlug: 'marketing-swarm',
    status: 'completed',
    title: 'Launch post',
    createdAt: 't',
    updatedAt: 't',
    completedAt: 't',
  };
  const source = {
    list: jest.fn(async () => [summary]),
    delete: jest.fn(async () => true),
  };
  registry.register({
    slug: 'marketing-swarm',
    name: 'Marketing Swarm',
    organizationSlugs: ['finance'],
    icon: 'flow', defaultGroup: 'General', defaultLifecycle: 'dev', hitl: false, dataClassification: 'internal',
    entryPoint: {
      kind: 'custom',
      invoke: jest.fn(),
      runs: source as WorkflowRunSource,
    },
  });
  registry.register({
    slug: 'decision-risk',
    name: 'Decision Risk',
    organizationSlugs: ['finance'],
    icon: 'flow', defaultGroup: 'General', defaultLifecycle: 'dev', hitl: false, dataClassification: 'internal',
    entryPoint: { kind: 'rest', endpoint: '/x' },
  });
  const run = {
    id: runId,
    workflowSlug: 'exec-digest',
    status: 'completed',
    input: { week: 'W39' },
    queuedAt: 'q',
    startedAt: 's',
    completedAt: 'c',
    executionContext: {},
    workerId: 'w',
    leaseExpiresAt: null,
  };
  const runs = {
    listVisible: jest.fn(async () => [run]),
    getReadable: jest.fn(async () => run as unknown),
    deleteOwned: jest.fn(async (): Promise<unknown> => ({
      status: 'deleted',
      run: { id: runId, organizationSlug: 'finance' },
    })),
  };
  const documents = { removeAll: jest.fn(async () => undefined) };
  const reviews = { getWaiting: jest.fn(async (): Promise<unknown> => null) };
  const controller = new WorkflowCatalogController(
    registry,
    {} as WorkflowCatalogService,
    runs as unknown as WorkflowRunsRepository,
    documents as unknown as WorkflowDocumentsService,
    reviews as unknown as HumanReviewService,
  );
  const user = { id: 'user-1' };
  const req = { organizationSlug: 'finance' };
  const reader = { userId: 'user-1', organizationSlug: 'finance' };
  return { controller, runs, source, documents, reviews, user, req, reader };
}

describe('WorkflowCatalogController runs', () => {
  it('lists runtime runs from workflows.runs, titled by the workflow', async () => {
    const { controller, runs, user, req, reader } = setup();
    const result = await controller.listRuns('exec-digest', user, req);
    expect(runs.listVisible).toHaveBeenCalledWith('exec-digest', reader, 50);
    expect(result.runs).toEqual([
      {
        conversationId: runId,
        workflowSlug: 'exec-digest',
        status: 'completed',
        title: 'Digest {"week":"W39"}',
        createdAt: 'q',
        updatedAt: 'c',
        completedAt: 'c',
      },
    ]);
  });

  it('lists a custom workflow through its own run source', async () => {
    const { controller, source, user, req, reader } = setup();
    const result = await controller.listRuns('marketing-swarm', user, req);
    expect(source.list).toHaveBeenCalledWith(reader);
    expect(result.runs[0]?.title).toBe('Launch post');
  });

  it('404s a workflow the org cannot see and one that keeps no runs here', async () => {
    const { controller, user } = setup();
    await expect(
      controller.listRuns('exec-digest', user, { organizationSlug: 'legal' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      controller.listRuns('decision-risk', user, { organizationSlug: 'finance' }),
    ).rejects.toThrow('does not record runs here');
  });

  it('returns a readable runtime run without worker internals', async () => {
    const { controller, runs, user, req, reader } = setup();
    const view = await controller.getRun('exec-digest', runId, user, req);
    expect(runs.getReadable).toHaveBeenCalledWith(runId, reader);
    expect(view.runId).toBe(runId);
    expect(view).not.toHaveProperty('workerId');
  });

  it('includes the open review of a run waiting on a person', async () => {
    const { controller, runs, reviews, user, req } = setup();
    runs.getReadable.mockResolvedValueOnce({
      id: runId,
      workflowSlug: 'exec-digest',
      status: 'awaiting_review',
      executionContext: {},
    });
    reviews.getWaiting.mockResolvedValueOnce({
      id: 'r1',
      runId,
      workflowSlug: 'exec-digest',
      gateSlug: 'approve-digest',
      kind: 'approval',
      status: 'waiting',
      allowedDecisions: ['approve', 'reject'],
      allowItemDecisions: false,
      payload: { draft: 'x' },
      createdAt: 't',
      workTask: null,
    });
    const view = await controller.getRun('exec-digest', runId, user, req);
    expect(reviews.getWaiting).toHaveBeenCalledWith(runId);
    expect(view.review).toMatchObject({ reviewId: 'r1', gateSlug: 'approve-digest' });
    expect(view.review).not.toHaveProperty('workTask');
  });

  it('404s a run the reader may not see, or of another workflow', async () => {
    const { controller, runs, user, req } = setup();
    runs.getReadable.mockResolvedValueOnce(null);
    await expect(controller.getRun('exec-digest', runId, user, req)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    runs.getReadable.mockResolvedValueOnce({ id: runId, workflowSlug: 'other' });
    await expect(controller.getRun('exec-digest', runId, user, req)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses to delete a run still in flight', async () => {
    const { controller, runs, user, req } = setup();
    const { documents } = setup();
    runs.deleteOwned.mockResolvedValueOnce({ status: 'active' });
    await expect(controller.deleteRun('exec-digest', runId, user, req)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(documents.removeAll).not.toHaveBeenCalled();
  });

  it('deletes a finished runtime run and its uploads', async () => {
    const { controller, documents, user, req } = setup();
    await expect(controller.deleteRun('exec-digest', runId, user, req)).resolves.toEqual({
      deleted: true,
    });
    expect(documents.removeAll).toHaveBeenCalledWith('finance', runId);
  });

  it('deletes a custom run through its source', async () => {
    const { controller, source, user, req, reader } = setup();
    await expect(controller.deleteRun('marketing-swarm', 'c1', user, req)).resolves.toEqual({
      deleted: true,
    });
    expect(source.delete).toHaveBeenCalledWith('c1', reader);
  });
});
