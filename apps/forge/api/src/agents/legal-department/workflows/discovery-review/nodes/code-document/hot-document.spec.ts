import { codeHotDocument } from './hot-document';
import { fixtureProtocol } from '../../__fixtures__/protocol';
import { fixtureDocuments } from '../../__fixtures__/documents';
import type { DocumentCoding } from '../../discovery-review.types';

const mockLLMClient = { callLLM: jest.fn() } as any;

const baseCtx = {
  orgSlug: 'legal',
  userId: 'user-1',
  conversationId: 'conv-hotdoc-spec',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'ollama',
  model: 'gemma4:e4b',
};

const doc = fixtureDocuments[1]!; // supply agreement

const relevantRelevance: DocumentCoding['relevance'] = {
  classification: 'relevant',
  confidence: 0.9,
  reasoning: 'Directly related',
  matchingCriteria: ['breach of contract'],
};

const notPrivileged: DocumentCoding['privilege'] = {
  classification: 'not_privileged',
  confidence: 0.97,
  privilegeType: 'none',
  reasoning: 'No attorney involved.',
};

const privileged: DocumentCoding['privilege'] = {
  classification: 'privileged',
  confidence: 0.98,
  privilegeType: 'attorney_client',
  reasoning: 'Attorney memo.',
};

const potentiallyPrivileged: DocumentCoding['privilege'] = {
  classification: 'potentially_privileged',
  confidence: 0.6,
  privilegeType: 'attorney_client',
  reasoning: 'Might be privileged.',
};

const notRelevant: DocumentCoding['relevance'] = {
  classification: 'not_relevant',
  confidence: 0.9,
  reasoning: 'Off-topic.',
  matchingCriteria: [],
};

beforeEach(() => jest.clearAllMocks());

describe('codeHotDocument', () => {
  describe('skip conditions', () => {
    it('returns hotDocument=false without LLM call when document is privileged', async () => {
      const result = await codeHotDocument(
        doc,
        relevantRelevance,
        privileged,
        fixtureProtocol,
        mockLLMClient,
        baseCtx,
      );

      expect(result.hotDocument).toBe(false);
      expect(mockLLMClient.callLLM).not.toHaveBeenCalled();
    });

    it('returns hotDocument=false without LLM call when document is potentially_privileged', async () => {
      const result = await codeHotDocument(
        doc,
        relevantRelevance,
        potentiallyPrivileged,
        fixtureProtocol,
        mockLLMClient,
        baseCtx,
      );

      expect(result.hotDocument).toBe(false);
      expect(mockLLMClient.callLLM).not.toHaveBeenCalled();
    });

    it('returns hotDocument=false without LLM call when document is not_relevant', async () => {
      const result = await codeHotDocument(
        doc,
        notRelevant,
        notPrivileged,
        fixtureProtocol,
        mockLLMClient,
        baseCtx,
      );

      expect(result.hotDocument).toBe(false);
      expect(mockLLMClient.callLLM).not.toHaveBeenCalled();
    });

    it('returns hotDocument=false for potentially_relevant (only runs on relevant)', async () => {
      const potentiallyRelevant: DocumentCoding['relevance'] = {
        classification: 'potentially_relevant',
        confidence: 0.6,
        reasoning: 'Possibly related.',
        matchingCriteria: [],
      };

      const result = await codeHotDocument(
        doc,
        potentiallyRelevant,
        notPrivileged,
        fixtureProtocol,
        mockLLMClient,
        baseCtx,
      );

      expect(result.hotDocument).toBe(false);
      expect(mockLLMClient.callLLM).not.toHaveBeenCalled();
    });
  });

  describe('active analysis', () => {
    it('runs LLM and returns hotDocument=true when relevant+not_privileged', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: '{"hotDocument":true,"hotDocumentReason":"Critical contract term about IP ownership."}',
      });

      const result = await codeHotDocument(
        doc,
        relevantRelevance,
        notPrivileged,
        fixtureProtocol,
        mockLLMClient,
        baseCtx,
      );

      expect(result.hotDocument).toBe(true);
      expect(result.hotDocumentReason).toContain('IP ownership');
      expect(mockLLMClient.callLLM).toHaveBeenCalledTimes(1);
    });

    it('returns hotDocument=false when LLM says not hot', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: '{"hotDocument":false,"hotDocumentReason":"Routine supply agreement."}',
      });

      const result = await codeHotDocument(
        doc,
        relevantRelevance,
        notPrivileged,
        fixtureProtocol,
        mockLLMClient,
        baseCtx,
      );

      expect(result.hotDocument).toBe(false);
    });

    it('returns hotDocument=false when JSON is unparseable', async () => {
      mockLLMClient.callLLM.mockResolvedValue({ text: 'not json' });

      const result = await codeHotDocument(
        doc,
        relevantRelevance,
        notPrivileged,
        fixtureProtocol,
        mockLLMClient,
        baseCtx,
      );

      expect(result.hotDocument).toBe(false);
    });

    it('excludes hotDocumentReason when LLM omits it', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: '{"hotDocument":false}',
      });

      const result = await codeHotDocument(
        doc,
        relevantRelevance,
        notPrivileged,
        fixtureProtocol,
        mockLLMClient,
        baseCtx,
      );

      expect(result.hotDocumentReason).toBeUndefined();
    });
  });
});
