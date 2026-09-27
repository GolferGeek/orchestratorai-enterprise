import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { AgentOutputError, type WorkflowAgentRuntime } from '../agents';
import type { HumanReviewService } from '../reviews';
import type { ObservabilityService } from '../services/observability.service';
import { WorkUnitFailedError, WorkUnitService } from './work-unit.service';
import type { WorkUnitsRepository } from './work-units.repository';
import type { JevMcpClient } from '../../../jev';

const call = {
  content: '{}',
  provider: 'openrouter',
  model: 'google/gemini-2.5-flash-lite',
  requestId: 'req-1',
  usage: { inputTokens: 3, outputTokens: 2 },
  thinking: null,
};

function setup(answers: Record<string, unknown | Error> = {}) {
  let ids = 0;
  const repo = {
    startUnit: jest.fn(async () => `unit-${++ids}`),
    finishUnit: jest.fn(async () => undefined),
    startParticipant: jest.fn(async () => `p-${++ids}`),
    finishParticipant: jest.fn(async () => undefined),
  };
  const invoked: Array<{ agent: string; input: unknown }> = [];
  const agents = {
    invoke: jest.fn(async (_scope: unknown, agent: string, input: unknown) => {
      invoked.push({ agent, input });
      const answer = answers[agent];
      if (answer instanceof Error) throw answer;
      return { output: answer ?? { from: agent }, definitionVersion: 2, modelRole: 'analyst', call };
    }),
  };
  const observability = { emitWorkUnit: jest.fn(async () => undefined) };
  const jev = {
    check: jest.fn(async (rubric: string, inputs: Record<string, unknown>) => {
      if (inputs.fail) throw new Error('Jev MCP unreachable');
      return { rubric, version: 3, decision: inputs.bad ? 'block' : 'pass', answers: {}, model: 'readout/x', usage: { input_tokens: 9, output_tokens: 0 } };
    }),
  };
  const service = new WorkUnitService(
    repo as unknown as WorkUnitsRepository,
    agents as unknown as WorkflowAgentRuntime,
    {} as HumanReviewService,
    observability as unknown as ObservabilityService,
    jev as unknown as JevMcpClient,
  );
  const scope = {
    executionContext: createMockExecutionContext({ orgSlug: 'corporate', conversationId: 'run-1', agentType: 'workflow' }),
    modelProfile: { analyst: { provider: 'openrouter', model: 'google/gemini-2.5-flash-lite' } },
  };
  return { service, repo, agents, scope, invoked, observability, jev };
}

const unitStatuses = (repo: ReturnType<typeof setup>['repo']) =>
  repo.finishUnit.mock.calls.map((c) => (c as unknown[])[3]);
const participantStatuses = (repo: ReturnType<typeof setup>['repo']) =>
  repo.finishParticipant.mock.calls.map((c) => ((c as unknown[])[3] as { status: string }).status);

describe('WorkUnitService', () => {
  it('records Jev checks as a check unit, one participant per rubric with its verdict', async () => {
    const { service, repo, scope, jev } = setup();
    const verdicts = await service.runCheck(scope, {
      slug: 'claims-check',
      checks: [
        { rubric: 'citation-in-record', inputs: { claim: 'a', record: 'b' }, label: 'claim 1' },
        { rubric: 'citation-in-record', inputs: { claim: 'c', record: 'd', bad: true } },
      ],
    });
    expect(verdicts.map((v) => v.decision)).toEqual(['pass', 'block']);
    expect(jev.check).toHaveBeenCalledTimes(2);
    expect(repo.startUnit).toHaveBeenCalledWith(expect.objectContaining({ slug: 'claims-check', pattern: 'check' }));
    expect(repo.startParticipant).toHaveBeenCalledWith(expect.objectContaining({ agentSlug: 'jev:citation-in-record', stage: 'check · claim 1', position: 0 }));
    const finish = repo.finishParticipant.mock.calls[0] as unknown[];
    expect(finish[3]).toMatchObject({ status: 'completed', call: { provider: 'jev', model: 'readout/x', agentVersion: 3, inputTokens: 9 } });
  });

  it('fails the check unit when Jev cannot answer: nothing proceeds unchecked', async () => {
    const { service, repo, scope } = setup();
    await expect(service.runCheck(scope, { slug: 'c', checks: [{ rubric: 'r', inputs: { fail: true } }] })).rejects.toThrow('unreachable');
    expect(participantStatuses(repo)).toEqual(['failed']);
    expect(unitStatuses(repo)).toEqual([expect.objectContaining({ status: 'failed' })]);
  });

  it('records a solo unit and its participant with the model that answered', async () => {
    const { service, repo, scope } = setup({ scorer: { score: 7 } });
    await expect(service.runSolo(scope, { slug: 'score', agent: 'scorer', input: { q: 1 } })).resolves.toEqual({ score: 7 });

    expect(repo.startUnit).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-1', organizationSlug: 'corporate', slug: 'score', pattern: 'solo' }),
    );
    expect(repo.finishParticipant).toHaveBeenCalledWith('p-2', 'corporate', expect.any(Number), {
      status: 'completed',
      output: { truncated: false, value: { score: 7 } },
      call: {
        agentVersion: 2,
        modelRole: 'analyst',
        provider: 'openrouter',
        model: 'google/gemini-2.5-flash-lite',
        llmRequestId: 'req-1',
        inputTokens: 3,
        outputTokens: 2,
      },
    });
    expect(unitStatuses(repo)).toEqual([{ status: 'completed', output: { truncated: false, value: { score: 7 } } }]);
  });

  it('announces each unit starting and finishing, with the models that answered', async () => {
    const { service, scope, observability } = setup({ scorer: { score: 7 } });
    await service.runSolo(scope, { slug: 'score', agent: 'scorer', input: {} });
    const events = observability.emitWorkUnit.mock.calls.map((c) => (c as unknown[]).slice(2));
    expect(events).toEqual([
      ['started', 'score (solo) started', { slug: 'score', pattern: 'solo', workUnitId: 'unit-1' }],
      [
        'completed',
        'score completed (1 call(s))',
        expect.objectContaining({ participants: 1, models: ['openrouter/google/gemini-2.5-flash-lite'], status: 'completed' }),
      ],
    ]);
  });

  it('announces a failed unit with the reason', async () => {
    const { service, scope, observability } = setup({ scorer: new Error('provider timeout') });
    await expect(service.runSolo(scope, { slug: 'score', agent: 'scorer', input: {} })).rejects.toThrow();
    expect(observability.emitWorkUnit).toHaveBeenLastCalledWith(
      scope.executionContext,
      'run-1',
      'failed',
      'score failed: provider timeout',
      expect.objectContaining({ error: 'provider timeout', participants: 0 }),
    );
  });

  it('keeps the raw answer and call of a contract miss, fails the unit, and rethrows', async () => {
    const miss = new AgentOutputError('scorer', ['/score must be integer'], '{"score":"7"}', call, 2, 'analyst');
    const { service, repo, scope } = setup({ scorer: miss });
    await expect(service.runSolo(scope, { slug: 'score', agent: 'scorer', input: {} })).rejects.toBe(miss);
    expect(repo.finishParticipant).toHaveBeenCalledWith('p-2', 'corporate', expect.any(Number), {
      status: 'failed',
      error: miss.message,
      raw: '{"score":"7"}',
      call: expect.objectContaining({ llmRequestId: 'req-1', agentVersion: 2 }),
    });
    expect(unitStatuses(repo)).toEqual([{ status: 'failed', error: miss.message }]);
  });

  it('reports the original error when recording the failure also fails', async () => {
    const { service, repo, scope } = setup({ scorer: new Error('provider timeout') });
    repo.finishParticipant.mockRejectedValueOnce(new Error('db down'));
    const error = (await service.runSolo(scope, { slug: 's', agent: 'scorer', input: {} }).catch((e: unknown) => e)) as Error;
    expect(error.message).toBe('provider timeout (recording this failure also failed: db down)');
    expect(unitStatuses(repo)).toEqual([{ status: 'failed', error: error.message }]);
  });

  it('lets every panelist finish before failing a fail_all panel', async () => {
    const { service, repo, scope } = setup({ b: new Error('b broke') });
    const panelists = ['a', 'b', 'c'].map((agent) => ({ agent, input: {} }));
    await expect(
      service.runPanel(scope, { slug: 'panel', panelists, maxConcurrent: 1, policy: { mode: 'fail_all' } }),
    ).rejects.toBeInstanceOf(WorkUnitFailedError);
    expect(participantStatuses(repo)).toEqual(['completed', 'failed', 'completed']);
    expect(unitStatuses(repo)).toEqual([{ status: 'failed', error: expect.stringContaining('1 of 3 panelists failed') }]);
  });

  it('completes an allow_partial panel as partial at minSuccess, and fails below it', async () => {
    const panelists = ['a', 'b', 'c'].map((agent) => ({ agent, input: {} }));
    const partial = setup({ c: new Error('c broke') });
    const outcome = await partial.service.runPanel(partial.scope, {
      slug: 'panel',
      panelists,
      maxConcurrent: 3,
      policy: { mode: 'allow_partial', minSuccess: 2 },
    });
    expect(outcome.status).toBe('completed_partial');
    expect(outcome.results.map((r) => r.ok)).toEqual([true, true, false]);

    const short = setup({ b: new Error('x'), c: new Error('y') });
    await expect(
      short.service.runPanel(short.scope, {
        slug: 'panel',
        panelists,
        maxConcurrent: 3,
        policy: { mode: 'allow_partial', minSuccess: 2 },
      }),
    ).rejects.toThrow('1 of 3 panelists answered; at least 2 needed');
  });

  it('refuses a panel configuration it cannot honor before starting anything', async () => {
    const { service, repo, scope } = setup();
    const panelists = [{ agent: 'a', input: {} }];
    await expect(
      service.runPanel(scope, { slug: 'p', panelists, maxConcurrent: 0, policy: { mode: 'fail_all' } }),
    ).rejects.toThrow('maxConcurrent');
    await expect(
      service.runPanel(scope, { slug: 'p', panelists, maxConcurrent: 1, policy: { mode: 'allow_partial', minSuccess: 2 } }),
    ).rejects.toThrow('minSuccess between 1 and 1');
    expect(repo.startUnit).not.toHaveBeenCalled();
  });

  it('builds each red/blue stage input from the earlier outputs, explicitly', async () => {
    const { service, scope, invoked } = setup({
      proposer: { plan: 'expand' },
      challenger: { objections: ['cost'] },
      judge: { verdict: 'go' },
    });
    const result = await service.runRedBlue<{ plan: string }, { objections: string[] }, never, { verdict: string }>(scope, {
      slug: 'debate',
      blue: { agent: 'proposer', input: { topic: 't' } },
      red: { agent: 'challenger', input: ({ blue }) => ({ plan: blue.plan }) },
      arbitrator: { agent: 'judge', input: ({ blue, red, revised }) => ({ plan: blue.plan, objections: red.objections, revised }) },
    });
    expect(invoked.map((i) => i.input)).toEqual([
      { topic: 't' },
      { plan: 'expand' },
      { plan: 'expand', objections: ['cost'], revised: null },
    ]);
    expect(result).toEqual({ blue: { plan: 'expand' }, red: { objections: ['cost'] }, revised: null, decision: { verdict: 'go' } });
  });

  it('names a labeled panelist in the trace', async () => {
    const { service, repo, scope } = setup();
    await service.runPanel(scope, {
      slug: 'radar',
      panelists: [{ agent: 'a', input: {}, label: 'Security & Privacy' }, { agent: 'b', input: {} }],
      maxConcurrent: 1,
      policy: { mode: 'fail_all' },
    });
    expect(repo.startParticipant.mock.calls.map((c) => ((c as unknown[])[0] as { stage: string }).stage)).toEqual([
      'panelist · Security & Privacy',
      'panelist',
    ]);
  });

  it('gives the arbitrator every panel answer and records it after the panelists', async () => {
    const { service, repo, scope, invoked } = setup({ a: 1, b: 2, judge: { pick: 'b' } });
    const result = await service.runArbitrated<number, { pick: string }>(scope, {
      slug: 'arb',
      panelists: [{ agent: 'a', input: {} }, { agent: 'b', input: {} }],
      maxConcurrent: 2,
      arbitrator: { agent: 'judge', input: ({ panel }) => ({ answers: panel }) },
    });
    expect(result).toEqual({ panel: [1, 2], decision: { pick: 'b' } });
    expect(invoked.at(-1)).toEqual({ agent: 'judge', input: { answers: [1, 2] } });
    expect(repo.startParticipant.mock.calls.map((c) => (c as unknown[])[0])).toEqual([
      expect.objectContaining({ position: 0, stage: 'panelist' }),
      expect.objectContaining({ position: 1, stage: 'panelist' }),
      expect.objectContaining({ position: 2, stage: 'arbitrator' }),
    ]);
  });
});
