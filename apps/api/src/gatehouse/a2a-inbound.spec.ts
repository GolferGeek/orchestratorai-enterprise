import { A2A_ERRORS, A2ARpcError, invokeData, outputParts, parseSendMessage, runEventStep, runTaskState, wireTask, type TaskRow } from './a2a-inbound';

const code = (fn: () => unknown): number => {
  try {
    fn();
  } catch (error) {
    if (error instanceof A2ARpcError) return error.code;
    throw error;
  }
  throw new Error('expected an A2ARpcError');
};
const message = (fields: Record<string, unknown>) => ({ message: { messageId: 'm1', role: 'ROLE_USER', parts: [{ text: 'hi' }], ...fields } });

describe('reading a SendMessage', () => {
  it('takes text and data parts and the caller\'s contextId', () => {
    expect(parseSendMessage(message({ contextId: 'ctx-1', parts: [{ text: 'Invoice attached' }, { data: { n: 1 }, mediaType: 'application/json' }] }))).toEqual({
      parts: [{ text: 'Invoice attached' }, { data: { n: 1 }, mediaType: 'application/json' }],
      contextId: 'ctx-1',
      returnImmediately: false,
    });
  });

  it('reads configuration.returnImmediately, and only as true or false', () => {
    expect(parseSendMessage({ ...message({}), configuration: { returnImmediately: true } }).returnImmediately).toBe(true);
    expect(parseSendMessage({ ...message({}), configuration: {} }).returnImmediately).toBe(false);
    expect(code(() => parseSendMessage({ ...message({}), configuration: { returnImmediately: 'yes' } }))).toBe(A2A_ERRORS.invalidParams);
    expect(code(() => parseSendMessage({ ...message({}), configuration: [] }))).toBe(A2A_ERRORS.invalidParams);
  });

  it('says precisely what it will not take', () => {
    expect(code(() => parseSendMessage({}))).toBe(A2A_ERRORS.invalidParams);
    expect(code(() => parseSendMessage(message({ role: 'ROLE_AGENT' })))).toBe(A2A_ERRORS.invalidParams);
    expect(code(() => parseSendMessage(message({ messageId: '' })))).toBe(A2A_ERRORS.invalidParams);
    expect(code(() => parseSendMessage(message({ parts: [] })))).toBe(A2A_ERRORS.invalidParams);
    expect(parseSendMessage(message({ taskId: 't1' })).taskId).toBe('t1');
    expect(code(() => parseSendMessage(message({ taskId: 7 })))).toBe(A2A_ERRORS.invalidParams);
    expect(code(() => parseSendMessage(message({ parts: [{ url: 'https://x/f.pdf', mediaType: 'application/pdf' }] })))).toBe(A2A_ERRORS.contentTypeNotSupported);
    expect(code(() => parseSendMessage(message({ parts: [{ raw: 'AAAA' }] })))).toBe(A2A_ERRORS.contentTypeNotSupported);
  });
});

describe('the message as agent input', () => {
  it('puts the text in message and one data object beside it', () => {
    expect(invokeData([{ text: 'a' }, { text: 'b' }, { data: { poNumber: 'PO-1' } }])).toEqual({ content: { message: 'a\n\nb', poNumber: 'PO-1' }, contentType: 'json' });
    expect(invokeData([{ data: { message: 'from data' } }]).content).toEqual({ message: 'from data' });
  });

  it('refuses data it cannot place', () => {
    expect(code(() => invokeData([{ data: [1] }]))).toBe(A2A_ERRORS.invalidParams);
    expect(code(() => invokeData([{ data: { a: 1 } }, { data: { b: 2 } }]))).toBe(A2A_ERRORS.invalidParams);
    expect(code(() => invokeData([{ text: 'a' }, { data: { message: 'b' } }]))).toBe(A2A_ERRORS.invalidParams);
  });
});

describe('answers and runs as A2A tasks', () => {
  it('reads text as text and anything else as data', () => {
    expect(outputParts({ content: 'Policy says…', outputType: 'text' })).toEqual([{ text: 'Policy says…' }]);
    expect(outputParts({ content: { total: 2 }, outputType: 'json' })).toEqual([{ data: { total: 2 }, mediaType: 'application/json' }]);
  });

  it('answers an image or video as a file part a caller outside can fetch', () => {
    const video = { content: 'https://enterprise.example/assets/storage/media/org/a%201.mp4', outputType: 'video' as const, metadata: { mimeType: 'video/mp4' } };
    expect(outputParts(video)).toEqual([{ url: video.content, mediaType: 'video/mp4', filename: 'a 1.mp4' }]);
    expect(() => outputParts({ ...video, content: '/assets/storage/media/a.mp4' })).toThrow('set PUBLIC_API_URL');
    expect(() => outputParts({ ...video, content: 'http://enterprise.example/a.mp4' })).toThrow('must be https');
    expect(() => outputParts({ ...video, metadata: {} })).toThrow('does not say its type');
    expect(() => outputParts({ ...video, content: { url: 'x' } })).toThrow('must be its stored URL');
  });

  it('follows a run through every status; our human gate is working, not input-required', () => {
    const run = (status: Parameters<typeof runTaskState>[0]['status'], extra = {}) => runTaskState({ status, lastMessage: 'Matching lines', result: null, ...extra }, 'finance');
    expect(run('queued')).toEqual({ state: 'submitted', statusMessage: 'Queued', artifact: null });
    expect(run('running').state).toBe('working');
    expect(run('cancel_requested').state).toBe('working');
    expect(run('awaiting_review')).toEqual({ state: 'working', statusMessage: 'Waiting for review in finance', artifact: null });
    expect(run('awaiting_answer').state).toBe('working');
    expect(run('completed', { result: { approved: true } })).toEqual({ state: 'completed', statusMessage: null, artifact: [{ data: { approved: true }, mediaType: 'application/json' }] });
    expect(run('failed')).toEqual({ state: 'failed', statusMessage: 'The workflow run failed', artifact: null });
    expect(run('canceled').state).toBe('canceled');
  });

  it('writes the A2A Task shape', () => {
    const task: TaskRow = {
      id: 't1', agentSlug: 'a', orgSlug: 'o', callerId: 'c', grantRef: null, contextId: 'ctx', state: 'working', target: 'workflow',
      runId: 'r', eventId: null, artifact: null, statusMessage: 'Matching lines', updatedAt: '2026-09-28T00:00:00.000Z',
    };
    expect(wireTask(task)).toEqual({
      id: 't1',
      contextId: 'ctx',
      status: {
        state: 'TASK_STATE_WORKING',
        message: { messageId: 't1-status', role: 'ROLE_AGENT', taskId: 't1', contextId: 'ctx', parts: [{ text: 'Matching lines' }] },
        timestamp: '2026-09-28T00:00:00.000Z',
      },
    });
    expect(wireTask({ ...task, state: 'completed', statusMessage: null, artifact: [{ text: 'done' }] })).toMatchObject({
      status: { state: 'TASK_STATE_COMPLETED' },
      artifacts: [{ artifactId: 't1-result', name: 'result', parts: [{ text: 'done' }] }],
    });
  });
});

describe('which run events a stream carries', () => {
  const step = (eventType: string, extra: Partial<Parameters<typeof runEventStep>[0]> = {}) =>
    runEventStep({ eventType, message: 'Doing a thing', step: null, progress: null, ...extra }, 'finance');

  it('relays progress with its step and percentage, our human gate as waiting, and the end', () => {
    expect(step('langgraph.processing', { step: 'match_lines', progress: 40 })).toEqual({ kind: 'status', message: 'Doing a thing', metadata: { step: 'match_lines', progress: 40 } });
    expect(step('langgraph.started')).toEqual({ kind: 'status', message: 'Doing a thing' });
    expect(step('langgraph.hitl_waiting')).toEqual({ kind: 'status', message: 'Waiting for review in finance' });
    for (const ended of ['langgraph.completed', 'langgraph.failed', 'langgraph.canceled']) expect(step(ended)).toEqual({ kind: 'ended' });
  });

  it('drops everything else: model calls, tools, and events it does not know', () => {
    for (const other of ['agent.llm.started', 'agent.llm.completed', 'langgraph.tool_calling', 'langgraph.queued', 'something.new']) {
      expect(step(other)).toEqual({ kind: 'skip' });
    }
  });
});

