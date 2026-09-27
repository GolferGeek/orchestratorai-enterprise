import { WorkflowInputError } from '../../catalog/workflow.registry';
import { createLoadNode } from '../nodes/load.node';
import { applyRequestDecisions } from '../nodes/review.node';
import { onboardingExporter } from '../onboarding.exporter';
import { onboardingRunTitle, parseOnboardingInput } from '../onboarding.input';
import { onboardingResult } from '../onboarding.result';
import type { OnboardingPlan, OnboardingRequest, OnboardingState } from '../onboarding.state';
import type { NewHire } from '../hires-store.service';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import * as fs from 'node:fs';
import * as path from 'node:path';

const config = { configurable: { reportProgress: async () => undefined } };
const fields = { fullName: 'Priya Raman', roleTitle: 'Support Specialist', team: 'Support', managerName: 'Dana Ortiz', location: 'Remote', employmentType: 'full-time', startDate: '2026-10-19', notes: null };
const hire: NewHire = { ...fields, employmentType: 'full-time', id: '11111111-1111-4111-8111-111111111111', onboardingRunId: null, createdAt: '2026-09-27T00:00:00Z' };
const request = (key: string, task: OnboardingRequest['task'] = null): OnboardingRequest => ({ key, kind: 'equipment', item: `Item ${key}`, owner: 'IT', neededBy: 'before day 1', task });
const plan: OnboardingPlan = { welcome: 'Welcome!', firstWeek: [1, 2, 3, 4, 5].map((day) => ({ day, items: [`Day ${day}`] })), plan30: ['a'], plan60: ['b'], plan90: ['c'] };

describe('onboarding input', () => {
  it('takes a recorded hire id or a whole hire, and nothing else', () => {
    expect(parseOnboardingInput({ hireId: hire.id })).toEqual({ hireId: hire.id });
    expect(parseOnboardingInput({ hireId: hire.id, hireName: ' Priya ' })).toEqual({ hireId: hire.id, hireName: 'Priya' });
    expect(onboardingRunTitle({ hireId: hire.id, hireName: 'Priya' })).toBe('Onboarding plan for Priya');
    expect(() => parseOnboardingInput({ hireName: 'Priya' })).toThrow(WorkflowInputError);
    expect(parseOnboardingInput({ hire: { ...fields, fullName: '  Priya Raman ' } })).toEqual({ hire: { ...fields, fullName: 'Priya Raman' } });
    expect(() => parseOnboardingInput({ hireId: 'nope' })).toThrow(WorkflowInputError);
    expect(() => parseOnboardingInput({ hireId: hire.id, hire: fields })).toThrow(WorkflowInputError);
    expect(() => parseOnboardingInput({ hire: { ...fields, employmentType: 'intern' } })).toThrow(/employmentType/);
    expect(() => parseOnboardingInput({ hire: { ...fields, startDate: '19/10/2026' } })).toThrow(/startDate/);
    expect(() => parseOnboardingInput({ hire: { ...fields, salary: 1 } })).toThrow(/unknown fields: salary/);
  });

  it('accepts both worked examples', () => {
    const dir = path.join(__dirname, '../docs/showcase');
    for (const name of fs.readdirSync(dir)) {
      const example = JSON.parse(fs.readFileSync(path.join(dir, name, 'case.json'), 'utf8'));
      expect(() => parseOnboardingInput(example.input)).not.toThrow();
    }
  });
});

describe('load', () => {
  const state = (input: OnboardingState['input']) => ({ input, executionContext: createMockExecutionContext({ agentType: 'workflow', conversationId: 'run-1' }) }) as unknown as OnboardingState;
  const policy = { facts: jest.fn(async () => [{ text: 'Benefits enrollment within 30 days', source: 'benefits-overview.md' }]) };

  it('links a recorded hire to the run', async () => {
    const hires = { get: jest.fn(async () => hire), attachRun: jest.fn(async () => undefined) };
    const out = await createLoadNode({ hires: hires as never, policy: policy as never })(state({ hireId: hire.id }), config);
    expect(out.hire).toBe(hire);
    expect(hires.attachRun).toHaveBeenCalledWith(expect.any(String), hire.id, 'run-1');
  });

  it('records a hire given in the input once, even on a retry', async () => {
    const hires = { byRun: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(hire), add: jest.fn(async () => hire) };
    const node = createLoadNode({ hires: hires as never, policy: policy as never });
    await node(state({ hire: { ...fields, employmentType: 'full-time' } }), config);
    await node(state({ hire: { ...fields, employmentType: 'full-time' } }), config);
    expect(hires.add).toHaveBeenCalledTimes(1);
    expect(hires.add).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ fullName: 'Priya Raman' }), expect.any(String), 'run-1');
  });

  it('fails for a hire HR does not have', async () => {
    const hires = { get: jest.fn(async () => null) };
    await expect(createLoadNode({ hires: hires as never, policy: policy as never })(state({ hireId: hire.id }), config)).rejects.toThrow(/no new hire/);
  });
});

describe('request decisions', () => {
  const requests = [request('request-1'), request('request-2'), request('request-3')];

  it('keeps accepted, drops rejected and rewords modified requests', () => {
    const out = applyRequestDecisions(requests, [
      { itemId: 'request-1', decision: 'accept' },
      { itemId: 'request-2', decision: 'reject' },
      { itemId: 'request-3', decision: 'modify', replacement: ' Linux workstation ' },
    ]);
    expect(out.map((r) => [r.key, r.item])).toEqual([['request-1', 'Item request-1'], ['request-3', 'Linux workstation']]);
  });

  it('refuses a decision on an unknown request or an empty rewrite', () => {
    expect(() => applyRequestDecisions(requests, [{ itemId: 'request-9', decision: 'reject' }])).toThrow(/No request request-9/);
    expect(() => applyRequestDecisions(requests, [{ itemId: 'request-1', decision: 'modify', replacement: ' ' }])).toThrow(/non-empty/);
  });
});

describe('result and export', () => {
  const done = { hire, plan, requests: [request('request-1', { provider: 'internal', id: 'T-1' })], policyFacts: [{ text: 't', source: 'pto-policy.md' }, { text: 'u', source: 'pto-policy.md' }] } as unknown as OnboardingState;

  it('refuses a result with a request that has no task', () => {
    expect(() => onboardingResult({ ...done, requests: [request('request-1')] } as OnboardingState)).toThrow(/no task/);
    expect(onboardingResult(done)).toMatchObject({ policySources: ['pto-policy.md'] });
  });

  it('exports the plan with the requests and their tasks', () => {
    const doc = onboardingExporter.build({ run: { id: 'run-1', result: onboardingResult(done) } as never, exportedAt: new Date('2026-09-27T00:00:00Z'), issues: {} as never });
    expect(doc.title).toBe('Onboarding plan: Priya Raman');
    expect(doc.sections.map((s) => s.heading)).toEqual(['Welcome', 'First week', 'First 30 days', 'By 60 days', 'By 90 days', 'Requests']);
    expect(JSON.stringify(doc)).toContain('internal T-1');
    expect(onboardingExporter.fileName({ run: { result: onboardingResult(done) } } as never)).toBe('onboarding-priya-raman');
  });
});
