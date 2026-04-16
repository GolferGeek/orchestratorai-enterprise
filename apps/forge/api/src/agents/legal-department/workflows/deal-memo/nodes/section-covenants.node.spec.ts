import { createSectionCovenantsNode } from './section-covenants.node';
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { DealMemoState } from '../deal-memo.state';

const ctx = {
  orgSlug: 'a',
  userId: 'u',
  conversationId: 'c',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'local',
  model: 'm',
};

const state = {
  executionContext: ctx,
  parentJobId: 'p',
  parentConversationId: 'pc',
  dealStructure: 'stock-purchase',
  documentIndex: [
    {
      documentId: 'd1',
      name: 'x',
      documentType: 'y',
      parties: [],
      date: null,
      summary: '',
      riskScore: null,
      status: 'complete',
      specialistsAssigned: [],
      specialistsCompleted: [],
    },
  ],
  runningFindings: {},
  dealBreakerFlags: [],
  missingDocuments: [],
  prunedForBudget: false,
  sectionDrafts: {},
  resynthesisCount: 0,
  status: 'drafting',
  startedAt: Date.now(),
  messages: [],
} as unknown as DealMemoState;

describe('createSectionCovenantsNode', () => {
  it('binds section "covenants" with the correct caller name', async () => {
    const calls: Array<{ callerName: string }> = [];
    const llm = {
      async callLLM(req: { callerName?: string }) {
        calls.push({ callerName: req.callerName ?? '' });
        return {
          text: JSON.stringify({
            draft: 'd',
            citations: [{ documentId: 'd1', excerpt: 'x' }],
          }),
        };
      },
    } as unknown as LLMHttpClientService;
    const obs = {
      emitProgress: jest.fn().mockResolvedValue(undefined),
    } as unknown as ObservabilityService;

    const out = await createSectionCovenantsNode(llm, obs)(state);

    expect(calls[0]!.callerName).toBe('legal-department:deal-memo:covenants');
    expect(out.sectionDrafts!['covenants']).toBeDefined();
  });
});
