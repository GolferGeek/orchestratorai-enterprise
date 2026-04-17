import { codeRelevance } from './relevance';
import { fixtureProtocol } from '../../__fixtures__/protocol';
import { fixtureDocuments } from '../../__fixtures__/documents';

const mockLLMClient = { callLLM: jest.fn() } as any;

const baseCtx = {
  orgSlug: 'legal',
  userId: 'user-1',
  conversationId: 'conv-relevance-spec',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'ollama',
  model: 'gemma4:e4b',
};

const doc = fixtureDocuments[1]!; // supply agreement — expected to be relevant

beforeEach(() => jest.clearAllMocks());

describe('codeRelevance', () => {
  it('happy path — parses valid LLM JSON and returns classification', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: JSON.stringify({
        classification: 'relevant',
        confidence: 0.92,
        reasoning:
          'The document discusses pricing and IP ownership between Acme and Globex.',
        matchingCriteria: ['breach of contract', 'pricing'],
      }),
    });

    const result = await codeRelevance(
      doc,
      fixtureProtocol,
      mockLLMClient,
      baseCtx,
    );

    expect(result.classification).toBe('relevant');
    expect(result.confidence).toBeCloseTo(0.92);
    expect(result.reasoning).toContain('pricing');
    expect(result.matchingCriteria).toContain('breach of contract');
  });

  it('handles markdown-fenced JSON from LLM', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: '```json\n{"classification":"not_relevant","confidence":0.85,"reasoning":"Unrelated","matchingCriteria":[]}\n```',
    });

    const result = await codeRelevance(
      doc,
      fixtureProtocol,
      mockLLMClient,
      baseCtx,
    );

    expect(result.classification).toBe('not_relevant');
    expect(result.confidence).toBeCloseTo(0.85);
  });

  it('defaults to potentially_relevant when JSON is unparseable', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: 'not valid JSON at all' });

    const result = await codeRelevance(
      doc,
      fixtureProtocol,
      mockLLMClient,
      baseCtx,
    );

    expect(result.classification).toBe('potentially_relevant');
    expect(result.confidence).toBe(0.5);
    expect(result.reasoning).toContain('Could not parse');
  });

  it('defaults to potentially_relevant when classification field is unknown', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: '{"classification":"unknown_type","confidence":0.7,"reasoning":"...","matchingCriteria":[]}',
    });

    const result = await codeRelevance(
      doc,
      fixtureProtocol,
      mockLLMClient,
      baseCtx,
    );

    expect(result.classification).toBe('potentially_relevant');
  });

  it('clamps confidence to [0, 1]', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: '{"classification":"relevant","confidence":1.5,"reasoning":"...","matchingCriteria":[]}',
    });

    const result = await codeRelevance(
      doc,
      fixtureProtocol,
      mockLLMClient,
      baseCtx,
    );

    expect(result.confidence).toBe(1);
  });

  it('calls LLM with callerName legal-department:dr-relevance', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: '{"classification":"relevant","confidence":0.9,"reasoning":"...","matchingCriteria":[]}',
    });

    await codeRelevance(doc, fixtureProtocol, mockLLMClient, baseCtx);

    expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
      expect.objectContaining({ callerName: 'legal-department:dr-relevance' }),
    );
  });
});
