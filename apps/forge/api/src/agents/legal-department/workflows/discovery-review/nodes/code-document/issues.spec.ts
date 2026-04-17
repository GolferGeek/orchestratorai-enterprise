import { codeIssues } from './issues';
import {
  fixtureProtocol,
  fixtureMinimalProtocol,
} from '../../__fixtures__/protocol';
import { fixtureDocuments } from '../../__fixtures__/documents';

const mockLLMClient = { callLLM: jest.fn() } as any;

const baseCtx = {
  orgSlug: 'legal',
  userId: 'user-1',
  conversationId: 'conv-issues-spec',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'ollama',
  model: 'gemma4:e4b',
};

const doc = fixtureDocuments[1]!; // supply agreement

beforeEach(() => jest.clearAllMocks());

describe('codeIssues', () => {
  it('returns empty array when protocol has no issue tags', async () => {
    const result = await codeIssues(
      doc,
      fixtureMinimalProtocol,
      mockLLMClient,
      baseCtx,
    );

    expect(result).toEqual([]);
    expect(mockLLMClient.callLLM).not.toHaveBeenCalled();
  });

  it('runs one LLM call per tag and returns confidence for each', async () => {
    // fixtureProtocol has 3 tags: trade-secret, pricing, customer-data
    mockLLMClient.callLLM
      .mockResolvedValueOnce({ text: '{"confidence":0.85}' })
      .mockResolvedValueOnce({ text: '{"confidence":0.92}' })
      .mockResolvedValueOnce({ text: '{"confidence":0.1}' });

    const result = await codeIssues(
      doc,
      fixtureProtocol,
      mockLLMClient,
      baseCtx,
    );

    expect(mockLLMClient.callLLM).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ tagId: 'trade-secret', confidence: 0.85 });
    expect(result[1]).toEqual({ tagId: 'pricing', confidence: 0.92 });
    expect(result[2]).toEqual({ tagId: 'customer-data', confidence: 0.1 });
  });

  it('runs calls sequentially — calls in tag order', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: '{"confidence":0.5}' });

    await codeIssues(doc, fixtureProtocol, mockLLMClient, baseCtx);

    const calls = mockLLMClient.callLLM.mock.calls as Array<
      [{ userMessage: string }]
    >;
    expect(calls[0]![0].userMessage).toContain('Trade Secret');
    expect(calls[1]![0].userMessage).toContain('Pricing');
    expect(calls[2]![0].userMessage).toContain('Customer Data');
  });

  it('defaults confidence to 0 when LLM response is unparseable', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: 'not json' });

    const result = await codeIssues(
      doc,
      fixtureProtocol,
      mockLLMClient,
      baseCtx,
    );

    for (const tag of result) {
      expect(tag.confidence).toBe(0);
    }
  });

  it('clamps confidence to [0, 1]', async () => {
    mockLLMClient.callLLM
      .mockResolvedValueOnce({ text: '{"confidence":1.5}' })
      .mockResolvedValueOnce({ text: '{"confidence":-0.3}' })
      .mockResolvedValueOnce({ text: '{"confidence":0.5}' });

    const result = await codeIssues(
      doc,
      fixtureProtocol,
      mockLLMClient,
      baseCtx,
    );

    expect(result[0]!.confidence).toBe(1);
    expect(result[1]!.confidence).toBe(0);
    expect(result[2]!.confidence).toBeCloseTo(0.5);
  });

  it('uses callerName legal-department:dr-issues', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: '{"confidence":0.5}' });

    await codeIssues(doc, fixtureProtocol, mockLLMClient, baseCtx);

    for (const call of mockLLMClient.callLLM.mock.calls as Array<
      [{ callerName: string }]
    >) {
      expect(call[0].callerName).toBe('legal-department:dr-issues');
    }
  });
});
