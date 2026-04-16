/**
 * Thin verification that the reps-warranties wrapper binds the correct
 * sectionId + callerName. The full factory behavior is covered in
 * shared/section-node.factory.spec.ts.
 */
import { createSectionRepsWarrantiesNode } from './section-reps-warranties.node';
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { DealMemoState } from '../deal-memo.state';

const ctx = {
  orgSlug: 'acme',
  userId: 'u-1',
  conversationId: 'c-1',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'local',
  model: 'gemma3:e4b',
};

const state = {
  executionContext: ctx,
  parentJobId: 'p-1',
  parentConversationId: 'p-c-1',
  dealStructure: 'stock-purchase',
  documentIndex: [
    {
      documentId: 'doc-1',
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

describe('createSectionRepsWarrantiesNode', () => {
  it('calls LLM with caller name "legal-department:deal-memo:reps-warranties"', async () => {
    const calls: Array<{ callerName: string }> = [];
    const llm = {
      async callLLM(req: { callerName?: string }) {
        calls.push({ callerName: req.callerName ?? '' });
        return {
          text: JSON.stringify({
            draft: 'd',
            citations: [{ documentId: 'doc-1', excerpt: 'x' }],
          }),
        };
      },
    } as unknown as LLMHttpClientService;
    const obs = {
      emitProgress: jest.fn().mockResolvedValue(undefined),
    } as unknown as ObservabilityService;

    const node = createSectionRepsWarrantiesNode(llm, obs);
    const out = await node(state);

    expect(calls[0]!.callerName).toBe(
      'legal-department:deal-memo:reps-warranties',
    );
    expect(out.sectionDrafts!['reps-warranties']).toBeDefined();
  });
});
