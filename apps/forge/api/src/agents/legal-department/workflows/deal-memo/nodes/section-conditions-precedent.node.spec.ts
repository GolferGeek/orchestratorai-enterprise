import { createSectionConditionsPrecedentNode } from './section-conditions-precedent.node';
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
  dealBreakerFlags: [
    {
      finding: 'Blocker',
      category: 'contractual',
      severity: 'critical',
      documentRefs: [],
      reasoning: '',
      recommendation: '',
    },
  ],
  missingDocuments: [
    {
      referencedIn: { documentId: 'd1', documentName: 'x' },
      description: 'Stockholder consent',
      importance: 'high',
    },
  ],
  prunedForBudget: false,
  sectionDrafts: {},
  resynthesisCount: 0,
  status: 'drafting',
  startedAt: Date.now(),
  messages: [],
} as unknown as DealMemoState;

describe('createSectionConditionsPrecedentNode', () => {
  it('binds section "conditions-precedent" with correct caller name; prompt emphasizes missing docs and deal breakers', async () => {
    const calls: Array<{ callerName: string; userMessage: string }> = [];
    const llm = {
      async callLLM(req: { callerName?: string; userMessage: string }) {
        calls.push({
          callerName: req.callerName ?? '',
          userMessage: req.userMessage,
        });
        return {
          text: JSON.stringify({
            draft: 'd',
            citations: [{ dealBreakerFlagId: 'db-0', excerpt: 'Blocker' }],
          }),
        };
      },
    } as unknown as LLMHttpClientService;
    const obs = {
      emitProgress: jest.fn().mockResolvedValue(undefined),
    } as unknown as ObservabilityService;

    const out = await createSectionConditionsPrecedentNode(llm, obs)(state);

    expect(calls[0]!.callerName).toBe(
      'legal-department:deal-memo:conditions-precedent',
    );
    expect(calls[0]!.userMessage).toContain('Stockholder consent');
    expect(calls[0]!.userMessage).toContain('db-0');
    expect(out.sectionDrafts!['conditions-precedent']).toBeDefined();
  });
});
