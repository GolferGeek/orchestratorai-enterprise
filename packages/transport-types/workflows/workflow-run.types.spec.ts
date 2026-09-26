import {
  isWorkflowInvokeAction,
  isWorkflowRunStatus,
  TERMINAL_WORKFLOW_RUN_STATUSES,
  WORKFLOW_RUN_STATUSES,
} from '../index';

describe('isWorkflowRunStatus', () => {
  it('accepts every declared status', () => {
    for (const status of WORKFLOW_RUN_STATUSES) {
      expect(isWorkflowRunStatus(status)).toBe(true);
    }
  });

  it('rejects anything else', () => {
    expect(isWorkflowRunStatus('processing')).toBe(false);
    expect(isWorkflowRunStatus(undefined)).toBe(false);
  });

  it('lists only declared statuses as terminal', () => {
    for (const status of TERMINAL_WORKFLOW_RUN_STATUSES) {
      expect(isWorkflowRunStatus(status)).toBe(true);
    }
  });
});

describe('isWorkflowInvokeAction', () => {
  it('accepts each well-formed action', () => {
    const actions: unknown[] = [
      { action: 'start', input: { proposition: 'Enter the EU market' } },
      { action: 'start', input: null, documents: [] },
      {
        action: 'start',
        input: {},
        documents: [{ ref: 'org/run/x-a.pdf', filename: 'a.pdf', mimeType: 'application/pdf' }],
      },
      { action: 'review.submit', reviewId: 'r1', decision: { type: 'approve' } },
      { action: 'answer.submit', reviewId: 'r1', answer: { text: 'No', turn: 2 } },
      { action: 'finish', reviewId: 'r1' },
      { action: 'cancel', runId: 'run-1' },
      {
        action: 'restart',
        source: { runId: 'run-1', workUnitRunId: 'wu-3' },
        overrides: { instruction: 'Be stricter on cost' },
      },
    ];
    for (const action of actions) {
      expect(isWorkflowInvokeAction(action)).toBe(true);
    }
  });

  it('rejects unknown actions and missing required fields', () => {
    const bad: unknown[] = [
      null,
      'start',
      { action: 'execute', input: {} },
      { action: 'start' },
      { action: 'start', input: {}, documents: 'a.pdf' },
      { action: 'start', input: {}, documents: [{ ref: 'org/run/x-a.pdf', filename: 'a.pdf' }] },
      { action: 'review.submit', reviewId: '', decision: { type: 'approve' } },
      { action: 'review.submit', reviewId: 'r1' },
      { action: 'answer.submit', reviewId: 'r1', answer: 'No' },
      { action: 'finish' },
      { action: 'cancel', runId: '' },
      { action: 'restart', source: { runId: 'run-1' } },
    ];
    for (const action of bad) {
      expect(isWorkflowInvokeAction(action)).toBe(false);
    }
  });
});
