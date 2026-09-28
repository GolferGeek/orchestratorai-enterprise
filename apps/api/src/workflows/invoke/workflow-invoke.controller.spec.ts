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
import {
  MissingModelProfileError,
  ModelUnavailableError,
  type ModelProfilesRepository,
} from '../shared/models';
import type { WorkflowCatalogService } from '../catalog/workflow-catalog.service';
import type { ObservabilityService } from '../shared/services/observability.service';
import type { WorkUnitTraceReader } from '../shared/work-units/work-unit-trace.reader';
import { QualityRequestError, type TraceReviewService } from '../shared/quality';
import { AgentOutputError } from '../shared/agents';
import { WorkflowInvokeController } from './workflow-invoke.controller';
import { WorkflowRunLauncher } from './workflow-run-launcher.service';

const conversationId = '11111111-1111-4111-a111-111111111111';
const PARENT = '22222222-2222-4222-a222-222222222222';

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
      restartPoints: { draft: { resumeAt: 'polish' } },
      maxAttempts: 2,
      modelRoles: ['drafter'],
      accessControl: { mode: 'org' },
      parseStartInput,
      runTitle: () => 'Executive digest',
    },
  });
  const conversations = { ensure: jest.fn(async () => undefined) };
  const runs = {
    getForOrg: jest.fn(async () => null as unknown),
    getReadable: jest.fn(async (): Promise<unknown> => ({
      id: PARENT,
      workflowSlug: 'exec-digest',
      status: 'completed',
      input: { week: 'w1' },
      documents: [],
    })),
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
  const observability = {
    emitQueued: jest.fn(async () => undefined),
    emitCanceled: jest.fn(async () => undefined),
  };
  const trace = {
    units: jest.fn(async (): Promise<unknown[]> => [
      { workUnitId: 'wu-draft', slug: 'draft', status: 'completed' },
      { workUnitId: 'wu-polish', slug: 'polish', status: 'completed' },
    ]),
  };
  const quality = {
    review: jest.fn(async (): Promise<unknown> => ({ reviewId: 'tr-1', status: 'completed' })),
    fileImprovement: jest.fn(async (): Promise<unknown> => ({ requestId: 'ir-1', status: 'open' })),
  };
  const launcher = new WorkflowRunLauncher(
    registry,
    catalog as unknown as WorkflowCatalogService,
    conversations as unknown as ConversationOwnershipService,
    runs as unknown as WorkflowRunsRepository,
    documents as unknown as WorkflowDocumentsService,
    modelProfiles as unknown as ModelProfilesRepository,
    observability as unknown as ObservabilityService,
  );
  const controller = new WorkflowInvokeController(
    registry,
    catalog as unknown as WorkflowCatalogService,
    runs as unknown as WorkflowRunsRepository,
    reviews as unknown as HumanReviewService,
    launcher,
    observability as unknown as ObservabilityService,
    trace as unknown as WorkUnitTraceReader,
    quality as unknown as TraceReviewService,
  );
  const call = (payload: unknown, org: string | undefined = 'finance', userId = 'user-1') =>
    controller.invoke(payload, { id: userId }, { organizationSlug: org });
  return { call, runs, conversations, parseStartInput, documents, reviews, modelProfiles, catalog, observability, trace, quality };
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
      const { call, catalog, conversations } = setup();
      catalog.isEnabled.mockResolvedValue(false);
      const runtime = await call(body({ action: 'start', input: { week: 'w' } }));
      expect(errorOf(runtime)).toEqual({
        code: -32600,
        message: 'Workflow "exec-digest" is disabled for organization "finance"',
      });
      expect(conversations.ensure).not.toHaveBeenCalled();
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

    it('announces the queued run to observability', async () => {
      const { call, observability } = setup();
      const payload = body({ action: 'start', input: { week: 'w' } });
      await call(payload);
      expect(observability.emitQueued).toHaveBeenCalledWith(payload.params.context, conversationId, 'Run queued');
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

    it('refuses to start on a local model the host does not have', async () => {
      const { call, runs, modelProfiles } = setup();
      modelProfiles.snapshot.mockRejectedValueOnce(
        new ModelUnavailableError([{ role: 'drafter', provider: 'ollama', model: 'qwen3:8b' }]),
      );
      const response = await call(body({ action: 'start', input: { week: 'w' } }));
      expect(errorOf(response)).toEqual({
        code: -32600,
        message: 'Not available on the local model host: ollama/qwen3:8b (role drafter)',
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

    it('expires the open review when a waiting run is canceled, and announces the cancel', async () => {
      const { call, runs, reviews, observability } = setup();
      runs.requestCancel.mockResolvedValueOnce({ id: conversationId, status: 'canceled' });
      const payload = body({ action: 'cancel', runId: conversationId });
      await call(payload);
      expect(reviews.closeForEndedRun).toHaveBeenCalledWith(conversationId);
      expect(observability.emitCanceled).toHaveBeenCalledWith(payload.params.context, conversationId);
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

    describe('actions on an existing run', () => {
      it('are refused on a run the caller cannot read', async () => {
        const { call, runs, reviews } = setup();
        runs.getReadable.mockResolvedValueOnce(null);
        const response = await call(body({ action: 'finish', reviewId: 'r1' }));
        expect(errorOf(response)).toEqual({ code: -32602, message: `No run ${conversationId} of this workflow` });
        expect(reviews.respond).not.toHaveBeenCalled();
      });

      it("are allowed on a readable run someone else started (a system run), without the conversation's owner check", async () => {
        const { call, runs, reviews, conversations } = setup();
        runs.getReadable.mockResolvedValueOnce({ id: conversationId, workflowSlug: 'exec-digest', status: 'awaiting_review' });
        const response = await call(body({ action: 'finish', reviewId: 'r1' }));
        expect((response as A2AInvokeSuccessResponse).result.output.content).toEqual({ runId: conversationId, status: 'queued' });
        expect(reviews.respond).toHaveBeenCalled();
        expect(conversations.ensure).not.toHaveBeenCalled();
      });
    });

    describe('restart', () => {
      const restart = (overrides?: unknown, workUnitRunId = 'wu-draft') =>
        body({ action: 'restart', source: { runId: PARENT, workUnitRunId }, ...(overrides ? { overrides } : {}) });

      it("queues a new run on the context's conversation, branching after the chosen step", async () => {
        const { call, runs, observability, modelProfiles } = setup();
        const response = await call(restart({ instruction: '  Be brief.  ' }));
        expect((response as A2AInvokeSuccessResponse).result.output.content).toEqual({ runId: conversationId, status: 'queued' });
        expect(runs.getReadable).toHaveBeenCalledWith(PARENT, { userId: 'user-1', organizationSlug: 'finance' });
        expect(modelProfiles.snapshot).toHaveBeenCalledWith('finance', 'exec-digest', ['drafter']);
        expect(runs.insertQueued).toHaveBeenCalledWith(
          expect.objectContaining({
            input: { week: 'w1' },
            restart: {
              parentRunId: PARENT,
              fromWorkUnitRunId: 'wu-draft',
              fromWorkUnitSlug: 'draft',
              resumeAt: 'polish',
              instruction: 'Be brief.',
            },
          }),
        );
        expect(observability.emitQueued).toHaveBeenCalledWith(
          expect.anything(),
          conversationId,
          `Run queued: a restart of ${PARENT} after draft`,
        );
      });

      it('refuses to reuse a conversation that already has a run', async () => {
        const { call, runs } = setup();
        runs.getForOrg.mockResolvedValueOnce({ id: conversationId });
        expect(errorOf(await call(restart())).message).toBe('A restart is a new run: send it with a new conversation');
        expect(runs.insertQueued).not.toHaveBeenCalled();
      });

      it("refuses a run the caller cannot read, or another workflow's", async () => {
        const { call, runs } = setup();
        runs.getReadable.mockResolvedValueOnce(null);
        expect(errorOf(await call(restart())).message).toBe(`No run ${PARENT} of this workflow to restart`);
        runs.getReadable.mockResolvedValueOnce({ id: PARENT, workflowSlug: 'other', status: 'completed' });
        expect(errorOf(await call(restart())).code).toBe(-32602);
        expect(runs.insertQueued).not.toHaveBeenCalled();
      });

      it('refuses an unknown step, a step without a restart point, and a run still going', async () => {
        const { call, runs } = setup();
        expect(errorOf(await call(restart(undefined, 'wu-nope'))).message).toBe(`Run ${PARENT} has no step wu-nope`);
        expect(errorOf(await call(restart(undefined, 'wu-polish'))).message).toBe(
          'This workflow cannot restart from this step.',
        );
        runs.getReadable.mockResolvedValueOnce({ id: PARENT, workflowSlug: 'exec-digest', status: 'running' });
        expect(errorOf(await call(restart())).message).toContain('restart it once it has finished');
        expect(runs.insertQueued).not.toHaveBeenCalled();
      });

      it('refuses an instruction that is not text or too long', async () => {
        const { call, runs } = setup();
        expect(errorOf(await call(restart({ instruction: 42 }))).message).toBe('overrides.instruction must be text');
        expect(errorOf(await call(restart({ instruction: 'x'.repeat(4001) }))).message).toContain('at most 4000');
        expect(runs.insertQueued).not.toHaveBeenCalled();
      });
    });

    describe('trace review and improvement requests', () => {
      const onRun = context({ conversationId: PARENT });
      const review = (extra: Record<string, unknown> = {}) =>
        body({ action: 'trace.review', runId: PARENT, target: { type: 'work_unit', id: 'wu-draft' }, notes: 'Too vague', ...extra }, onRun);

      it("reviews a step of the context's run and returns the review", async () => {
        const { call, quality, runs } = setup();
        const response = await call(review());
        expect((response as A2AInvokeSuccessResponse).result.output.content).toEqual({
          runId: PARENT,
          status: 'completed',
          traceReview: { reviewId: 'tr-1', status: 'completed' },
        });
        expect(runs.getReadable).toHaveBeenCalledWith(PARENT, { userId: 'user-1', organizationSlug: 'finance' });
        expect(quality.review).toHaveBeenCalledWith(onRun, expect.objectContaining({ id: PARENT }), { type: 'work_unit', id: 'wu-draft' }, 'Too vague');
      });

      it('files an improvement request on the run', async () => {
        const { call, quality } = setup();
        const response = await call(
          body({ action: 'improvement.request', runId: PARENT, kind: 'context', title: 'Tighten the brief', description: 'Ask for numbers.' }, onRun),
        );
        expect((response as A2AInvokeSuccessResponse).result.output.content).toMatchObject({ improvementRequest: { requestId: 'ir-1' } });
        expect(quality.fileImprovement).toHaveBeenCalledWith(onRun, expect.objectContaining({ id: PARENT }), expect.objectContaining({ kind: 'context' }));
      });

      it('refuses a malformed target, another conversation, and a run the caller cannot read', async () => {
        const { call, runs, quality } = setup();
        expect(errorOf(await call(review({ target: { type: 'step', id: 'x' } }))).code).toBe(-32602);
        expect(errorOf(await call(body({ action: 'trace.review', runId: PARENT, target: { type: 'work_unit', id: 'x' } })))).toMatchObject({
          message: 'trace.review.runId must be the conversation the context names',
        });
        runs.getReadable.mockResolvedValueOnce(null);
        expect(errorOf(await call(review())).message).toBe(`No run ${PARENT} of this workflow`);
        expect(quality.review).not.toHaveBeenCalled();
      });

      it("answers a caller mistake as invalid params and the reviewer's failure plainly", async () => {
        const { call, quality } = setup();
        quality.review.mockRejectedValueOnce(new QualityRequestError('Workflow exec-digest has no trace reviewer'));
        expect(errorOf(await call(review()))).toEqual({ code: -32602, message: 'Workflow exec-digest has no trace reviewer' });
        quality.review.mockRejectedValueOnce(
          new AgentOutputError('workflow-trace-reviewer', ['summary is required'], '{}', {} as never, 1, 'reviewer'),
        );
        expect(errorOf(await call(review())).message).toContain('The trace review failed');
      });
    });

    it('masks unexpected failures', async () => {
      const { call, runs } = setup();
      runs.insertQueued.mockRejectedValueOnce(new Error('database password leaked'));
      const response = await call(body({ action: 'start', input: { week: 'w' } }));
      expect(errorOf(response)).toEqual({ code: -32603, message: 'Workflow invocation failed' });
      expect(JSON.stringify(response)).not.toContain('password');
    });
  });
});
