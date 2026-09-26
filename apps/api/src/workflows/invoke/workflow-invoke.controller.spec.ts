import {
  createMockExecutionContext,
  type A2AInvokeErrorResponse,
  type A2AInvokeSuccessResponse,
  type ExecutionContext,
  type JsonValue,
} from '@orchestrator-ai/transport-types';
import type { ConversationOwnershipService } from '../../common/conversations/conversation-ownership.service';
import {
  WorkflowInputError,
  WorkflowRegistry,
} from '../catalog/workflow.registry';
import { WorkflowRunTransitionError, type WorkflowRunsRepository } from '../shared/runs';
import {
  WorkflowDocumentError,
  type WorkflowDocumentsService,
} from '../shared/documents/workflow-documents.service';
import { HumanReviewError, type HumanReviewService } from '../shared/reviews';
import { MissingModelProfileError, type ModelProfilesRepository } from '../shared/models';
import type { WorkflowCatalogService } from '../catalog/workflow-catalog.service';
import { WorkflowInvokeController } from './workflow-invoke.controller';

const conversationId = '11111111-1111-4111-a111-111111111111';

function context(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return createMockExecutionContext({
    orgSlug: 'finance',
    userId: 'user-1',
    conversationId,
    agentSlug: 'exec-digest',
    agentType: 'workflow',
    ...overrides,
  });
}

function body(content: unknown, ctx: ExecutionContext = context(), contentType = 'json') {
  return {
    jsonrpc: '2.0',
    id: 'req-1',
    method: 'invoke',
    params: { context: ctx, data: { content, contentType } },
  };
}

function setup() {
  const registry = new WorkflowRegistry();
  const parseStartInput = jest.fn((input: JsonValue): JsonValue => {
    if (typeof input !== 'object' || input === null || Array.isArray(input) || !input.week) {
      throw new WorkflowInputError('input.week is required');
    }
    return input;
  });
  registry.register({
    slug: 'exec-digest',
    name: 'Executive Digest',
    organizationSlugs: ['finance'],
    icon: 'flow', defaultGroup: 'General', defaultLifecycle: 'dev', hitl: false, dataClassification: 'internal',
    entryPoint: {
      kind: 'runtime',
      maxAttempts: 2,
      modelRoles: ['drafter'],
      accessControl: { mode: 'org' },
      parseStartInput,
      runTitle: () => 'Executive digest',
    },
  });
  const custom = jest.fn(async (): Promise<A2AInvokeSuccessResponse> => ({
    jsonrpc: '2.0',
    id: 'req-1',
    result: { success: true, output: { content: 'done', outputType: 'text' } },
  }));
  registry.register({
    slug: 'marketing-swarm',
    name: 'Marketing Swarm',
    organizationSlugs: ['marketing'],
    icon: 'flow', defaultGroup: 'General', defaultLifecycle: 'dev', hitl: false, dataClassification: 'internal',
    entryPoint: { kind: 'custom', invoke: custom, runs: null },
  });
  registry.register({
    slug: 'decision-risk',
    name: 'Decision Risk',
    organizationSlugs: ['finance'],
    icon: 'flow', defaultGroup: 'General', defaultLifecycle: 'dev', hitl: false, dataClassification: 'internal',
    entryPoint: { kind: 'rest', endpoint: '/workflows/decision-risk/assess' },
  });

  const conversations = { ensure: jest.fn(async () => undefined) };
  const runs = {
    getForOrg: jest.fn(async () => null as unknown),
    insertQueued: jest.fn(async () => ({ id: conversationId, status: 'queued' })),
    requestCancel: jest.fn(async (): Promise<{ id: string; status: string }> => ({
      id: conversationId,
      status: 'cancel_requested',
    })),
  };
  const documents = { verify: jest.fn(async () => undefined) };
  const modelProfiles = {
    snapshot: jest.fn(async (): Promise<unknown> => ({
      drafter: { provider: 'openrouter', model: 'google/gemini-2.5-flash-lite' },
    })),
  };
  const reviews = {
    respond: jest.fn(async () => undefined),
    closeForEndedRun: jest.fn(async () => undefined),
  };
  const catalog = { isEnabled: jest.fn(async () => true) };
  const controller = new WorkflowInvokeController(
    registry,
    catalog as unknown as WorkflowCatalogService,
    conversations as unknown as ConversationOwnershipService,
    runs as unknown as WorkflowRunsRepository,
    documents as unknown as WorkflowDocumentsService,
    reviews as unknown as HumanReviewService,
    modelProfiles as unknown as ModelProfilesRepository,
  );
  const call = (payload: unknown, org: string | undefined = 'finance', userId = 'user-1') =>
    controller.invoke(payload, { id: userId }, { organizationSlug: org });
  return { call, runs, conversations, custom, parseStartInput, documents, reviews, modelProfiles, catalog };
}

function errorOf(response: unknown) {
  return (response as A2AInvokeErrorResponse).error;
}

describe('WorkflowInvokeController', () => {
  describe('authorization', () => {
    it('rejects a context whose user is not the authenticated user', async () => {
      const { call, conversations } = setup();
      const response = await call(body({ action: 'start', input: { week: 'w' } }), 'finance', 'user-2');
      expect(errorOf(response).code).toBe(-32602);
      expect(conversations.ensure).not.toHaveBeenCalled();
    });

    it('rejects a context for another organization', async () => {
      const { call, runs } = setup();
      const response = await call(
        body({ action: 'start', input: { week: 'w' } }, context({ orgSlug: 'legal' })),
      );
      expect(errorOf(response).code).toBe(-32602);
      expect(runs.insertQueued).not.toHaveBeenCalled();
    });

    it('rejects a workflow not registered for the org', async () => {
      const { call } = setup();
      const response = await call(
        body({ action: 'start', input: { week: 'w' } }, context({ agentSlug: 'marketing-swarm' })),
      );
      expect(errorOf(response).message).toContain('not available to organization "finance"');
    });

    it('rejects an unknown slug and a non-workflow agent type', async () => {
      const { call } = setup();
      expect(errorOf(await call(body({}, context({ agentSlug: 'nope' })))).code).toBe(-32602);
      expect(errorOf(await call(body({}, context({ agentType: 'context' })))).message).toContain(
        'agentType',
      );
    });

    it('refuses a reused conversation without leaking why', async () => {
      const { call, conversations, runs } = setup();
      conversations.ensure.mockRejectedValueOnce(new Error('Conversation ownership mismatch'));
      const response = await call(body({ action: 'start', input: { week: 'w' } }));
      expect(errorOf(response).code).toBe(-32602);
      expect(JSON.stringify(response)).not.toContain('mismatch');
      expect(runs.insertQueued).not.toHaveBeenCalled();
    });

    it('refuses a workflow the org has disabled, before touching the conversation', async () => {
      const { call, catalog, conversations, custom } = setup();
      catalog.isEnabled.mockResolvedValue(false);
      const runtime = await call(body({ action: 'start', input: { week: 'w' } }));
      expect(errorOf(runtime)).toEqual({
        code: -32600,
        message: 'Workflow "exec-digest" is disabled for organization "finance"',
      });
      const marketing = await call(
        body({ x: 1 }, context({ orgSlug: 'marketing', agentSlug: 'marketing-swarm' })),
        'marketing',
      );
      expect(errorOf(marketing).code).toBe(-32600);
      expect(conversations.ensure).not.toHaveBeenCalled();
      expect(custom).not.toHaveBeenCalled();
    });

    it('refuses a runtime write under the all-organizations scope', async () => {
      const { call, runs } = setup();
      const response = await call(body({ action: 'start', input: { week: 'w' } }), '*');
      expect(errorOf(response).code).toBe(-32600);
      expect(runs.insertQueued).not.toHaveBeenCalled();
    });
  });

  describe('runtime entry point', () => {
    it('queues a start and answers with the run id, echoing the context whole', async () => {
      const { call, runs, conversations } = setup();
      const payload = body({ action: 'start', input: { week: '2026-W39' } });
      const response = (await call(payload)) as A2AInvokeSuccessResponse;

      expect(conversations.ensure).toHaveBeenCalledWith(payload.params.context);
      expect(runs.insertQueued).toHaveBeenCalledWith({
        context: payload.params.context,
        input: { week: '2026-W39' },
        documents: [],
        modelProfile: { drafter: { provider: 'openrouter', model: 'google/gemini-2.5-flash-lite' } },
        accessControl: { mode: 'org' },
        maxAttempts: 2,
      });
      expect(response.result).toEqual({
        success: true,
        output: { content: { runId: conversationId, status: 'queued' }, outputType: 'json' },
        context: payload.params.context,
      });
    });

    it('queues verified documents with the run', async () => {
      const { call, runs, documents } = setup();
      const doc = { ref: `finance/${conversationId}/x-brief.pdf`, filename: 'brief.pdf', mimeType: 'application/pdf' };
      const payload = body({ action: 'start', input: { week: 'w' }, documents: [doc] });
      await call(payload);
      expect(documents.verify).toHaveBeenCalledWith(payload.params.context, [doc]);
      expect(runs.insertQueued).toHaveBeenCalledWith(expect.objectContaining({ documents: [doc] }));
    });

    it('refuses a document that was not uploaded to this conversation', async () => {
      const { call, runs, documents } = setup();
      documents.verify.mockRejectedValueOnce(
        new WorkflowDocumentError('Document "a.pdf" was not uploaded to this conversation'),
      );
      const doc = { ref: 'finance/other/x-a.pdf', filename: 'a.pdf', mimeType: 'application/pdf' };
      const response = await call(body({ action: 'start', input: { week: 'w' }, documents: [doc] }));
      expect(errorOf(response)).toEqual({
        code: -32602,
        message: 'Document "a.pdf" was not uploaded to this conversation',
      });
      expect(runs.insertQueued).not.toHaveBeenCalled();
    });

    it('rejects a malformed document list before touching storage', async () => {
      const { call, documents } = setup();
      const response = await call(body({ action: 'start', input: { week: 'w' }, documents: ['x'] }));
      expect(errorOf(response).code).toBe(-32602);
      expect(documents.verify).not.toHaveBeenCalled();
    });

    it('snapshots the org model profile for the workflow roles', async () => {
      const { call, modelProfiles } = setup();
      await call(body({ action: 'start', input: { week: 'w' } }));
      expect(modelProfiles.snapshot).toHaveBeenCalledWith('finance', 'exec-digest', ['drafter']);
    });

    it('refuses to start when a role has no model in the org', async () => {
      const { call, runs, modelProfiles } = setup();
      modelProfiles.snapshot.mockRejectedValueOnce(
        new MissingModelProfileError('exec-digest', 'finance', ['drafter']),
      );
      const response = await call(body({ action: 'start', input: { week: 'w' } }));
      expect(errorOf(response)).toEqual({
        code: -32600,
        message: 'Workflow "exec-digest" has no model configured in organization "finance" for: drafter',
      });
      expect(runs.insertQueued).not.toHaveBeenCalled();
    });

    it('returns the workflow input error as invalid params', async () => {
      const { call, runs } = setup();
      const response = await call(body({ action: 'start', input: {} }));
      expect(errorOf(response)).toEqual({ code: -32602, message: 'input.week is required' });
      expect(runs.insertQueued).not.toHaveBeenCalled();
    });

    it('refuses a second start on the same conversation', async () => {
      const { call, runs } = setup();
      runs.getForOrg.mockResolvedValueOnce({ id: conversationId });
      const response = await call(body({ action: 'start', input: { week: 'w' } }));
      expect(errorOf(response).message).toContain('already exists');
      expect(runs.insertQueued).not.toHaveBeenCalled();
    });

    it('rejects content that is not a json workflow action', async () => {
      const { call } = setup();
      expect(errorOf(await call(body({ action: 'launch' }))).code).toBe(-32602);
      expect(errorOf(await call(body({ action: 'start', input: {} }, context(), 'text'))).code).toBe(
        -32602,
      );
    });

    it('cancels only the run the context names', async () => {
      const { call, runs } = setup();
      const other = await call(body({ action: 'cancel', runId: 'someone-elses-run' }));
      expect(errorOf(other).code).toBe(-32602);
      expect(runs.requestCancel).not.toHaveBeenCalled();

      const response = (await call(body({ action: 'cancel', runId: conversationId }))) as A2AInvokeSuccessResponse;
      expect(runs.requestCancel).toHaveBeenCalledWith('finance', conversationId);
      expect(response.result.output.content).toEqual({ runId: conversationId, status: 'cancel_requested' });
    });

    it('maps a cancel of a finished run to invalid request', async () => {
      const { call, runs } = setup();
      runs.requestCancel.mockRejectedValueOnce(new WorkflowRunTransitionError(conversationId, 'cancel'));
      const response = await call(body({ action: 'cancel', runId: conversationId }));
      expect(errorOf(response)).toEqual({ code: -32600, message: 'The run is not queued, running or waiting' });
    });

    it('expires the open review when a waiting run is canceled', async () => {
      const { call, runs, reviews } = setup();
      runs.requestCancel.mockResolvedValueOnce({ id: conversationId, status: 'canceled' });
      await call(body({ action: 'cancel', runId: conversationId }));
      expect(reviews.closeForEndedRun).toHaveBeenCalledWith(conversationId);
    });

    it('records a review decision and reports the run requeued', async () => {
      const { call, reviews } = setup();
      const payload = body({ action: 'review.submit', reviewId: 'r1', decision: { type: 'approve' } });
      const response = (await call(payload)) as A2AInvokeSuccessResponse;
      expect(reviews.respond).toHaveBeenCalledWith(payload.params.context, 'r1', {
        kind: 'decision',
        decision: { type: 'approve' },
      });
      expect(response.result.output.content).toEqual({ runId: conversationId, status: 'queued' });
    });

    it('rejects a malformed decision before touching the review', async () => {
      const { call, reviews } = setup();
      const response = await call(
        body({ action: 'review.submit', reviewId: 'r1', decision: { type: 'reject' } }),
      );
      expect(errorOf(response).code).toBe(-32602);
      expect(reviews.respond).not.toHaveBeenCalled();
    });

    it('maps a lost race to invalid request and a wrong review to invalid params', async () => {
      const { call, reviews } = setup();
      reviews.respond.mockRejectedValueOnce(
        new HumanReviewError('conflict', 'This review has already been answered'),
      );
      const raced = await call(body({ action: 'finish', reviewId: 'r1' }));
      expect(errorOf(raced)).toEqual({ code: -32600, message: 'This review has already been answered' });

      reviews.respond.mockRejectedValueOnce(new HumanReviewError('not_found', 'No such review for this run'));
      const missing = await call(body({ action: 'answer.submit', reviewId: 'r9', answer: { text: 'Yes', turn: 1 } }));
      expect(errorOf(missing).code).toBe(-32602);
    });

    it('says plainly which actions are not available yet', async () => {
      const { call } = setup();
      const response = await call(
        body({ action: 'restart', source: { runId: conversationId, workUnitRunId: 'wu' } }),
      );
      expect(errorOf(response).message).toBe('Workflow action "restart" is not available yet');
    });

    it('masks unexpected failures', async () => {
      const { call, runs } = setup();
      runs.insertQueued.mockRejectedValueOnce(new Error('database password leaked'));
      const response = await call(body({ action: 'start', input: { week: 'w' } }));
      expect(errorOf(response)).toEqual({ code: -32603, message: 'Workflow invocation failed' });
      expect(JSON.stringify(response)).not.toContain('password');
    });
  });

  describe('other entry points', () => {
    it('hands a custom workflow the original request after the conversation is ensured', async () => {
      const { call, custom, conversations } = setup();
      const payload = body({ anything: true }, context({ orgSlug: 'marketing', agentSlug: 'marketing-swarm' }));
      await call(payload, 'marketing');
      expect(conversations.ensure).toHaveBeenCalled();
      expect(custom).toHaveBeenCalledWith(payload, 'user-1', 'marketing');
    });

    it('points a rest-only workflow at its endpoint', async () => {
      const { call, conversations } = setup();
      const response = await call(body({}, context({ agentSlug: 'decision-risk' })));
      expect(errorOf(response)).toEqual({
        code: -32601,
        message:
          'Workflow "decision-risk" is not invocable through A2A yet; use /workflows/decision-risk/assess',
      });
      expect(conversations.ensure).not.toHaveBeenCalled();
    });
  });
});
